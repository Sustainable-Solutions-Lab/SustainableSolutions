// scripts/commit-scholar-refresh.js
//
// Stages the citation-bearing artifacts produced by the Scholar refresh and
// commits + pushes them so the next Vercel build picks up fresh citation
// counts. Skips silently when nothing changed. Run automatically at the end
// of `npm run refresh-scholar`.
//
// Files in scope:
//   templates/scholar-details.json   (per-paper citation counts + year chart)
//   templates/scholar-master.json    (master list of Scholar IDs)
//   templates/external-pubs.json     (citations for externally-authored pubs)
//
// The generated paste-into-Sheet artifacts (publications-from-scholar.csv /
// .json) are deliberately NOT committed — they're noisy and the Publications
// Sheet is maintained by hand.

import { spawnSync } from 'node:child_process'

const FILES = [
  'templates/scholar-details.json',
  'templates/scholar-master.json',
  'templates/external-pubs.json',
]

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts })
  if (r.status !== 0) {
    console.error(`[commit-scholar-refresh] '${cmd} ${args.join(' ')}' exited ${r.status}`)
    process.exit(r.status ?? 1)
  }
}

function runQuiet(cmd, args) {
  return spawnSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
}

// Stage only the citation files (no -A; never sweep in unrelated changes).
run('git', ['add', '--', ...FILES])

// `git diff --cached --quiet` exits 0 = no staged changes, 1 = changes staged.
const staged = runQuiet('git', ['diff', '--cached', '--quiet', '--', ...FILES])
if (staged.status === 0) {
  console.log('[commit-scholar-refresh] no citation-data changes to commit; skipping')
  process.exit(0)
}

run('git', ['commit', '-m', 'Refresh Scholar citation data'])
run('git', ['push'])
console.log('[commit-scholar-refresh] pushed; Vercel will redeploy automatically')
