// PlotTwist rules engine. Pure functions. Code decides; agents only explain.
// Runs in Node (scripts, API routes) and in the browser (3D what-if recoloring).

export type ZoneRules = {
  code: string;
  label: string;
  minLotSqft: number;
  maxCoverage: number; // fraction of net lot area
  frontYardFt: number;
  sideYardFt: number;
  rearYardFt: number;
  accessoryMaxHeightFt: number;
  source: string;
};

const CODE_634 = 'https://online.encodeplus.com/regs/princegeorgescounty-md/doc-viewer.aspx#secid-634';
export const CODE_652 = 'https://online.encodeplus.com/regs/princegeorgescounty-md/doc-viewer.aspx#secid-652';

// Verified against Prince George's County Zoning Ordinance Sec. 27-4202, single-family detached column
// (eCode360/enCodePlus, fetched Nov 6, 2026).
export const ZONES: Record<string, ZoneRules> = {
  RR: { code: 'RR', label: 'Residential, Rural', minLotSqft: 20000, maxCoverage: 0.25, frontYardFt: 25, sideYardFt: 8, rearYardFt: 20, accessoryMaxHeightFt: 15, source: CODE_634 },
  RSF95: { code: 'RSF-95', label: 'Residential, Single-Family-95', minLotSqft: 9500, maxCoverage: 0.30, frontYardFt: 25, sideYardFt: 8, rearYardFt: 20, accessoryMaxHeightFt: 15, source: CODE_634 },
  RSF65: { code: 'RSF-65', label: 'Residential, Single-Family-65', minLotSqft: 6500, maxCoverage: 0.35, frontYardFt: 25, sideYardFt: 8, rearYardFt: 20, accessoryMaxHeightFt: 15, source: CODE_634 },
  RSFA: { code: 'RSF-A', label: 'Residential, Single-Family-Attached', minLotSqft: 5000, maxCoverage: 0.40, frontYardFt: 15, sideYardFt: 8, rearYardFt: 20, accessoryMaxHeightFt: 25, source: CODE_634 },
};

export const STATE_LAW = {
  maxPctOfPrimary: 0.75,
  cite: 'Maryland HB 1466 / SB 891 (2025), Ch. 196: an ADU may be at most 75% of the main single-family detached home.',
  url: 'https://planning.maryland.gov/Pages/OurWork/PBP/ADUTF/ADU-FAQ-for-Local-Governments-HB-1466.aspx',
};

export const ACCESSORY_RULE = {
  cite: 'PG County Zoning Ordinance, general accessory structure standards (Sec. 27-5200): accessory structures may sit in a required side or rear yard, but not the front yard; above 10 ft tall, they step back 1 ft from the side/rear line per foot over 10 ft. On corner lots they keep the 25 ft street-side setback.',
  url: CODE_652,
};

// Values we could not verify yet. Every report labels them.
export const ASSUMPTIONS = {
  cottageHeightFt: 15, // a one-story cottage at the 15 ft accessory height cap -> 5 ft side/rear setback under Sec. 27-5202
  separationFt: 6, // gap from the main house; no county number found, typical fire-separation practice
  localMaxAduSqft: 1000, // CB-074-2026's local size cap not yet read from the adopted text
  minUnitSqft: 250, // smallest efficiency we treat as a real home
  minWidthFt: 16, // narrowest practical cottage
};

export const CB_074 = {
  cite: "Prince George's County CB-074-2026, the local ADU bill, reported enacted Sept 29, 2026. Its specific numbers are not yet reflected here.",
  url: 'https://www.smartergrowth.net/resources/testimony/testimony-support-with-amendments-cb-074-2026-allow-accessory-dwelling-units-adus/',
};

export const RENT = {
  ami4: 166100,
  fmr: { studio: 1550, oneBr: 1825, twoBr: 2200 },
  source: 'HUD FY2026, Washington-Arlington-Alexandria (AMI $166,100; FMRs via secondary source)',
  operatingCostShare: 0.25,
};

export const COSTS = {
  detached: { low: 300, high: 450, fixedLow: 25000, fixedHigh: 45000, label: 'Backyard cottage' },
  conversion: { low: 200, high: 300, fixedLow: 10000, fixedHigh: 20000, label: 'Garage/shed conversion' },
};

// The site scan precomputes the biggest buildable rectangle for this grid of setbacks x separations.
export const SETBACK_STEPS = [0, 3, 5, 8] as const;
export const SEPARATION_STEPS = [3, 6, 10] as const;
export const scenarioIndex = (setbackFt: number, separationFt: number) =>
  SETBACK_STEPS.indexOf(setbackFt as never) * SEPARATION_STEPS.length + SEPARATION_STEPS.indexOf(separationFt as never);

export type LotFacts = {
  id: number;
  addr: string;
  zone: string; // raw county code, e.g. RSF65
  lotSqft: number;
  livingSqft: number; // SDAT structure sq ft (0 = unknown)
  year: number | null;
  historic: boolean;
  footprintSqft: number; // all buildings on the lot (OSM)
  houseFootprintSqft: number;
  accessorySqft: number; // largest existing accessory building
  accessoryIsGarage: boolean;
  rects: number[]; // max cottage rectangle (sq ft) per scenario; [] if no site scan
  scan: 'ok' | 'estimated' | 'no-building' | 'no-street'; // estimated = house box inferred from county living area
};

export type Policy = {
  setbackFt: (typeof SETBACK_STEPS)[number];
  separationFt: (typeof SEPARATION_STEPS)[number];
  coverageBonus: number; // added to the zone's max coverage fraction, e.g. 0.05
  maxAduSqft: number;
  requireMinLot: boolean;
};

export const BASE_POLICY: Policy = {
  setbackFt: 5,
  separationFt: ASSUMPTIONS.separationFt as 6,
  coverageBonus: 0,
  maxAduSqft: ASSUMPTIONS.localMaxAduSqft,
  requireMinLot: false,
};

export type Verdict = 'yes' | 'maybe' | 'no' | 'review';
export type Blocker = 'backyard-room' | 'lot-coverage' | 'size-cap' | 'min-lot' | 'zone-not-modeled' | 'no-data';

export type Result = {
  verdict: Verdict;
  best: null | {
    kind: 'detached' | 'conversion';
    label: string;
    sqft: number;
    unit: 'Studio' | '1 bedroom' | '2 bedroom';
    costLow: number;
    costHigh: number;
    marketRent: number;
    rents: { amiPct: number; rent: number; netPerYear: number; paybackYears: number }[];
  };
  detachedSqft: number;
  limits: { rectSqft: number; coverageRoomSqft: number; capSqft: number };
  limitedBy: string;
  blocker: Blocker | null;
};

const r10 = (n: number) => Math.round(n / 10) * 10;
const r1000 = (n: number) => Math.round(n / 1000) * 1000;

export function rentFor(sqft: number, amiPct: number) {
  const [unit, hh, fmr] =
    sqft < 450 ? (['Studio', 0.7, RENT.fmr.studio] as const)
      : sqft < 750 ? (['1 bedroom', 0.75, RENT.fmr.oneBr] as const)
        : (['2 bedroom', 0.9, RENT.fmr.twoBr] as const);
  const affordable = Math.round((RENT.ami4 * hh * amiPct * 0.3) / 12 / 5) * 5;
  return { unit, marketRent: fmr, rent: Math.min(affordable, fmr) };
}

export function money(kind: 'detached' | 'conversion', sqft: number) {
  const c = COSTS[kind];
  const costLow = r1000(sqft * c.low + c.fixedLow);
  const costHigh = r1000(sqft * c.high + c.fixedHigh);
  const mid = (costLow + costHigh) / 2;
  const rents = [0.5, 0.6, 0.8].map((amiPct) => {
    const { rent } = rentFor(sqft, amiPct);
    const netPerYear = Math.round((rent * 12 * (1 - RENT.operatingCostShare)) / 100) * 100;
    return { amiPct, rent, netPerYear, paybackYears: Math.round((mid / netPerYear) * 10) / 10 };
  });
  const { unit, marketRent } = rentFor(sqft, 0.6);
  return { label: c.label, unit, costLow, costHigh, marketRent, rents };
}

export function evaluate(lot: LotFacts, policy: Policy = BASE_POLICY): Result {
  const zone = ZONES[lot.zone];
  const empty = { verdict: 'review' as Verdict, best: null, detachedSqft: 0, limits: { rectSqft: 0, coverageRoomSqft: 0, capSqft: 0 } };
  if (!zone) return { ...empty, limitedBy: `zone ${lot.zone} isn't modeled yet`, blocker: 'zone-not-modeled' };
  if ((lot.scan !== 'ok' && lot.scan !== 'estimated') || lot.rects.length === 0) {
    return { ...empty, limitedBy: lot.scan === 'no-building' ? 'no building footprint in the map data' : 'no street found next to the lot', blocker: 'no-data' };
  }

  const rectSqft = lot.rects[scenarioIndex(policy.setbackFt, policy.separationFt)] ?? 0;
  const coverageRoomSqft = Math.max(0, (zone.maxCoverage + policy.coverageBonus) * lot.lotSqft - lot.footprintSqft);
  const living = lot.livingSqft > 0 ? lot.livingSqft : lot.houseFootprintSqft;
  const capSqft = Math.min(policy.maxAduSqft, STATE_LAW.maxPctOfPrimary * living);
  const minLotFail = policy.requireMinLot && lot.lotSqft < zone.minLotSqft;

  const limits = [
    { key: 'backyard-room' as const, label: 'room behind the house after setbacks', v: rectSqft },
    { key: 'lot-coverage' as const, label: `lot coverage limit (${Math.round((zone.maxCoverage + policy.coverageBonus) * 100)}%)`, v: coverageRoomSqft },
    { key: 'size-cap' as const, label: capSqft === policy.maxAduSqft ? `size cap (${policy.maxAduSqft} sq ft)` : '75% of the main house (state law)', v: capSqft },
  ];
  const binding = limits.reduce((a, b) => (b.v < a.v ? b : a));
  const detachedSqft = minLotFail ? 0 : Math.floor(binding.v);
  const detachedOk = detachedSqft >= ASSUMPTIONS.minUnitSqft;

  const convSqft = Math.floor(Math.min(lot.accessorySqft, capSqft));
  const convOk = lot.accessorySqft >= ASSUMPTIONS.minUnitSqft && convSqft >= ASSUMPTIONS.minUnitSqft && !minLotFail;

  let best: Result['best'] = null;
  if (detachedOk) best = { kind: 'detached', sqft: r10(detachedSqft), ...money('detached', r10(detachedSqft)) };
  else if (convOk) best = { kind: 'conversion', sqft: r10(convSqft), ...money('conversion', r10(convSqft)) };

  const verdict: Verdict = best ? 'yes' : binding.v >= 150 || lot.accessorySqft >= 150 ? 'maybe' : 'no';
  return {
    verdict,
    best,
    detachedSqft: detachedOk ? r10(detachedSqft) : 0,
    limits: { rectSqft: Math.round(rectSqft), coverageRoomSqft: Math.round(coverageRoomSqft), capSqft: Math.round(capSqft) },
    limitedBy: minLotFail ? `minimum lot size (${zone.minLotSqft.toLocaleString()} sq ft)` : binding.label,
    blocker: best ? null : minLotFail ? 'min-lot' : binding.key,
  };
}

export type CityStats = {
  homes: number;
  yes: number;
  maybe: number;
  no: number;
  review: number;
  newHomeSqft: number;
  byBlocker: Partial<Record<Blocker, number>>;
};

export function cityStats(lots: LotFacts[], policy: Policy = BASE_POLICY): CityStats {
  const s: CityStats = { homes: lots.length, yes: 0, maybe: 0, no: 0, review: 0, newHomeSqft: 0, byBlocker: {} };
  for (const lot of lots) {
    const r = evaluate(lot, policy);
    s[r.verdict]++;
    if (r.best) s.newHomeSqft += r.best.sqft;
    if (r.blocker) s.byBlocker[r.blocker] = (s.byBlocker[r.blocker] ?? 0) + 1;
  }
  return s;
}

// Which single policy change unlocks the most homes from a given starting policy?
export const RELAXATIONS: { key: string; label: string; apply: (p: Policy) => Policy }[] = [
  { key: 'setback', label: 'Let cottages sit 3 ft from side/rear lines (now 5 ft)', apply: (p) => ({ ...p, setbackFt: 3 }) },
  { key: 'separation', label: 'Allow a 3 ft gap from the main house (now 6 ft)', apply: (p) => ({ ...p, separationFt: 3 }) },
  { key: 'coverage', label: 'Add 10 points to the lot-coverage limit', apply: (p) => ({ ...p, coverageBonus: p.coverageBonus + 0.1 }) },
  { key: 'cap', label: 'Raise the local size cap to 1,200 sq ft', apply: (p) => ({ ...p, maxAduSqft: Math.max(p.maxAduSqft, 1200) }) },
];

export function rankRelaxations(lots: LotFacts[], policy: Policy = BASE_POLICY) {
  const base = cityStats(lots, policy).yes;
  return RELAXATIONS.map((r) => ({ key: r.key, label: r.label, extraHomes: cityStats(lots, r.apply(policy)).yes - base }))
    .sort((a, b) => b.extraHomes - a.extraHomes);
}
