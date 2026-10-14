/**
 * Checks the refinery model with Node's own test runner:
 *   node --test src/tools/refinery/model.test.ts
 * Mass must close (products + fuel gas + losses = crude + plant oil +
 * hydrogen bought) within 0.5% for every configuration and a spread of levers.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compute, DEFAULT_STATE, unitsFromPreset, type State } from './model.ts';
import { PRESETS, PRICES_NZ, type PresetId } from './data.ts';

const presets = Object.keys(PRESETS) as PresetId[];
const variants: Partial<State>[] = [
  {},
  { throughput: 400, slate: { ls: 0, ms: 0, hs: 1 } },
  { throughput: 60, slate: { ls: 1, ms: 0, hs: 0 } },
  { nkShift: -20, kdShift: 20, hckMode: 'jet', fccMode: 'distillate' },
  { nkShift: 20, kdShift: -20, hckMode: 'naphtha', fccMode: 'propylene', refSeverity: 1 },
  { naphToCracker: 1, refToArom: 1, coproc: 0.1, h2Source: 'ely', prices: PRICES_NZ },
  { refSeverity: 0, coproc: 0.05, h2Source: 'ccs' },
];

for (const p of presets) {
  test(`mass closes: ${p}`, () => {
    for (const v of variants) {
      const r = compute({ ...DEFAULT_STATE, units: unitsFromPreset(p), ...v });
      assert.ok(r.mass.err < 0.005, `${p} ${JSON.stringify(v)}: in ${r.mass.inT.toFixed(1)} out ${r.mass.outT.toFixed(1)}`);
      for (const l of r.links) assert.ok(l.t >= 0 && Number.isFinite(l.t), `bad link ${l.from}>${l.to}`);
    }
  });
}

test('every node in the Sankey balances: what enters a cut leaves it', () => {
  const r = compute({ ...DEFAULT_STATE, units: unitsFromPreset('petchem'), naphToCracker: 0.6, refToArom: 0.5 });
  const sum = (f: (l: { from: string; to: string }) => boolean) => r.links.filter(f).reduce((a, l) => a + (l as { t: number }).t, 0);
  for (const c of ['lpg', 'ln', 'hn', 'ker', 'go', 'vgo', 'vr']) {
    const inn = sum((l) => l.to === `cut_${c}`), out = sum((l) => l.from === `cut_${c}`);
    assert.ok(Math.abs(inn - out) < 1e-6 * Math.max(1, inn), `cut ${c}: in ${inn} out ${out}`);
  }
});

test('mass closes with the base oil plant on and no coker', () => {
  const units = { ...unitsFromPreset('deep'), coker: { on: false, cap: 40 }, lube: { on: true, cap: 22 } };
  const r = compute({ ...DEFAULT_STATE, units });
  assert.ok(r.products.baseOil > 0);
  assert.ok(r.mass.err < 0.005, `mass error ${r.mass.err}`);
});
