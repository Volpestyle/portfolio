import {
  CreateScheduleCommand,
  DeleteScheduleCommand,
  UpdateScheduleCommand,
} from '@aws-sdk/client-scheduler';
import { blogConfig } from '@/server/blog/config';
import { getSchedulerClient } from '@/server/blog/clients';

const scheduler = getSchedulerClient();

function ensureSchedulerConfig() {
  if (!blogConfig.publishLambdaArn) {
    throw new Error('BLOG_PUBLISH_FUNCTION_ARN is not configured');
  }
  if (!blogConfig.schedulerRoleArn) {
    throw new Error('SCHEDULER_ROLE_ARN is not configured');
  }
}

export async function upsertPublishSchedule(slug: string, scheduledFor: string): Promise<{ arn: string; name: string }> {
  ensureSchedulerConfig();
  const scheduleName = `publish-${slug}`;

  const baseInput = {
    Name: scheduleName,
    ScheduleExpression: `at(${scheduledFor})`,
    FlexibleTimeWindow: { Mode: 'OFF' as const },
    Target: {
      Arn: blogConfig.publishLambdaArn!,
      RoleArn: blogConfig.schedulerRoleArn!,
      Input: JSON.stringify({ slug }),
    },
    Description: `Auto-publish blog post ${slug} at ${scheduledFor}`,
  };

  try {
    const response = await scheduler.send(new UpdateScheduleCommand({ ...baseInput }));
    return { arn: response.ScheduleArn ?? `arn:aws:scheduler:::schedule/default/${scheduleName}`, name: scheduleName };
  } catch (error: unknown) {
    if (!isResourceNotFound(error)) {
      throw error;
    }
  }

  const created = await scheduler.send(new CreateScheduleCommand(baseInput));
  return {
    arn: created.ScheduleArn ?? `arn:aws:scheduler:::schedule/default/${scheduleName}`,
    name: scheduleName,
  };
}

export async function deletePublishSchedule(name?: string) {
  if (!name) {
    return;
  }
  try {
    await scheduler.send(
      new DeleteScheduleCommand({
        Name: name,
      })
    );
  } catch (error: unknown) {
    if (isResourceNotFound(error)) {
      return;
    }
    throw error;
  }
}

function isResourceNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const name = (error as { name?: unknown }).name;
  return name === 'ResourceNotFoundException';
}
