import type { OpenNextConfig } from '@opennextjs/aws/types/open-next';

const config: OpenNextConfig = {
  default: {
    override: {
      wrapper: 'aws-lambda',
      converter: 'aws-cloudfront',
      incrementalCache: 's3',
      tagCache: 'dynamodb',
    },
  },
  buildCommand: 'pnpm exec next build',
};

export default config;
