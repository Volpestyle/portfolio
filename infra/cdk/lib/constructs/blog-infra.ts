import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface BlogInfraProps {
  runtimeEnvironment: Record<string, string>;
  primaryDomainName?: string;
  alternateDomainNames?: string[];
}

export class BlogInfra extends Construct {
  readonly postsTable: dynamodb.Table;
  readonly adminDataTable: dynamodb.Table;
  readonly contentBucket: s3.Bucket;
  readonly mediaBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: BlogInfraProps) {
    super(scope, id);

    const { runtimeEnvironment, primaryDomainName, alternateDomainNames = [] } = props;

    this.postsTable = this.createBlogPostsTable();
    this.adminDataTable = this.createAdminDataTable();
    this.contentBucket = this.createBlogContentBucket();
    this.mediaBucket = this.createBlogMediaBucket(runtimeEnvironment, primaryDomainName, alternateDomainNames);
  }

  private createBlogPostsTable(): dynamodb.Table {
    const tableName = `${Stack.of(this).stackName}-BlogPosts`;
    const table = new dynamodb.Table(this, 'BlogPostsTable', {
      partitionKey: { name: 'slug', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      tableName,
    });

    table.addGlobalSecondaryIndex({
      indexName: 'byStatusPublishedAt',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'publishedAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    return table;
  }

  private createAdminDataTable(): dynamodb.Table {
    const tableName = `${Stack.of(this).stackName}-AdminData`;
    return new dynamodb.Table(this, 'AdminDataTable', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      tableName,
    });
  }

  private createBlogContentBucket(): s3.Bucket {
    return new s3.Bucket(this, 'BlogContentBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      lifecycleRules: [
        {
          enabled: true,
          noncurrentVersionExpiration: Duration.days(30),
          abortIncompleteMultipartUploadAfter: Duration.days(7),
        },
        {
          enabled: true,
          expiration: Duration.days(90),
          prefix: 'posts/',
        },
      ],
    });
  }

  private createBlogMediaBucket(
    runtimeEnvironment: Record<string, string>,
    primaryDomainName?: string,
    alternateDomainNames: string[] = []
  ): s3.Bucket {
    return new s3.Bucket(this, 'BlogMediaBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      lifecycleRules: [
        {
          enabled: true,
          noncurrentVersionExpiration: Duration.days(30),
          abortIncompleteMultipartUploadAfter: Duration.days(7),
        },
      ],
      cors: [
        {
          allowedHeaders: ['*'],
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.HEAD],
          allowedOrigins: this.resolveMediaCorsOrigins(runtimeEnvironment, primaryDomainName, alternateDomainNames),
          maxAge: 3000,
        },
      ],
    });
  }

  private resolveMediaCorsOrigins(
    runtimeEnvironment: Record<string, string>,
    primaryDomainName?: string,
    alternateDomainNames: string[] = []
  ): string[] {
    const origins = new Set<string>(['http://localhost:3000', 'https://localhost:3000']);
    const siteUrl = runtimeEnvironment['NEXT_PUBLIC_SITE_URL'];
    if (siteUrl) {
      origins.add(siteUrl.replace(/\/$/, ''));
    }
    if (primaryDomainName) {
      origins.add(`https://${primaryDomainName}`);
    }
    for (const domain of alternateDomainNames ?? []) {
      if (domain) {
        origins.add(`https://${domain}`);
      }
    }
    return Array.from(origins);
  }
}
