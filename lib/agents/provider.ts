// Which model writes the agents' words. PLOTTWIST_LLM = gemini | claude | off; unset picks Gemini, then Claude, by which key is present.
import { geminiKey } from './gemini.ts';
import { claudeKey } from './claude.ts';
import type { AgentMode } from '../town/types.ts';

export function provider(): AgentMode {
  const want = process.env.PLOTTWIST_LLM?.toLowerCase();
  if (want === 'off') return 'offline';
  if (want === 'gemini') return geminiKey() ? 'gemini' : 'offline';
  if (want === 'claude') return claudeKey() ? 'claude' : 'offline';
  return geminiKey() ? 'gemini' : claudeKey() ? 'claude' : 'offline';
}
