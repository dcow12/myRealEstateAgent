// Reference data for the PlotTwist rules engine.
// Anything marked verified:false is a DEMO PLACEHOLDER, not a quote from the code.
// Replace it with values from the adopted ordinance before showing it to a real homeowner.

export const STATE_RULES = {
  maxPctOfPrimary: 0.75,
  source: 'Maryland HB 1466 / SB 891 (2025), Chapter 196: an ADU may be no larger than 75% of the primary single-family detached dwelling.',
  url: 'https://planning.maryland.gov/Pages/OurWork/PBP/ADUTF/ADU-FAQ-for-Local-Governments-HB-1466.aspx',
  verified: true,
};

export const COUNTY_BILL = {
  name: 'Prince George\'s County CB-074-2026',
  note: 'County ADU ordinance reported enacted Sept 29, 2026. The dimensional numbers below are placeholders until checked against the adopted text.',
  url: 'https://www.smartergrowth.net/resources/testimony/testimony-support-with-amendments-cb-074-2026-allow-accessory-dwelling-units-adus/',
};

// Dimensional rules per zone (placeholders, verified:false).
export const ZONES = {
  'RSF-95': {
    label: 'Residential, Single-Family-95',
    minLotSqft: 9500,
    rearSetbackFt: 10,
    sideSetbackFt: 8,
    separationFt: 10,
    maxAduSqft: 1000,
    maxLotCoverage: 0.30,
    verified: false,
  },
  'RSF-65': {
    label: 'Residential, Single-Family-65',
    minLotSqft: 6500,
    rearSetbackFt: 10,
    sideSetbackFt: 5,
    separationFt: 10,
    maxAduSqft: 800,
    maxLotCoverage: 0.35,
    verified: false,
  },
  'RSF-A': {
    label: 'Residential, Single-Family-Attached',
    minLotSqft: 4000,
    rearSetbackFt: 8,
    sideSetbackFt: 5,
    separationFt: 8,
    maxAduSqft: 600,
    maxLotCoverage: 0.40,
    verified: false,
  },
};

// Smallest unit the report treats as a real home (efficiency apartment).
export const MIN_UNIT_SQFT = 250;

// Rough DMV construction cost ranges, $/sq ft (demo assumptions).
export const COSTS = {
  garage: { low: 200, high: 300, fixed: [10000, 20000], label: 'Garage conversion' },
  basement: { low: 150, high: 250, fixed: [8000, 15000], label: 'Basement apartment' },
  detached: { low: 300, high: 450, fixed: [25000, 45000], label: 'Backyard cottage' },
};

// HUD FY2026, Washington-Arlington-Alexandria metro.
export const RENT_DATA = {
  ami4: 166100, // median family income (4-person), effective May 1, 2026
  fmr: { studio: 1550, oneBr: 1825, twoBr: 2200 }, // FY2026 Fair Market Rents (from a secondary source; check huduser.gov)
  source: 'HUD FY2026 income limits & Fair Market Rents, Washington-Arlington-Alexandria, DC-VA-MD',
  operatingCostShare: 0.25, // taxes, insurance, upkeep, vacancy (assumption)
};
