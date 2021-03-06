import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CloudFrontAllowedMethods, CloudFrontWebDistribution, OriginAccessIdentity, ViewerCertificate } from 'aws-cdk-lib/aws-cloudfront';
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3';
import { CanonicalUserPrincipal, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { AaaaRecord, ARecord, PublicHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';

export class RentingOrBuyInfraStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const cloudfrontOAI = new OriginAccessIdentity(this, 'cloudfront-OAI', {
      comment: `OAI for ${id}`,
    });

    const hostingBucket = new Bucket(this, 'RentingOrBuyBucket', {
      websiteIndexDocument: 'index.html',
      publicReadAccess: false,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    });

    hostingBucket.addToResourcePolicy(new PolicyStatement({
      actions: [ 's3:GetObject' ],
      resources: [ hostingBucket.arnForObjects('*') ],
      principals: [ new CanonicalUserPrincipal(cloudfrontOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId, )]
    }));

    const certArn = 'arn:aws:acm:us-east-1:410489852199:certificate/9fe3b3b7-f194-4940-8dd4-4fdf9dec2ca7';
    const certifcate = Certificate.fromCertificateArn(this, 'certificate', certArn);
    const viewerCertificate = ViewerCertificate.fromAcmCertificate(certifcate, {
      aliases: [ 'rentingorbuy.com'] ,
    });

    const distribution = new CloudFrontWebDistribution(this, 'SiteDistribution', {
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: hostingBucket,
            originAccessIdentity: cloudfrontOAI,
          },
          behaviors: [{
            isDefaultBehavior: true,
            compress: true,
            allowedMethods: CloudFrontAllowedMethods.GET_HEAD_OPTIONS,
          }],
        }
      ],
      viewerCertificate,
    });

    new BucketDeployment(this, 'DeployWithInvalidation', {
      sources: [ Source.asset('../src') ],
      destinationBucket: hostingBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    const hostedZone = new PublicHostedZone(this, 'HostedZone', {
      zoneName: 'rentingorbuy.com',
    });

    new ARecord(this, 'aAlias', {
      zone: hostedZone,
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
    });

    new AaaaRecord(this, 'aaaaAlias', {
      zone: hostedZone,
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
    });
  }
}
