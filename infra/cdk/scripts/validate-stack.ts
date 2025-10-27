import fs from 'node:fs';
import { App } from 'aws-cdk-lib';
import path from 'node:path';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { PortfolioStack } from '../lib/portfolio-stack';

const OPEN_NEXT_OUTPUT_FILE = 'open-next.output.json';

function resolveOpenNextPath(): string {
  const repoRoot = path.resolve(__dirname, '../../..');
  const repoOpenNextDir = path.join(repoRoot, '.open-next');
  const repoOutputFile = path.join(repoOpenNextDir, OPEN_NEXT_OUTPUT_FILE);

  if (fs.existsSync(repoOutputFile)) {
    console.log(`Using OpenNext output at ${repoOpenNextDir} for validation.`);
    return repoOpenNextDir;
  }

  const fixtureDir = path.resolve(__dirname, '../__fixtures__/open-next');
  const fixtureOutputFile = path.join(fixtureDir, OPEN_NEXT_OUTPUT_FILE);

  if (fs.existsSync(fixtureOutputFile)) {
    console.warn('OpenNext build output not found; falling back to fixture bundle.');
    return fixtureDir;
  }

  throw new Error(
    `Unable to locate ${OPEN_NEXT_OUTPUT_FILE}. Run 'pnpm run build:web' before validating the stack.`
  );
}

function validateStack() {
  const app = new App();
  const openNextPath = resolveOpenNextPath();
  const stack = new PortfolioStack(app, 'ValidationStack', {
    env: {
      account: '000000000000',
      region: 'us-east-1',
    },
    openNextPath,
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
