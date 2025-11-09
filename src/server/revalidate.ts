import { revalidatePath, revalidateTag } from 'next/cache';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';

let cachedCloudFront: CloudFrontClient | undefined;

function getCloudFrontClient(): CloudFrontClient {
  if (!cachedCloudFront) {
    const region = process.env.AWS_REGION ?? 'us-east-1';
    cachedCloudFront = new CloudFrontClient({ region });
  }
  return cachedCloudFront;
}

async function invalidateCloudFrontPaths(paths: string[]) {
  const distributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID;
  if (!distributionId || !paths.length) {
    return;
  }

  const client = getCloudFrontClient();
  await client.send(
    new CreateInvalidationCommand({
      DistributionId: distributionId,
      InvalidationBatch: {
        CallerReference: `${Date.now()}`,
        Paths: {
          Quantity: paths.length,
          Items: paths,
        },
      },
    })
  );
}

export async function revalidateContent(inputs: { paths?: string[]; tags?: string[] }) {
  const uniquePaths = Array.from(new Set((inputs.paths ?? []).filter(Boolean))).map((path) =>
    path!.startsWith('/') ? path! : `/${path}`
  );
  const uniqueTags = Array.from(new Set((inputs.tags ?? []).filter(Boolean)));

  await Promise.all(uniqueTags.map((tag) => revalidateTag(tag)));
  await Promise.all(uniquePaths.map((path) => revalidatePath(path)));
  await invalidateCloudFrontPaths(uniquePaths);
}
