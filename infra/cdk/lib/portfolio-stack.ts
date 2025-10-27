import path from 'node:path';
import { Duration, Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';

export interface PortfolioStackProps extends StackProps {
  domainName?: string;
  hostedZoneDomain?: string;
  certificateArn?: string;
  alternateDomainNames?: string[];
  desiredCount?: number;
  cpu?: number;
  memoryMiB?: number;
  containerEnvironment?: Record<string, string>;
  appDirectory?: string;
  containerImage?: ecs.ContainerImage;
}

export class PortfolioStack extends Stack {
  constructor(scope: Construct, id: string, props: PortfolioStackProps = {}) {
    super(scope, id, props);

    const {
      domainName,
      hostedZoneDomain,
      certificateArn,
      alternateDomainNames = [],
      desiredCount = 1,
      cpu = 512,
      memoryMiB = 1024,
      containerEnvironment = {},
      appDirectory = path.resolve(process.cwd(), '..', '..'),
      containerImage,
    } = props;

    const vpc = new ec2.Vpc(this, 'PortfolioVpc', {
      maxAzs: 2,
      natGateways: 1,
    });

    const cluster = new ecs.Cluster(this, 'PortfolioCluster', {
      vpc,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });

    const image =
      containerImage ??
      ecs.ContainerImage.fromAsset(appDirectory, {
        file: 'Dockerfile',
      });

    const domainZone =
      domainName && hostedZoneDomain
        ? route53.HostedZone.fromLookup(this, 'PortfolioZone', {
            domainName: hostedZoneDomain,
          })
        : undefined;

    const certificate = certificateArn
      ? acm.Certificate.fromCertificateArn(this, 'PortfolioCert', certificateArn)
      : domainName && domainZone
        ? new acm.Certificate(this, 'PortfolioCert', {
            domainName,
            subjectAlternativeNames: alternateDomainNames,
            validation: acm.CertificateValidation.fromDns(domainZone),
          })
        : undefined;

    const environment = {
      NODE_ENV: 'production',
      PORT: '3000',
      ...containerEnvironment,
    };

    const fargateService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'PortfolioService', {
      cluster,
      publicLoadBalancer: true,
      desiredCount,
      cpu,
      memoryLimitMiB: memoryMiB,
      listenerPort: 80,
      domainName: domainName && domainZone ? domainName : undefined,
      domainZone,
      certificate,
      redirectHTTP: Boolean(domainName && certificate && domainZone),
      healthCheckGracePeriod: Duration.minutes(5),
      taskImageOptions: {
        image,
        containerName: 'portfolio-web',
        containerPort: 3000,
        environment,
        logDriver: ecs.LogDrivers.awsLogs({
          streamPrefix: 'portfolio',
          logRetention: logs.RetentionDays.ONE_WEEK,
        }),
      },
    });

    fargateService.targetGroup.configureHealthCheck({
      path: '/',
      healthyHttpCodes: '200,301,302',
      interval: Duration.seconds(30),
    });

    const scaling = fargateService.service.autoScaleTaskCount({
      minCapacity: desiredCount,
      maxCapacity: Math.max(2, desiredCount * 2),
    });

    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 60,
      scaleInCooldown: Duration.minutes(2),
      scaleOutCooldown: Duration.minutes(1),
    });

    new CfnOutput(this, 'ServiceUrl', {
      value: domainName ?? fargateService.loadBalancer.loadBalancerDnsName,
    });
  }
}
