// Plain-language Lot Report text built only from the engine's numbers.
// The server can swap this for a Gemini rewrite, but it is always given these facts and nothing else.

const usd = (n) => '$' + Math.round(n).toLocaleString('en-US');

const T = {
  en: {
    yes: (b) => `Good news: a ${b.label.toLowerCase()} of about ${b.sizeSqft} sq ft looks possible on this lot.`,
    maybe: 'You have space you could convert, but it is too small to count as a home under these rules.',
    no: 'Under the current rules, a second home does not fit on this lot.',
    limited: (b) => `The size is limited by the ${b.limitedBy}.`,
    cost: (b) => `Rough build cost: ${usd(b.costLow)}–${usd(b.costHigh)}. That is a wide range, so get two contractor quotes before you decide anything.`,
    rent: (b, r) => `As a ${b.unitType.toLowerCase()}, typical market rent here is about ${usd(b.marketRent)}/month. If you rent it at an affordable level (${Math.round(r.amiPct * 100)}% of area median income), the rent would be about ${usd(r.rent)}/month, or roughly ${usd(r.netPerYear)} a year after costs.`,
    unlock: (labels) => `One rule change would fix this: the ${labels.join(' or the ')}. That is useful to tell your county council member.`,
    nounlock: 'No single rule change would make this lot work. The lot itself is the limit.',
    caveat: 'This is a feasibility estimate, not a permit, legal advice or an appraisal. Confirm everything with the Prince George\'s County permitting office.',
    demo: 'Note: the zone measurements in this prototype are demo values, not yet checked against the adopted county ordinance.',
  },
  es: {
    yes: (b) => `Buenas noticias: parece posible construir ${b.label} de unos ${b.sizeSqft} pies cuadrados en este terreno.`,
    maybe: 'Tiene un espacio que podría convertir, pero es demasiado pequeño para contar como vivienda bajo estas reglas.',
    no: 'Con las reglas actuales, una segunda vivienda no cabe en este terreno.',
    limited: (b) => `El tamaño está limitado por: ${b.limitedBy}.`,
    cost: (b) => `Costo aproximado: ${usd(b.costLow)}–${usd(b.costHigh)}. Es un rango amplio; pida al menos dos cotizaciones antes de decidir.`,
    rent: (b, r) => `Como ${b.unitType}, la renta típica del mercado aquí es de unos ${usd(b.marketRent)}/mes. Si la renta a un nivel asequible (${Math.round(r.amiPct * 100)}% del ingreso medio del área), sería de unos ${usd(r.rent)}/mes, o aproximadamente ${usd(r.netPerYear)} al año después de gastos.`,
    unlock: (labels) => `Un solo cambio de regla lo haría posible: ${labels.join(' o ')}. Vale la pena comentarlo con su concejal del condado.`,
    nounlock: 'Ningún cambio de regla por sí solo haría viable este terreno. El límite es el terreno mismo.',
    caveat: 'Esto es una estimación de viabilidad, no un permiso, asesoría legal ni una tasación. Confirme todo con la oficina de permisos del Condado de Prince George\'s.',
    demo: 'Nota: las medidas de zonificación en este prototipo son valores de demostración, aún no verificados con la ordenanza adoptada.',
  },
};

const ES_TERMS = [
  [/^Backyard cottage$/, 'una casita en el patio'],
  [/^Garage conversion$/, 'una conversión de garaje'],
  [/^Basement apartment$/, 'un apartamento en el sótano'],
  [/^Studio$/, 'un estudio'],
  [/^1 bedroom$/, 'un apartamento de 1 habitación'],
  [/^2 bedroom$/, 'un apartamento de 2 habitaciones'],
  [/^zone size cap \((\d+) sq ft\)$/, 'el tamaño máximo de la zona ($1 pies cuadrados)'],
  [/^minimum lot size \((\d+) sq ft\)$/, 'el tamaño mínimo del terreno ($1 pies cuadrados)'],
  [/^75% of the main house \(state law\)$/, 'el 75% del tamaño de la casa principal (ley estatal)'],
  [/^room left behind the house after setbacks$/, 'el espacio que queda detrás de la casa después de los retiros'],
  [/^lot-coverage limit$/, 'el límite de cobertura del terreno'],
  [/^existing (garage|basement) size$/, 'el tamaño del espacio existente'],
  [/^rear setback$/, 'el retiro trasero'],
  [/^side setback$/, 'el retiro lateral'],
  [/^distance from main house$/, 'la distancia a la casa principal'],
  [/^minimum lot size$/, 'el tamaño mínimo del terreno'],
];
const es = (s) => { for (const [re, out] of ES_TERMS) if (re.test(s)) return s.replace(re, out); return s; };

export function explainReport(report, lang = 'en', amiPct = 0.5) {
  const t = T[lang] || T.en;
  const lines = [];
  if (lang === 'es') {
    report = {
      ...report,
      best: report.best && { ...report.best, label: es(report.best.label), unitType: es(report.best.unitType), limitedBy: es(report.best.limitedBy) },
      blockers: report.blockers.map((x) => ({ ...x, label: es(x.label) })),
    };
  }
  const b = report.best;
  if (b) {
    lines.push(t.yes(b), t.limited(b), t.cost(b));
    const r = b.rents.find((x) => x.amiPct === amiPct) || b.rents[0];
    lines.push(t.rent(b, r));
  } else {
    lines.push(report.verdict === 'maybe' ? t.maybe : t.no);
    lines.push(report.blockers.length ? t.unlock(report.blockers.map((x) => x.label)) : t.nounlock);
  }
  if (!report.rulesVerified) lines.push(t.demo);
  lines.push(t.caveat);
  return lines;
}
