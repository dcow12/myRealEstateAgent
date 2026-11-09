// Rules-only agents used when no Claude credentials are configured. Same tools, templated words.
import { ROLES } from './roles.ts';
import { TOOLS, homeReport, findHomes, explainRules, affordability, cityStatsTool, rankRuleChanges, streetLeaderboard, mergePolicy, town } from './tools.ts';
import type { AgentAction, AgentRequest, AgentResponse, AgentId } from '../town/types.ts';
import { ZONES } from '../engine/rules.ts';

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const k = (n: number) => '$' + Math.round(n / 1000) + 'k';

/** Reads a home-search request ("a $300,000 house within 10 minutes of X") into search_homes inputs, or null. */
export function parseSearch(msg: string): Record<string, unknown> | null {
  const m = msg.toLowerCase().replace(/,/g, '');
  const money = m.match(/(?:\$\s*(\d+(?:\.\d+)?)\s*(k|m|thousand|million)?)|(\d+(?:\.\d+)?)\s*(k|thousand|million)\b|(\d{5,7})\s*(?:dollars?)/);
  const mins = m.match(/(\d+(?:\.\d+)?)\s*(?:min|mins|minutes?)\b/);
  const miles = m.match(/(\d+(?:\.\d+)?)\s*(?:mi|miles?)\b/);
  const near = msg.match(/\b(?:from|of|near|to|around|by)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9.'& -]{2,60}?)(?:[?.!,]|$)/i);
  let maxPrice: number | undefined;
  if (money) {
    const n = Number(money[1] ?? money[3] ?? money[5]);
    const unit = money[2] ?? money[4] ?? '';
    maxPrice = /m/.test(unit) ? n * 1e6 : /k|thousand/.test(unit) ? n * 1e3 : n;
    if (maxPrice < 1000) maxPrice = undefined;
  }
  if (!maxPrice && !mins && !miles) return null;
  if (!near && !maxPrice) return null;
  const out: Record<string, unknown> = {};
  if (near) out.near = near[1].replace(/\b(within|like|about|under)\b.*$/i, '').trim();
  if (maxPrice) out.max_price = maxPrice;
  if (mins) out.max_drive_minutes = Number(mins[1]);
  if (miles) out.max_miles = Number(miles[1]);
  if (/backyard|adu|cottage|add a unit/.test(m)) out.can_add_unit = true;
  return out;
}

export function offlineReply(roleId: AgentId, req: AgentRequest): AgentResponse {
  const role = ROLES[roleId];
  const msg = (req.thread.at(-1)?.text ?? '').trim();
  const lower = msg.toLowerCase();
  const actions: AgentAction[] = [];
  const tools: AgentResponse['tools'] = [];
  const use = <T,>(name: string, input: unknown, out: T) => { tools.push({ name, input }); return out; };
  let lotIndex = req.lotIndex;

  // Home search by price and distance from a place.
  const search = roleId === 'surveyor' ? parseSearch(msg) : null;
  if (search) {
    const out = TOOLS.search_homes.run(search, { actions }) as { error?: string; matchingHomes?: number; place?: { name: string } | null; homes?: { address: string; assessedValue: number; driveMinutes: number | null; miles: number | null }[] };
    tools.push({ name: 'search_homes', input: search });
    if (out.error) return { reply: out.error, actions, tools, mode: 'offline' };
    const top = (out.homes ?? []).slice(0, 3).map((h) => `${h.address} (${k(h.assessedValue)}${h.driveMinutes != null ? `, ${h.driveMinutes} min` : ''})`).join(', ');
    const where = out.place ? `, measured from ${out.place.name}` : '';
    return {
      reply: out.matchingHomes
        ? `${out.matchingHomes} College Park single-family homes match${where}. Closest: ${top}. Prices are county assessed values, not asking prices, and drive times assume no traffic. They're highlighted on the map.`
        : `No College Park single-family home fits those limits${where}. Try a higher price or a longer drive.`,
      actions, tools, mode: 'offline',
    };
  }

  // Anyone can resolve an address mentioned in the message.
  const addrMatch = msg.match(/\b\d{3,5}[a-z]?\s+[a-z0-9 .]+/i);
  if (addrMatch && (roleId === 'surveyor' || lotIndex == null)) {
    const hits = use('find_home', { query: addrMatch[0] }, findHomes(addrMatch[0], 3));
    if (hits[0]) {
      lotIndex = hits[0].lotIndex;
      actions.push({ type: 'focus', lotIndex });
      tools.push({ name: 'show_on_map', input: { lotIndex } });
    } else if (roleId === 'surveyor') {
      return { reply: `I couldn't find "${addrMatch[0]}" among College Park's single-family homes. Try the house number and street name, like "4719 Pontiac St".`, actions, tools, mode: 'offline' };
    }
  }

  const needLot = () => ({ reply: 'Select a lot first: click one on the map, or ask the Site agent to look up an address.', actions: [{ type: 'handoff', to: 'surveyor', reason: 'Find a home first' } as AgentAction], tools, mode: 'offline' as const });

  if (roleId === 'planner') {
    const policy = { ...req.policy };
    const ft = lower.match(/(\d+)\s*(?:ft|foot|feet)/);
    if (ft && /setback|side|rear|line/.test(lower)) policy.setbackFt = ([0, 3, 5, 8].includes(+ft[1]) ? +ft[1] : 3) as 0 | 3 | 5 | 8;
    if (ft && /gap|separation|house/.test(lower)) policy.separationFt = ([3, 6, 10].includes(+ft[1]) ? +ft[1] : 3) as 3 | 6 | 10;
    if (/coverage/.test(lower)) policy.coverageBonus = 0.1;
    const changed = JSON.stringify(policy) !== JSON.stringify(req.policy);
    if (changed) actions.push({ type: 'policy', policy: mergePolicy(policy) });
    const s = use('city_stats', { policy }, cityStatsTool(policy));
    if (/street/.test(lower)) {
      const top = use('street_leaderboard', { policy }, streetLeaderboard(policy, 5));
      return { reply: `Streets with the most homes that could add a cottage: ${top.map((t) => `${t.street} (${t.ready} of ${t.homes})`).join(', ')}.`, actions, tools, mode: 'offline' };
    }
    const r = use('rank_rule_changes', { policy }, rankRuleChanges(policy));
    const best = r.ranked[0];
    return {
      reply: `${changed ? 'With that rule change, ' : 'Under current rules, '}${s.canAddAHome.toLocaleString()} of College Park's ${s.singleFamilyHomes.toLocaleString()} single-family homes could add a backyard home${changed ? ` (${s.changeVsCurrentRules >= 0 ? '+' : ''}${s.changeVsCurrentRules} vs. today)` : ''}. ` +
        (best && best.extraHomes > 0 ? `The single biggest unlock from here: "${best.label}", which adds about ${best.extraHomes} more.` : 'No single rule change unlocks many more from here.') +
        (changed ? ' The map is recolored to show it.' : ''),
      actions, tools, mode: 'offline',
    };
  }

  if (lotIndex == null) return needLot();
  const rep = use('home_report', { lotIndex, policy: req.policy }, homeReport(lotIndex, req.policy));
  if ('error' in rep) return needLot();
  const lot = town().lots[lotIndex];
  const best = rep.best;

  if (roleId === 'surveyor') {
    const where = `${rep.address} sits on a ${rep.lotSqft.toLocaleString()} sq ft lot${lot.rings > 1 ? ` (${lot.rings} platted lots combined)` : ''} with about ${rep.buildingsFootprintSqft.toLocaleString()} sq ft of buildings on it.`;
    const room = `After the 5 ft side/rear setback and a 6 ft gap from the house, the biggest cottage-shaped rectangle behind it is about ${rep.limits_sqft.biggest_cottage_rectangle_behind_house.toLocaleString()} sq ft.`;
    const out = best
      ? ` So yes: a ${best.label.toLowerCase()} of about ${best.sqft} sq ft fits, limited by the ${rep.limitedBy}.`
      : ` That's not enough for a home here. The limit is the ${rep.limitedBy}.`;
    const est = lot.scan === 'estimated' ? " (The house outline is estimated, so treat this as rough.)" : '';
    if (!best) actions.push({ type: 'handoff', to: 'planner', reason: 'See which rule change would unlock this lot' });
    else actions.push({ type: 'handoff', to: 'builder', reason: 'Price it out' });
    return { reply: where + ' ' + room + out + est, actions, tools, mode: 'offline' };
  }

  if (roleId === 'clerk') {
    const z = ZONES[lot.zone];
    const rules = use('explain_rules', { zone: lot.zone }, explainRules(lot.zone));
    void rules;
    if (!z) return { reply: `This home is zoned ${lot.zone}, which PlotTwist doesn't model yet. Under Maryland's 2025 ADU law, an ADU can be at most 75% of the main house, but the county's rules for this zone need a direct check with DPIE.`, actions, tools, mode: 'offline' };
    return {
      reply: `This home is in ${z.code} (${z.label}). The county caps lot coverage at ${Math.round(z.maxCoverage * 100)}% and keeps accessory buildings out of the ${z.frontYardFt} ft front yard. A cottage can sit in the side or rear yard, stepping 1 ft back per foot over 10 ft tall, so a 15 ft cottage needs 5 ft. Maryland's 2025 ADU law (HB 1466) caps an ADU at 75% of the main house. The 6 ft gap from the house and the ${rep.policyUsed.maxAduSqft} sq ft local cap are PlotTwist assumptions until the county's new bill, CB-074-2026, is checked.` +
        (lot.historic ? ' This home is also in a historic district, so expect design review.' : ''),
      actions, tools, mode: 'offline',
    };
  }

  if (roleId === 'builder') {
    if (!best) return { reply: `There isn't a buildable option on this lot under these rules, so there's nothing to price yet. The Policy agent can show which rule change would open it up.`, actions: [{ type: 'handoff', to: 'planner', reason: 'Find the rule that blocks this lot' }], tools, mode: 'offline' };
    tools.push({ name: 'cost_estimate', input: { sqft: best.sqft, kind: best.kind } });
    const alt = best.kind === 'detached' && lot.accessorySqft >= 250 ? ` There's also an existing ${lot.accessoryIsGarage ? 'garage' : 'outbuilding'} of about ${lot.accessorySqft} sq ft; converting it usually costs less than building new.` : '';
    actions.push({ type: 'handoff', to: 'steward', reason: 'Set an affordable rent' });
    return { reply: `A ${best.sqft} sq ft ${best.label.toLowerCase()} would run roughly ${k(best.costLow)}–${k(best.costHigh)}, including utility hookups and permits. That's a planning range, not a quote, so get two bids.${alt} Building smaller brings the cost down roughly in step with the square footage.`, actions, tools, mode: 'offline' };
  }

  // steward
  if (!best) return { reply: `No unit fits here under these rules, so there's no rent to set yet. The Policy agent can show what would change that.`, actions: [{ type: 'handoff', to: 'planner', reason: 'See what would unlock this lot' }], tools, mode: 'offline' };
  const pct = /80/.test(lower) ? 0.8 : /60/.test(lower) ? 0.6 : 0.5;
  const a = use('affordability', { sqft: best.sqft, amiPct: pct }, affordability(best.sqft, pct));
  const rr = best.rents.find((x) => x.amiPct === pct)!;
  return {
    reply: `As a ${a.unit.toLowerCase()}, typical market rent here is about ${usd(a.marketRent_HUD_FMR)}/month. At ${pct * 100}% of the area median income, an affordable rent is about ${usd(a.affordableRent)}/month. That brings in roughly ${usd(rr.netPerYear)} a year after upkeep, taxes and vacancy, so payback is about ${rr.paybackYears} years. That's a home a teacher or grad student could afford.`,
    actions, tools, mode: 'offline',
  };
}

export const TOOL_NAMES = Object.keys(TOOLS);
