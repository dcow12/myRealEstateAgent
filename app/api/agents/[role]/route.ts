import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { ApiError as GeminiError } from '@google/genai';
import { ROLES } from '@/lib/agents/roles.ts';
import { offlineReply } from '@/lib/agents/offline.ts';
import { claudeReply } from '@/lib/agents/claude.ts';
import { geminiReply } from '@/lib/agents/gemini.ts';
import { provider } from '@/lib/agents/provider.ts';
import { mergePolicy } from '@/lib/agents/tools.ts';
import type { AgentId, AgentRequest, ChatTurn } from '@/lib/town/types.ts';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ mode: provider() });
}

function why(err: unknown): string {
  if (err instanceof Error && /abort|timeout/i.test(err.name + err.message)) return 'took too long';
  if (err instanceof Anthropic.RateLimitError) return 'rate limited';
  if (err instanceof Anthropic.AuthenticationError) return 'bad API key';
  if (err instanceof Anthropic.APIError) return `API error ${err.status}`;
  if (err instanceof GeminiError) {
    if (err.status === 429) return 'rate limited';
    if (/API.?key/i.test(err.message) || err.status === 401 || err.status === 403) return 'bad API key';
    return `API error ${err.status}`;
  }
  return 'network error';
}

export async function POST(req: Request, ctx: { params: Promise<{ role: string }> }) {
  const { role } = await ctx.params;
  if (!(role in ROLES)) return NextResponse.json({ error: 'unknown agent' }, { status: 404 });
  const roleId = role as AgentId;

  let body: AgentRequest;
  try {
    const raw = await req.json();
    const thread: ChatTurn[] = Array.isArray(raw.thread)
      ? raw.thread
        .filter((t: ChatTurn) => (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string')
        .map((t: ChatTurn) => ({ role: t.role, text: t.text.slice(0, 2000) }))
      : [];
    if (!thread.length || thread.at(-1)!.role !== 'user') throw new Error('thread must end with a user turn');
    body = {
      thread,
      lotIndex: Number.isInteger(raw.lotIndex) ? raw.lotIndex : null,
      policy: mergePolicy(raw.policy),
      handoff: raw.handoff && raw.handoff.from in ROLES ? { from: raw.handoff.from, summary: String(raw.handoff.summary ?? '') } : null,
    };
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  const mode = provider();
  if (mode === 'offline') return NextResponse.json(offlineReply(roleId, body));
  try {
    return NextResponse.json(mode === 'gemini' ? await geminiReply(roleId, body) : await claudeReply(roleId, body));
  } catch (err) {
    // Fall back to the rules-only agent so the demo never dead-ends.
    const name = mode === 'gemini' ? 'Gemini' : 'Claude';
    return NextResponse.json({ ...offlineReply(roleId, body), note: `${name} unavailable (${why(err)}); answered with rules only.` });
  }
}
