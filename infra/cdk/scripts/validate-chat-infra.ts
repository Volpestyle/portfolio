/**
 * Standalone validation for the ChatInfra construct. Does not require an
 * OpenNext build output; exercises just the chat cost table/bucket/alarm
 * creation so we can sanity check CloudFormation synth after CDK changes.
 */
import { App, Stack } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { ChatInfra } from '../lib/constructs/chat-infra';

function buildTemplate(runtimeEnvironment: Record<string, string>): Template {
  const app = new App();
  const stack = new Stack(app, 'ChatInfraTestStack', {
    env: { account: '000000000000', region: 'us-east-1' },
  });
  new ChatInfra(stack, 'ChatInfra', { runtimeEnvironment });
  return Template.fromStack(stack);
}

function validate() {
  // Case 1: default happy path.
  const template = buildTemplate({
    CHAT_COST_ALERT_EMAIL: 'alerts@example.com',
    CHAT_COST_ALERT_THRESHOLD_USD: '10',
  });

  template.resourceCountIs('AWS::DynamoDB::Table', 1);
  template.resourceCountIs('AWS::S3::Bucket', 1);
  template.resourceCountIs('AWS::CloudWatch::Alarm', 1);
  template.resourceCountIs('AWS::SNS::Topic', 1);
  template.resourceCountIs('AWS::SNS::Subscription', 1);

  // Alarm must reference the active runtime cost metric via a SEARCH
  // expression so it follows the currently-active YearMonth dimension
  // automatically.
  template.hasResourceProperties('AWS::CloudWatch::Alarm', {
    Threshold: 10,
    ComparisonOperator: 'GreaterThanOrEqualToThreshold',
    Metrics: Match.arrayWith([
      Match.objectLike({
        Expression: Match.stringLikeRegexp('SEARCH.*PortfolioChat/Costs.*RuntimeCostMtdUsd'),
      }),
    ]),
  });

  template.hasResourceProperties('AWS::SNS::Subscription', {
    Protocol: 'email',
    Endpoint: 'alerts@example.com',
  });

  // Case 2: alarm is NOT created when no email is configured.
  const noEmailTemplate = buildTemplate({});
  noEmailTemplate.resourceCountIs('AWS::CloudWatch::Alarm', 0);
  noEmailTemplate.resourceCountIs('AWS::SNS::Topic', 0);

  // Case 3: backwards compat with OPENAI_COST_ALERT_EMAIL.
  const legacyTemplate = buildTemplate({ OPENAI_COST_ALERT_EMAIL: 'legacy@example.com' });
  legacyTemplate.resourceCountIs('AWS::CloudWatch::Alarm', 1);
  legacyTemplate.hasResourceProperties('AWS::SNS::Subscription', {
    Protocol: 'email',
    Endpoint: 'legacy@example.com',
  });

  // Case 4: custom threshold.
  const customTemplate = buildTemplate({
    CHAT_COST_ALERT_EMAIL: 'ops@example.com',
    CHAT_COST_ALERT_THRESHOLD_USD: '25',
  });
  customTemplate.hasResourceProperties('AWS::CloudWatch::Alarm', { Threshold: 25 });

  // Case 5: invalid threshold falls back to default $10.
  const invalidThresholdTemplate = buildTemplate({
    CHAT_COST_ALERT_EMAIL: 'ops@example.com',
    CHAT_COST_ALERT_THRESHOLD_USD: 'not-a-number',
  });
  invalidThresholdTemplate.hasResourceProperties('AWS::CloudWatch::Alarm', { Threshold: 10 });

  // Case 6: falls back to first ADMIN_EMAILS entry when no explicit alert
  // email is set. The deploy workflow already exposes ADMIN_EMAILS so the
  // alarm self-provisions on existing deployments.
  const adminFallbackTemplate = buildTemplate({
    ADMIN_EMAILS: 'first@example.com, second@example.com',
  });
  adminFallbackTemplate.resourceCountIs('AWS::CloudWatch::Alarm', 1);
  adminFallbackTemplate.hasResourceProperties('AWS::SNS::Subscription', {
    Protocol: 'email',
    Endpoint: 'first@example.com',
  });

  // Case 7: explicit email wins over ADMIN_EMAILS.
  const explicitWinsTemplate = buildTemplate({
    CHAT_COST_ALERT_EMAIL: 'explicit@example.com',
    ADMIN_EMAILS: 'admin@example.com',
  });
  explicitWinsTemplate.hasResourceProperties('AWS::SNS::Subscription', {
    Protocol: 'email',
    Endpoint: 'explicit@example.com',
  });

  console.log('ChatInfra construct validated successfully.');
}

try {
  validate();
} catch (error) {
  console.error('ChatInfra validation failed.');
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
}
