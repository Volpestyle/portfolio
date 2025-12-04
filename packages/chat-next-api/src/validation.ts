import type { ChatRequestMessage } from '@portfolio/chat-contract';

export type ChatPostBody = {
  messages?: ChatRequestMessage[];
  responseAnchorId?: string;
  ownerId?: string;
  reasoningEnabled?: boolean;
  conversationId?: string;
};

type ValidationError = { ok: false; error: string; status: number };
type ValidationSuccess = {
  ok: true;
  value: {
    messages: ChatRequestMessage[];
    responseAnchorId: string;
    ownerId: string;
    reasoningEnabled?: boolean;
    conversationId: string;
  };
};

export function resolveReasoningEnabled(options: { requested?: boolean; environment?: string | undefined }): boolean {
  // Simplified: only emit reasoning when the request explicitly asked for it.
  return Boolean(options.requested);
}

export function validateChatPostBody(
  body: ChatPostBody | null | undefined,
  expectedOwnerId: string
): ValidationError | ValidationSuccess {
  const messages = Array.isArray(body?.messages) ? body!.messages : [];
  if (!messages.length) {
    return { ok: false, error: 'No messages provided.', status: 400 };
  }

  const conversationId =
    typeof body?.conversationId === 'string' && body.conversationId.trim().length > 0
      ? body.conversationId.trim()
      : null;
  if (!conversationId) {
    return { ok: false, error: 'Missing conversationId.', status: 400 };
  }

  const responseAnchorId =
    typeof body?.responseAnchorId === 'string' && body.responseAnchorId.trim().length > 0
      ? body.responseAnchorId.trim()
      : null;
  if (!responseAnchorId) {
    return { ok: false, error: 'Missing responseAnchorId.', status: 400 };
  }

  const ownerIdInput =
    typeof body?.ownerId === 'string' && body.ownerId.trim().length > 0 ? body.ownerId.trim() : expectedOwnerId;
  if (ownerIdInput !== expectedOwnerId) {
    return { ok: false, error: 'Unknown ownerId.', status: 404 };
  }

  return {
    ok: true,
    value: {
      messages,
      responseAnchorId,
      ownerId: ownerIdInput,
      reasoningEnabled: typeof body?.reasoningEnabled === 'boolean' ? body.reasoningEnabled : undefined,
      conversationId,
    },
  };
}
