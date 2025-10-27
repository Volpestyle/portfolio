import { App } from 'aws-cdk-lib';
import path from 'node:path';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { PortfolioStack } from '../lib/portfolio-stack';

function validateStack() {
  const app = new App();
  const stack = new PortfolioStack(app, 'ValidationStack', {
    openNextPath: path.resolve(__dirname, '../__fixtures__/open-next'),
    environment: {
      NEXT_PUBLIC_SITE_URL: 'https://example.com',
    },
  });

  const template = Template.fromStack(stack);

  template.resourceCountIs('AWS::CloudFront::Distribution', 1);

  const lambdaResources = template.findResources('AWS::Lambda::Function');
  if (Object.keys(lambdaResources).length < 2) {
    throw new Error('Expected at least two Lambda functions in the stack');
  }

  const bucketResources = template.findResources('AWS::S3::Bucket');
  if (Object.keys(bucketResources).length < 1) {
    throw new Error('Expected at least one S3 bucket in the stack');
  }

  template.hasResourceProperties('AWS::Lambda::Function', {
    Environment: {
      Variables: Match.objectLike({
        NODE_ENV: 'production',
        NEXT_PUBLIC_SITE_URL: 'https://example.com',
      }),
    },
    Runtime: Match.stringLikeRegexp('nodejs'),
  });

  template.hasResourceProperties('AWS::S3::Bucket', {
    VersioningConfiguration: Match.objectLike({
      Status: 'Enabled',
    }),
  });

  console.log('CDK stack validated successfully.');
}

try {
  validateStack();
} catch (error) {
  console.error('CDK stack validation failed.');
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
}
