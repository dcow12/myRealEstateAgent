// Gemini-backed agent turn: same role, same tools, same guardrails as the Claude path. Code still decides every number.
import { GoogleGenAI, ApiError, type Content, type FunctionDeclaration, type GenerateContentParameters, type Part } from '@google/genai';
import { ROLES, systemPrompt } from './roles.ts';
import { TOOLS } from './tools.ts';
import { appState, briefing } from './state.ts';
import type { AgentAction, AgentRequest, AgentResponse, AgentId } from '../town/types.ts';

// Tried in order. A busy (503), rate-limited (429) or retired (404) model hands the turn to the next one,
// and the first model that answers stays first for later turns. GEMINI_MODEL goes to the front of the list.
// Lite first: every number comes from our tools, so the model only picks tools and writes 2-5 sentences. It is the fastest and has the most free-tier quota.
const MODELS = [...new Set([process.env.GEMINI_MODEL, 'gemini-flash-lite-latest', 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.5-flash-lite'].filter(Boolean) as string[])];
let preferred = 0;
const SKIPPABLE = new Set([404, 408, 429, 500, 503, 504]);
// The SDK would otherwise retry a busy model 5 times with 1-2-4-8 s backoff before failing; we fail over to the next model instead.
const PER_CALL_MS = 8_000;
/** Whole agent turn, all models and tool steps. Past this the route answers with rules only. */
const TURN_MS = 15_000;

async function generate(req: Omit<GenerateContentParameters, 'model'>, deadline: number) {
  let last: unknown = new Error('Gemini timeout');
  for (let n = 0; n < MODELS.length; n++) {
    const left = deadline - Date.now();
    if (left < 1_500) break;
    const i = (preferred + n) % MODELS.length;
    try {
      // Cancel on our side: an httpOptions.timeout is sent to Google as a deadline, and Google rejects anything under 10 s.
      const config = { ...req.config, abortSignal: AbortSignal.timeout(Math.min(PER_CALL_MS, left)), httpOptions: { retryOptions: { attempts: 1 } } };
      const res = await client!.models.generateContent({ ...req, model: MODELS[i], config });
      preferred = i;
      return res;
    } catch (err) {
      const timedOut = err instanceof Error && /timeout|abort/i.test(err.name + err.message);
      if (!timedOut && !(err instanceof ApiError && SKIPPABLE.has(err.status))) throw err;
      last = err;
    }
  }
  throw last;
}
const MAX_STEPS = 6;

export const geminiKey = () => Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);

let client: GoogleGenAI | null = null;

export async function geminiReply(roleId: AgentId, req: AgentRequest): Promise<AgentResponse> {
  // v1beta: the -latest aliases and function calling features live there; the SDK defaults to v1.
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY, apiVersion: 'v1beta' });
  const role = ROLES[roleId];
  const functionDeclarations: FunctionDeclaration[] = role.tools.map((name) => {
    const t = TOOLS[name];
    return { name: t.name, description: t.description, parametersJsonSchema: t.input_schema };
  });

  const brief = briefing(req, roleId);
  // This agent's thread only. App state rides with the newest user turn.
  const history = req.thread.slice(-16);
  const contents: Content[] = history.map((t, i) => ({
    role: t.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: i === history.length - 1 && t.role === 'user' ? `${appState(req, roleId)}\n${brief.text}\n\n${t.text}` : t.text }],
  }));
  while (contents[0]?.role !== 'user') contents.shift();

  const actions: AgentAction[] = [];
  const used: AgentResponse['tools'] = [...brief.calls];
  let reply = '';
  const deadline = Date.now() + TURN_MS;

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await generate({
      contents,
      config: { systemInstruction: systemPrompt(role), tools: [{ functionDeclarations }], temperature: 0.4 },
    }, deadline);

    const cand = res.candidates?.[0];
    if (res.promptFeedback?.blockReason || cand?.finishReason === 'SAFETY' || cand?.finishReason === 'PROHIBITED_CONTENT') {
      return { reply: "I can't help with that one. Ask me about this home, the rules, costs or rents.", actions, tools: used, mode: 'gemini' };
    }
    const parts: Part[] = cand?.content?.parts ?? [];
    const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim();
    if (text) reply = text;
    const calls = parts.filter((p) => p.functionCall).map((p) => p.functionCall!);
    if (!calls.length) break;
    // Send the model's turn back unchanged so its thought signatures stay valid.
    contents.push(cand!.content!);

    const responses: Part[] = calls.map((call) => {
      const name = call.name ?? '';
      const def = TOOLS[name];
      if (!def || !role.tools.includes(name)) {
        return { functionResponse: { id: call.id, name, response: { error: `Tool ${name} is not available to ${role.name}.` } } };
      }
      used.push({ name, input: call.args ?? {} });
      try {
        return { functionResponse: { id: call.id, name, response: { output: def.run(call.args ?? {}, { actions }) } } };
      } catch (err) {
        return { functionResponse: { id: call.id, name, response: { error: `Tool failed: ${(err as Error).message}` } } };
      }
    });
    contents.push({ role: 'user', parts: responses });
  }

  return { reply: reply || '(no answer)', actions, tools: used, mode: 'gemini' };
}
