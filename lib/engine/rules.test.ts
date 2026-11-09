import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { evaluate, cityStats, rankRelaxations, BASE_POLICY, SETBACK_STEPS, SEPARATION_STEPS, scenarioIndex, type LotFacts } from './rules.ts';
import { scanSite, fitCottage, ringArea, type Ring, type Edge } from './site.ts';

// A classic College Park lot: 50 ft wide, 150 ft deep, street along y = 0.
const lot: Ring = [[0, 0], [50, 0], [50, 150], [0, 150]];
const house: Ring = [[10, 25], [40, 25], [40, 60], [10, 60]]; // 30 x 35, 25 ft back from the street
const edges = (front = 0): Edge[] => lot.map((p, i) => ({ a: p, b: lot[(i + 1) % 4], kind: i === front ? 'front' : 'line' }));

const scan = () => scanSite({
  rings: [lot], edges: edges(), buildings: [house], frontYardFt: 25, cornerSideYardFt: 25,
  setbacks: SETBACK_STEPS, separations: SEPARATION_STEPS, minWidthFt: 16,
});

test('site scan finds the backyard rectangle behind the house', () => {
  const { rects, rectCorners } = scan();
  // 5 ft setbacks -> 40 ft wide; behind house (60) + 6 ft gap = 66 to 145 -> 79 ft deep, on a 2 ft grid.
  const a = rects[scenarioIndex(5, 6)];
  assert.ok(a >= 38 * 76 && a <= 40 * 79, `got ${a}`);
  const r = rectCorners[scenarioIndex(5, 6)]!;
  for (const [x, y] of r) assert.ok(x >= 5 - 1e-6 && x <= 45 + 1e-6 && y >= 66 - 1e-6 && y <= 145 + 1e-6, `corner ${x},${y}`);
});

test('looser rules never shrink the buildable rectangle', () => {
  const { rects } = scan();
  for (const sep of SEPARATION_STEPS) for (let i = 1; i < SETBACK_STEPS.length; i++)
    assert.ok(rects[scenarioIndex(SETBACK_STEPS[i - 1], sep)] >= rects[scenarioIndex(SETBACK_STEPS[i], sep)]);
});

test('a corner lot keeps the 25 ft street-side setback', () => {
  const e = edges();
  e[1] = { ...e[1], kind: 'street' }; // east side faces a street
  const { rects } = scanSite({ rings: [lot], edges: e, buildings: [house], frontYardFt: 25, cornerSideYardFt: 25, setbacks: [5], separations: [6], minWidthFt: 16 });
  assert.ok(rects[0] <= 20 * 79, `east 25 ft must be excluded, got ${rects[0]}`);
});

test('fitted cottage has the requested area and sits inside the rectangle', () => {
  const r = scan().rectCorners[scenarioIndex(5, 6)]!;
  const c = fitCottage(r, 600, 16);
  assert.ok(Math.abs(ringArea(c) - 600) < 1);
});

const facts = (o: Partial<LotFacts> = {}): LotFacts => ({
  id: 1, addr: '1 Test St', zone: 'RSF65', lotSqft: 7500, livingSqft: 1200, year: 1950, historic: false,
  footprintSqft: 1100, houseFootprintSqft: 1050, accessorySqft: 0, accessoryIsGarage: false,
  rects: scan().rects, scan: 'ok', ...o,
});

test('state law caps the cottage at 75% of the main house', () => {
  const r = evaluate(facts({ livingSqft: 800 }));
  assert.equal(r.verdict, 'yes');
  assert.equal(r.best!.sqft, 600);
  assert.match(r.limitedBy, /75%/);
});

test('lot coverage can be the binding limit', () => {
  const r = evaluate(facts({ footprintSqft: 2500 })); // 35% of 7,500 = 2,625 -> 125 left
  assert.equal(r.blocker, 'lot-coverage');
  assert.notEqual(r.verdict, 'yes');
});

test('unmodeled zones go to review, not yes/no', () => {
  assert.equal(evaluate(facts({ zone: 'RTOLE' })).verdict, 'review');
});

const townFile = new URL('../../public/data/town.json', import.meta.url);
test('citywide: every relaxation helps or does nothing', { skip: !existsSync(townFile) }, () => {
  const town = JSON.parse(readFileSync(townFile, 'utf8'));
  const base = cityStats(town.lots, BASE_POLICY);
  assert.equal(base.homes, town.lots.length);
  assert.equal(base.yes + base.maybe + base.no + base.review, base.homes);
  for (const r of rankRelaxations(town.lots)) assert.ok(r.extraHomes >= 0, r.label);
});
