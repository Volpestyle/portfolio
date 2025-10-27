import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { PortfolioStack } from '../lib/portfolio-stack';

function validateStack() {
  const app = new App();
  const stack = new PortfolioStack(app, 'ValidationStack', {
    // Use a public image during validation to avoid Docker builds from source
    containerImage: ecs.ContainerImage.fromRegistry('public.ecr.aws/docker/library/node:20'),
    containerEnvironment: {
      NEXT_PUBLIC_SITE_URL: 'https://example.com',
    },
  });

  const template = Template.fromStack(stack);

  template.resourceCountIs('AWS::EC2::VPC', 1);
  template.resourceCountIs('AWS::ECS::Cluster', 1);
  template.resourceCountIs('AWS::ECS::Service', 1);
  template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);

  template.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
    Type: 'application',
    Scheme: 'internet-facing',
  });

  template.hasResourceProperties('AWS::ECS::TaskDefinition', {
    Cpu: '512',
    Memory: '1024',
    ContainerDefinitions: Match.arrayWith([
      Match.objectLike({
        Name: 'portfolio-web',
        Image: Match.anyValue(),
        PortMappings: Match.arrayWith([
          Match.objectLike({
            ContainerPort: 3000,
          }),
        ]),
        Environment: Match.arrayWith([
          Match.objectLike({ Name: 'NODE_ENV', Value: 'production' }),
          Match.objectLike({ Name: 'PORT', Value: '3000' }),
          Match.objectLike({ Name: 'NEXT_PUBLIC_SITE_URL', Value: 'https://example.com' }),
        ]),
      }),
    ]),
  });

  template.hasResourceProperties('AWS::ApplicationAutoScaling::ScalableTarget', {
    MinCapacity: 1,
    MaxCapacity: 2,
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
