import { spawn } from 'node:child_process';
import type OpenAI from 'openai';
import type { ResponseFormatTextJSONSchemaConfig } from 'openai/resources/responses/responses';
import Anthropic from '@anthropic-ai/sdk';

export type LlmProviderId = 'openai' | 'anthropic' | 'claude-code-cli';

export type JsonSchema = ResponseFormatTextJSONSchemaConfig;

export type LlmLogger = (event: string, payload: Record<string, unknown>) => void;

export type LlmStructuredPrompt = {
  systemPrompt: string;
  userContent: string;
  /**
   * JSON Schema object describing the expected output.
   * For OpenAI this is passed as `text.format`.
   * For Anthropic this is embedded into the prompt as guidance.
   */
  jsonSchema: JsonSchema;
  model: string;
  maxOutputTokens?: number;
  temperature?: number;
  /**
   * Provider-specific params. Currently only used for OpenAI Responses API.
   * Anthropic ignores this field.
   */
  openAiReasoning?: unknown;
  signal?: AbortSignal;
  logger?: LlmLogger;
  stage?: string;
};

export type StreamStructuredPrompt = LlmStructuredPrompt & {
  onTextSnapshot?: (snapshot: string) => void;
};

export type LlmStructuredResult = {
  rawText: string;
  structured?: unknown;
  usage?: unknown;
};

export type BaseLlmClient = {
  provider: LlmProviderId;
  createStructuredJson: (prompt: LlmStructuredPrompt) => Promise<LlmStructuredResult>;
  streamStructuredJson: (prompt: StreamStructuredPrompt) => Promise<LlmStructuredResult>;
};

export type OpenAiLlmClient = BaseLlmClient & {
  provider: 'openai';
  openai: OpenAI;
};

export type AnthropicLlmClient = BaseLlmClient & {
  provider: 'anthropic';
  anthropic: Anthropic;
};

export type ClaudeCodeCliLlmClient = BaseLlmClient & {
  provider: 'claude-code-cli';
};

export type LlmClient = OpenAiLlmClient | AnthropicLlmClient | ClaudeCodeCliLlmClient;

function buildAnthropicJsonInstruction(jsonSchema: JsonSchema): string {
  const schema = (jsonSchema?.schema ?? {}) as Record<string, unknown>;
  // Keep it short-ish; Claude does well with explicit "JSON only" rules.
  return [
    'You MUST respond with valid JSON only (no markdown, no prose).',
    'The JSON must conform to this JSON Schema:',
    JSON.stringify(schema),
  ].join('\n');
}

function extractAnthropicText(message: Anthropic.Messages.Message): string {
  const parts: string[] = [];
  for (const block of message.content ?? []) {
    if (block.type === 'text') {
      parts.push(block.text);
    }
  }
  return parts.join('').trim();
}

function extractOpenAiStructured(response: unknown): unknown {
  const r = response as { output?: unknown[] };
  const outputItems = Array.isArray(r?.output) ? (r.output as Array<Record<string, unknown>>) : [];
  for (const item of outputItems) {
    if (!item || typeof item !== 'object') continue;
    if (Object.prototype.hasOwnProperty.call(item, 'parsed') && (item as { parsed?: unknown }).parsed !== undefined) {
      return (item as { parsed?: unknown }).parsed;
    }
    const content = Array.isArray(item.content) ? (item.content as Array<Record<string, unknown>>) : [];
    for (const chunk of content) {
      if (!chunk || typeof chunk !== 'object') continue;
      if (Object.prototype.hasOwnProperty.call(chunk, 'parsed') && (chunk as { parsed?: unknown }).parsed !== undefined) {
        return (chunk as { parsed?: unknown }).parsed;
      }
    }
  }
  return undefined;
}

export function createOpenAiLlmClient(client: OpenAI): OpenAiLlmClient {
  return {
    provider: 'openai',
    openai: client,
    async createStructuredJson(prompt): Promise<LlmStructuredResult> {
      const stage = prompt.stage ?? 'structured_json';
      prompt.logger?.('llm.request', {
        provider: 'openai',
        stage,
        model: prompt.model,
        maxOutputTokens: prompt.maxOutputTokens ?? null,
      });

      const response = await client.responses.create(
        {
          model: prompt.model,
          stream: false,
          text: { format: prompt.jsonSchema },
          input: [
            { role: 'system', content: prompt.systemPrompt, type: 'message' },
            { role: 'user', content: prompt.userContent, type: 'message' },
          ],
          ...(prompt.openAiReasoning ? { reasoning: prompt.openAiReasoning as Record<string, unknown> } : {}),
          ...(typeof prompt.maxOutputTokens === 'number' && Number.isFinite(prompt.maxOutputTokens) && prompt.maxOutputTokens > 0
            ? { max_output_tokens: Math.floor(prompt.maxOutputTokens) }
            : {}),
          ...(typeof prompt.temperature === 'number' && Number.isFinite(prompt.temperature)
            ? { temperature: prompt.temperature }
            : {}),
        },
        prompt.signal ? { signal: prompt.signal } : undefined
      );

      return {
        rawText: (response.output_text ?? '').trim(),
        structured: extractOpenAiStructured(response),
        usage: (response as { usage?: unknown }).usage,
      };
    },
    async streamStructuredJson(prompt): Promise<LlmStructuredResult> {
      const stage = prompt.stage ?? 'structured_json';
      prompt.logger?.('llm.request', {
        provider: 'openai',
        stage,
        model: prompt.model,
        maxOutputTokens: prompt.maxOutputTokens ?? null,
        streaming: true,
      });

      let streamedText = '';
      const stream = client.responses.stream(
        {
          model: prompt.model,
          stream: true,
          text: { format: prompt.jsonSchema },
          input: [
            { role: 'system', content: prompt.systemPrompt, type: 'message' },
            { role: 'user', content: prompt.userContent, type: 'message' },
          ],
          ...(prompt.openAiReasoning ? { reasoning: prompt.openAiReasoning as Record<string, unknown> } : {}),
          ...(typeof prompt.maxOutputTokens === 'number' && Number.isFinite(prompt.maxOutputTokens) && prompt.maxOutputTokens > 0
            ? { max_output_tokens: Math.floor(prompt.maxOutputTokens) }
            : {}),
          ...(typeof prompt.temperature === 'number' && Number.isFinite(prompt.temperature)
            ? { temperature: prompt.temperature }
            : {}),
        },
        prompt.signal ? { signal: prompt.signal } : undefined
      );

      stream.on('response.output_text.delta', (event) => {
        const snapshot =
          typeof (event as { snapshot?: unknown }).snapshot === 'string'
            ? ((event as { snapshot: string }).snapshot as string)
            : typeof event.delta === 'string'
              ? event.delta
              : '';
        if (!snapshot) return;
        streamedText = snapshot;
        prompt.onTextSnapshot?.(snapshot);
      });

      const finalResponse = await stream.finalResponse();
      const rawText = (streamedText || finalResponse.output_text || '').trim();
      return {
        rawText,
        structured: extractOpenAiStructured(finalResponse),
        usage: (finalResponse as { usage?: unknown }).usage,
      };
    },
  };
}

export type AnthropicClientOptions = {
  apiKey: string;
  timeoutMs?: number;
};

export function createAnthropicClient(options: AnthropicClientOptions): Anthropic {
  const timeoutMs =
    typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? options.timeoutMs
      : undefined;
  return new Anthropic({ apiKey: options.apiKey, timeout: timeoutMs });
}

const DEFAULT_ANTHROPIC_MAX_OUTPUT_TOKENS = 8192;

function clampAnthropicMaxTokens(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 1024;
  }
  return Math.max(1, Math.min(DEFAULT_ANTHROPIC_MAX_OUTPUT_TOKENS, Math.floor(value)));
}

export function createAnthropicLlmClient(client: Anthropic): AnthropicLlmClient {
  return {
    provider: 'anthropic',
    anthropic: client,
    async createStructuredJson(prompt): Promise<LlmStructuredResult> {
      const stage = prompt.stage ?? 'structured_json';
      prompt.logger?.('llm.request', {
        provider: 'anthropic',
        stage,
        model: prompt.model,
        maxOutputTokens: prompt.maxOutputTokens ?? null,
      });

      const schemaInstruction = buildAnthropicJsonInstruction(prompt.jsonSchema);
      const message = await client.messages.create(
        {
          model: prompt.model,
          max_tokens: clampAnthropicMaxTokens(prompt.maxOutputTokens),
          system: `${prompt.systemPrompt}\n\n${schemaInstruction}`,
          messages: [{ role: 'user', content: prompt.userContent }],
          ...(typeof prompt.temperature === 'number' && Number.isFinite(prompt.temperature)
            ? { temperature: prompt.temperature }
            : {}),
        },
        prompt.signal ? { signal: prompt.signal } : undefined
      );

      return {
        rawText: extractAnthropicText(message),
        usage: message.usage,
      };
    },
    async streamStructuredJson(prompt): Promise<LlmStructuredResult> {
      const stage = prompt.stage ?? 'structured_json';
      prompt.logger?.('llm.request', {
        provider: 'anthropic',
        stage,
        model: prompt.model,
        maxOutputTokens: prompt.maxOutputTokens ?? null,
        streaming: true,
      });

      const schemaInstruction = buildAnthropicJsonInstruction(prompt.jsonSchema);
      let snapshot = '';

      const stream = client.messages.stream(
        {
          model: prompt.model,
          max_tokens: clampAnthropicMaxTokens(prompt.maxOutputTokens),
          system: `${prompt.systemPrompt}\n\n${schemaInstruction}`,
          messages: [{ role: 'user', content: prompt.userContent }],
          ...(typeof prompt.temperature === 'number' && Number.isFinite(prompt.temperature)
            ? { temperature: prompt.temperature }
            : {}),
        },
        prompt.signal ? { signal: prompt.signal } : undefined
      );

      stream.on('text', (textDelta: string) => {
        if (!textDelta) return;
        snapshot += textDelta;
        prompt.onTextSnapshot?.(snapshot);
      });

      const finalMessage = await stream.finalMessage();

      return {
        rawText: snapshot.trim() || extractAnthropicText(finalMessage),
        usage: finalMessage.usage,
      };
    },
  };
}

function runClaudeCodeCli(combinedPrompt: string, model: string, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--output-format', 'text', '--verbose', '--model', model];
    const child = spawn('claude', args, { stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn claude CLI: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`claude CLI exited with code ${code}: ${stderr.trim()}`));
        return;
      }
      resolve(stdout.trim());
    });

    if (signal) {
      signal.addEventListener('abort', () => {
        child.kill('SIGTERM');
      }, { once: true });
    }

    child.stdin.write(combinedPrompt);
    child.stdin.end();
  });
}

export function createClaudeCodeCliLlmClient(): ClaudeCodeCliLlmClient {
  return {
    provider: 'claude-code-cli',
    async createStructuredJson(prompt): Promise<LlmStructuredResult> {
      const stage = prompt.stage ?? 'structured_json';
      prompt.logger?.('llm.request', {
        provider: 'claude-code-cli',
        stage,
        model: prompt.model,
        maxOutputTokens: prompt.maxOutputTokens ?? null,
      });

      const schemaInstruction = buildAnthropicJsonInstruction(prompt.jsonSchema);
      const combinedPrompt = `${prompt.systemPrompt}\n\n${schemaInstruction}\n\n${prompt.userContent}`;
      const rawText = await runClaudeCodeCli(combinedPrompt, prompt.model, prompt.signal);

      return { rawText };
    },
    async streamStructuredJson(prompt): Promise<LlmStructuredResult> {
      // Claude Code CLI does not support streaming; delegate to non-streaming path.
      return this.createStructuredJson(prompt);
    },
  };
}

