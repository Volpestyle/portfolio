import fs from 'node:fs';
import path from 'node:path';
import {
  CfnOutput,
  CustomResource,
  Duration,
  Fn,
  RemovalPolicy,
  Size,
  Stack,
  StackProps,
} from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { experimental as cloudfrontExperimental } from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

type BaseFunction = {
  handler: string;
  bundle: string;
};

interface OpenNextFunctionOrigin extends BaseFunction {
  type: 'function';
  streaming?: boolean;
}

interface OpenNextS3Origin {
  type: 's3';
  originPath: string;
  copy: {
    from: string;
    to: string;
    cached: boolean;
    versionedSubDir?: string;
  }[];
}

type OpenNextOrigin = OpenNextFunctionOrigin | OpenNextS3Origin;

interface OpenNextOutput {
  edgeFunctions?: Record<string, BaseFunction>;
  origins: {
    s3: OpenNextS3Origin;
    default: OpenNextFunctionOrigin;
    imageOptimizer: OpenNextFunctionOrigin;
    [key: string]: OpenNextOrigin;
  };
  behaviors: {
    pattern: string;
    origin?: string;
    edgeFunction?: string;
  }[];
  additionalProps?: {
    disableIncrementalCache?: boolean;
    disableTagCache?: boolean;
    initializationFunction?: BaseFunction;
    warmer?: BaseFunction;
    revalidationFunction?: BaseFunction;
  };
}

type FunctionOriginResource = {
  origin: cloudfront.IOrigin;
  function?: lambda.Function;
  functionUrl?: lambda.IFunctionUrl;
};

type ImageOptimizationResources = {
  origin: cloudfront.IOrigin;
  function: lambda.Function;
  functionUrl: lambda.IFunctionUrl;
};

export interface PortfolioStackProps extends StackProps {
  domainName?: string;
  hostedZoneDomain?: string;
  certificateArn?: string;
  alternateDomainNames?: string[];
  environment?: Record<string, string>;
  appDirectory?: string;
  openNextPath?: string;
}

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
  private readonly edgeRuntimeHeaderName = 'x-opn-runtime-config';
  private readonly edgeRuntimeEntriesPerHeader = 8;
  private readonly edgeEnvSecretIdHeaderName = 'x-opn-env-secret-id';
  private readonly edgeRepoSecretIdHeaderName = 'x-opn-repo-secret-id';
  private readonly edgeSecretsRegionHeaderName = 'x-opn-secrets-region';
  private readonly edgeSecretsFallbackRegionHeaderName = 'x-opn-secrets-fallback-region';
  private edgeRuntimeHeaderValues?: Record<string, string>;
  private readonly protectedFunctionUrls: lambda.IFunctionUrl[] = [];

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
    } = props;

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

    this.revalidationTable = this.createRevalidationTable();
    this.revalidationQueue = this.createRevalidationQueue();

    const baseEnv = this.buildBaseEnvironment();

    this.createCacheInitializer(baseEnv);
    const revalidationWorker = this.createRevalidationConsumer(baseEnv);
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
    const serverEdgeFunctionVersion = serverEdgeFunction.currentVersion.node.defaultChild as lambda.CfnVersion | undefined;
    if (serverEdgeFunctionVersion) {
      serverEdgeFunctionVersion.applyRemovalPolicy(RemovalPolicy.RETAIN);
    }
    this.grantRuntimeAccess(serverEdgeFunction);
    this.attachSesPermissions(serverEdgeFunction);
    this.grantSecretAccess(serverEdgeFunction);

    const imageResources = this.createImageOptimizationResources(baseEnv);
    if (imageResources) {
      this.grantRuntimeAccess(imageResources.function, { allowCacheWrite: false });
      this.grantSecretAccess(imageResources.function);
    }

    const additionalOrigins = this.createAdditionalOrigins(baseEnv);
    for (const resource of Object.values(additionalOrigins)) {
      if (resource.function) {
        this.grantRuntimeAccess(resource.function);
        this.grantSecretAccess(resource.function);
      }
    }

    const serverCachePolicy = this.createServerCachePolicy();
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
          },
        ],
      },
      additionalBehaviors: this.buildAdditionalBehaviors({
        serverCachePolicy,
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
  }

  private enrichRuntimeEnvironment(environment: Record<string, string>): Record<string, string> {
    const env: Record<string, string> = {
      NODE_ENV: 'production',
      ...environment,
    };

    if (env['AWS_ENV_SECRET_NAME'] && !env['SECRETS_MANAGER_ENV_SECRET_ID']) {
      env['SECRETS_MANAGER_ENV_SECRET_ID'] = env['AWS_ENV_SECRET_NAME'];
    }

    if (env['AWS_REPO_SECRET_NAME'] && !env['SECRETS_MANAGER_REPO_SECRET_ID']) {
      env['SECRETS_MANAGER_REPO_SECRET_ID'] = env['AWS_REPO_SECRET_NAME'];
    }

    if (!env['AWS_SECRETS_MANAGER_PRIMARY_REGION'] && env['AWS_REGION']) {
      env['AWS_SECRETS_MANAGER_PRIMARY_REGION'] = env['AWS_REGION'];
    }

    return env;
  }

  private resolveOpenNextDirectory(explicitPath: string | undefined, appDirectory: string): string {
    const candidate = explicitPath
      ? path.resolve(explicitPath)
      : path.resolve(appDirectory, '.open-next');

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

  private createRevalidationTable(): dynamodb.Table {
    const table = new dynamodb.Table(this, 'RevalidationTable', {
      partitionKey: { name: 'tag', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'path', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    table.addGlobalSecondaryIndex({
      indexName: 'revalidate',
      partitionKey: { name: 'path', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'revalidatedAt', type: dynamodb.AttributeType.NUMBER },
    });

    return table;
  }

  private createRevalidationQueue(): sqs.Queue {
    const deadLetterQueue = new sqs.Queue(this, 'RevalidationDLQ', {
      fifo: true,
      contentBasedDeduplication: true,
      retentionPeriod: Duration.days(14),
    });

    return new sqs.Queue(this, 'RevalidationQueue', {
      fifo: true,
      contentBasedDeduplication: true,
      visibilityTimeout: Duration.seconds(45),
      deadLetterQueue: {
        queue: deadLetterQueue,
        maxReceiveCount: 5,
      },
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
    env['REVALIDATION_QUEUE_URL'] = this.revalidationQueue.queueUrl;
    env['REVALIDATION_QUEUE_REGION'] = region;
    env['BUCKET_NAME'] = env['BUCKET_NAME'] ?? this.assetsBucket.bucketName;
    env['BUCKET_KEY_PREFIX'] = env['BUCKET_KEY_PREFIX'] ?? '_assets';

    if (!env['AWS_SECRETS_MANAGER_PRIMARY_REGION']) {
      env['AWS_SECRETS_MANAGER_PRIMARY_REGION'] = region;
    }

    return env;
  }

  private createCacheInitializer(baseEnv: Record<string, string>) {
    const initConfig = this.openNextOutput.additionalProps?.initializationFunction;
    const bundlePath = initConfig?.bundle
      ? this.resolveBundlePath(initConfig.bundle)
      : this.resolveBundlePath('dynamodb-provider');

    if (!fs.existsSync(bundlePath)) {
      return;
    }

    const initLogGroup = new logs.LogGroup(this, 'CacheInitializationFunctionLogs', {
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const initFn = new lambda.Function(this, 'CacheInitializationFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      handler: initConfig?.handler ?? 'index.handler',
      code: lambda.Code.fromAsset(bundlePath),
      timeout: Duration.minutes(5),
      memorySize: 256,
      environment: this.pickRuntimeEnv(baseEnv, ['CACHE_DYNAMO_TABLE']),
      logGroup: initLogGroup,
    });

    this.revalidationTable.grantReadWriteData(initFn);
    this.grantSecretAccess(initFn);

    const providerLogGroup = new logs.LogGroup(this, 'CacheInitializationProviderLogs', {
      retention: logs.RetentionDays.ONE_DAY,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const provider = new Provider(this, 'CacheInitializationProvider', {
      onEventHandler: initFn,
      logGroup: providerLogGroup,
    });

    new CustomResource(this, 'CacheInitializationResource', {
      serviceToken: provider.serviceToken,
      properties: {
        version: Date.now().toString(),
      },
    });
  }

  private createRevalidationConsumer(baseEnv: Record<string, string>): lambda.Function | undefined {
    const revalidationConfig = this.openNextOutput.additionalProps?.revalidationFunction;
    if (!revalidationConfig?.bundle) {
      return undefined;
    }

    const bundlePath = this.resolveBundlePath(revalidationConfig.bundle);
    if (!fs.existsSync(bundlePath)) {
      return undefined;
    }

    const workerLogGroup = new logs.LogGroup(this, 'RevalidationWorkerLogs', {
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const fn = new lambda.Function(this, 'RevalidationWorkerFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      handler: revalidationConfig.handler,
      code: lambda.Code.fromAsset(bundlePath),
      timeout: Duration.seconds(30),
      memorySize: 512,
      environment: this.filterReservedLambdaEnv(baseEnv),
      logGroup: workerLogGroup,
    });

    fn.addEventSource(
      new lambdaEventSources.SqsEventSource(this.revalidationQueue, {
        batchSize: 5,
      })
    );

    return fn;
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
    this.edgeRuntimeHeaderValues = this.buildEdgeRuntimeHeaders(edgeEnv);
    if (!this.edgeRuntimeHeaderValues || Object.keys(this.edgeRuntimeHeaderValues).length === 0) {
      throw new Error('Edge runtime configuration is empty; ensure required environment values are provided.');
    }
    this.patchEdgeServerBundle(bundlePath);

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
      environment: this.pickRuntimeEnv(baseEnv, [
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

    this.protectedFunctionUrls.push(functionUrl);

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
          environment: this.filterReservedLambdaEnv(baseEnv),
          logGroup: fnLogGroup,
        });

        const fnUrl = fn.addFunctionUrl({
          authType: lambda.FunctionUrlAuthType.AWS_IAM,
          invokeMode: originConfig.streaming ? lambda.InvokeMode.RESPONSE_STREAM : lambda.InvokeMode.BUFFERED,
        });

        this.protectedFunctionUrls.push(fnUrl);

        const customHeaders = this.buildOriginCustomHeaders();
        const originResource = origins.FunctionUrlOrigin.withOriginAccessControl(fnUrl, {
          originAccessControl: new cloudfront.FunctionUrlOriginAccessControl(this, `${functionId}FunctionOAC`),
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
        'x-prerender-revalidate'
      ),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });
  }

  private buildAdditionalBehaviors(options: {
    serverCachePolicy: cloudfront.ICachePolicy;
    staticCachePolicy: cloudfront.ICachePolicy;
    serverEdgeFunction: cloudfrontExperimental.EdgeFunction;
    originMap: Record<string, cloudfront.IOrigin>;
    responseHeadersPolicy: cloudfront.IResponseHeadersPolicy;
  }): Record<string, cloudfront.BehaviorOptions> {
    const {
      serverCachePolicy,
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
      const cachePolicy = isImageOptimizer
        ? cloudfront.CachePolicy.CACHING_DISABLED
        : isStatic
          ? staticCachePolicy
          : serverCachePolicy;
      const allowedMethods =
        isImageOptimizer || isStatic
          ? cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS
          : cloudfront.AllowedMethods.ALLOW_ALL;
      const originRequestPolicy = isImageOptimizer
        ? cloudfront.OriginRequestPolicy.ALL_VIEWER
        : !isStatic
          ? cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER
          : undefined;
      const edgeLambdas =
        !isStatic && !isImageOptimizer
          ? [
            {
              eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST,
              functionVersion: serverEdgeFunction.currentVersion,
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
    const reserved = new Set(['AWS_REGION', 'AWS_DEFAULT_REGION']);
    const sanitized: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      if (reserved.has(key)) {
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

    if (options.allowQueueSend !== false) {
      this.revalidationQueue.grantSendMessages(grantable);
    }
  }

  private attachSesPermissions(fn: cloudfrontExperimental.EdgeFunction) {
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail', 'ses:SendRawEmail'],
        resources: ['*'],
      })
    );
  }

  private grantSecretAccess(grantable: iam.IGrantable) {
    if (this.envSecret) {
      this.envSecret.grantRead(grantable);
    }
    if (this.repoSecret) {
      this.repoSecret.grantRead(grantable);
    }
  }

  private restrictFunctionUrlAccess(distribution: cloudfront.Distribution) {
    if (!this.protectedFunctionUrls.length) {
      return;
    }

    for (const fnUrl of this.protectedFunctionUrls) {
      fnUrl.grantInvokeUrl(
        new iam.ServicePrincipal('cloudfront.amazonaws.com', {
          conditions: {
            ArnLike: {
              'aws:SourceArn': distribution.distributionArn,
            },
          },
        })
      );
    }
  }

  private buildEdgeEnvironment(source: Record<string, string>): Record<string, string> {
    const { prefixes, explicitKeys, blocklist } = this.resolveEdgeRuntimeEnvRules();
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined) {
        continue;
      }
      if (blocklist.has(key)) {
        continue;
      }
      const isExplicit = explicitKeys.has(key);
      const matchesPrefix = prefixes.some((prefix) => key.startsWith(prefix));
      if (!isExplicit && !matchesPrefix) {
        continue;
      }
      env[key] = value;
    }
    return env;
  }

  private resolveEdgeRuntimeEnvRules(): {
    prefixes: string[];
    explicitKeys: Set<string>;
    blocklist: Set<string>;
  } {
    const splitList = (value?: string) =>
      value
        ? value
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)
        : [];

    const defaultPrefixes = ['NEXT_PUBLIC_'];
    const configuredPrefixes = splitList(this.runtimeEnvironment['EDGE_RUNTIME_ENV_PREFIXES']);
    const prefixes = Array.from(new Set([...defaultPrefixes, ...configuredPrefixes]));

    const defaultExplicitKeys = ['NODE_ENV', 'APP_ENV', 'APP_STAGE', 'APP_HOST'];
    const configuredKeys = splitList(this.runtimeEnvironment['EDGE_RUNTIME_ENV_KEYS']);
    const explicitKeys = new Set<string>([...defaultExplicitKeys, ...configuredKeys]);

    const blocklist = new Set<string>([
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'AWS_SESSION_TOKEN',
      'SECRETS_MANAGER_ENV_SECRET_ID',
      'SECRETS_MANAGER_REPO_SECRET_ID',
      'AWS_SECRETS_MANAGER_PRIMARY_REGION',
      'AWS_SECRETS_MANAGER_FALLBACK_REGION',
      'AWS_SECRETS_MANAGER_SECONDARY_REGION',
      'OPENAI_API_KEY',
      'GH_TOKEN',
      'DATABASE_URL',
      'API_KEY',
      'AWS_ENV_SECRET_NAME',
      'AWS_REPO_SECRET_NAME',
    ]);
    for (const key of splitList(this.runtimeEnvironment['EDGE_RUNTIME_ENV_BLOCKLIST'])) {
      blocklist.add(key);
    }

    return {
      prefixes,
      explicitKeys,
      blocklist,
    };
  }

  private buildEdgeRuntimeHeaders(env: Record<string, string>): Record<string, string> {
    const entries = Object.entries(env);
    if (!entries.length) {
      return {};
    }

    const headers: Record<string, string> = {};
    const chunkSize = Math.max(1, this.edgeRuntimeEntriesPerHeader);

    for (let start = 0; start < entries.length; start += chunkSize) {
      const chunkEntries = entries.slice(start, start + chunkSize);
      const templateParts: string[] = ['{'];
      const substitutions: Record<string, any> = {};

      chunkEntries.forEach(([key, value], index) => {
        const placeholder = `v${index}`;
        templateParts.push(`"${key}":"\${${placeholder}}"`);
        if (index < chunkEntries.length - 1) {
          templateParts.push(',');
        }
        substitutions[placeholder] = value;
      });

      templateParts.push('}');
      const jsonTemplate = templateParts.join('');
      const json = Fn.sub(jsonTemplate, substitutions);
      const encoded = Fn.base64(json);

      const chunkIndex = Math.floor(start / chunkSize);
      const headerName =
        chunkIndex === 0 && entries.length <= chunkSize
          ? this.edgeRuntimeHeaderName
          : `${this.edgeRuntimeHeaderName}-${chunkIndex + 1}`;

      headers[headerName] = encoded;
    }

    return headers;
  }

  private buildEdgeSecretHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const envSecretId = this.runtimeEnvironment['SECRETS_MANAGER_ENV_SECRET_ID'];
    if (envSecretId) {
      headers[this.edgeEnvSecretIdHeaderName] = envSecretId;
    }

    const repoSecretId = this.runtimeEnvironment['SECRETS_MANAGER_REPO_SECRET_ID'];
    if (repoSecretId) {
      headers[this.edgeRepoSecretIdHeaderName] = repoSecretId;
    }

    const primaryRegion =
      this.runtimeEnvironment['AWS_SECRETS_MANAGER_PRIMARY_REGION'] ??
      this.runtimeEnvironment['AWS_REGION'];
    if (primaryRegion) {
      headers[this.edgeSecretsRegionHeaderName] = primaryRegion;
    }

    const fallbackRegion =
      this.runtimeEnvironment['AWS_SECRETS_MANAGER_FALLBACK_REGION'] ??
      this.runtimeEnvironment['AWS_SECRETS_MANAGER_SECONDARY_REGION'];
    if (fallbackRegion && fallbackRegion !== primaryRegion) {
      headers[this.edgeSecretsFallbackRegionHeaderName] = fallbackRegion;
    }

    return headers;
  }

  private buildOriginCustomHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(this.edgeRuntimeHeaderValues ?? {})) {
      headers[name] = value;
    }

    for (const [key, value] of Object.entries(this.buildEdgeSecretHeaders())) {
      headers[key] = value;
    }

    return headers;
  }

  private patchEdgeServerBundle(bundlePath: string) {
    const indexPath = path.join(bundlePath, 'index.mjs');
    const handlerPath = path.join(bundlePath, 'server-handler.mjs');

    if (!fs.existsSync(handlerPath)) {
      if (!fs.existsSync(indexPath)) {
        throw new Error(`Expected OpenNext server bundle at ${indexPath}`);
      }
      fs.renameSync(indexPath, handlerPath);
    }

    const runtimeHeaderNames = Object.keys(this.edgeRuntimeHeaderValues ?? {});
    if (!runtimeHeaderNames.length) {
      throw new Error('Edge runtime configuration headers missing; ensure buildEdgeRuntimeHeaders ran first.');
    }
    const runtimeHeaderLiteral = JSON.stringify(runtimeHeaderNames);

    const wrapperSource = `import { Buffer } from 'node:buffer';

const RUNTIME_CONFIG_HEADERS = ${runtimeHeaderLiteral};
const RUNTIME_CONFIG_BASE_HEADER = '${this.edgeRuntimeHeaderName}';
const ENV_SECRET_HEADER = '${this.edgeEnvSecretIdHeaderName}';
const REPO_SECRET_HEADER = '${this.edgeRepoSecretIdHeaderName}';
const SECRETS_REGION_HEADER = '${this.edgeSecretsRegionHeaderName}';
const SECRETS_FALLBACK_REGION_HEADER = '${this.edgeSecretsFallbackRegionHeaderName}';
let cachedHandlerPromise;

function readCustomHeader(origin, name) {
  const entries = origin?.customHeaders?.[name];
  if (!entries || entries.length === 0) {
    return undefined;
  }
  return entries[0]?.value;
}

function extractRuntimeConfig(event) {
  try {
    const record = event?.Records?.[0];
    const request = record?.cf?.request;
    if (!request) {
      return undefined;
    }
    const origin = request.origin?.s3 ?? request.origin?.custom;
    const encodedChunks = [];
    for (const headerName of RUNTIME_CONFIG_HEADERS) {
      const value = readCustomHeader(origin, headerName);
      if (value) {
        encodedChunks.push(value);
      }
    }
    if (encodedChunks.length === 0) {
      const fallback = readCustomHeader(origin, RUNTIME_CONFIG_BASE_HEADER);
      if (fallback) {
        encodedChunks.push(fallback);
      }
    }
    if (encodedChunks.length === 0) {
      console.error('Lambda@Edge runtime config header missing');
      return undefined;
    }
    const runtimeConfig = {};
    for (const encoded of encodedChunks) {
      const json = Buffer.from(encoded, 'base64').toString('utf-8');
      const parsed = JSON.parse(json);
      if (parsed && typeof parsed === 'object') {
        Object.assign(runtimeConfig, parsed);
      }
    }

    const envSecretId = readCustomHeader(origin, ENV_SECRET_HEADER);
    if (envSecretId) {
      runtimeConfig.SECRETS_MANAGER_ENV_SECRET_ID = envSecretId;
    }

    const repoSecretId = readCustomHeader(origin, REPO_SECRET_HEADER);
    if (repoSecretId) {
      runtimeConfig.SECRETS_MANAGER_REPO_SECRET_ID = repoSecretId;
    }

    const primaryRegion = readCustomHeader(origin, SECRETS_REGION_HEADER);
    if (primaryRegion) {
      runtimeConfig.AWS_SECRETS_MANAGER_PRIMARY_REGION = primaryRegion;
    }

    const fallbackRegion = readCustomHeader(origin, SECRETS_FALLBACK_REGION_HEADER);
    if (fallbackRegion) {
      runtimeConfig.AWS_SECRETS_MANAGER_FALLBACK_REGION = fallbackRegion;
    }

    return runtimeConfig;
  } catch (error) {
    console.error('Failed to parse Lambda@Edge runtime configuration', error);
    return undefined;
  }
}

function applyRuntimeConfig(config) {
  if (!config) {
    return;
  }
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'string' && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function loadHandler(event) {
  if (!cachedHandlerPromise) {
    const config = extractRuntimeConfig(event);
    if (!config) {
      throw new Error('Missing Lambda@Edge runtime configuration header');
    }
    applyRuntimeConfig(config);
    cachedHandlerPromise = import('./server-handler.mjs').then((mod) => mod.handler);
  }
  return cachedHandlerPromise;
}

export const handler = async (event, context, callback) => {
  if (!event?.Records?.[0]?.cf?.request) {
    if (event?.type === 'warmer') {
      return { type: 'warmer', serverId: 'edge' };
    }
  }

  const actualHandler = await loadHandler(event);
  return actualHandler(event, context, callback);
};
`;

    fs.writeFileSync(indexPath, wrapperSource, { encoding: 'utf-8' });
  }

  private toPascalCase(value: string): string {
    return value
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }
}
