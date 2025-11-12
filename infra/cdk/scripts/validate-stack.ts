import fs from 'node:fs';
import { App } from 'aws-cdk-lib';
import path from 'node:path';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { PortfolioStack } from '../lib/portfolio-stack';

const OPEN_NEXT_OUTPUT_FILE = 'open-next.output.json';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

interface LambdaEnvironment {
  Variables?: Record<string, unknown>;
}

interface LambdaProperties {
  Environment?: LambdaEnvironment;
}

interface LambdaTemplateResource {
  Properties?: LambdaProperties;
}

const isLambdaEnvironment = (value: unknown): value is LambdaEnvironment => {
  if (!isRecord(value)) {
    return false;
  }

  const { Variables } = value;
  return Variables === undefined || isRecord(Variables);
};

const isLambdaProperties = (value: unknown): value is LambdaProperties => {
  if (!isRecord(value)) {
    return false;
  }

  const { Environment } = value;
  return Environment === undefined || isLambdaEnvironment(Environment);
};

const isLambdaTemplateResource = (value: unknown): value is LambdaTemplateResource => {
  if (!isRecord(value)) {
    return false;
  }

  const { Properties } = value;
  return Properties === undefined || isLambdaProperties(Properties);
};

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

  const requireEnv = (name: string): string => {
    const value = process.env[name];
    if (!value) {
      throw new Error(`${name} must be set before running validate-stack.ts`);
    }
    return value;
  };

  const stack = new PortfolioStack(app, 'ValidationStack', {
    env: {
      account: '000000000000',
      region: 'us-east-1',
    },
    openNextPath,
    environment: {
      NEXT_PUBLIC_SITE_URL: requireEnv('NEXT_PUBLIC_SITE_URL'),
    },
    validationMode: true,
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

  const expectedSiteUrl = requireEnv('NEXT_PUBLIC_SITE_URL');
  const lambdaResourceValues: unknown[] = Object.values(lambdaResources);
  const lambdaHasSiteEnv = lambdaResourceValues.some((resource) => {
    if (!isLambdaTemplateResource(resource)) {
      return false;
    }

    const variables = resource.Properties?.Environment?.Variables;
    return (
      typeof variables?.NEXT_PUBLIC_SITE_URL === 'string' &&
      variables.NEXT_PUBLIC_SITE_URL === expectedSiteUrl &&
      typeof variables.NODE_ENV === 'string' &&
      variables.NODE_ENV === 'production'
    );
  });
  if (!lambdaHasSiteEnv) {
    throw new Error(
      `Expected at least one Lambda function to include NEXT_PUBLIC_SITE_URL=${expectedSiteUrl} and NODE_ENV=production`
    );
  }

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
