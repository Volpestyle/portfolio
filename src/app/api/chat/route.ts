import OpenAI from 'openai';
import type {
  ResponseCompletedEvent,
  ResponseFunctionCallArgumentsDoneEvent,
  ResponseFunctionToolCall,
  ResponseInput,
  ResponseInputItem,
  ResponseOutputItem,
  ResponseOutputItemAddedEvent,
  ResponseStreamEvent,
  ResponseTextDeltaEvent,
} from 'openai/resources/responses/responses';
import { NextRequest } from 'next/server';
import { buildSystemPrompt } from '@/server/prompt/buildSystemPrompt';
import { buildTools, toolRouter } from '@/server/tools';
import type { FunctionTool } from '@/server/tools';
import type { ChatRequestMessage } from '@/types/chat';
import { enforceChatRateLimit } from '@/lib/rate-limit';
import { resolveSecretValue } from '@/lib/secrets/manager';
import { headerIncludesTestMode, shouldReturnTestFixtures } from '@/lib/test-mode';
import { TEST_REPO, TEST_README } from '@/lib/test-fixtures';
export const runtime = 'nodejs';

let cachedClient: OpenAI | undefined;

function isOutputItemAddedEvent(event: ResponseStreamEvent): event is ResponseOutputItemAddedEvent {
  return event.type === 'response.output_item.added';
}

function isOutputTextDeltaEvent(event: ResponseStreamEvent): event is ResponseTextDeltaEvent {
  return event.type === 'response.output_text.delta';
}

function isFunctionCallArgumentsDoneEvent(
  event: ResponseStreamEvent
): event is ResponseFunctionCallArgumentsDoneEvent {
  return event.type === 'response.function_call_arguments.done';
}

function isResponseCompletedEvent(event: ResponseStreamEvent): event is ResponseCompletedEvent {
  return event.type === 'response.completed';
}

function isFunctionCallItem(item?: ResponseOutputItem): item is ResponseFunctionToolCall {
  return item?.type === 'function_call';
}

function getItemId(item?: ResponseOutputItem): string | undefined {
  if (!item || typeof item !== 'object') {
    return undefined;
  }
  if ('id' in item) {
    const possibleId = (item as { id?: unknown }).id;
    return typeof possibleId === 'string' ? possibleId : undefined;
  }
  return undefined;
}

async function getOpenAIClient(): Promise<OpenAI> {
  if (!cachedClient) {
    const apiKey = await resolveSecretValue('OPENAI_API_KEY', { scope: 'repo', required: true });
    cachedClient = new OpenAI({ apiKey });
  }
  return cachedClient;
}

export async function POST(req: NextRequest) {
  const headersList = req.headers;
  const isIntegrationTest = headerIncludesTestMode(headersList, 'integration');

  if (isIntegrationTest) {
    return new Response(JSON.stringify({ ok: true, message: 'Chat API integration response' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Return deterministic fixtures for E2E tests
  if (shouldReturnTestFixtures(headersList)) {
    return buildE2EChatResponse();
  }

  let client: OpenAI;
  try {
    client = await getOpenAIClient();
  } catch (error) {
    console.error('[Chat API] Failed to initialize OpenAI client', error);
    return new Response('Chat is not configured. Missing OPENAI API credentials.', { status: 500 });
  }

  const rateLimit = await enforceChatRateLimit(req);
  if (!rateLimit.success) {
    const retryAfterSeconds =
      typeof rateLimit.reset === 'number'
        ? Math.max(0, rateLimit.reset - Math.floor(Date.now() / 1000))
        : 60;
    return new Response('Too many requests. Please slow down.', {
      status: 429,
      headers: {
        'Retry-After': retryAfterSeconds.toString(),
        'X-RateLimit-Limit': String(rateLimit.limit ?? ''),
        'X-RateLimit-Remaining': String(rateLimit.remaining ?? 0),
        'X-RateLimit-Reset': String(rateLimit.reset ?? ''),
      },
    });
  }

  let body: { messages?: ChatRequestMessage[] };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON body.', { status: 400 });
  }

  if (!body?.messages?.length) {
    return new Response('No messages provided.', { status: 400 });
  }

  const instructions = await buildSystemPrompt();
  const toolDefinitions = await buildTools();

  const systemPrompt = `${instructions}

Keep your internal planning and tool usage private; gather whatever you need quietly, then reply once with a concise, conversational answer.`;

  const baseInput: ResponseInput = [
    {
      role: 'system',
      content: systemPrompt,
    },
    ...body.messages.map((message) => ({ role: message.role, content: message.content })),
  ];
  const encoder = new TextEncoder();
  let completed = false;

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        let nextInput: ResponseInput = baseInput;
        let previousResponseId: string | undefined;

        while (true) {
          const payload: {
            model: string;
            input: ResponseInput;
            tools: FunctionTool[];
            stream: true;
            previous_response_id?: string;
          } = {
            model: 'gpt-5-nano-2025-08-07',
            input: nextInput,
            tools: toolDefinitions,
            stream: true,
          };

          if (previousResponseId) {
            payload.previous_response_id = previousResponseId;
          }

          const stream = (await client.responses.create(payload)) as AsyncIterable<ResponseStreamEvent>;
          const result = await processResponseStream({
            stream,
            controller,
            encoder,
          });

          if (result.status === 'needs-tool-output') {
            previousResponseId = result.responseId;
            nextInput = result.toolOutputs;
            continue;
          }

          completed = true;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
          break;
        }
      } catch (error) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', error: String(error) })}\n\n`)
        );
      } finally {
        if (!completed) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
        }
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

function buildE2EChatResponse() {
  const frames = [
    { type: 'item', itemId: 'assistant-item' },
    {
      type: 'token',
      delta: "Here's a featured project and its inline docs.",
      itemId: 'assistant-item',
    },
    {
      type: 'attachment',
      attachment: { type: 'project-cards', repos: [TEST_REPO] },
      itemId: 'assistant-item',
    },
    {
      type: 'attachment',
      attachment: { type: 'project-details', repo: TEST_REPO, readme: TEST_README },
      itemId: 'assistant-item',
    },
    { type: 'done' },
  ];

  const body = frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('');
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

type ToolOutputInput = ResponseInputItem.FunctionCallOutput;

type StreamIterationResult =
  | {
    status: 'needs-tool-output';
    responseId: string;
    toolOutputs: ResponseInput;
  }
  | { status: 'completed' };

async function processResponseStream({
  stream,
  controller,
  encoder,
}: {
  stream: AsyncIterable<ResponseStreamEvent>;
  controller: ReadableStreamDefaultController<Uint8Array>;
  encoder: TextEncoder;
}): Promise<StreamIterationResult> {
  const toolOutputs: ToolOutputInput[] = [];
  const toolMetadataByItemId = new Map<string, { name: string; callId?: string }>();
  let responseId: string | undefined;

  for await (const event of stream) {
    if (event.type === 'response.created') {
      responseId = event.response.id;
      continue;
    }

    if (isOutputItemAddedEvent(event)) {
      const item = event.item;
      if (isFunctionCallItem(item) && item.id && item.name) {
        toolMetadataByItemId.set(item.id, { name: item.name, callId: item.call_id });
      }

      const itemId = getItemId(item);
      if (itemId) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'item',
              itemId,
              itemType: item?.type,
            })}\n\n`
          )
        );
      }
      continue;
    }

    if (isOutputTextDeltaEvent(event)) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: 'token',
            delta: event.delta,
            itemId: event.item_id,
          })}\n\n`
        )
      );
      continue;
    }

    if (isFunctionCallArgumentsDoneEvent(event)) {
      const metadata = toolMetadataByItemId.get(event.item_id);
      const resolvedName = event.name ?? metadata?.name;

      if (!resolvedName) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', error: 'Unknown tool call (missing name).' })}\n\n`
          )
        );
        continue;
      }

      try {
        const attachment = await toolRouter({
          name: resolvedName,
          arguments: event.arguments,
        });
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'attachment',
              attachment,
              itemId: event.item_id,
            })}\n\n`
          )
        );

        const callId = metadata?.callId ?? event.item_id;
        toolOutputs.push({
          type: 'function_call_output',
          call_id: callId,
          output: JSON.stringify(attachment),
        });
        toolMetadataByItemId.delete(event.item_id);
      } catch (toolError) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', error: String(toolError) })}\n\n`)
        );
      }
      continue;
    }

    if (isResponseCompletedEvent(event)) {
      if (toolOutputs.length > 0) {
        return {
          status: 'needs-tool-output',
          responseId: responseId ?? event.response.id,
          toolOutputs,
        };
      }
      return { status: 'completed' };
    }
  }

  if (toolOutputs.length > 0 && responseId) {
    return {
      status: 'needs-tool-output',
      responseId,
      toolOutputs,
    };
  }

  return { status: 'completed' };
}
