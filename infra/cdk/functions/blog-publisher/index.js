const AWS = require('aws-sdk');

const dynamo = new AWS.DynamoDB.DocumentClient({ convertEmptyValues: true });
const secretsClients = new Map();
const primarySecretsRegion =
  process.env.AWS_SECRETS_MANAGER_PRIMARY_REGION || process.env.AWS_REGION || 'us-east-1';
const fallbackSecretsRegion = process.env.AWS_SECRETS_MANAGER_FALLBACK_REGION;

function getSecretsManager(region) {
  if (!region) {
    return null;
  }
  if (!secretsClients.has(region)) {
    secretsClients.set(region, new AWS.SecretsManager({ region }));
  }
  return secretsClients.get(region);
}

async function loadSecretString(secretId, region) {
  const client = getSecretsManager(region);
  if (!client) {
    return null;
  }
  try {
    const result = await client.getSecretValue({ SecretId: secretId }).promise();
    if (typeof result.SecretString === 'string') {
      return result.SecretString;
    }
    if (result.SecretBinary) {
      return Buffer.from(result.SecretBinary).toString('utf-8');
    }
  } catch (error) {
    if (error && error.code !== 'ResourceNotFoundException') {
      console.warn(`[blog-publisher] Failed to load secret ${secretId} in ${region}:`, error.message);
    }
  }
  return null;
}

async function loadSecretPayload(secretId) {
  if (!secretId) {
    return null;
  }

  const primary = await loadSecretString(secretId, primarySecretsRegion);
  const raw = primary || (fallbackSecretsRegion ? await loadSecretString(secretId, fallbackSecretsRegion) : null);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const normalized = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (value === undefined || value === null) {
          continue;
        }
        normalized[key] = typeof value === 'string' ? value : JSON.stringify(value);
      }
      return normalized;
    }
  } catch {
    // fall through
  }

  return { value: raw };
}

let cachedRevalidateSecret;
let revalidateSecretPromise;

async function getRevalidateSecret() {
  if (process.env.REVALIDATE_SECRET) {
    return process.env.REVALIDATE_SECRET;
  }
  if (cachedRevalidateSecret !== undefined) {
    return cachedRevalidateSecret;
  }
  if (!revalidateSecretPromise) {
    revalidateSecretPromise = (async () => {
      const secretIds = [
        process.env.REVALIDATE_SECRET_ID,
        process.env.SECRETS_MANAGER_ENV_SECRET_ID,
        process.env.SECRETS_MANAGER_REPO_SECRET_ID,
      ].filter(Boolean);

      for (const secretId of secretIds) {
        const payload = await loadSecretPayload(secretId);
        if (!payload) {
          continue;
        }
        if (payload.REVALIDATE_SECRET) {
          return payload.REVALIDATE_SECRET;
        }
        if (payload.value) {
          return payload.value;
        }
      }

      console.warn('[blog-publisher] Unable to resolve REVALIDATE_SECRET from Secrets Manager.');
      return null;
    })()
      .then((value) => {
        cachedRevalidateSecret = value === undefined ? null : value;
        return cachedRevalidateSecret;
      })
      .finally(() => {
        revalidateSecretPromise = null;
      });
  }
  return revalidateSecretPromise;
}

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
  if (!endpoint) {
    console.warn('[blog-publisher] Revalidation endpoint missing; skipping');
    return;
  }

  const secret = await getRevalidateSecret();
  if (!secret) {
    console.warn('[blog-publisher] Revalidation secret unavailable; skipping');
    return;
  }

  const payload = {
    tags: [`post:${slug}`, 'posts'],
    paths: [`/blog/${slug}`, '/blog', '/sitemap.xml'],
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
