import type { OpenNextConfig } from '@opennextjs/aws/types/open-next';

const baseRuntimePackages = [
  '@next/env@15.5.6',
  '@swc/helpers@0.5.15',
  'postcss@8.4.31',
  'styled-jsx@5.1.6',
  'react@19.0.0',
  'react-dom@19.0.0',
];

const config: OpenNextConfig = {
  default: {
    override: {
      wrapper: 'aws-lambda',
      converter: 'aws-cloudfront',
      incrementalCache: 's3',
      tagCache: 'dynamodb',
    },
    placement: 'global',
    install: {
      packages: [
        ...baseRuntimePackages,
        // AWS SDK and Smithy dependencies for Lambda@Edge
        '@aws-sdk/client-dynamodb@3',
        '@aws-sdk/lib-dynamodb@3',
        '@aws-sdk/client-s3@3',
        '@aws-sdk/s3-request-presigner@3',
        '@aws-sdk/client-scheduler@3',
        '@aws-sdk/client-secrets-manager@3',
        '@smithy/config-resolver@3',
        '@smithy/core@2',
        '@smithy/fetch-http-handler@4',
        '@smithy/middleware-retry@3',
        '@smithy/node-config-provider@3',
        '@smithy/protocol-http@4',
        '@smithy/smithy-client@3',
        '@smithy/types@3',
        '@smithy/util-stream@3',
      ],
    },
  },
  functions: {
    // Stream the chat API from a regional Lambda Function URL instead of Lambda@Edge.
    // CloudFront origin-request Lambdas can't stream, so this routes /api/chat to a
    // streaming-capable function (InvokeMode.RESPONSE_STREAM).
    chat: {
      routes: ['app/api/chat/route'],
      patterns: ['api/chat*'],
      placement: 'regional',
      override: {
        wrapper: 'aws-lambda-streaming',
        converter: 'aws-apigw-v2',
      },
      install: {
        packages: [
          ...baseRuntimePackages,
          '@aws-sdk/client-secrets-manager@3',
          '@aws-sdk/client-cloudwatch@3',
          '@aws-sdk/client-dynamodb@3',
          '@aws-sdk/client-sns@3',
        ],
      },
    },
  },
  imageOptimization: {
    override: {
      wrapper: 'aws-lambda',
    },
  },
  buildCommand: 'pnpm exec next build',
};

export default config;
