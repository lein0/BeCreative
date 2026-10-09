export type FunnelStep = { name: string; count: number };

export function funnelReport(steps: FunnelStep[]) {
  const start = steps[0]?.count ?? 0;
  return steps.map((step, index) => {
    const previous = index === 0 ? step.count : steps[index - 1]!.count;
    const conversion = previous === 0 ? 0 : step.count / previous;
    return {
      name: step.name,
      count: step.count,
      conversion,
      dropOff: previous === 0 ? 0 : 1 - conversion,
      fromStart: start === 0 ? 0 : step.count / start,
    };
  });
}

export function hashToUnit(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 2 ** 32;
}

export function assignVariant(subjectId: string, experimentKey: string, variants: { key: string; weight: number }[]) {
  const usable = variants.filter((variant) => variant.weight > 0);
  if (!usable.length) return variants[0]?.key ?? "control";
  const total = usable.reduce((sum, variant) => sum + variant.weight, 0);
  let cursor = hashToUnit(`${experimentKey}:${subjectId}`) * total;
  for (const variant of usable) {
    cursor -= variant.weight;
    if (cursor < 0) return variant.key;
  }
  return usable[usable.length - 1]!.key;
}

function normalCdf(z: number) {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

/** Two-proportion z-test. `a` is the control. Significant when the two-sided p-value is under 0.05. */
export function twoProportionZ(control: { success: number; total: number }, variant: { success: number; total: number }) {
  if (control.total <= 0 || variant.total <= 0) return { z: 0, p: 1, uplift: 0, significant: false };
  const p1 = control.success / control.total;
  const p2 = variant.success / variant.total;
  const pooled = (control.success + variant.success) / (control.total + variant.total);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / control.total + 1 / variant.total));
  const z = se === 0 ? 0 : (p2 - p1) / se;
  const p = 2 * (1 - normalCdf(Math.abs(z)));
  const uplift = p1 === 0 ? (p2 === 0 ? 0 : 1) : (p2 - p1) / p1;
  return { z, p, uplift, significant: p < 0.05 };
}

export function variantScore(exposed: number, converted: number) {
  return { exposed, converted, rate: exposed === 0 ? 0 : converted / exposed };
}
