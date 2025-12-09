import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, QueryCommand, type BatchWriteCommandOutput, type QueryCommandOutput } from '@aws-sdk/lib-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { TEST_REPO } from '@portfolio/test-support/fixtures';
import { assertNoFixtureFlagsInProd, shouldUseFixtureRuntime } from '@/lib/test-flags';

export type PortfolioProjectRecord = {
  name: string;
  owner?: string;
  visible: boolean;
  order?: number;
  description?: string;
  icon?: string;
  isStarred?: boolean;
  topics?: string[];
  language?: string;
  updatedAt?: string;
};

const PROJECTS_PK = 'PROJECTS';
const REPO_PREFIX = 'REPO#';
const MAX_BATCH_ITEMS = 25;

let dynamoClient: DynamoDBDocumentClient | null = null;
let fixtureProjects: PortfolioProjectRecord[] | null = null;

function getTableName(): string | null {
  const tableName =
    process.env.ADMIN_TABLE_NAME ??
    process.env.PORTFOLIO_TABLE ??
    process.env.ADMIN_TABLE ??
    process.env.DYNAMODB_TABLE ??
    '';

  return tableName || null;
}

function requireTableName(): string {
  const tableName = getTableName();
  if (!tableName) {
    throw new Error('ADMIN_TABLE_NAME (or PORTFOLIO_TABLE) must be configured for the portfolio store.');
  }
  return tableName;
}

function getDocumentClient(): DynamoDBDocumentClient {
  if (!dynamoClient) {
    dynamoClient = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-east-1' }),
      { marshallOptions: { removeUndefinedValues: true } }
    );
  }
  return dynamoClient;
}

function sortProjects(a: PortfolioProjectRecord, b: PortfolioProjectRecord): number {
  const orderA = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
  const orderB = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) {
    return orderA - orderB;
  }
  if (Boolean(a.isStarred) !== Boolean(b.isStarred)) {
    return Number(b.isStarred) - Number(a.isStarred);
  }
  return a.name.localeCompare(b.name);
}

function normalizeTopics(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) {
    return undefined;
  }
  const topics = input
    .map((value) => (typeof value === 'string' ? value.trim() : String(value)))
    .map((value) => value.trim())
    .filter(Boolean);
  return topics.length ? Array.from(new Set(topics)) : undefined;
}

function normalizeOrder(value: unknown): number | undefined {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function normalizeProjectInput(input: unknown): PortfolioProjectRecord | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const record = input as Record<string, unknown>;
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  if (!name) {
    return null;
  }

  const owner = typeof record.owner === 'string' && record.owner.trim() ? record.owner.trim() : undefined;
  const description =
    typeof record.description === 'string' && record.description.trim() ? record.description.trim() : undefined;
  const icon = typeof record.icon === 'string' && record.icon.trim() ? record.icon.trim() : undefined;
  const language = typeof record.language === 'string' && record.language.trim() ? record.language.trim() : undefined;
  const order = normalizeOrder(record.order);

  return {
    name,
    owner,
    visible: record.visible !== false,
    order,
    description,
    icon,
    isStarred: Boolean(record.isStarred),
    topics: normalizeTopics(record.topics),
    language,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : undefined,
  };
}

function toRecord(item?: Record<string, unknown>): PortfolioProjectRecord | null {
  if (!item) {
    return null;
  }

  const sk = (item.SK as string) || (item.sk as string) || '';
  const rawName = typeof item.name === 'string' ? item.name : sk.startsWith(REPO_PREFIX) ? sk.slice(REPO_PREFIX.length) : '';
  if (!rawName) {
    return null;
  }

  return {
    name: rawName,
    owner: typeof item.owner === 'string' ? item.owner : undefined,
    visible: item.visible !== false,
    order: normalizeOrder(item.order),
    description: typeof item.description === 'string' ? item.description : undefined,
    icon: typeof item.icon === 'string' ? item.icon : undefined,
    isStarred: Boolean(item.isStarred),
    topics: normalizeTopics(item.topics),
    language: typeof item.language === 'string' ? item.language : undefined,
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : undefined,
  };
}

function buildItem(project: PortfolioProjectRecord) {
  return {
    PK: PROJECTS_PK,
    SK: `${REPO_PREFIX}${project.name}`,
    name: project.name,
    owner: project.owner,
    visible: project.visible !== false,
    order: typeof project.order === 'number' ? project.order : 0,
    description: project.description,
    icon: project.icon,
    isStarred: Boolean(project.isStarred),
    topics: project.topics,
    language: project.language,
    updatedAt: project.updatedAt ?? new Date().toISOString(),
  };
}

function useFixtureStore(): boolean {
  assertNoFixtureFlagsInProd();
  return shouldUseFixtureRuntime();
}

function getFixtureProjects(): PortfolioProjectRecord[] {
  if (!fixtureProjects) {
    fixtureProjects = [
      {
        name: TEST_REPO.name,
        owner: TEST_REPO.owner?.login ?? 'volpestyle',
        visible: true,
        order: 0,
        description: TEST_REPO.description ?? undefined,
        icon: TEST_REPO.icon,
        isStarred: Boolean(TEST_REPO.isStarred),
        topics: TEST_REPO.tags ?? TEST_REPO.topics,
        language: TEST_REPO.language ?? TEST_REPO.languagePercentages?.[0]?.name,
        updatedAt: new Date().toISOString(),
      },
    ];
  }
  return fixtureProjects.map((project) => ({ ...project }));
}

async function queryProjects(): Promise<PortfolioProjectRecord[]> {
  const tableName = getTableName();
  if (!tableName) {
    console.warn('[portfolio-store] ADMIN_TABLE_NAME is not configured; falling back to config store.');
    return [];
  }

  const client = getDocumentClient();

  const response: QueryCommandOutput = await client.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': PROJECTS_PK },
    })
  );

  const records =
    response.Items?.map((item) => toRecord(item as Record<string, unknown>)).filter(
      (record): record is PortfolioProjectRecord => Boolean(record)
    ) ?? [];

  return records.sort(sortProjects);
}

async function writeProjects(projects: PortfolioProjectRecord[]): Promise<void> {
  const client = getDocumentClient();
  const tableName = requireTableName();
  const items = projects.map((project) => ({ PutRequest: { Item: buildItem(project) } }));

  for (let i = 0; i < items.length; i += MAX_BATCH_ITEMS) {
    const batch = items.slice(i, i + MAX_BATCH_ITEMS);
    const response: BatchWriteCommandOutput = await client.send(
      new BatchWriteCommand({
        RequestItems: {
          [tableName]: batch,
        },
      })
    );

    const unprocessed = response.UnprocessedItems?.[tableName];
    if (unprocessed && unprocessed.length > 0) {
      throw new Error(`Failed to persist ${unprocessed.length} project records to DynamoDB`);
    }
  }
}

export async function getAllProjects(): Promise<PortfolioProjectRecord[]> {
  if (useFixtureStore()) {
    return getFixtureProjects().sort(sortProjects);
  }

  const stored = await queryProjects();
  return stored;
}

export async function getVisibleProjects(): Promise<PortfolioProjectRecord[]> {
  const projects = await getAllProjects();
  return projects.filter((project) => project.visible !== false);
}

export async function saveProjects(projects: unknown[]): Promise<PortfolioProjectRecord[]> {
  const normalized = projects
    .map((project) => normalizeProjectInput(project))
    .filter((project): project is PortfolioProjectRecord => Boolean(project))
    .map((project) => ({ ...project, updatedAt: project.updatedAt ?? new Date().toISOString() }));

  const deduped = Array.from(
    normalized.reduce((acc, project) => acc.set(project.name, project), new Map<string, PortfolioProjectRecord>()).values()
  );

  if (useFixtureStore()) {
    fixtureProjects = deduped;
    return getFixtureProjects().sort(sortProjects);
  }

  if (deduped.length === 0) {
    return [];
  }

  await writeProjects(deduped);
  return deduped.sort(sortProjects);
}
