/**
 * scripts/export-magnet-figures.mjs
 *
 * Exports the magnet explorer's figures as they are drawn on the page, for
 * slides and manuscripts: vector EPS and PDF, and a PNG.
 *
 *   node scripts/export-magnet-figures.mjs [--url <page>] [--out <folder>] [--width 1440]
 *
 * Each figure is printed by the browser from the live page, so what is exported
 * is what the explorer shows at its opening settings, not a redrawing of it.
 * Controls (buttons, hints about dragging) and explanatory paragraphs are left
 * out. EPS has no transparency, so for the EPS every translucent colour is
 * replaced by the solid colour it makes over what lies beneath it. The PDF and
 * PNG in "for slides" keep the page's own transparency.
 *
 * Needs Google Chrome and poppler's `pdftocairo` (brew install poppler).
 */
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const URL_ = arg('url', 'https://sustainablesolutions.vercel.app/tools/magnets');
const OUT = arg('out', join(homedir(), 'Library/CloudStorage/Dropbox/Papers/Active Prep/Rare earth magnets',
  'Rare earth magnets (w Shahab)/Plots'));
const WIDTH = Number(arg('width', 1440));
const SLIDES = join(OUT, 'for slides');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const press = (label) => async (page) => {
  await page.evaluate((t) => [...document.querySelectorAll('button')]
    .find((b) => b.textContent.trim() === t)?.click(), label);
  await new Promise((r) => setTimeout(r, 1200));
};
const SANKEY = () => document.querySelector('svg[aria-label="Supply-chain Sankey"]').closest('section');

/** name, how to reach the view, which element, and what inside it to leave out. */
const FIGURES = [
  { name: 'explorer_sankey_total_2035', before: [press('2035'), press('Total')], find: SANKEY, drop: ['button', 'p', '[data-hint]'] },
  { name: 'explorer_sankey_DyTb_2035', before: [press('2035'), press('Dy/Tb')], find: SANKEY, drop: ['button', 'p', '[data-hint]'] },
  { name: 'explorer_sankey_NdPr_2035', before: [press('2035'), press('Nd/Pr')], find: SANKEY, drop: ['button', 'p', '[data-hint]'] },
  { name: 'explorer_sankey_total_2030', before: [press('2030'), press('Total')], find: SANKEY, drop: ['button', 'p', '[data-hint]'] },
  { name: 'explorer_capacity_build', before: [], find: () => document.querySelector('section.cap-root'),
    drop: ['button', 'p', '.frontier-root', '[data-verdict]', '[data-hint]'] },
  { name: 'explorer_hurdle_frontier', before: [], find: () => document.querySelector('.frontier-root'),
    // Its stage cards are buttons, and part of the figure.
    drop: ['p', '[data-hint]'], pad: 16 },
];

/** Runs in the page. Lifts the figure out on its own and makes it printable. */
function prepare(findSrc, drop, pad) {
  const el = (0, eval)(`(${findSrc})`)();
  if (!el) return null;
  const width = el.getBoundingClientRect().width;
  // Words that only make sense with a pointer in hand.
  const HINTS = [/^drag a circle/i, /^class shown$/i, /^chain in$/i];
  for (const n of el.querySelectorAll('span, div'))
    if (n.children.length === 0 && HINTS.some((h) => h.test(n.textContent.trim()))) n.setAttribute('data-hint', '');
  // The verdict under the columns is prose: a block that holds a paragraph.
  for (const n of el.querySelectorAll(':scope > div'))
    if (n.querySelector(':scope > p') && !n.querySelector('svg')) n.setAttribute('data-verdict', '');
  for (const sel of drop) for (const n of el.querySelectorAll(sel)) n.style.setProperty('display', 'none', 'important');

  const paper = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#F8F8E8';
  // Keep the ancestors whose classes and variables the figure's styles hang on.
  const shell = document.createElement('div');
  const tool = el.closest('.magnet-tool');
  if (tool) { shell.className = tool.className; shell.setAttribute('style', tool.getAttribute('style') ?? ''); }
  const cap = el.closest('.cap-root');
  let inner = shell;
  if (cap && cap !== el) { inner = document.createElement('div'); inner.className = cap.className; shell.appendChild(inner); }
  inner.appendChild(el);
  Object.assign(shell.style, { position: 'absolute', left: '0', top: '0', width: `${width + 2 * pad}px`, margin: '0',
    padding: `${pad}px`, boxSizing: 'border-box', minHeight: '0', background: paper, display: 'block' });
  for (const n of [...document.body.children]) n.style.setProperty('display', 'none', 'important');
  document.body.appendChild(shell);
  Object.assign(document.body.style, { margin: '0', padding: '0', background: paper, minHeight: '0' });
  Object.assign(document.documentElement.style, { background: paper, minHeight: '0' });
  el.style.margin = '0';
  const st = document.createElement('style');
  st.textContent = '* { transition: none !important; animation: none !important; }';
  document.head.appendChild(st);
  shell.setAttribute('data-export-shell', '');
  const r = shell.getBoundingClientRect();
  return { width: Math.ceil(r.width), height: Math.ceil(r.height) };
}

/** Runs in the page. Translucent colours become the solid colours they make. */
function flatten() {
  const shell = document.querySelector('[data-export-shell]');
  const paper = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#F8F8E8';
  const parse = (c) => {
    const m = /^rgba?\(([^)]+)\)$/.exec(c.trim());
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return p.length >= 3 && p.every((v) => Number.isFinite(v)) ? { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 } : null;
  };
  const probe = document.createElement('span'); probe.style.color = paper; document.body.appendChild(probe);
  const base = parse(getComputedStyle(probe).color) ?? { r: 248, g: 248, b: 232, a: 1 };
  probe.remove();
  const over = (c, a, u) => ({ r: c.r * a + u.r * (1 - a), g: c.g * a + u.g * (1 - a), b: c.b * a + u.b * (1 - a), a: 1 });
  const css = (c) => `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
  const HTML = ['color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'outline-color', 'text-decoration-color'];
  const plan = [];
  const walk = (n, opacity, under) => {
    const cs = getComputedStyle(n);
    if (cs.display === 'none') return;
    const op = opacity * (parseFloat(cs.opacity) || 0);
    const set = [];
    let beneath = under;
    const bg = parse(cs.backgroundColor);
    if (bg && bg.a > 0) { beneath = over(bg, bg.a * op, under); set.push(['background-color', css(beneath)]); }
    for (const p of HTML) {
      const c = parse(cs.getPropertyValue(p));
      if (c && c.a > 0) set.push([p, css(over(c, c.a * op, beneath))]);
    }
    if (n instanceof SVGElement) {
      for (const [p, po] of [['fill', 'fill-opacity'], ['stroke', 'stroke-opacity']]) {
        const c = parse(cs.getPropertyValue(p));
        if (c && c.a > 0) set.push([p, css(over(c, c.a * op * (parseFloat(cs.getPropertyValue(po)) || 0), beneath))]);
      }
      set.push(['fill-opacity', '1'], ['stroke-opacity', '1']);
    }
    set.push(['opacity', '1']);
    plan.push([n, set]);
    for (const k of n.children) walk(k, op, beneath);
  };
  walk(shell, 1, base);
  for (const [n, set] of plan) for (const [p, v] of set) n.style.setProperty(p, v, 'important');
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
mkdirSync(OUT, { recursive: true });
mkdirSync(SLIDES, { recursive: true });
const work = join(tmpdir(), `magnet-figures-${process.pid}`);
mkdirSync(work, { recursive: true });
let failed = 0;
for (const fig of FIGURES) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: WIDTH, height: 1000, deviceScaleFactor: 3 });
    await page.emulateMediaType('screen');
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    await page.goto(URL_, { waitUntil: 'networkidle0', timeout: 180000 });
    await page.waitForSelector('svg[aria-label="Supply-chain Sankey"]', { timeout: 120000 });
    await new Promise((r) => setTimeout(r, 3000));
    for (const step of fig.before) await step(page);
    const size = await page.evaluate(prepare, fig.find.toString(), fig.drop, fig.pad ?? 0);
    if (!size) throw new Error('the figure is not on the page');
    await page.evaluate(() => document.fonts.ready);
    const print = (path) => page.pdf({ path, width: `${size.width}px`, height: `${size.height}px`,
      printBackground: true, pageRanges: '1', margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    await print(join(SLIDES, `${fig.name}.pdf`));
    await page.screenshot({ path: join(SLIDES, `${fig.name}.png`),
      clip: { x: 0, y: 0, width: size.width, height: size.height } });
    await page.evaluate(flatten);
    const flat = join(work, `${fig.name}.pdf`);
    await print(flat);
    execFileSync('pdftocairo', ['-eps', flat, join(OUT, `${fig.name}.eps`)]);
    console.log(`${fig.name}: ${size.width} x ${size.height} px`);
  } catch (err) {
    failed += 1;
    console.error(`${fig.name}: FAILED, ${err.message}`);
  } finally {
    await page.close();
  }
}
await browser.close();
if (existsSync(work)) rmSync(work, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
