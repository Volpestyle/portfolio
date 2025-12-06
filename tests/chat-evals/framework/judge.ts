// LLM-as-a-judge for evaluating chatbot responses

import type OpenAI from 'openai';
import type { JudgeInput, JudgeResult } from './types';

const JUDGE_SYSTEM_PROMPT = `You are an eval judge for a portfolio chatbot. Your job is to score how well the ACTUAL response compares to the GOLDEN reference response.

Score from 0.0 to 1.0 based on:
- Factual accuracy (does it convey the same key facts?)
- Tone match (casual, friendly, matches the persona?)
- Completeness (does it cover the important points?)

Do NOT penalize for:
- Different wording or phrasing
- Different follow-up questions
- Minor style variations

Return JSON only:
{
  "score": 0.0-1.0,
  "reasoning": "Brief explanation of score"
}`;

function buildJudgePrompt(input: JudgeInput): string {
  return `USER MESSAGE: "${input.userMessage}"

GOLDEN RESPONSE:
"${input.goldenResponse}"

ACTUAL RESPONSE:
"${input.actualResponse}"

${input.judgeHints ? `GRADING HINTS: ${input.judgeHints}` : ''}

Score the ACTUAL response.`;
}

export async function runJudge(
  client: OpenAI,
  input: JudgeInput,
  model: string
): Promise<JudgeResult> {
  const response = await client.responses.create({
    model,
    input: [
      { role: 'system', content: JUDGE_SYSTEM_PROMPT, type: 'message' },
      { role: 'user', content: buildJudgePrompt(input), type: 'message' },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'judge_result',
        schema: {
          type: 'object',
          properties: {
            score: { type: 'number', description: 'Score from 0.0 to 1.0' },
            reasoning: { type: 'string', description: 'Brief explanation of score' },
          },
          required: ['score', 'reasoning'],
          additionalProperties: false,
        },
        strict: true,
      },
    },
    temperature: 0,
  });

  const content = response.output_text ?? '{}';
  try {
    const parsed = JSON.parse(content) as { score?: number; reasoning?: string };
    return {
      score: typeof parsed.score === 'number' ? Math.min(1, Math.max(0, parsed.score)) : 0,
      reasoning: parsed.reasoning ?? 'No reasoning provided',
    };
  } catch {
    return { score: 0, reasoning: 'Failed to parse judge response' };
  }
}
