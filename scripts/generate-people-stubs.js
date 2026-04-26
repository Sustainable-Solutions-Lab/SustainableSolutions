// scripts/generate-people-stubs.js
//
// For every person in src/data/people.json, ensure there's a Markdown bio
// stub at src/content/people/<slug>.md. Skips files that already exist —
// safe to re-run any time.
//
// Run after the Sheet is updated (or after `npm run prebuild`):
//   node scripts/generate-people-stubs.js

import { readFile, writeFile, access, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const PEOPLE_JSON = resolve('src/data/people.json')
const OUT_DIR = resolve('src/content/people')

async function exists(p) {
  try { await access(p); return true } catch { return false }
}

function stubFor(person) {
  return [
    '---',
    `title: ${person.name}`,
    '---',
    '',
    `Bio coming soon for ${person.name}.`,
    '',
  ].join('\n')
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const people = JSON.parse(await readFile(PEOPLE_JSON, 'utf8'))

  let written = 0
  let skipped = 0
  for (const p of people) {
    if (!p.slug || !p.name) continue
    const out = resolve(OUT_DIR, `${p.slug}.md`)
    if (await exists(out)) {
      skipped++
      continue
    }
    await writeFile(out, stubFor(p))
    written++
  }
  console.log(`[generate-people-stubs] wrote ${written}, skipped ${skipped} (already existed)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
