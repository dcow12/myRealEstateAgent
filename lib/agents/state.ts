// The <app_state> block every model sees with the newest user turn. Data, never instructions.
import { ROLES } from './roles.ts';
import { town, homeReport, costEstimate, affordability, explainRules, cityStatsTool, rankRuleChanges } from './tools.ts';
import type { AgentRequest, AgentId } from '../town/types.ts';

export function appState(req: AgentRequest, roleId: AgentId): string {
  const T = town();
  const lot = req.lotIndex != null ? T.lots[req.lotIndex] : null;
  const lines = [
    lot ? `Selected home: lotIndex=${req.lotIndex}, address="${lot.addr}"` : 'Selected home: none',
    `Map rules: ${JSON.stringify(req.policy)}`,
  ];
  if (req.handoff) lines.push(`The user was just talking to the ${ROLES[req.handoff.from].name} agent, which last said: "${req.handoff.summary.slice(0, 600)}"`);
  lines.push(`You are the ${ROLES[roleId].name} agent.`);
  return `<app_state>\n${lines.join('\n')}\n</app_state>`;
}

/**
 * Tool results run by code before the model is called, so most questions take one model call instead of two.
 * Same functions the tools call; the model can still call a tool for anything not covered here.
 */
export type Briefing = { text: string; calls: { name: string; input: unknown; pre: true }[] };

export function briefing(req: AgentRequest, roleId: AgentId): Briefing {
  const out: Record<string, unknown> = {};
  const calls: Briefing['calls'] = [];
  const run = <T,>(name: string, input: unknown, fn: () => T): T => { calls.push({ name, input, pre: true }); return fn(); };
  const lot = req.lotIndex;
  if (roleId === 'planner') {
    out.city_stats = run('city_stats', { policy: req.policy }, () => cityStatsTool(req.policy));
    out.rank_rule_changes = run('rank_rule_changes', { policy: req.policy }, () => rankRuleChanges(req.policy));
  } else if (lot != null) {
    const report = run('home_report', { lotIndex: lot }, () => homeReport(lot, req.policy));
    out.home_report = report;
    const best = 'best' in report ? report.best : null;
    if (roleId === 'builder' && best) out.cost_estimate = run('cost_estimate', { sqft: best.sqft, kind: best.kind }, () => costEstimate(best.sqft, best.kind));
    if (roleId === 'steward' && best) out.affordability = [0.5, 0.6, 0.8].map((p) => run('affordability', { sqft: best.sqft, amiPct: p }, () => affordability(best.sqft, p)));
    if (roleId === 'clerk') {
      const zone = town().lots[lot].zone;
      out.explain_rules = run('explain_rules', { zone }, () => explainRules(zone));
    }
  }
  if (!calls.length) return { text: '', calls };
  return {
    text: `<briefing>\nTool results already run for this turn (current map rules). Answer from these directly; call a tool only for something they don't cover or to change the map.\n${JSON.stringify(out)}\n</briefing>`,
    calls,
  };
}
