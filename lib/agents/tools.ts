// Agent tools. Every number an agent says comes from here; the model never computes money or rules.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ZONES, STATE_LAW, ACCESSORY_RULE, ASSUMPTIONS, CB_074, RENT, BASE_POLICY, SETBACK_STEPS, SEPARATION_STEPS,
  evaluate, cityStats, rankRelaxations, money, rentFor, type Policy,
} from '../engine/rules.ts';
import type { TownData, TownLot, AgentAction, AgentId } from '../town/types.ts';
import { assessed, searchHomes } from './search.ts';

let cached: TownData | null = null;
export function town(): TownData {
  if (!cached) cached = JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', 'town.json'), 'utf8')) as TownData;
  return cached;
}

export function mergePolicy(p: Partial<Policy> | undefined, base: Policy = BASE_POLICY): Policy {
  const out = { ...base };
  if (!p) return out;
  if (SETBACK_STEPS.includes(p.setbackFt as never)) out.setbackFt = p.setbackFt!;
  if (SEPARATION_STEPS.includes(p.separationFt as never)) out.separationFt = p.separationFt!;
  if (typeof p.coverageBonus === 'number') out.coverageBonus = Math.max(0, Math.min(0.25, p.coverageBonus));
  if (typeof p.maxAduSqft === 'number') out.maxAduSqft = Math.max(300, Math.min(2000, Math.round(p.maxAduSqft)));
  if (typeof p.requireMinLot === 'boolean') out.requireMinLot = p.requireMinLot;
  return out;
}

const norm = (s: string) => s.toLowerCase()
  .replace(/\b(street)\b/g, 'st').replace(/\b(avenue)\b/g, 'ave').replace(/\b(road)\b/g, 'rd').replace(/\b(drive)\b/g, 'dr')
  .replace(/\b(place)\b/g, 'pl').replace(/\b(lane)\b/g, 'ln').replace(/\b(court)\b/g, 'ct').replace(/\b(terrace)\b/g, 'ter')
  .replace(/\b(boulevard)\b/g, 'blvd').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export function findHomes(query: string, limit = 5) {
  const q = norm(query);
  const words = q.split(' ').filter(Boolean);
  if (!words.length) return [];
  const T = town();
  const scored: { i: number; score: number }[] = [];
  T.lots.forEach((l, i) => {
    if (!l.addr) return;
    const a = norm(l.addr);
    let score = 0;
    if (a === q) score = 100;
    else if (a.startsWith(q)) score = 80;
    else {
      const hits = words.filter((w) => a.split(' ').includes(w)).length;
      if (hits === words.length) score = 60;
      else if (hits) score = 20 * hits + (a.includes(words[0]) ? 5 : 0);
    }
    if (score) scored.push({ i, score });
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map(({ i }) => {
    const l = T.lots[i];
    const r = evaluate(l);
    return { lotIndex: i, address: l.addr, verdict: r.verdict, bestSqft: r.best?.sqft ?? 0, assessedValue: assessed(i) };
  });
}

const zoneOf = (l: TownLot) => ZONES[l.zone];

export function homeReport(lotIndex: number, policy?: Partial<Policy>) {
  const l = town().lots[lotIndex];
  if (!l) return { error: `No home with lotIndex ${lotIndex}` };
  const p = mergePolicy(policy);
  const r = evaluate(l, p);
  const z = zoneOf(l);
  return {
    lotIndex,
    address: l.addr || '(no street address on record)',
    zone: z ? `${z.code} (${z.label})` : `${l.zone} (not modeled: ADU rules for this zone are not in PlotTwist yet)`,
    lotSqft: l.lotSqft,
    platted_lots_merged: l.rings,
    livingSqft_county_record: l.livingSqft || 'unknown',
    yearBuilt: l.year ?? 'unknown',
    assessedValue_county: assessed(lotIndex) ?? 'unknown',
    buildingsFootprintSqft: l.footprintSqft,
    houseFootprintSqft: l.houseFootprintSqft,
    houseOutline: l.scan === 'estimated' ? 'ESTIMATED from county living area (not in OpenStreetMap)' : l.scan === 'ok' ? 'OpenStreetMap footprint' : 'missing',
    existingAccessoryBuildingSqft: l.accessorySqft,
    inHistoricDistrict: l.historic,
    verdict: r.verdict,
    best: r.best,
    limitedBy: r.limitedBy,
    // Rounded to 10 sq ft, the same rounding the engine applies to best.sqft, so an agent never quotes 752 beside a panel showing 750.
    limits_sqft: {
      biggest_cottage_rectangle_behind_house: Math.round(r.limits.rectSqft / 10) * 10,
      room_left_under_lot_coverage: Math.round(r.limits.coverageRoomSqft / 10) * 10,
      size_cap: Math.round(r.limits.capSqft / 10) * 10,
    },
    policyUsed: p,
    flags: [
      l.historic ? 'In a historic district: exterior changes may need Historic Preservation review.' : null,
      l.scan === 'estimated' ? 'House outline is estimated, so the backyard numbers are rough.' : null,
      'Local ADU size cap and the 6 ft house gap are PlotTwist assumptions until CB-074-2026 text is checked.',
    ].filter(Boolean),
  };
}

export function explainRules(zoneCode: string) {
  const key = zoneCode.replace(/-/g, '').toUpperCase();
  const z = ZONES[key];
  return {
    zone: z ?? `Zone ${zoneCode} is not modeled. Modeled: ${Object.values(ZONES).map((x) => x.code).join(', ')}`,
    zoneSource: z?.source,
    accessoryStructures: ACCESSORY_RULE,
    stateLaw: STATE_LAW,
    countyAduBill: CB_074,
    assumptions: {
      ...ASSUMPTIONS,
      note: 'cottageHeightFt 15 gives a 5 ft side/rear setback under the 1-ft-per-ft-over-10 rule. separationFt and localMaxAduSqft are unverified placeholders.',
    },
  };
}

export function costEstimate(sqft: number, kind: 'detached' | 'conversion') {
  const s = Math.max(150, Math.min(2000, Math.round(sqft)));
  const m = money(kind, s);
  return {
    sqft: s, kind, label: m.label, costLow: m.costLow, costHigh: m.costHigh,
    basis: kind === 'detached' ? '$300–$450/sq ft + $25k–$45k utility hookups and permits (DMV rough range, assumption)' : '$200–$300/sq ft + $10k–$20k (assumption)',
    caveat: 'Rough planning range, not a quote. Get two contractor bids.',
  };
}

export function affordability(sqft: number, amiPct: number) {
  const pct = [0.5, 0.6, 0.8].includes(amiPct) ? amiPct : 0.6;
  const r = rentFor(sqft, pct);
  return {
    unit: r.unit, marketRent_HUD_FMR: r.marketRent, affordableRent: r.rent, amiPct: pct,
    areaMedianIncome4Person: RENT.ami4,
    method: 'Rent = 30% of monthly income at the chosen % of area median income, adjusted for household size (studio 0.7, 1BR 0.75, 2BR 0.9 of the 4-person figure). Capped at market rent.',
    source: RENT.source,
  };
}

const BLOCKER_TEXT = {
  'backyard-room': 'not enough open backyard behind the house (setbacks plus the gap from the house)',
  'lot-coverage': 'lot already near its coverage limit',
  'size-cap': 'size cap leaves too little room',
  'min-lot': 'lot smaller than the zone minimum',
  'zone-not-modeled': 'zone not modeled by PlotTwist',
  'no-data': 'missing map data',
} as const;

export function cityStatsTool(policy?: Partial<Policy>) {
  const T = town();
  const p = mergePolicy(policy);
  const s = cityStats(T.lots, p);
  const base = cityStats(T.lots);
  return { policy: p, singleFamilyHomes: s.homes, canAddAHome: s.yes, maybe: s.maybe, blocked: s.no, needsReview: s.review, changeVsCurrentRules: s.yes - base.yes, newHomeSqftTotal: s.newHomeSqft,
    homesNotFittingByReason: Object.fromEntries(Object.entries(s.byBlocker).map(([k, n]) => [BLOCKER_TEXT[k as keyof typeof BLOCKER_TEXT] ?? k, n])),
    note: 'homesNotFittingByReason counts homes by the limit that stops them today. It is not what one rule change would unlock; rank_rule_changes gives that.' };
}

export function rankRuleChanges(policy?: Partial<Policy>) {
  return { startingPolicy: mergePolicy(policy), ranked: rankRelaxations(town().lots, mergePolicy(policy)) };
}

export function streetLeaderboard(policy?: Partial<Policy>, limit = 8) {
  const T = town();
  const p = mergePolicy(policy);
  const by = new Map<string, { street: string; homes: number; ready: number }>();
  for (const l of T.lots) {
    const street = l.addr.replace(/^\S+\s+/, '');
    if (!street) continue;
    const e = by.get(street) ?? { street, homes: 0, ready: 0 };
    e.homes++;
    if (evaluate(l, p).verdict === 'yes') e.ready++;
    by.set(street, e);
  }
  return [...by.values()].filter((e) => e.homes >= 8).sort((a, b) => b.ready - a.ready).slice(0, Math.min(15, limit));
}

/* ---------- Tool registry with JSON schemas ---------- */
type ToolDef = {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
  run: (input: any, ctx: { actions: AgentAction[] }) => unknown;
};

const policySchema = {
  type: 'object',
  description: 'Optional rule set. Omit fields to keep the current rules.',
  properties: {
    setbackFt: { type: 'number', enum: [0, 3, 5, 8], description: 'Cottage distance from side/rear lot lines' },
    separationFt: { type: 'number', enum: [3, 6, 10], description: 'Gap between cottage and main house' },
    coverageBonus: { type: 'number', description: 'Added to max lot coverage, e.g. 0.1 = +10 points' },
    maxAduSqft: { type: 'number', description: 'Local size cap in sq ft' },
    requireMinLot: { type: 'boolean', description: 'Require the zone minimum lot size' },
  },
  additionalProperties: false,
};

export const TOOLS: Record<string, ToolDef> = {
  find_home: {
    name: 'find_home',
    description: 'Search College Park single-family homes by street address. Returns lotIndex values for other tools.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
    run: (i) => findHomes(String(i.query ?? '')),
  },
  home_report: {
    name: 'home_report',
    description: 'Full feasibility facts for one home: zone, lot, footprint, biggest cottage rectangle, verdict, best option with cost and rents, flags.',
    input_schema: { type: 'object', properties: { lotIndex: { type: 'integer' }, policy: policySchema }, required: ['lotIndex'], additionalProperties: false },
    run: (i) => homeReport(Number(i.lotIndex), i.policy),
  },
  search_homes: {
    name: 'search_homes',
    description: 'Find College Park single-family homes by county assessed value and by distance or drive time from a named place (school, station, park, library, store, campus). Shows the matches on the map. Use this for any "homes under $X near / within N miles / N minutes of Y" question.',
    input_schema: {
      type: 'object',
      properties: {
        near: { type: 'string', description: 'Name of a place, e.g. "Friends Community School", "College Park Metro", "UMD"' },
        max_price: { type: 'number', description: 'Max assessed value in dollars, e.g. 300000' },
        min_price: { type: 'number' },
        max_miles: { type: 'number', description: 'Max straight-line distance in miles from the place' },
        max_drive_minutes: { type: 'number', description: 'Max drive time in minutes from the place' },
        can_add_unit: { type: 'boolean', description: 'Only homes that could also add a backyard unit' },
        min_living_sqft: { type: 'number' },
        limit: { type: 'integer', description: 'How many homes to list (default 8, max 25)' },
      },
      additionalProperties: false,
    },
    run: (i, ctx) => {
      const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
      const filters = {
        near: typeof i.near === 'string' ? i.near : undefined, maxPrice: num(i.max_price), minPrice: num(i.min_price),
        maxMiles: num(i.max_miles), maxDriveMinutes: num(i.max_drive_minutes), canAddUnit: i.can_add_unit === true,
        minBedroomsProxySqft: num(i.min_living_sqft),
      };
      const r = searchHomes({ ...filters, limit: 25 });
      if ('error' in r) return r;
      const { _place, _all, ...out } = r;
      const parts = [
        filters.maxPrice != null && `under $${Math.round(filters.maxPrice / 1000)}k`,
        filters.maxDriveMinutes != null && `within ${filters.maxDriveMinutes} min drive`,
        filters.maxMiles != null && `within ${filters.maxMiles} mi`,
      ].filter(Boolean);
      ctx.actions.push({
        type: 'results', total: r.matchingHomes, all: _all,
        label: [parts.join(', '), _place ? `of ${_place.name}` : ''].filter(Boolean).join(' ') || 'Matching homes',
        place: _place ? { name: _place.name, x: _place.x, y: _place.y } : null,
        homes: r.homes.map((h) => ({ lotIndex: h.lotIndex, address: h.address, assessedValue: h.assessedValue, driveMinutes: h.driveMinutes, miles: h.miles })),
      });
      return { ...out, homes: out.homes.slice(0, Math.max(1, Math.min(25, num(i.limit) ?? 8))) };
    },
  },
  show_on_map: {
    name: 'show_on_map',
    description: 'Fly the 3D map to a home and select it.',
    input_schema: { type: 'object', properties: { lotIndex: { type: 'integer' } }, required: ['lotIndex'], additionalProperties: false },
    run: (i, ctx) => {
      const idx = Number(i.lotIndex);
      if (!town().lots[idx]) return { error: 'unknown lotIndex' };
      ctx.actions.push({ type: 'focus', lotIndex: idx });
      return { ok: true };
    },
  },
  explain_rules: {
    name: 'explain_rules',
    description: 'Zoning and state rules that govern backyard homes, with citations and which values are assumptions.',
    input_schema: { type: 'object', properties: { zone: { type: 'string', description: 'e.g. RSF-65' } }, required: ['zone'], additionalProperties: false },
    run: (i) => explainRules(String(i.zone ?? 'RSF-65')),
  },
  cost_estimate: {
    name: 'cost_estimate',
    description: 'Rough build cost range for a backyard cottage (detached) or a garage/shed conversion.',
    input_schema: { type: 'object', properties: { sqft: { type: 'number' }, kind: { type: 'string', enum: ['detached', 'conversion'] } }, required: ['sqft', 'kind'], additionalProperties: false },
    run: (i) => costEstimate(Number(i.sqft), i.kind === 'conversion' ? 'conversion' : 'detached'),
  },
  affordability: {
    name: 'affordability',
    description: 'Affordable rent at 50/60/80% of area median income vs. market rent for a unit size.',
    input_schema: { type: 'object', properties: { sqft: { type: 'number' }, amiPct: { type: 'number', enum: [0.5, 0.6, 0.8] } }, required: ['sqft', 'amiPct'], additionalProperties: false },
    run: (i) => affordability(Number(i.sqft), Number(i.amiPct)),
  },
  city_stats: {
    name: 'city_stats',
    description: 'Citywide count of single-family homes that can add a backyard home under a rule set.',
    input_schema: { type: 'object', properties: { policy: policySchema }, additionalProperties: false },
    run: (i) => cityStatsTool(i.policy),
  },
  rank_rule_changes: {
    name: 'rank_rule_changes',
    description: 'Which single rule change would unlock the most extra homes citywide.',
    input_schema: { type: 'object', properties: { policy: policySchema }, additionalProperties: false },
    run: (i) => rankRuleChanges(i.policy),
  },
  street_leaderboard: {
    name: 'street_leaderboard',
    description: 'Streets with the most homes that can add a backyard home.',
    input_schema: { type: 'object', properties: { policy: policySchema, limit: { type: 'integer' } }, additionalProperties: false },
    run: (i) => streetLeaderboard(i.policy, Number(i.limit ?? 8)),
  },
  set_map_policy: {
    name: 'set_map_policy',
    description: 'Recolor the 3D map under a what-if rule set so the user can see it.',
    input_schema: { type: 'object', properties: { policy: policySchema }, required: ['policy'], additionalProperties: false },
    run: (i, ctx) => {
      const p = mergePolicy(i.policy);
      ctx.actions.push({ type: 'policy', policy: p });
      return { ok: true, policy: p };
    },
  },
  hand_off: {
    name: 'hand_off',
    description: 'Suggest the user talk to another agent next. The user decides; this only shows a button.',
    input_schema: {
      type: 'object',
      properties: { to: { type: 'string', enum: ['surveyor', 'clerk', 'builder', 'steward', 'planner'] }, reason: { type: 'string' } },
      required: ['to', 'reason'],
      additionalProperties: false,
    },
    run: (i, ctx) => {
      ctx.actions.push({ type: 'handoff', to: i.to as AgentId, reason: String(i.reason ?? '').slice(0, 160) });
      return { ok: true };
    },
  },
};
