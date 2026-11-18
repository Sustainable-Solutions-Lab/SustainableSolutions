/**
 * scripts/fetch-github.js
 *
 * Build-time snapshot of the lab's GitHub organization for the research
 * page's "Open code & data" section: org stats, the most notable public
 * repos (stars, then recency), and a 52-week commit sparkline per repo.
 *
 * Unauthenticated (60 req/h is plenty: 2 + one participation call per
 * featured repo). Never fails the build: on any error it keeps a stale
 * src/data/github.json if present, else writes an empty snapshot the
 * page knows to hide.
 */

import { writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ORG = 'Sustainable-Solutions-Lab';
// Cornerstone (Steve co-leads it) is listed alongside the lab's own repos
// (Steve, 18 Nov 2026). Its forks of EPA's USEEIO repos stay out via the
// fork filter. The "Follow us" link still points at the lab org.
const ORGS = [ORG, 'Cornerstone-Data'];
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'github.json');
// Featured per org, so Cornerstone's starred repos don't crowd out the lab's.
const N_FEATURED = { 'Sustainable-Solutions-Lab': 6, 'Cornerstone-Data': 3 };
// The site's own repo is not a research output; howto is internal docs.
const EXCLUDE = new Set(['SustainableSolutions', 'howto', '.github', 'cornerstone-data.github.io']);
// Cross-listed forks of Steve's personal published-paper repos are lab
// projects too — allow them through the fork filter by name.
const ALLOW_FORKS = new Set(['FoodWithoutAg', 'multiregional-acct', 'eeio-defense']);

const HEADERS = { 'User-Agent': 'ssl-site-build', Accept: 'application/vnd.github+json' };

async function gh(path) {
  const r = await fetch(`https://api.github.com${path}`, { headers: HEADERS });
  if (r.status === 202) return { __pending: true };   // stats being computed
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

async function participation(owner, repo) {
  // 52 weekly commit counts; GitHub returns 202 while it computes — retry
  // once, then give up quietly (the card just skips its sparkline).
  for (let i = 0; i < 2; i++) {
    const d = await gh(`/repos/${owner}/${repo}/stats/participation`).catch(() => null);
    if (d && !d.__pending && Array.isArray(d.all)) return d.all;
    await new Promise((res) => setTimeout(res, 2500));
  }
  return null;
}

async function main() {
  const org = await gh(`/orgs/${ORG}`);
  const repos = (await Promise.all(ORGS.map((o) =>
    gh(`/orgs/${o}/repos?per_page=100&type=public`)))).flat();
  const pool = repos
    .filter((r) => !EXCLUDE.has(r.name) && !r.archived
      && (!r.fork || ALLOW_FORKS.has(r.name)))
    .sort((a, b) =>
      (b.stargazers_count - a.stargazers_count)
      || (new Date(b.pushed_at) - new Date(a.pushed_at)));
  const featured = [];
  const picks = ORGS.flatMap((o) => pool
    .filter((r) => r.owner.login.toLowerCase() === o.toLowerCase())
    .slice(0, N_FEATURED[o]));
  for (const r of picks) {
    featured.push({
      name: r.name,
      url: r.html_url,
      description: r.description ?? '',
      language: r.language ?? null,
      stars: r.stargazers_count,
      pushedAt: r.pushed_at,
      commits52w: await participation(r.owner.login, r.name),
    });
  }
  const snapshot = {
    fetchedAt: new Date().toISOString(),
    orgUrl: `https://github.com/${ORG}`,
    publicRepos: repos.filter((r) => !r.fork).length,
    totalStars: repos.reduce((s, r) => s + r.stargazers_count, 0),
    languages: [...new Set(pool.map((r) => r.language).filter(Boolean))],
    featured,
  };
  writeFileSync(OUT, JSON.stringify(snapshot, null, 2));
  console.log(`github.json: ${snapshot.publicRepos} public repos, `
    + `${snapshot.totalStars} stars, ${featured.length} featured`);
}

main().catch((err) => {
  console.warn(`fetch-github: ${err.message}`);
  if (!existsSync(OUT)) {
    writeFileSync(OUT, JSON.stringify({ featured: [] }));
    console.warn('fetch-github: wrote empty snapshot (section will hide)');
  } else {
    console.warn('fetch-github: keeping stale snapshot');
  }
});
