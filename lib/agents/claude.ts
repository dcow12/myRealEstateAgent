// Claude-backed agent turn: one role, its own tools only, a bounded manual tool loop.
import Anthropic from '@anthropic-ai/sdk';
import { ROLES, systemPrompt } from './roles.ts';
import { TOOLS } from './tools.ts';
import { appState, briefing } from './state.ts';
import type { AgentAction, AgentRequest, AgentResponse, AgentId } from '../town/types.ts';

const MODEL = process.env.CLAUDE_MODEL || process.env.MYREALESTATEAGENT_MODEL || process.env.PLOTTWIST_MODEL || 'claude-opus-5-5';
const MAX_STEPS = 6;

export const claudeKey = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

let client: Anthropic | null = null;

export async function claudeReply(roleId: AgentId, req: AgentRequest): Promise<AgentResponse> {
  client ??= new Anthropic();
  const role = ROLES[roleId];
  const tools: Anthropic.Beta.BetaTool[] = role.tools.map((name) => {
    const t = TOOLS[name];
    return { name: t.name, description: t.description, input_schema: t.input_schema } as Anthropic.Beta.BetaTool;
  });

  const brief = briefing(req, roleId);
  // This agent's thread only. App state rides with the newest user turn.
  const history = req.thread.slice(-16);
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((t, i) =>
    i === history.length - 1 && t.role === 'user'
      ? { role: 'user', content: `${appState(req, roleId)}\n${brief.text}\n\n${t.text}` }
      : { role: t.role, content: t.text },
  );
  if (messages[0]?.role !== 'user') messages.shift();

  const actions: AgentAction[] = [];
  const used: AgentResponse['tools'] = [...brief.calls];
  let reply = '';

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: [{ type: 'text', text: systemPrompt(role), cache_control: { type: 'ephemeral' } }],
      tools,
      messages,
    });

    if (res.stop_reason === 'refusal') {
      return { reply: "I can't help with that one. Ask me about this home, the rules, costs or rents.", actions, tools: used, mode: 'claude' };
    }
    const text = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (text) reply = text;
    messages.push({ role: 'assistant', content: res.content });

    if (res.stop_reason === 'pause_turn') continue;
    if (res.stop_reason !== 'tool_use') break;

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type !== 'tool_use') continue;
      const def = TOOLS[block.name];
      if (!def || !role.tools.includes(block.name)) {
        results.push({ type: 'tool_result', tool_use_id: block.id, content: `Tool ${block.name} is not available to ${role.name}.`, is_error: true });
        continue;
      }
      used.push({ name: block.name, input: block.input });
      try {
        const out = def.run(block.input ?? {}, { actions });
        results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(out) });
      } catch (err) {
        results.push({ type: 'tool_result', tool_use_id: block.id, content: `Tool failed: ${(err as Error).message}`, is_error: true });
      }
    }
    messages.push({ role: 'user', content: results });
  }

  return { reply: reply || '(no answer)', actions, tools: used, mode: 'claude' };
}
