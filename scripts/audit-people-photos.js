// scripts/audit-people-photos.js
//
// Cross-reference the People sheet (via src/data/people.json) against the
// photos in /public/people/. Reports four classes of mismatch:
//
//   1. MISSING_FILE   — Sheet row points at a photo file that doesn't exist
//   2. ORPHAN_FILE    — Photo file in /public/people/ that no Sheet row uses
//   3. NO_PHOTO_SET   — Sheet row has no photo_filename (uses letter-avatar)
//   4. CASE_MISMATCH  — Sheet filename differs only in case from a real file
//
// Run:
//   npm run prebuild           (refresh src/data/people.json from the Sheet)
//   node scripts/audit-people-photos.js
//
// Exit code: 0 always (the audit is informational, not a build gate).

import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const PEOPLE_JSON = resolve('src/data/people.json')
const PHOTOS_DIR = resolve('public/people')

const PHOTO_EXT_RE = /\.(jpe?g|png|webp|avif)$/i

async function loadPeople() {
  const text = await readFile(PEOPLE_JSON, 'utf8')
  return JSON.parse(text)
}

async function listPhotos() {
  try {
    const entries = await readdir(PHOTOS_DIR)
    return entries.filter((f) => PHOTO_EXT_RE.test(f))
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
}

function suggestFilename(slug, photos) {
  // Look for a photo whose stem starts with the slug, regardless of case/ext.
  const candidates = photos.filter((f) =>
    f.toLowerCase().replace(PHOTO_EXT_RE, '') === slug.toLowerCase(),
  )
  return candidates[0] ?? null
}

async function main() {
  const people = await loadPeople()
  const photos = await listPhotos()

  if (people.length === 0) {
    console.log('No people in src/data/people.json. Run `npm run prebuild` first.')
    return
  }

  const photoSet = new Set(photos)
  const photoLowerMap = new Map(photos.map((f) => [f.toLowerCase(), f]))
  const usedFilenames = new Set()

  const issues = {
    MISSING_FILE: [],
    NO_PHOTO_SET: [],
    CASE_MISMATCH: [],
    ORPHAN_FILE: [],
  }

  for (const p of people) {
    const fn = p.photo_filename
    if (!fn) {
      // No filename set in the Sheet — but a file matching the slug may exist.
      const guess = suggestFilename(p.slug, photos)
      issues.NO_PHOTO_SET.push({ slug: p.slug, name: p.name, guess })
      if (guess) usedFilenames.add(guess)
      continue
    }
    if (photoSet.has(fn)) {
      usedFilenames.add(fn)
    } else if (photoLowerMap.has(fn.toLowerCase())) {
      const actual = photoLowerMap.get(fn.toLowerCase())
      issues.CASE_MISMATCH.push({ slug: p.slug, name: p.name, sheet: fn, actual })
      usedFilenames.add(actual)
    } else {
      issues.MISSING_FILE.push({ slug: p.slug, name: p.name, filename: fn })
    }
  }

  for (const f of photos) {
    if (!usedFilenames.has(f)) {
      issues.ORPHAN_FILE.push(f)
    }
  }

  // ── Report ───────────────────────────────────────────────────────────────
  const total = people.length
  const withPhoto = people.filter((p) => p.photo_filename).length
  const summary = `${withPhoto} of ${total} people have photo_filename set; ${photos.length} files in /public/people/`

  console.log('')
  console.log(`[audit-people-photos] ${summary}`)
  console.log('')

  const print = (label, items, render) => {
    if (items.length === 0) {
      console.log(`  ✓ ${label}: none`)
      return
    }
    console.log(`  ${items.length} ${label}:`)
    for (const it of items) console.log('    - ' + render(it))
    console.log('')
  }

  print('rows missing a photo file', issues.MISSING_FILE,
    (it) => `${it.slug} (${it.name}) → photo_filename "${it.filename}" not in /public/people/`)

  print('rows with case-mismatched filename', issues.CASE_MISMATCH,
    (it) => `${it.slug} (${it.name}) → Sheet says "${it.sheet}", file is actually "${it.actual}"`)

  print('rows with no photo_filename', issues.NO_PHOTO_SET,
    (it) => it.guess
      ? `${it.slug} (${it.name}) — found "${it.guess}" in /public/people/, set photo_filename to use it`
      : `${it.slug} (${it.name}) — letter-avatar fallback`)

  print('orphan photo files (no Sheet row uses them)', issues.ORPHAN_FILE,
    (f) => f)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
