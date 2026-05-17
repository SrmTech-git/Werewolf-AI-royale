import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';

export const DEFAULT_MODEL = 'claude-sonnet-4-6';

// ─── Lazy clients (so .env loads first) ────────────────────────────────────

let _anthropic;
function anthropic() {
  if (!_anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set. Check your .env file.');
    }
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

let _openai;
function openai() {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set. Check your .env file.');
    }
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

let _gemini;
function gemini() {
  if (!_gemini) {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY (or GOOGLE_API_KEY) is not set. Check your .env file. Get a free key at https://aistudio.google.com/apikey');
    }
    _gemini = new GoogleGenAI({ apiKey: key });
  }
  return _gemini;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

export function stripCodeFence(text) {
  return text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

// ─── Provider implementations ──────────────────────────────────────────────

async function askAnthropic(system, user, maxTokens, model) {
  const msg = await anthropic().messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  });
  return msg.content[0].text.trim();
}

async function askOpenAI(system, user, maxTokens, model) {
  // GPT-5 and o-series are reasoning models. They spend tokens thinking before
  // responding. For Werewolf dialogue we want snappy instinctive replies, not
  // deep analysis, so we ask them to use minimal reasoning effort.
  const isReasoning = /^(gpt-5|o1|o3)/.test(model);
  const budget = isReasoning ? Math.max(maxTokens * 5, 2000) : maxTokens;

  const params = {
    model,
    max_completion_tokens: budget,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
  if (isReasoning) {
    params.reasoning_effort = 'minimal';
  }

  const response = await openai().chat.completions.create(params);

  const choice = response.choices[0];
  const content = (choice?.message?.content ?? '').trim();
  if (!content) {
    const finish = choice?.finish_reason ?? 'unknown';
    throw new Error(
      `OpenAI (${model}) returned empty content (finish_reason: ${finish}). ` +
      `If finish_reason is "length", reasoning tokens consumed the budget.`
    );
  }
  return content;
}

async function askGemini(system, user, maxTokens, model) {
  const response = await gemini().models.generateContent({
    model,
    contents: user,
    config: {
      systemInstruction: system,
      maxOutputTokens: Math.max(maxTokens * 2, 1000), // headroom for any reasoning
    },
  });
  const text = (response.text ?? '').trim();
  if (!text) {
    throw new Error(`Gemini (${model}) returned empty content.`);
  }
  return text;
}

// ─── Dispatcher ────────────────────────────────────────────────────────────

export async function ask(system, user, maxTokens = 600, model = DEFAULT_MODEL) {
  if (model.startsWith('gemini-')) {
    return askGemini(system, user, maxTokens, model);
  }
  if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3')) {
    return askOpenAI(system, user, maxTokens, model);
  }
  return askAnthropic(system, user, maxTokens, model);
}
