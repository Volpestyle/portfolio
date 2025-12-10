import fs from 'node:fs';
import path from 'node:path';
import { CfnOutput, Duration, RemovalPolicy, Size, Stack } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { experimental as cloudfrontExperimental } from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import {
  FunctionOriginResource,
  ImageOptimizationResources,
  OpenNextFunctionOrigin,
  OpenNextOutput,
  OpenNextS3Origin,
  PortfolioStackProps,
} from './types';
import {
  buildEdgeRuntimeHeaders,
  buildEdgeSecretHeaders,
  patchEdgeServerBundle,
  EDGE_RUNTIME_HEADER_NAME,
  EDGE_ENV_SECRET_HEADER_NAME,
  EDGE_REPO_SECRET_HEADER_NAME,
  EDGE_SECRETS_REGION_HEADER_NAME,
  EDGE_SECRETS_FALLBACK_REGION_HEADER_NAME,
} from './config/edge-runtime';
import { buildEnvironmentFromRules, resolveEdgeRuntimeEnvRules } from './config/env-rules';
import { BlogInfra } from './constructs/blog-infra';
import { ChatInfra } from './constructs/chat-infra';
import { CacheInfra } from './constructs/cache-infra';

export class PortfolioStack extends Stack {
  private readonly appDirectoryPath: string;
  private readonly openNextDir: string;
  private readonly openNextOutput: OpenNextOutput;
  private readonly assetsBucket: s3.Bucket;
  private readonly revalidationTable: dynamodb.Table;
  private readonly revalidationQueue: sqs.Queue;
  private readonly runtimeEnvironment: Record<string, string>;
  private readonly envSecret?: secretsmanager.ISecret;
  private readonly repoSecret?: secretsmanager.ISecret;
  private readonly edgeRuntimeEntriesPerHeader = 8;
  private edgeRuntimeHeaderValues?: Record<string, string>;
  private readonly protectedFunctionUrls: { url: lambda.IFunctionUrl; fn: lambda.Function }[] = [];
  private readonly postsTable: dynamodb.Table;
  private readonly adminDataTable: dynamodb.Table;
  private readonly blogContentBucket: s3.Bucket;
  private readonly blogMediaBucket: s3.Bucket;
  private readonly chatExportBucket: s3.Bucket;
  private readonly chatCostTable: dynamodb.Table;
  private readonly alternateDomains: string[] = [];
  private readonly primaryDomainName?: string;
  private readonly validationMode: boolean;

  constructor(scope: Construct, id: string, props: PortfolioStackProps = {}) {
    super(scope, id, props);

    const {
      domainName,
      hostedZoneDomain,
      certificateArn,
      alternateDomainNames = [],
      environment = {},
      appDirectory = path.resolve(process.cwd(), '..', '..'),
      openNextPath,
      validationMode = false,
    } = props;

    this.validationMode = validationMode;
    this.primaryDomainName = domainName;
    this.alternateDomains = alternateDomainNames;

    this.appDirectoryPath = appDirectory;
    const hostedZone =
      domainName && hostedZoneDomain
        ? route53.HostedZone.fromLookup(this, 'PortfolioHostedZone', { domainName: hostedZoneDomain })
        : undefined;

    const certificate =
      domainName && certificateArn
        ? acm.Certificate.fromCertificateArn(this, 'PortfolioCertificate', certificateArn)
        : domainName && hostedZone
          ? new acm.Certificate(this, 'PortfolioCertificate', {
            domainName,
            validation: acm.CertificateValidation.fromDns(hostedZone),
            subjectAlternativeNames: alternateDomainNames,
          })
          : undefined;

    this.runtimeEnvironment = this.enrichRuntimeEnvironment(environment);
    this.openNextDir = this.resolveOpenNextDirectory(openNextPath, appDirectory);
    this.openNextOutput = this.readOpenNextOutput();

    this.envSecret = this.resolveSecretReference(
      'EnvSecretRef',
      this.runtimeEnvironment['SECRETS_MANAGER_ENV_SECRET_ID']
    );
    this.repoSecret = this.resolveSecretReference(
      'RepoSecretRef',
      this.runtimeEnvironment['SECRETS_MANAGER_REPO_SECRET_ID']
    );

    this.assetsBucket = this.createAssetsBucket();

    const blogInfra = new BlogInfra(this, 'BlogInfra', {
      runtimeEnvironment: this.runtimeEnvironment,
      primaryDomainName: this.primaryDomainName,
      alternateDomainNames,
    });
    this.postsTable = blogInfra.postsTable;
    this.adminDataTable = blogInfra.adminDataTable;
    this.blogContentBucket = blogInfra.contentBucket;
    this.blogMediaBucket = blogInfra.mediaBucket;

    const chatInfra = new ChatInfra(this, 'ChatInfra', {
      runtimeEnvironment: this.runtimeEnvironment,
    });
    this.chatExportBucket = chatInfra.chatExportBucket;
    this.chatCostTable = chatInfra.chatCostTable;

    const cacheInfra = new CacheInfra(this, 'CacheInfra', {
      openNextOutput: this.openNextOutput,
      resolveBundlePath: this.resolveBundlePath.bind(this),
      grantSecretAccess: this.grantSecretAccess.bind(this),
    });
    this.revalidationTable = cacheInfra.revalidationTable;
    this.revalidationQueue = cacheInfra.revalidationQueue;

    const baseEnv = this.buildBaseEnvironment();

    cacheInfra.addInitializer(baseEnv, (keys) => this.buildLambdaRuntimeEnv(baseEnv, keys));
    const revalidationWorker = cacheInfra.addRevalidationConsumer(baseEnv, (keys) =>
      this.buildLambdaRuntimeEnv(baseEnv, keys)
    );
    if (revalidationWorker) {
      this.grantRuntimeAccess(revalidationWorker, { allowQueueSend: false });
      this.revalidationQueue.grantConsumeMessages(revalidationWorker);
      this.grantSecretAccess(revalidationWorker);
    }

    const serverEdgeFunction = this.createServerEdgeFunction(baseEnv);
    const serverEdgeFunctionResource = serverEdgeFunction.node.defaultChild as lambda.CfnFunction | undefined;
    if (serverEdgeFunctionResource) {
      serverEdgeFunctionResource.applyRemovalPolicy(RemovalPolicy.RETAIN);
    }
    const serverEdgeFunctionVersion = serverEdgeFunction.currentVersion.node.defaultChild as
      | lambda.CfnVersion
      | undefined;
    if (serverEdgeFunctionVersion) {
      serverEdgeFunctionVersion.applyRemovalPolicy(RemovalPolicy.RETAIN);
    }
    this.grantRuntimeAccess(serverEdgeFunction);
    this.grantBlogDataAccess(serverEdgeFunction);
    this.attachSesPermissions(serverEdgeFunction);
    this.grantSecretAccess(serverEdgeFunction, serverEdgeFunction);
    this.attachCostMetricPermissions(serverEdgeFunction);

    const imageResources = this.createImageOptimizationResources(baseEnv);
    if (imageResources) {
      this.grantRuntimeAccess(imageResources.function);
      this.grantSecretAccess(imageResources.function);
    }

    const additionalOrigins = this.createAdditionalOrigins(baseEnv);
    for (const resource of Object.values(additionalOrigins)) {
      if (resource.function) {
        this.grantRuntimeAccess(resource.function);
        this.grantSecretAccess(resource.function);
        this.attachSesPermissions(resource.function);
      }
    }

    const serverCachePolicy = this.createServerCachePolicy();
    const imageCachePolicy = this.createImageCachePolicy();
    const staticCachePolicy = cloudfront.CachePolicy.CACHING_OPTIMIZED;
    const responseHeadersPolicy = cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS;

    const originCustomHeaders = this.buildOriginCustomHeaders();
    const s3OriginProps: origins.S3BucketOriginWithOACProps = {
      originAccessLevels: [cloudfront.AccessLevel.READ],
      originPath: this.openNextOutput.origins.s3.originPath,
      ...(Object.keys(originCustomHeaders).length ? { customHeaders: originCustomHeaders } : {}),
    };

    const staticOrigin = origins.S3BucketOrigin.withOriginAccessControl(this.assetsBucket, s3OriginProps);

    const originMap: Record<string, cloudfront.IOrigin> = {
      s3: staticOrigin,
      default: staticOrigin,
    };

    if (imageResources) {
      originMap.imageOptimizer = imageResources.origin;
    }

    for (const [key, resource] of Object.entries(additionalOrigins)) {
      originMap[key] = resource.origin;
    }

    const domainConfig = this.resolveDistributionDomainConfig(domainName, alternateDomainNames, certificate);

    const distribution = new cloudfront.Distribution(this, 'PortfolioDistribution', {
      defaultBehavior: {
        origin: staticOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: serverCachePolicy,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        responseHeadersPolicy,
        edgeLambdas: [
          {
            eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST,
            functionVersion: serverEdgeFunction.currentVersion,
            includeBody: true,
          },
        ],
      },
      additionalBehaviors: this.buildAdditionalBehaviors({
        serverCachePolicy,
        imageCachePolicy,
        staticCachePolicy,
        serverEdgeFunction,
        originMap,
        responseHeadersPolicy,
      }),
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      ...(domainConfig?.domainNames ? { domainNames: domainConfig.domainNames } : {}),
      ...(domainConfig?.certificate ? { certificate: domainConfig.certificate } : {}),
    });

    const edgeFunction = serverEdgeFunction.lambda as lambda.Function;
    edgeFunction.addEnvironment('CLOUDFRONT_DISTRIBUTION_ID', distribution.distributionId, {
      removeInEdge: true,
    });
    if (!this.validationMode) {
      this.attachCloudFrontInvalidationPermission(serverEdgeFunction);
    }

    this.deployStaticAssets(this.openNextOutput.origins.s3, distribution);

    this.restrictFunctionUrlAccess(distribution);
    if (hostedZone && domainConfig?.domainNames?.length) {
      this.createAliasRecords(hostedZone, distribution, domainConfig.domainNames);
    }

    new CfnOutput(this, 'DistributionDomainName', {
      value: distribution.distributionDomainName,
    });

    new CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId,
    });

    new CfnOutput(this, 'AssetBucketName', {
      value: this.assetsBucket.bucketName,
    });

    new CfnOutput(this, 'BlogPostsTableName', {
      value: this.postsTable.tableName,
    });

    new CfnOutput(this, 'BlogContentBucketName', {
      value: this.blogContentBucket.bucketName,
    });

    new CfnOutput(this, 'BlogMediaBucketName', {
      value: this.blogMediaBucket.bucketName,
    });

    new CfnOutput(this, 'ChatExportBucketName', {
      value: this.chatExportBucket.bucketName,
    });

    new CfnOutput(this, 'AdminDataTableName', {
      value: this.adminDataTable.tableName,
    });

    new CfnOutput(this, 'ChatRuntimeCostTableName', {
      value: this.chatCostTable.tableName,
    });
  }

  private enrichRuntimeEnvironment(environment: Record<string, string>): Record<string, string> {
    const env: Record<string, string> = {
      NODE_ENV: 'production',
      ...environment,
    };
    const allowProdFixtures = env['ALLOW_TEST_FIXTURES_IN_PROD'] === 'true';
    if (!allowProdFixtures) {
      delete env['BLOG_TEST_FIXTURES'];
      delete env['PORTFOLIO_TEST_FIXTURES'];
    }

    if (!env['AWS_SECRETS_MANAGER_PRIMARY_REGION'] && env['AWS_REGION']) {
      env['AWS_SECRETS_MANAGER_PRIMARY_REGION'] = env['AWS_REGION'];
    }

    return env;
  }

  private resolveOpenNextDirectory(explicitPath: string | undefined, appDirectory: string): string {
    const candidate = explicitPath ? path.resolve(explicitPath) : path.resolve(appDirectory, '.open-next');

    if (!fs.existsSync(candidate)) {
      throw new Error(
        `OpenNext build output not found at ${candidate}. Run 'pnpm run build:web' before synthesizing the CDK app.`
      );
    }

    const outputFile = path.join(candidate, 'open-next.output.json');
    if (!fs.existsSync(outputFile)) {
      throw new Error(
        `Missing open-next.output.json at ${outputFile}. Ensure '@opennextjs/aws build' has completed successfully.`
      );
    }

    return candidate;
  }

  private readOpenNextOutput(): OpenNextOutput {
    const outputPath = path.join(this.openNextDir, 'open-next.output.json');
    const raw = fs.readFileSync(outputPath, 'utf-8');
    return JSON.parse(raw) as OpenNextOutput;
  }

  private resolveSecretReference(id: string, secretId?: string): secretsmanager.ISecret | undefined {
    if (!secretId) {
      return undefined;
    }

    return secretId.startsWith('arn:')
      ? secretsmanager.Secret.fromSecretCompleteArn(this, id, secretId)
      : secretsmanager.Secret.fromSecretNameV2(this, id, secretId);
  }

  private createAssetsBucket(): s3.Bucket {
    return new s3.Bucket(this, 'AssetsBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });
  }

  private deployStaticAssets(config: OpenNextS3Origin, distribution: cloudfront.IDistribution) {
    config.copy.forEach((copy, index) => {
      const sourcePath = this.resolveBundlePath(copy.from);
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`Static asset source not found: ${sourcePath}`);
      }

      new s3deploy.BucketDeployment(this, `AssetsDeployment${index}`, {
        sources: [
          s3deploy.Source.asset(sourcePath, {
            exclude: ['**/*.map', '**/.DS_Store'],
          }),
        ],
        destinationBucket: this.assetsBucket,
        destinationKeyPrefix: copy.to.replace(/^\//, ''),
        prune: false,
        distribution,
        distributionPaths: ['/*'],
        memoryLimit: 2048,
        ephemeralStorageSize: Size.gibibytes(4),
        cacheControl: copy.cached
          ? [
            s3deploy.CacheControl.setPublic(),
            s3deploy.CacheControl.immutable(),
            s3deploy.CacheControl.maxAge(Duration.days(365)),
          ]
          : [s3deploy.CacheControl.setPublic(), s3deploy.CacheControl.noCache()],
      });
    });
  }

  private buildBaseEnvironment(): Record<string, string> {
    const env: Record<string, string> = { ...this.runtimeEnvironment };
    const region = Stack.of(this).region;

    if (!env['AWS_REGION']) {
      env['AWS_REGION'] = region;
    }

    env['CACHE_BUCKET_NAME'] = this.assetsBucket.bucketName;
    env['CACHE_BUCKET_KEY_PREFIX'] = env['CACHE_BUCKET_KEY_PREFIX'] ?? '_cache';
    env['CACHE_BUCKET_REGION'] = region;
    env['CACHE_DYNAMO_TABLE'] = this.revalidationTable.tableName;
    env['COST_TABLE_NAME'] = this.chatCostTable.tableName;
    env['REVALIDATION_QUEUE_URL'] = this.revalidationQueue.queueUrl;
    env['REVALIDATION_QUEUE_REGION'] = region;
    env['BUCKET_NAME'] = env['BUCKET_NAME'] ?? this.assetsBucket.bucketName;
    env['POSTS_TABLE'] = this.postsTable.tableName;
    env['ADMIN_TABLE_NAME'] = this.adminDataTable.tableName;
    env['POSTS_STATUS_INDEX'] = 'byStatusPublishedAt';
    env['CONTENT_BUCKET'] = this.blogContentBucket.bucketName;
    env['MEDIA_BUCKET'] = this.blogMediaBucket.bucketName;
    env['CHAT_EXPORT_BUCKET'] = this.chatExportBucket.bucketName;

    const s3OriginPath = this.openNextOutput.origins.s3.originPath ?? '/';
    env['BUCKET_KEY_PREFIX'] = s3OriginPath.replace(/^\//, ''); // '' if originPath is '/'

    if (!env['AWS_SECRETS_MANAGER_PRIMARY_REGION']) {
      env['AWS_SECRETS_MANAGER_PRIMARY_REGION'] = region;
    }

    if (!env['NEXTAUTH_URL']) {
      const siteUrl =
        env['NEXT_PUBLIC_SITE_URL'] ?? (this.primaryDomainName ? `https://${this.primaryDomainName}` : undefined);
      if (siteUrl) {
        env['NEXTAUTH_URL'] = siteUrl.replace(/\/$/, '');
      }
    }

    return env;
  }

  private createServerEdgeFunction(baseEnv: Record<string, string>): cloudfrontExperimental.EdgeFunction {
    const serverOrigin = this.openNextOutput.origins.default;
    if (serverOrigin.type !== 'function') {
      throw new Error('OpenNext default origin must be of type "function".');
    }

    const bundlePath = this.resolveBundlePath(serverOrigin.bundle);
    if (!fs.existsSync(bundlePath)) {
      throw new Error(`Server bundle not found: ${bundlePath}`);
    }

    const edgeEnv = this.buildEdgeEnvironment(baseEnv);
    this.assertEdgeEnvironment(edgeEnv);
    this.edgeRuntimeHeaderValues = buildEdgeRuntimeHeaders(edgeEnv, {
      runtimeHeaderName: EDGE_RUNTIME_HEADER_NAME,
      entriesPerHeader: this.edgeRuntimeEntriesPerHeader,
    });
    if (!this.edgeRuntimeHeaderValues || Object.keys(this.edgeRuntimeHeaderValues).length === 0) {
      throw new Error('Edge runtime configuration is empty; ensure required environment values are provided.');
    }
    patchEdgeServerBundle({
      bundlePath,
      runtimeHeaders: this.edgeRuntimeHeaderValues,
      runtimeHeaderName: EDGE_RUNTIME_HEADER_NAME,
      envSecretHeaderName: EDGE_ENV_SECRET_HEADER_NAME,
      repoSecretHeaderName: EDGE_REPO_SECRET_HEADER_NAME,
      secretsRegionHeaderName: EDGE_SECRETS_REGION_HEADER_NAME,
      secretsFallbackRegionHeaderName: EDGE_SECRETS_FALLBACK_REGION_HEADER_NAME,
    });

    return new cloudfrontExperimental.EdgeFunction(this, 'ServerEdgeFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: serverOrigin.handler,
      code: lambda.Code.fromAsset(bundlePath),
      architecture: lambda.Architecture.X86_64,
      memorySize: 1536,
      timeout: Duration.seconds(30),
      description: 'Next.js server Lambda@Edge',
    });
  }

  private createImageOptimizationResources(baseEnv: Record<string, string>): ImageOptimizationResources | undefined {
    const imageOrigin = this.openNextOutput.origins.imageOptimizer;
    if (!imageOrigin?.bundle) {
      return undefined;
    }

    const bundlePath = this.resolveBundlePath(imageOrigin.bundle);
    if (!fs.existsSync(bundlePath)) {
      return undefined;
    }

    const imageLogGroup = new logs.LogGroup(this, 'ImageOptimizationFunctionLogs', {
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const fn = new lambda.Function(this, 'ImageOptimizationFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      handler: imageOrigin.handler,
      code: lambda.Code.fromAsset(bundlePath),
      timeout: Duration.seconds(30),
      memorySize: 1024,
      environment: this.buildLambdaRuntimeEnv(baseEnv, [
        'BUCKET_NAME',
        'BUCKET_KEY_PREFIX',
        'CACHE_BUCKET_NAME',
        'CACHE_BUCKET_KEY_PREFIX',
        'CACHE_BUCKET_REGION',
        'CACHE_DYNAMO_TABLE',
        'AWS_REGION',
        'AWS_SECRETS_MANAGER_PRIMARY_REGION',
        'SECRETS_MANAGER_ENV_SECRET_ID',
        'SECRETS_MANAGER_REPO_SECRET_ID',
      ]),
      logGroup: imageLogGroup,
    });

    const functionUrl = fn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
      invokeMode: imageOrigin.streaming ? lambda.InvokeMode.RESPONSE_STREAM : lambda.InvokeMode.BUFFERED,
    });

    this.protectedFunctionUrls.push({ url: functionUrl, fn });

    const origin = origins.FunctionUrlOrigin.withOriginAccessControl(functionUrl, {
      originAccessControl: new cloudfront.FunctionUrlOriginAccessControl(this, 'ImageOptimizerOAC'),
    });

    return { function: fn, functionUrl, origin };
  }

  private createAdditionalOrigins(baseEnv: Record<string, string>): Record<string, FunctionOriginResource> {
    const result: Record<string, FunctionOriginResource> = {};
    for (const [key, originDef] of Object.entries(this.openNextOutput.origins)) {
      if (['s3', 'default', 'imageOptimizer'].includes(key)) {
        continue;
      }

      if ((originDef as OpenNextFunctionOrigin).type === 'function') {
        const originConfig = originDef as OpenNextFunctionOrigin;
        const bundlePath = this.resolveBundlePath(originConfig.bundle);
        if (!fs.existsSync(bundlePath)) {
          continue;
        }

        const functionId = this.toPascalCase(key);
        const fnLogGroup = new logs.LogGroup(this, `${functionId}FunctionLogs`, {
          retention: logs.RetentionDays.TWO_WEEKS,
          removalPolicy: RemovalPolicy.DESTROY,
        });

        const fn = new lambda.Function(this, `${functionId}Function`, {
          runtime: lambda.Runtime.NODEJS_20_X,
          architecture: lambda.Architecture.ARM_64,
          handler: originConfig.handler,
          code: lambda.Code.fromAsset(bundlePath),
          timeout: Duration.seconds(30),
          memorySize: 1024,
          environment: this.buildLambdaRuntimeEnv(baseEnv),
          logGroup: fnLogGroup,
        });

        // The chat endpoint must accept unsigned requests from CloudFront viewers,
        // so disable IAM auth just for that origin to avoid SigV4 errors.
        const functionAuthType =
          key === 'chat' ? lambda.FunctionUrlAuthType.NONE : lambda.FunctionUrlAuthType.AWS_IAM;
        const oacSigning =
          functionAuthType === lambda.FunctionUrlAuthType.NONE ? cloudfront.Signing.NEVER : undefined;

        const fnUrl = fn.addFunctionUrl({
          authType: functionAuthType,
          invokeMode: originConfig.streaming ? lambda.InvokeMode.RESPONSE_STREAM : lambda.InvokeMode.BUFFERED,
        });

        this.protectedFunctionUrls.push({ url: fnUrl, fn });

        const customHeaders = this.buildOriginCustomHeaders();
        const originResource = origins.FunctionUrlOrigin.withOriginAccessControl(fnUrl, {
          originAccessControl: new cloudfront.FunctionUrlOriginAccessControl(this, `${functionId}FunctionOAC`, {
            signing: oacSigning,
          }),
          customHeaders: Object.keys(customHeaders).length ? customHeaders : undefined,
        });

        result[key] = {
          function: fn,
          functionUrl: fnUrl,
          origin: originResource,
        };
      }
    }

    return result;
  }

  private createServerCachePolicy(): cloudfront.CachePolicy {
    return new cloudfront.CachePolicy(this, 'ServerCachePolicy', {
      cachePolicyName: `${Stack.of(this).stackName}-Server`,
      comment: 'Cache policy for Next.js SSR and API routes',
      defaultTtl: Duration.seconds(0),
      minTtl: Duration.seconds(0),
      maxTtl: Duration.days(365),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList(
        'accept',
        'rsc',
        'next-router-prefetch',
        'next-router-state-tree',
        'next-url',
        'x-prerender-revalidate',
        'x-revalidate-secret',
        'x-chat-origin-secret',
        'x-portfolio-test-mode'
      ),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });
  }

  private createImageCachePolicy(): cloudfront.CachePolicy {
    return new cloudfront.CachePolicy(this, 'ImageCachePolicy', {
      cachePolicyName: `${Stack.of(this).stackName}-Image`,
      comment: 'Cache policy for Next.js image optimization (/_next/image)',
      defaultTtl: Duration.days(30),
      maxTtl: Duration.days(365),
      minTtl: Duration.seconds(0),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(), // url, w, q
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList('accept'), // webp/avif variants
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      enableAcceptEncodingBrotli: true,
      enableAcceptEncodingGzip: true,
    });
  }

  private buildAdditionalBehaviors(options: {
    serverCachePolicy: cloudfront.ICachePolicy;
    imageCachePolicy: cloudfront.ICachePolicy;
    staticCachePolicy: cloudfront.ICachePolicy;
    serverEdgeFunction: cloudfrontExperimental.EdgeFunction;
    originMap: Record<string, cloudfront.IOrigin>;
    responseHeadersPolicy: cloudfront.IResponseHeadersPolicy;
  }): Record<string, cloudfront.BehaviorOptions> {
    const {
      serverCachePolicy,
      imageCachePolicy,
      staticCachePolicy,
      serverEdgeFunction,
      originMap,
      responseHeadersPolicy,
    } = options;

    const behaviors: Record<string, cloudfront.BehaviorOptions> = {};

    for (const behavior of this.openNextOutput.behaviors ?? []) {
      if (behavior.pattern === '*') {
        continue;
      }

      const originKey = behavior.origin ?? 'default';
      const origin = originMap[originKey];

      if (!origin) {
        throw new Error(`No origin registered for key '${originKey}' in OpenNext behaviors.`);
      }

      const isStatic = originKey === 's3';
      const isImageOptimizer = originKey === 'imageOptimizer';
      const isDefaultOrigin = originKey === 'default';
      const cachePolicy = isImageOptimizer ? imageCachePolicy : isStatic ? staticCachePolicy : serverCachePolicy;
      const allowedMethods =
        isImageOptimizer || isStatic
          ? cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS
          : cloudfront.AllowedMethods.ALLOW_ALL;
      const originRequestPolicy = isImageOptimizer
        ? cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER
        : !isStatic
          ? cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER
          : undefined;
      // Only attach edge function to the default origin. Custom function origins
      // (like 'chat') handle requests themselves and don't need the edge function.
      const edgeLambdas = isDefaultOrigin
        ? [
          {
            eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST,
            functionVersion: serverEdgeFunction.currentVersion,
            includeBody: true,
          },
        ]
        : undefined;

      const behaviorOptions: cloudfront.BehaviorOptions = {
        origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy,
        responseHeadersPolicy,
        ...(originRequestPolicy ? { originRequestPolicy } : {}),
        ...(edgeLambdas ? { edgeLambdas } : {}),
      };

      behaviors[behavior.pattern] = behaviorOptions;
    }

    return behaviors;
  }

  private resolveDistributionDomainConfig(
    domainName: string | undefined,
    alternateDomainNames: string[],
    certificate?: acm.ICertificate
  ):
    | {
      domainNames: string[];
      certificate: acm.ICertificate;
    }
    | undefined {
    if (!domainName) {
      return undefined;
    }

    if (!certificate) {
      throw new Error(
        'A CloudFront custom domain requires an ACM certificate in us-east-1. Provide certificateArn or configure a hosted zone to issue one.'
      );
    }

    const names = [domainName, ...alternateDomainNames.filter(Boolean)];
    return {
      domainNames: names,
      certificate,
    };
  }

  private createAliasRecords(
    hostedZone: route53.IHostedZone,
    distribution: cloudfront.Distribution,
    domainNames: string[]
  ) {
    const target = route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(distribution));

    domainNames.forEach((name, index) => {
      new route53.ARecord(this, `AliasRecord${index}`, {
        zone: hostedZone,
        recordName: name,
        target,
      });

      new route53.AaaaRecord(this, `AliasRecordAAAA${index}`, {
        zone: hostedZone,
        recordName: name,
        target,
      });
    });
  }

  private resolveBundlePath(bundle: string): string {
    if (path.isAbsolute(bundle)) {
      return bundle;
    }

    const trimmed = bundle.startsWith('./') ? bundle.slice(2) : bundle;
    const normalized = trimmed.replace(/\\/g, '/');

    if (normalized === '.open-next' || normalized.startsWith('.open-next/')) {
      return path.resolve(this.appDirectoryPath, ...normalized.split('/'));
    }

    return path.join(this.openNextDir, ...normalized.split('/'));
  }

  private pickRuntimeEnv(source: Record<string, string>, keys: string[]): Record<string, string> {
    const subset: Record<string, string> = {};
    for (const key of keys) {
      const value = source[key];
      if (value !== undefined) {
        subset[key] = value;
      }
    }
    return this.filterReservedLambdaEnv(subset);
  }

  private filterReservedLambdaEnv(env: Record<string, string>): Record<string, string> {
    const reserved = new Set([
      'AWS_REGION',
      'AWS_DEFAULT_REGION',
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'AWS_SESSION_TOKEN',
    ]);
    const isValidLambdaEnvKey = (key: string): boolean => /^[A-Za-z][A-Za-z0-9_]*$/.test(key);
    const sanitized: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      if (reserved.has(key)) {
        continue;
      }
      // CloudFormation/Lambda require env var names to start with a letter and contain only letters, numbers, and underscores
      // Common CI shells inject '_' which is invalid and must be filtered out
      if (!isValidLambdaEnvKey(key)) {
        continue;
      }
      sanitized[key] = value;
    }
    return sanitized;
  }

  private grantRuntimeAccess(
    grantable: iam.IGrantable,
    options: { allowCacheWrite?: boolean; allowQueueSend?: boolean } = {}
  ) {
    if (options.allowCacheWrite === false) {
      this.assetsBucket.grantRead(grantable);
    } else {
      this.assetsBucket.grantReadWrite(grantable);
    }

    this.revalidationTable.grantReadWriteData(grantable);
    this.chatCostTable.grantReadWriteData(grantable);
    this.adminDataTable.grantReadWriteData(grantable);

    if (options.allowQueueSend !== false) {
      this.revalidationQueue.grantSendMessages(grantable);
    }
  }

  private grantBlogDataAccess(grantable: iam.IGrantable) {
    this.postsTable.grantReadWriteData(grantable);
    this.blogContentBucket.grantReadWrite(grantable);
    this.blogMediaBucket.grantReadWrite(grantable);
    this.chatExportBucket.grantReadWrite(grantable);
  }

  private attachCloudFrontInvalidationPermission(fn: cloudfrontExperimental.EdgeFunction) {
    const stack = Stack.of(this);
    const distributionArn = stack.formatArn({
      service: 'cloudfront',
      region: '',
      account: stack.account,
      resource: 'distribution',
      resourceName: '*',
    });

    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cloudfront:CreateInvalidation'],
        resources: [distributionArn],
        conditions: {
          StringEquals: {
            'aws:ResourceTag/aws:cloudformation:stack-id': Stack.of(this).stackId,
            'aws:ResourceTag/aws:cloudformation:stack-name': Stack.of(this).stackName,
          },
        },
      })
    );
  }

  private attachSesPermissions(grantable: iam.IGrantable) {
    grantable.grantPrincipal.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail', 'ses:SendRawEmail'],
        resources: ['*'],
      })
    );
  }

  private attachCostMetricPermissions(fn: cloudfrontExperimental.EdgeFunction) {
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'cloudwatch:namespace': this.runtimeEnvironment['OPENAI_COST_METRIC_NAMESPACE'] ?? 'PortfolioChat/OpenAI',
          },
        },
      })
    );
  }

  private grantSecretAccess(grantable: iam.IGrantable, edgeFunction?: cloudfrontExperimental.EdgeFunction) {
    const configuredSecretIds = [
      this.runtimeEnvironment['SECRETS_MANAGER_ENV_SECRET_ID'],
      this.runtimeEnvironment['SECRETS_MANAGER_REPO_SECRET_ID'],
    ].filter((value): value is string => typeof value === 'string' && value.length > 0);

    if (this.envSecret) {
      this.envSecret.grantRead(grantable);
    }
    if (this.repoSecret) {
      this.repoSecret.grantRead(grantable);
    }

    const secretResourceArns = Array.from(
      new Set(configuredSecretIds.flatMap((secretId) => this.buildSecretResourceArns(secretId)))
    );

    if (secretResourceArns.length > 0) {
      grantable.grantPrincipal.addToPrincipalPolicy(
        new iam.PolicyStatement({
          actions: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
          resources: secretResourceArns,
        })
      );
    }

    // For Lambda@Edge functions, explicitly add policy to handle imported secrets and
    // ensure the replicated execution role receives the statement.
    if (edgeFunction && secretResourceArns.length > 0) {
      edgeFunction.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
          resources: secretResourceArns,
        })
      );
    }
  }

  private buildSecretResourceArns(secretId: string): string[] {
    const stack = Stack.of(this);
    const baseArn =
      secretId.startsWith('arn:')
        ? secretId
        : stack.formatArn({
          service: 'secretsmanager',
          resource: 'secret',
          resourceName: secretId,
        });

    const resourceName = baseArn.split(':secret:')[1] ?? secretId;
    const normalizedName = resourceName.replace(/-[A-Za-z0-9]{6}$/, '');

    const wildcardArn = stack.formatArn({
      service: 'secretsmanager',
      resource: 'secret',
      resourceName: `${normalizedName}*`,
    });

    return [baseArn, wildcardArn];
  }

  private restrictFunctionUrlAccess(distribution: cloudfront.Distribution) {
    if (!this.protectedFunctionUrls.length) {
      return;
    }

    for (const entry of this.protectedFunctionUrls) {
      // Only add IAM-based CloudFront invoke permissions for AWS_IAM URLs.
      if (entry.url.authType !== lambda.FunctionUrlAuthType.AWS_IAM) {
        continue;
      }

      entry.url.grantInvokeUrl(
        new iam.ServicePrincipal('cloudfront.amazonaws.com', {
          conditions: {
            ArnLike: {
              'aws:SourceArn': distribution.distributionArn,
            },
            StringEquals: {
              'aws:SourceAccount': Stack.of(this).account,
            },
          },
        })
      );
    }
  }

  private buildEdgeEnvironment(source: Record<string, string>): Record<string, string> {
    const rules = resolveEdgeRuntimeEnvRules(this.runtimeEnvironment);
    return buildEnvironmentFromRules(source, rules);
  }

  private assertEdgeEnvironment(edgeEnv: Record<string, string>) {
    const requiredKeys = ['NODE_ENV', 'AWS_REGION', 'CACHE_BUCKET_NAME', 'CACHE_DYNAMO_TABLE'];
    const missing = requiredKeys.filter((key) => !edgeEnv[key]);
    if (missing.length) {
      throw new Error(`Edge runtime configuration missing required keys: ${missing.join(', ')}`);
    }
  }

  private buildLambdaRuntimeEnv(source: Record<string, string>, keys?: string[]): Record<string, string> {
    const rules = resolveEdgeRuntimeEnvRules(this.runtimeEnvironment);
    const env = buildEnvironmentFromRules(source, rules);
    for (const key of [
      'SECRETS_MANAGER_ENV_SECRET_ID',
      'SECRETS_MANAGER_REPO_SECRET_ID',
      'AWS_SECRETS_MANAGER_PRIMARY_REGION',
      'AWS_SECRETS_MANAGER_FALLBACK_REGION',
    ]) {
      const value = source[key];
      if (value !== undefined) {
        env[key] = value;
      }
    }
    if (keys && keys.length > 0) {
      return this.pickRuntimeEnv(env, keys);
    }
    return this.filterReservedLambdaEnv(env);
  }

  private buildOriginCustomHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      ...this.edgeRuntimeHeaderValues,
      ...buildEdgeSecretHeaders(this.runtimeEnvironment),
    };

    const chatOriginSecret =
      this.runtimeEnvironment['CHAT_ORIGIN_SECRET'] ?? this.runtimeEnvironment['REVALIDATE_SECRET'];
    if (chatOriginSecret) {
      headers['x-chat-origin-secret'] = chatOriginSecret;
    }

    return headers;
  }

  private toPascalCase(value: string): string {
    return value
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }
}
