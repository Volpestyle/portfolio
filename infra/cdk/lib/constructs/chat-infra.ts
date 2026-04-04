import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

export interface ChatInfraProps {
  runtimeEnvironment: Record<string, string>;
}

export class ChatInfra extends Construct {
  readonly chatExportBucket: s3.Bucket;
  readonly chatCostTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: ChatInfraProps) {
    super(scope, id);

    this.chatExportBucket = this.createChatExportBucket();
    this.chatCostTable = this.createChatCostTable();
    this.createChatCostAlarm(props.runtimeEnvironment);
  }

  private createChatExportBucket(): s3.Bucket {
    return new s3.Bucket(this, 'ChatExportBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: false,
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      lifecycleRules: [
        {
          enabled: true,
          expiration: Duration.days(7),
          prefix: 'chat/exports/',
          abortIncompleteMultipartUploadAfter: Duration.days(7),
        },
      ],
    });
  }

  private createChatCostTable(): dynamodb.Table {
    return new dynamodb.Table(this, 'ChatRuntimeCostTable', {
      partitionKey: { name: 'owner_env', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'year_month', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.DESTROY,
      tableName: `${Stack.of(this).stackName}-ChatRuntimeCost`,
    });
  }

  private createChatCostAlarm(runtimeEnvironment: Record<string, string>) {
    // `CHAT_COST_ALERT_EMAIL` is the preferred env var; fall back to the
    // legacy `OPENAI_COST_ALERT_EMAIL` name, then to the first entry in
    // `ADMIN_EMAILS` (which the deploy workflow already exposes) so this
    // alarm self-configures without requiring new CI variables.
    const explicitEmail = runtimeEnvironment['CHAT_COST_ALERT_EMAIL'] ?? runtimeEnvironment['OPENAI_COST_ALERT_EMAIL'];
    const adminEmailFallback = runtimeEnvironment['ADMIN_EMAILS']
      ?.split(',')
      .map((entry) => entry.trim())
      .find((entry) => entry.length > 0);
    const email = explicitEmail ?? adminEmailFallback;
    if (!email) {
      return;
    }

    // Monitor the metric that the active runtime cost publisher emits per
    // chat turn (see packages/chat-next-api/src/runtimeCost.ts). CloudWatch
    // MetricAlarms do not support SEARCH expressions, so the publisher also
    // emits RuntimeCostMtdUsd with just App/Env dimensions (no rolling
    // YearMonth) specifically so this alarm can bind to a stable dimension
    // set without needing to be rotated every month.
    const appId =
      runtimeEnvironment['COST_APP_ID'] ??
      runtimeEnvironment['NEXT_PUBLIC_APP_NAME'] ??
      runtimeEnvironment['APP_NAME'] ??
      'portfolio';
    const rawEnv = runtimeEnvironment['APP_ENV'] ?? runtimeEnvironment['NEXT_PUBLIC_APP_ENV'] ?? 'prod';
    const env = rawEnv === 'production' ? 'prod' : rawEnv;
    const mtdCost = new cloudwatch.Metric({
      namespace: 'PortfolioChat/Costs',
      metricName: 'RuntimeCostMtdUsd',
      dimensionsMap: { App: appId, Env: env },
      statistic: 'Maximum',
      period: Duration.minutes(5),
      label: 'ChatMtdCostUsd',
    });

    const thresholdRaw = runtimeEnvironment['CHAT_COST_ALERT_THRESHOLD_USD'];
    const parsedThreshold = thresholdRaw ? Number(thresholdRaw) : NaN;
    const threshold = Number.isFinite(parsedThreshold) && parsedThreshold > 0 ? parsedThreshold : 10;

    const alarm = new cloudwatch.Alarm(this, 'ChatMtdCostAlarm', {
      metric: mtdCost,
      threshold,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      alarmDescription: `Chat month-to-date cost exceeded $${threshold} USD.`,
    });

    const topic = new sns.Topic(this, 'ChatCostAlarmTopic', {
      displayName: 'Chat Cost Alarm',
    });
    topic.addSubscription(new subs.EmailSubscription(email));

    alarm.addAlarmAction(new cloudwatchActions.SnsAction(topic));
    alarm.addOkAction(new cloudwatchActions.SnsAction(topic));
  }
}
