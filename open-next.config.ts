import type { OpenNextConfig } from '@opennextjs/aws/types/open-next';

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
      packages: ['@next/env@15.5.6', '@swc/helpers@0.5.15', 'postcss@8.4.31', 'styled-jsx@5.1.6'],
    },
  },
  imageOptimization: {
    override: {
      wrapper: 'aws-lambda',
      converter: 'aws-cloudfront',
    },
  },
  buildCommand: 'pnpm exec next build',
};

export default config;
