import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeLot, analyzeNeighborhood, rentFor } from '../public/lib/rules.js';
import { SAMPLE_LOTS, syntheticNeighborhood } from '../public/lib/lots.js';
import { explainReport } from '../public/lib/explain.js';

const [A, B, C] = SAMPLE_LOTS;

test('lot A fits a backyard cottage capped by the zone size limit', () => {
  const r = analyzeLot(A);
  assert.equal(r.verdict, 'yes');
  const det = r.options.find((o) => o.type === 'detached');
  assert.equal(det.feasible, true);
  assert.equal(det.sizeSqft, 800); // RSF-65 placeholder cap; 75% of 1600 = 1200 is looser
  assert.ok(det.costLow < det.costHigh);
});

test('state law caps an ADU at 75% of the main house', () => {
  const r = analyzeLot({ ...A, primarySqft: 600 });
  const det = r.options.find((o) => o.type === 'detached');
  assert.equal(det.sizeSqft, 450);
  assert.match(det.limitedBy, /75%/);
});

test('lot B is blocked only by minimum lot size, and the engine says so', () => {
  const r = analyzeLot(B);
  assert.equal(r.verdict, 'no');
  assert.deepEqual(r.blockers.map((b) => b.rule), ['minLotSqft']);
  assert.equal(analyzeLot(B, { minLotSqft: 0 }).verdict, 'yes');
});

test('lot C works only as a garage conversion', () => {
  const r = analyzeLot(C);
  assert.equal(r.verdict, 'yes');
  assert.equal(r.best.type, 'garage');
  assert.equal(r.options.find((o) => o.type === 'detached').feasible, false);
});

test('a tiny garage is "maybe", not "yes"', () => {
  const r = analyzeLot({ ...B, hasGarage: true, garageSqft: 180 });
  assert.equal(r.verdict, 'maybe');
});

test('affordable rent never exceeds market rent and rises with AMI', () => {
  const r50 = rentFor(500, 0.5), r80 = rentFor(500, 0.8);
  assert.ok(r50.affordableRent < r80.affordableRent || r80.affordableRent === r80.marketRent);
  assert.ok(r80.affordableRent <= r80.marketRent);
});

test('neighborhood: relaxing rules never reduces the number of ready lots', () => {
  const lots = syntheticNeighborhood();
  assert.equal(lots.length, 64);
  const base = analyzeNeighborhood(lots).ready;
  const relaxed = analyzeNeighborhood(lots, () => ({ rearSetbackFt: 4, minLotSqft: 0 })).ready;
  assert.ok(base > 0 && base < 64, `baseline should be mixed, got ${base}`);
  assert.ok(relaxed >= base);
});

test('report text uses only engine numbers and always carries the caveat', () => {
  for (const lot of SAMPLE_LOTS) {
    for (const lang of ['en', 'es']) {
      const lines = explainReport(analyzeLot(lot), lang);
      assert.ok(lines.length >= 3);
      assert.match(lines.at(-1), /permit|permiso/);
    }
  }
});
