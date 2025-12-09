import { CustomResource, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Provider } from 'aws-cdk-lib/custom-resources';
import fs from 'node:fs';
import { Construct } from 'constructs';
import { OpenNextOutput } from '../types';

export interface CacheInfraProps {
  openNextOutput: OpenNextOutput;
  resolveBundlePath: (bundle: string) => string;
  grantSecretAccess: (grantable: iam.IGrantable) => void;
}

export class CacheInfra extends Construct {
  readonly revalidationTable: dynamodb.Table;
  readonly revalidationQueue: sqs.Queue;

  private readonly openNextOutput: OpenNextOutput;
  private readonly resolveBundlePath: (bundle: string) => string;
  private readonly grantSecretAccessFn: (grantable: iam.IGrantable) => void;

  constructor(scope: Construct, id: string, props: CacheInfraProps) {
    super(scope, id);

    this.openNextOutput = props.openNextOutput;
    this.resolveBundlePath = props.resolveBundlePath;
    this.grantSecretAccessFn = props.grantSecretAccess;

    this.revalidationTable = this.createRevalidationTable();
    this.revalidationQueue = this.createRevalidationQueue();
  }

  addInitializer(baseEnv: Record<string, string>, selectEnv: (keys: string[]) => Record<string, string>) {
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
      environment: selectEnv(['CACHE_DYNAMO_TABLE', 'NODE_ENV', 'NEXT_PUBLIC_SITE_URL']),
      logGroup: initLogGroup,
    });

    this.revalidationTable.grantReadWriteData(initFn);
    this.grantSecretAccessFn(initFn);

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

    return initFn;
  }

  addRevalidationConsumer(
    baseEnv: Record<string, string>,
    selectEnv: (keys: string[]) => Record<string, string>
  ): lambda.Function | undefined {
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
      environment: selectEnv([
        'CACHE_DYNAMO_TABLE',
        'REVALIDATION_QUEUE_URL',
        'REVALIDATION_QUEUE_REGION',
        'AWS_REGION',
        'AWS_SECRETS_MANAGER_PRIMARY_REGION',
        'NODE_ENV',
        'NEXT_PUBLIC_SITE_URL',
      ]),
      logGroup: workerLogGroup,
    });

    fn.addEventSource(
      new lambdaEventSources.SqsEventSource(this.revalidationQueue, {
        batchSize: 5,
      })
    );

    return fn;
  }

  private createRevalidationTable(): dynamodb.Table {
    const table = new dynamodb.Table(this, 'RevalidationTable', {
      partitionKey: { name: 'tag', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'path', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.DESTROY,
      tableName: `${Stack.of(this).stackName}-Revalidation`,
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
}
