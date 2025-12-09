import type * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import type * as lambda from 'aws-cdk-lib/aws-lambda';
import type { StackProps } from 'aws-cdk-lib';

export type BaseFunction = {
  handler: string;
  bundle: string;
};

export interface OpenNextFunctionOrigin extends BaseFunction {
  type: 'function';
  streaming?: boolean;
}

export interface OpenNextS3Origin {
  type: 's3';
  originPath: string;
  copy: {
    from: string;
    to: string;
    cached: boolean;
    versionedSubDir?: string;
  }[];
}

export type OpenNextOrigin = OpenNextFunctionOrigin | OpenNextS3Origin;

export interface OpenNextOutput {
  edgeFunctions?: Record<string, BaseFunction>;
  origins: {
    s3: OpenNextS3Origin;
    default: OpenNextFunctionOrigin;
    imageOptimizer: OpenNextFunctionOrigin;
    [key: string]: OpenNextOrigin;
  };
  behaviors: {
    pattern: string;
    origin?: string;
    edgeFunction?: string;
  }[];
  additionalProps?: {
    disableIncrementalCache?: boolean;
    disableTagCache?: boolean;
    initializationFunction?: BaseFunction;
    warmer?: BaseFunction;
    revalidationFunction?: BaseFunction;
  };
}

export type FunctionOriginResource = {
  origin: cloudfront.IOrigin;
  function?: lambda.Function;
  functionUrl?: lambda.IFunctionUrl;
};

export type ImageOptimizationResources = {
  origin: cloudfront.IOrigin;
  function: lambda.Function;
  functionUrl: lambda.IFunctionUrl;
};

export interface PortfolioStackProps extends StackProps {
  domainName?: string;
  hostedZoneDomain?: string;
  certificateArn?: string;
  alternateDomainNames?: string[];
  environment?: Record<string, string>;
  appDirectory?: string;
  openNextPath?: string;
  validationMode?: boolean;
}
