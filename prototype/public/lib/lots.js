// Sample and synthetic lots. These are made up for the demo, not real parcels or owners.

export const SAMPLE_LOTS = [
  {
    id: 'A', name: 'Sample lot A: deep backyard', zone: 'RSF-65',
    lotWidthFt: 60, lotDepthFt: 140, houseFrontSetbackFt: 25, houseWidthFt: 30, houseDepthFt: 36,
    primarySqft: 1600, otherStructuresSqft: 120, obstructionSqft: 300,
    hasGarage: false, garageSqft: 0, hasBasement: true, basementSqft: 700,
  },
  {
    id: 'B', name: 'Sample lot B: just under the minimum lot size', zone: 'RSF-65',
    lotWidthFt: 60, lotDepthFt: 105, houseFrontSetbackFt: 25, houseWidthFt: 28, houseDepthFt: 40,
    primarySqft: 1300, otherStructuresSqft: 0, obstructionSqft: 0,
    hasGarage: false, garageSqft: 0, hasBasement: false, basementSqft: 0,
  },
  {
    id: 'C', name: 'Sample lot C: narrow lot with a garage', zone: 'RSF-A',
    lotWidthFt: 28, lotDepthFt: 95, houseFrontSetbackFt: 20, houseWidthFt: 20, houseDepthFt: 42,
    primarySqft: 1500, otherStructuresSqft: 300, obstructionSqft: 0,
    hasGarage: true, garageSqft: 300, hasBasement: false, basementSqft: 0,
  },
];

// Deterministic PRNG so the neighborhood looks the same on every load.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function syntheticNeighborhood({ blocks = 4, lotsPerSide = 8, seed = 20261106 } = {}) {
  const rand = mulberry32(seed);
  const pick = (lo, hi) => lo + rand() * (hi - lo);
  const lots = [];
  for (let b = 0; b < blocks; b++) {
    const zone = ['RSF-65', 'RSF-65', 'RSF-95', 'RSF-A'][b % 4];
    for (let side = 0; side < 2; side++) {
      for (let i = 0; i < lotsPerSide; i++) {
        const lotWidthFt = Math.round(zone === 'RSF-A' ? pick(24, 40) : zone === 'RSF-95' ? pick(65, 95) : pick(48, 75));
        const lotDepthFt = Math.round(pick(90, 165));
        const houseWidthFt = Math.round(Math.min(lotWidthFt - 6, pick(0.45, 0.7) * lotWidthFt));
        const houseDepthFt = Math.round(pick(28, 48));
        const stories = rand() < 0.5 ? 1 : 1.7;
        lots.push({
          id: `B${b + 1}-${side ? 'S' : 'N'}${i + 1}`,
          name: `Block ${b + 1}, lot ${side ? 'S' : 'N'}${i + 1}`,
          zone, block: b, side, index: i,
          lotWidthFt, lotDepthFt,
          houseFrontSetbackFt: Math.round(pick(18, 35)),
          houseWidthFt, houseDepthFt,
          primarySqft: Math.round(houseWidthFt * houseDepthFt * stories),
          otherStructuresSqft: rand() < 0.4 ? Math.round(pick(80, 300)) : 0,
          obstructionSqft: rand() < 0.5 ? Math.round(pick(100, 900)) : 0,
          hasGarage: rand() < 0.15,
          garageSqft: Math.round(pick(220, 400)),
          hasBasement: rand() < 0.2,
          basementSqft: Math.round(houseWidthFt * houseDepthFt * pick(0.4, 0.8)),
        });
      }
    }
  }
  return lots;
}
