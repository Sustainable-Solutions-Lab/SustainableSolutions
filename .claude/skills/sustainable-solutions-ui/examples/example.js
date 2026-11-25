/* All metrics in this file are synthetic, for UI demonstration ONLY. */
const DATA = {
  alpha: {baseline: {2030: 31, 2040: 42, 2050: 61}, alternative: {2030: 23, 2040: 36, 2050: 53}},
  beta: {baseline: {2030: 22, 2040: 39, 2050: 57}, alternative: {2030: 18, 2040: 31, 2050: 45}}
};
const form = document.querySelector('#model');
const theme = document.querySelector('#theme');
const field = document.querySelector('#year');
const error = document.querySelector('#year-error');
let current = {region: 'alpha', scenario: 'baseline', year: 2040};
function render() {
  const {region, scenario, year} = current;
  document.querySelector('#result-value').textContent = DATA[region][scenario][year];
  document.querySelector('#result-summary').textContent = `${region === 'alpha' ? 'Region Alpha' : 'Region Beta'}, ${scenario}, ${year}. Synthetic UI data.`;
  document.querySelector('table caption').textContent = `Illustrative index (points), fictional Region ${region === 'alpha' ? 'Alpha' : 'Beta'}`;
  [...document.querySelectorAll('table tbody tr')].forEach((tr, i) => {
    const y = [2030,2040,2050][i];
    tr.querySelectorAll('td')[0].textContent = DATA[region].baseline[y];
    tr.querySelectorAll('td')[1].textContent = DATA[region].alternative[y];
  });
  // The chart, data table and downloads must share the same dataset/filter state.
  const years = [2030, 2040, 2050];
  const yPosition = value => 200 - ((value - 20) / 60) * 164;
  const xs = [70, 329, 588];
  ['baseline', 'alternative'].forEach((series, seriesIndex) => {
    const points = years.map((y, i) => `${xs[i]},${yPosition(DATA[region][series][y]).toFixed(1)}`).join(' ');
    document.querySelector(`svg polyline.line-${seriesIndex + 1}`).setAttribute('points', points);
    document.querySelectorAll(`svg .line-${seriesIndex + 1}-dot`).forEach((mark, i) => {
      const py = yPosition(DATA[region][series][years[i]]);
      if (series === 'baseline') {
        mark.setAttribute('cy', py.toFixed(1));
      } else {
        mark.setAttribute('y', (py - 5).toFixed(1));
      }
    });
  });
  document.querySelector('.chart svg').setAttribute('aria-label',
    `Synthetic baseline and alternative series for fictional Region ${region === 'alpha' ? 'Alpha' : 'Beta'} from 2030 to 2050. Exact values appear in the table.`);
  document.querySelector('.chart figcaption').textContent =
    `Figure 1. Synthetic scenario index for fictional Region ${region === 'alpha' ? 'Alpha' : 'Beta'}, 2030–2050. Not a scientific result. Source: local example fixture, version 1.`;
}
form.addEventListener('submit', event => {
  event.preventDefault();
  const year = Number(field.value);
  if (!Number.isInteger(year) || ![2030, 2040, 2050].includes(year)) {
    error.hidden = false;
    error.textContent = 'Choose 2030, 2040, or 2050.';
    field.setAttribute('aria-invalid', 'true');
    field.focus();
    return;
  }
  error.hidden = true;
  error.textContent = '';
  field.removeAttribute('aria-invalid');
  current = {region: form.elements.region.value, scenario: form.elements.scenario.value, year};
  render();
});
form.addEventListener('reset', () => {
  queueMicrotask(() => {
    current = {region:'alpha',scenario:'baseline',year:2040};
    error.hidden = true;
    field.removeAttribute('aria-invalid');
    render();
  });
});
theme.addEventListener('click', () => {
  const root = document.documentElement;
  const isDark = root.getAttribute('data-theme') === 'dark';
  if (isDark) {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', 'dark');
  }
  theme.setAttribute('aria-pressed', String(!isDark));
  theme.textContent = isDark ? 'Dark' : 'Light';
});
document.querySelector('#download').addEventListener('click', () => {
  const {region, scenario, year} = current;
  const csv = [
    'year,region,baseline_index_points,alternative_index_points,selected_scenario,selected_year,data_version',
    ...[2030,2040,2050].map(y =>
      `${y},${region},${DATA[region].baseline[y]},${DATA[region].alternative[y]},${scenario},${year},synthetic-demo-1`)
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
  const a = document.createElement('a');
  a.href = url;
  a.download = `synthetic-index-${region}-${scenario}-${year}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
render();
