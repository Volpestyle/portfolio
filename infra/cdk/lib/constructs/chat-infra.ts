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
    this.createOpenAiCostAlarm(props.runtimeEnvironment);
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
      removalPolicy: RemovalPolicy.RETAIN,
      tableName: `${Stack.of(this).stackName}-ChatRuntimeCost`,
    });
  }

  private createOpenAiCostAlarm(runtimeEnvironment: Record<string, string>) {
    const email = runtimeEnvironment['OPENAI_COST_ALERT_EMAIL'];
    const metricsEnabled = runtimeEnvironment['OPENAI_COST_METRICS_ENABLED'] === 'true';
    if (!email || !metricsEnabled) {
      return;
    }

    const namespace = runtimeEnvironment['OPENAI_COST_METRIC_NAMESPACE'] ?? 'PortfolioChat/OpenAI';
    const metricName = runtimeEnvironment['OPENAI_COST_METRIC_NAME'] ?? 'EstimatedCost';

    const dailyCost = new cloudwatch.Metric({
      namespace,
      metricName,
      statistic: 'Sum',
      period: Duration.days(1),
    });

    const rolling30d = new cloudwatch.MathExpression({
      expression: 'SUM([cost], 30)',
      usingMetrics: { cost: dailyCost },
      period: Duration.days(1),
      label: 'OpenAICost30d',
    });

    const alarm = new cloudwatch.Alarm(this, 'OpenAICostAlarm', {
      metric: rolling30d,
      threshold: 10,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      alarmDescription: 'OpenAI estimated cost over the last ~30 days exceeded $10.',
    });

    const missingDataAlarm = new cloudwatch.Alarm(this, 'OpenAICostMetricMissing', {
      metric: dailyCost.with({ statistic: 'SampleCount' }),
      threshold: 1,
      evaluationPeriods: 3,
      datapointsToAlarm: 3,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      alarmDescription: 'No OpenAI cost metrics received for 3 days; publishing may be broken.',
    });

    const topic = new sns.Topic(this, 'OpenAICostAlarmTopic', {
      displayName: 'OpenAI Cost Alarm',
    });
    topic.addSubscription(new subs.EmailSubscription(email));

    alarm.addAlarmAction(new cloudwatchActions.SnsAction(topic));
    alarm.addOkAction(new cloudwatchActions.SnsAction(topic));
    missingDataAlarm.addAlarmAction(new cloudwatchActions.SnsAction(topic));
    missingDataAlarm.addOkAction(new cloudwatchActions.SnsAction(topic));
  }
}
