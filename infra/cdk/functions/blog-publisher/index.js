const AWS = require('aws-sdk');

const dynamo = new AWS.DynamoDB.DocumentClient({ convertEmptyValues: true });

async function publishPost(slug, scheduledFor) {
  const tableName = process.env.POSTS_TABLE;
  if (!tableName) {
    throw new Error('POSTS_TABLE is not configured');
  }

  const existing = await dynamo
    .get({
      TableName: tableName,
      Key: { slug },
    })
    .promise();

  if (!existing.Item) {
    console.warn(`[blog-publisher] Post ${slug} not found`);
    return false;
  }

  if (existing.Item.status !== 'scheduled') {
    console.log(`[blog-publisher] Post ${slug} status is ${existing.Item.status}; skipping`);
    return false;
  }

  const version = Number(existing.Item.version ?? 1);
  const nextVersion = version + 1;
  const publishedAt = scheduledFor || existing.Item.scheduledFor || new Date().toISOString();

  try {
    await dynamo
      .update({
        TableName: tableName,
        Key: { slug },
        UpdateExpression:
          'SET #status = :status, #publishedAt = :publishedAt, #updatedAt = :updatedAt, #version = :nextVersion REMOVE #scheduledFor, #activeScheduleArn, #activeScheduleName',
        ConditionExpression: '#version = :version',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#publishedAt': 'publishedAt',
          '#updatedAt': 'updatedAt',
          '#version': 'version',
          '#scheduledFor': 'scheduledFor',
          '#activeScheduleArn': 'activeScheduleArn',
          '#activeScheduleName': 'activeScheduleName',
        },
        ExpressionAttributeValues: {
          ':status': 'published',
          ':publishedAt': publishedAt,
          ':updatedAt': new Date().toISOString(),
          ':nextVersion': nextVersion,
          ':version': version,
        },
      })
      .promise();
  } catch (error) {
    console.error('[blog-publisher] Failed to update post', error);
    return false;
  }

  return true;
}

async function triggerRevalidate(slug) {
  const endpoint = process.env.REVALIDATE_ENDPOINT;
  const secret = process.env.REVALIDATE_SECRET;
  if (!endpoint || !secret) {
    console.warn('[blog-publisher] Revalidation config missing; skipping');
    return;
  }

  const payload = {
    tags: [`post:${slug}`, 'posts'],
    paths: [`/blog/${slug}`, '/blog', '/sitemap.xml', '/rss.xml'],
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-revalidate-secret': secret,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      console.error('[blog-publisher] Revalidate API failed', await response.text());
    }
  } catch (error) {
    console.error('[blog-publisher] Revalidate request failed', error);
  }
}

exports.handler = async (event = {}) => {
  const detail = event.detail || {};
  const slug = event.slug || detail.slug;
  const scheduledFor = event.scheduledFor || detail.scheduledFor;
  if (!slug) {
    console.error('[blog-publisher] Missing slug in event');
    return;
  }

  const published = await publishPost(slug, scheduledFor);
  if (published) {
    await triggerRevalidate(slug);
  }
};
