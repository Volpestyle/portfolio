import OpenAI from 'openai';
import { NextRequest } from 'next/server';
import { buildSystemPrompt } from '@/server/prompt/buildSystemPrompt';
import { tools, toolRouter } from '@/server/tools';
import type { ChatRequestMessage } from '@/types/chat';
import { enforceChatRateLimit } from '@/lib/rate-limit';

function resolveOpenAIKey() {
  return (
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_API_SECRET ||
    process.env.NEXT_PRIVATE_OPENAI_API_KEY ||
    null
  );
}

export async function POST(req: NextRequest) {
  const apiKey = resolveOpenAIKey();
  if (!apiKey) {
    return new Response('Chat is not configured. Missing OPENAI API credentials.', { status: 500 });
  }

  const client = new OpenAI({ apiKey });

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
  const stream = await client.responses.create({
    model: 'gpt-5-nano-2025-08-07',
    input: [
      {
        role: 'system',
        content: `${instructions}

When you need to look something up or fetch information, naturally explain what you're checking before using tools. Keep things conversational and friendly throughout - no need for rigid structure, just be transparent about your thought process.`,
      },
      ...body.messages.map((message) => ({ role: message.role, content: message.content })),
    ],
    tools,
    stream: true,
  });

  const encoder = new TextEncoder();
  let completed = false;
  const toolNameByItemId = new Map<string, string>();

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === 'response.output_item.added') {
            const item = (event as any).item;
            if (
              item?.type === 'function_call' &&
              typeof item.id === 'string' &&
              typeof item.name === 'string'
            ) {
              toolNameByItemId.set(item.id, item.name);
            }

            if (item?.id) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'item',
                    itemId: item.id,
                    itemType: item.type,
                  })}\n\n`
                )
              );
            }
            continue;
          }

          if (event.type === 'response.output_text.delta') {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'token',
                  delta: event.delta,
                  itemId: (event as any).item_id,
                })}\n\n`
              )
            );
            continue;
          }

          if (event.type === 'response.function_call_arguments.done') {
            const itemId =
              typeof (event as any).item_id === 'string'
                ? ((event as any).item_id as string)
                : undefined;
            const resolvedName =
              (event as any).name ??
              (event as any).call_name ??
              (itemId ? toolNameByItemId.get(itemId) : undefined);

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
                arguments: typeof (event as any).arguments === 'string' ? (event as any).arguments : undefined,
              });
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'attachment',
                    attachment,
                    itemId,
                  })}\n\n`
                )
              );
              if (itemId) {
                toolNameByItemId.delete(itemId);
              }
            } catch (toolError) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'error', error: String(toolError) })}\n\n`
                )
              );
            }
            continue;
          }

          if (event.type === 'response.completed') {
            completed = true;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
            continue;
          }
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
