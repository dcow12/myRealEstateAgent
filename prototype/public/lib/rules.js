// PlotTwist rules engine. Pure functions, no AI: the code decides, the model only explains.
import { STATE_RULES, ZONES, MIN_UNIT_SQFT, COSTS, RENT_DATA } from './data.js';

const round = (n, step = 1) => Math.round(n / step) * step;

/**
 * Lot shape:
 * { zone, lotWidthFt, lotDepthFt, houseFrontSetbackFt, houseWidthFt, houseDepthFt,
 *   primarySqft, otherStructuresSqft, obstructionSqft,
 *   hasGarage, garageSqft, hasBasement, basementSqft }
 */
export function analyzeLot(lot, ruleOverrides = {}) {
  const base = ZONES[lot.zone];
  if (!base) throw new Error(`Unknown zone: ${lot.zone}`);
  const zone = { ...base, ...ruleOverrides };

  const lotArea = lot.lotWidthFt * lot.lotDepthFt;
  const houseFootprint = lot.houseWidthFt * lot.houseDepthFt;
  const existingFootprint = houseFootprint + (lot.otherStructuresSqft || 0);
  const sizeCapByPrimary = STATE_RULES.maxPctOfPrimary * lot.primarySqft;
  const cap = Math.min(zone.maxAduSqft, sizeCapByPrimary);

  const options = [];

  // Garage conversion: reuses an existing footprint, so setbacks and coverage do not change.
  options.push(interiorOption('garage', lot.hasGarage, lot.garageSqft, cap, zone, sizeCapByPrimary));
  options.push(interiorOption('basement', lot.hasBasement, lot.basementSqft, cap, zone, sizeCapByPrimary));

  // Detached cottage.
  const rearYardDepth = lot.lotDepthFt - lot.houseFrontSetbackFt - lot.houseDepthFt;
  const usableDepth = Math.max(0, rearYardDepth - zone.separationFt - zone.rearSetbackFt);
  const usableWidth = Math.max(0, lot.lotWidthFt - 2 * zone.sideSetbackFt);
  const footprintRoom = Math.max(0, usableDepth * usableWidth - (lot.obstructionSqft || 0));
  const coverageRoom = Math.max(0, zone.maxLotCoverage * lotArea - existingFootprint);
  const lotTooSmall = lotArea < zone.minLotSqft;

  const limits = [
    { rule: 'footprint', label: 'room left behind the house after setbacks', value: footprintRoom },
    { rule: 'coverage', label: 'lot-coverage limit', value: coverageRoom },
    { rule: 'maxAduSqft', label: `zone size cap (${zone.maxAduSqft} sq ft)`, value: zone.maxAduSqft },
    { rule: 'statePct', label: '75% of the main house (state law)', value: sizeCapByPrimary },
  ];
  const binding = limits.reduce((a, b) => (b.value < a.value ? b : a));
  const detachedSize = lotTooSmall ? 0 : Math.floor(binding.value);
  const detachedOk = !lotTooSmall && detachedSize >= MIN_UNIT_SQFT;

  options.push({
    type: 'detached',
    label: COSTS.detached.label,
    feasible: detachedOk,
    sizeSqft: detachedOk ? round(detachedSize, 10) : 0,
    limitedBy: lotTooSmall ? `minimum lot size (${zone.minLotSqft} sq ft)` : binding.label,
    detail: {
      rearYardDepthFt: rearYardDepth,
      usableDepthFt: usableDepth,
      usableWidthFt: usableWidth,
      footprintRoomSqft: Math.round(footprintRoom),
      coverageRoomSqft: Math.round(coverageRoom),
    },
  });

  for (const o of options) {
    if (o.feasible) Object.assign(o, money(o.type, o.sizeSqft));
  }

  const feasible = options.filter((o) => o.feasible);
  const best = feasible.sort((a, b) => b.sizeSqft - a.sizeSqft)[0] || null;

  return {
    zone: lot.zone,
    zoneLabel: zone.label,
    rulesVerified: zone.verified && Object.keys(ruleOverrides).length === 0,
    lotAreaSqft: lotArea,
    options,
    best,
    verdict: best ? 'yes' : options.some((o) => o.available) ? 'maybe' : 'no',
    blockers: best ? [] : explainBlockers(lot, zone),
  };
}

function interiorOption(type, has, sqft, cap, zone, statePctCap) {
  const label = COSTS[type].label;
  if (!has) return { type, label, feasible: false, available: false, sizeSqft: 0, limitedBy: `no existing ${type}` };
  const size = Math.floor(Math.min(sqft, cap));
  const feasible = size >= MIN_UNIT_SQFT;
  let limitedBy = `existing ${type} size`;
  if (size < sqft) limitedBy = statePctCap < zone.maxAduSqft ? '75% of the main house (state law)' : `zone size cap (${zone.maxAduSqft} sq ft)`;
  return {
    type, label, feasible, available: true,
    sizeSqft: feasible ? round(size, 10) : 0,
    limitedBy: feasible ? limitedBy : `too small to be a home (under ${MIN_UNIT_SQFT} sq ft)`,
  };
}

export function rentFor(sizeSqft, amiPct) {
  // HUD-style: affordable rent = 30% of income at amiPct of area median, adjusted for household size.
  const [unit, hhAdj, fmr] =
    sizeSqft < 450 ? ['Studio', 0.7, RENT_DATA.fmr.studio]
      : sizeSqft < 750 ? ['1 bedroom', 0.75, RENT_DATA.fmr.oneBr]
        : ['2 bedroom', 0.9, RENT_DATA.fmr.twoBr];
  const affordable = round((RENT_DATA.ami4 * hhAdj * amiPct * 0.3) / 12, 5);
  return { unit, marketRent: fmr, affordableRent: Math.min(affordable, fmr) };
}

function money(type, sizeSqft) {
  const c = COSTS[type];
  const costLow = round(sizeSqft * c.low + c.fixed[0], 1000);
  const costHigh = round(sizeSqft * c.high + c.fixed[1], 1000);
  const rents = [0.5, 0.6, 0.8].map((pct) => {
    const r = rentFor(sizeSqft, pct);
    const netYear = round(r.affordableRent * 12 * (1 - RENT_DATA.operatingCostShare), 100);
    const mid = (costLow + costHigh) / 2;
    return { amiPct: pct, rent: r.affordableRent, netPerYear: netYear, paybackYears: Math.round((mid / netYear) * 10) / 10 };
  });
  const r = rentFor(sizeSqft, 0.6);
  return { unitType: r.unit, marketRent: r.marketRent, costLow, costHigh, rents };
}

// Which single rule, if relaxed, would turn this "no" into a "yes"?
const RELAXATIONS = {
  rearSetbackFt: { label: 'rear setback', permissive: 4 },
  sideSetbackFt: { label: 'side setback', permissive: 3 },
  separationFt: { label: 'distance from main house', permissive: 6 },
  maxLotCoverage: { label: 'lot-coverage limit', permissive: 0.5 },
  minLotSqft: { label: 'minimum lot size', permissive: 0 },
};

export function explainBlockers(lot, zone) {
  const out = [];
  for (const [rule, r] of Object.entries(RELAXATIONS)) {
    const trial = analyzeDetachedOnly(lot, { ...zone, [rule]: r.permissive });
    if (trial) out.push({ rule, label: r.label });
  }
  return out;
}

function analyzeDetachedOnly(lot, zone) {
  const lotArea = lot.lotWidthFt * lot.lotDepthFt;
  if (lotArea < zone.minLotSqft) return false;
  const rearYardDepth = lot.lotDepthFt - lot.houseFrontSetbackFt - lot.houseDepthFt;
  const usableDepth = Math.max(0, rearYardDepth - zone.separationFt - zone.rearSetbackFt);
  const usableWidth = Math.max(0, lot.lotWidthFt - 2 * zone.sideSetbackFt);
  const footprintRoom = usableDepth * usableWidth - (lot.obstructionSqft || 0);
  const coverageRoom = zone.maxLotCoverage * lotArea - lot.houseWidthFt * lot.houseDepthFt - (lot.otherStructuresSqft || 0);
  const size = Math.min(footprintRoom, coverageRoom, zone.maxAduSqft, STATE_RULES.maxPctOfPrimary * lot.primarySqft);
  return size >= MIN_UNIT_SQFT;
}

/**
 * Neighborhood mode: run every lot under a (possibly relaxed) rule set and
 * measure how many extra homes each single rule change would unlock.
 */
export function analyzeNeighborhood(lots, overridesByZone = () => ({})) {
  const results = lots.map((lot) => ({ lot, report: analyzeLot(lot, overridesByZone(lot.zone)) }));
  const ready = results.filter((r) => r.report.verdict === 'yes').length;
  const unlocks = {};
  for (const { lot, report } of results) {
    if (report.verdict === 'yes') continue;
    const zone = { ...ZONES[lot.zone], ...overridesByZone(lot.zone) };
    for (const b of explainBlockers(lot, zone)) unlocks[b.label] = (unlocks[b.label] || 0) + 1;
  }
  const ranked = Object.entries(unlocks).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  return { results, total: lots.length, ready, unlocks: ranked };
}
