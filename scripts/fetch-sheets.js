// scripts/fetch-sheets.js
// Build-time fetcher: pulls each published-CSV URL, parses, validates, writes JSON.
// Runs as `prebuild`. Falls back to templates/*.csv when env vars are missing,
// so dev/CI builds work without a live Sheet.

import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const OUT_DIR = resolve('src/data');
const TEMPLATES_DIR = resolve('templates');
const PHOTOS_DIR = resolve('public/people');

const PHOTO_EXT_RE = /\.(jpe?g|png|webp|avif)$/i;

// Schema definitions — column names per CLAUDE.md sheet specs.
// Required columns fail the build loudly if missing.
const tabs = {
  publications: {
    env: 'SHEET_PUBLICATIONS_CSV',
    required: ['authors', 'title', 'journal', 'year', 'doi'],
  },
  people: {
    env: 'SHEET_PEOPLE_CSV',
    required: ['slug', 'name', 'role', 'unit', 'status'],
  },
  news: {
    env: 'SHEET_NEWS_CSV',
    required: ['date', 'title', 'type'],
  },
  featured: {
    env: 'SHEET_FEATURED_CSV',
    required: ['order', 'title', 'type'],
  },
  tools: {
    env: 'SHEET_TOOLS_CSV',
    required: ['slug', 'title'],
  },
};

// Tiny RFC-4180-ish CSV parser. Handles quoted fields with embedded commas/newlines.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

// ── Systematic UTF-8 → Mac Roman / Win-1252 mojibake healing ─────────────────
//
// Mojibake happens when UTF-8 bytes get decoded as a single-byte legacy
// encoding (Mac Roman or Win-1252) and the resulting characters get re-encoded
// as UTF-8. To reverse: re-encode each char as the legacy encoding's byte,
// then decode the resulting bytes as UTF-8 strict. If valid → mojibake fixed.

// Mac Roman 0x80–0xFF → Unicode codepoint. ASCII (0x00–0x7F) is identical.
const MAC_ROMAN = [
  /* 80 */ 0x00C4, 0x00C5, 0x00C7, 0x00C9, 0x00D1, 0x00D6, 0x00DC, 0x00E1,
  /* 88 */ 0x00E0, 0x00E2, 0x00E4, 0x00E3, 0x00E5, 0x00E7, 0x00E9, 0x00E8,
  /* 90 */ 0x00EA, 0x00EB, 0x00ED, 0x00EC, 0x00EE, 0x00EF, 0x00F1, 0x00F3,
  /* 98 */ 0x00F2, 0x00F4, 0x00F6, 0x00F5, 0x00FA, 0x00F9, 0x00FB, 0x00FC,
  /* A0 */ 0x2020, 0x00B0, 0x00A2, 0x00A3, 0x00A7, 0x2022, 0x00B6, 0x00DF,
  /* A8 */ 0x00AE, 0x00A9, 0x2122, 0x00B4, 0x00A8, 0x2260, 0x00C6, 0x00D8,
  /* B0 */ 0x221E, 0x00B1, 0x2264, 0x2265, 0x00A5, 0x00B5, 0x2202, 0x2211,
  /* B8 */ 0x220F, 0x03C0, 0x222B, 0x00AA, 0x00BA, 0x03A9, 0x00E6, 0x00F8,
  /* C0 */ 0x00BF, 0x00A1, 0x00AC, 0x221A, 0x0192, 0x2248, 0x2206, 0x00AB,
  /* C8 */ 0x00BB, 0x2026, 0x00A0, 0x00C0, 0x00C3, 0x00D5, 0x0152, 0x0153,
  /* D0 */ 0x2013, 0x2014, 0x201C, 0x201D, 0x2018, 0x2019, 0x00F7, 0x25CA,
  /* D8 */ 0x00FF, 0x0178, 0x2044, 0x20AC, 0x2039, 0x203A, 0xFB01, 0xFB02,
  /* E0 */ 0x2021, 0x00B7, 0x201A, 0x201E, 0x2030, 0x00C2, 0x00CA, 0x00C1,
  /* E8 */ 0x00CB, 0x00C8, 0x00CD, 0x00CE, 0x00CF, 0x00CC, 0x00D3, 0x00D4,
  /* F0 */ 0xF8FF, 0x00D2, 0x00DA, 0x00DB, 0x00D9, 0x0131, 0x02C6, 0x02DC,
  /* F8 */ 0x00AF, 0x02D8, 0x02D9, 0x02DA, 0x00B8, 0x02DD, 0x02DB, 0x02C7,
];

// Win-1252 0x80–0x9F differs from Latin-1; 0xA0–0xFF identical to Latin-1.
const WIN1252_HIGH = [
  /* 80 */ 0x20AC, null,   0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021,
  /* 88 */ 0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, null,   0x017D, null,
  /* 90 */ null,   0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014,
  /* 98 */ 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, null,   0x017E, 0x0178,
];

const MAC_BY_CP = new Map();
MAC_ROMAN.forEach((cp, i) => MAC_BY_CP.set(cp, 0x80 + i));

const WIN_BY_CP = new Map();
WIN1252_HIGH.forEach((cp, i) => { if (cp != null) WIN_BY_CP.set(cp, 0x80 + i); });
for (let b = 0xA0; b <= 0xFF; b++) WIN_BY_CP.set(b, b);

// Re-encode the string as the legacy encoding, then decode UTF-8 strict.
// Returns null if any char doesn't fit the encoding or the bytes don't form
// valid UTF-8 — both signal "this isn't mojibake of that flavor".
function tryUndoMojibake(s, encMap) {
  const bytes = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp == null) return null;
    if (cp < 0x80) {
      bytes.push(cp);
      continue;
    }
    const b = encMap.get(cp);
    if (b == null) return null;
    bytes.push(b);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

// Static substring replacements for mixed strings the algorithmic pass can't
// fully handle (when only some characters are mojibake'd).
const STATIC_REPLACEMENTS = [
  // Mac Roman: originals starting with 0xE2 byte → "‚..." prefix
  [/‚Äì/g, '–'], [/‚Äî/g, '—'],
  [/‚Äú/g, '“'], [/‚Äù/g, '”'],
  [/‚Äò/g, '‘'], [/‚Äô/g, '’'],
  [/‚Ä¶/g, '…'], [/‚Ä¢/g, '•'],
  [/‚ÇÄ/g, '₀'], [/‚ÇÅ/g, '₁'], [/‚ÇÇ/g, '₂'], [/‚ÇÉ/g, '₃'],
  [/‚ÇÑ/g, '₄'], [/‚ÇÖ/g, '₅'], [/‚ÇÜ/g, '₆'], [/‚Çá/g, '₇'],
  [/‚Çà/g, '₈'], [/‚Çâ/g, '₉'],
  // Mac Roman: Latin accents (originals starting with 0xC3 byte → "√...")
  [/√©/g, 'é'], [/√®/g, 'è'], [/√™/g, 'ê'], [/√´/g, 'ë'],
  [/√†/g, 'à'], [/√°/g, 'á'], [/√¢/g, 'â'], [/√§/g, 'ä'],
  [/√≠/g, 'í'], [/√¨/g, 'ì'], [/√Æ/g, 'î'], [/√Ø/g, 'ï'],
  [/√≥/g, 'ó'], [/√≤/g, 'ò'], [/√¥/g, 'ô'], [/√∂/g, 'ö'],
  [/√∫/g, 'ú'], [/√π/g, 'ù'], [/√ª/g, 'û'], [/√º/g, 'ü'],
  [/√±/g, 'ñ'], [/√ß/g, 'ç'], [/√∏/g, 'ø'],
  // Mac Roman: 0xC2 byte → "¬..." prefix
  [/¬°/g, '¡'], [/¬®/g, '¨'], [/¬©/g, '©'], [/¬™/g, '™'],
  [/¬∞/g, '°'], [/¬±/g, '±'], [/¬µ/g, 'µ'],
  // Mac Roman Greek (0xCE byte → "Œ..." prefix)
  [/Œ±/g, 'α'], [/Œ≤/g, 'β'], [/Œ≥/g, 'γ'], [/Œ¥/g, 'δ'], [/Œµ/g, 'ε'],
  [/œÉ/g, 'σ'],
  // Win-1252: 0xC2/0xC3 → "Ã..." or "Â..." prefix
  [/â€“/g, '–'], [/â€”/g, '—'],
  [/â€œ/g, '“'], [/â€/g, '”'],
  [/â€˜/g, '‘'], [/â€™/g, '’'],
  [/â€¦/g, '…'], [/â€¢/g, '•'],
  [/â‚‚/g, '₂'], [/â‚ƒ/g, '₃'], [/â‚„/g, '₄'],
  [/Â°/g, '°'], [/Â±/g, '±'], [/Â /g, ' '],
  [/Ã©/g, 'é'], [/Ã¨/g, 'è'], [/Ãª/g, 'ê'], [/Ã«/g, 'ë'],
  [/Ã /g, 'à'], [/Ã¡/g, 'á'], [/Ã¢/g, 'â'],
  [/Ã±/g, 'ñ'], [/Ã§/g, 'ç'],
  [/Ã³/g, 'ó'], [/Ã²/g, 'ò'], [/Ã´/g, 'ô'], [/Ã¶/g, 'ö'],
  [/Ãº/g, 'ú'], [/Ã¼/g, 'ü'],
];

// Common chemistry abbreviations where Scholar HTML wraps the digit in a
// span; stripping tags leaves "CO" + " " + "2" → "CO 2". Restore subscript.
const SUBSCRIPT_FIXES = [
  [/\bCO\s*2\b/g, 'CO₂'], [/\bCO\s*3\b/g, 'CO₃'],
  [/\bCH\s*4\b/g, 'CH₄'], [/\bCH\s*2\b/g, 'CH₂'],
  [/\bN\s*2\s*O\b/g, 'N₂O'],
  [/\bH\s*2\s*O\b/g, 'H₂O'], [/\bH\s*2\b/g, 'H₂'],
  [/\bSO\s*2\b/g, 'SO₂'], [/\bSO\s*3\b/g, 'SO₃'],
  [/\bNO\s*2\b/g, 'NO₂'], [/\bNO\s*x\b/gi, 'NOₓ'],
  [/\bO\s*3\b/g, 'O₃'],
  [/\bN\s*2\b/g, 'N₂'], [/\bO\s*2\b/g, 'O₂'],
  [/\bPM\s*2\.5\b/g, 'PM₂.₅'], [/\bPM\s*10\b/g, 'PM₁₀'],
];

// Decode HTML entities (&amp;, &lt;, &mdash;, &#8211;, &#x2014;, …) so titles
// and other text fields don't render as raw entity references on the page.
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  copy: '©', reg: '®', trade: '™',
};
function decodeHtmlEntities(s) {
  if (!s) return s;
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, ent) => {
    if (ent[0] === '#') {
      const hex = ent[1] === 'x' || ent[1] === 'X';
      const code = hex ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      if (Number.isFinite(code) && code > 0) return String.fromCodePoint(code);
      return match;
    }
    return NAMED_ENTITIES[ent.toLowerCase()] ?? match;
  });
}

function fixMojibake(s) {
  if (!s) return s;
  s = decodeHtmlEntities(s);

  // 1. Iteratively peel mojibake layers. A round-trip through Sheets
  //    (paste a CSV that already had Mac Roman / Win-1252 mojibake →
  //    re-encoded → re-exported) can stack two or three layers of
  //    misinterpretation on top of each other, so we keep retrying
  //    until a pass produces no further change.
  for (let iter = 0; iter < 5; iter++) {
    if (!/[‚√Œ¬ÂÃ]/.test(s)) break;
    const macFix = tryUndoMojibake(s, MAC_BY_CP);
    if (macFix != null && macFix !== s) {
      s = macFix;
      continue;
    }
    const winFix = tryUndoMojibake(s, WIN_BY_CP);
    if (winFix != null && winFix !== s) {
      s = winFix;
      continue;
    }
    break;
  }

  // 2. Static substring replacements for mixed strings (some clean UTF-8,
  //    some mojibake) — the algorithmic pass rejects these.
  for (const [re, replacement] of STATIC_REPLACEMENTS) {
    s = s.replace(re, replacement);
  }

  // 3. Subscript word-form fixes (CO 2 → CO₂ etc.).
  for (const [re, replacement] of SUBSCRIPT_FIXES) {
    s = s.replace(re, replacement);
  }

  return s;
}

function rowsToObjects(rows) {
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = fixMojibake((r[i] ?? '').trim());
    });
    return obj;
  });
}

function coerce(value, key) {
  if (value === '') return null;
  const lower = value.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;
  if (key === 'year' || key === 'order' || key === 'month') {
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
  }
  // comma-separated lists for known multi-value columns
  if (
    key === 'themes' ||
    key === 'lab_authors' ||
    key === 'system' ||
    key === 'response'
  ) {
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return value;
}

function normalize(rows) {
  return rows.map((row) => {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = coerce(v, k);
    }
    return out;
  });
}

function validate(records, required, tabName) {
  if (records.length === 0) return;
  const sample = records[0];
  const missing = required.filter((r) => !(r in sample));
  if (missing.length > 0) {
    throw new Error(
      `[fetch-sheets] Tab "${tabName}" is missing required columns: ${missing.join(', ')}. ` +
        `Found columns: ${Object.keys(sample).join(', ')}`,
    );
  }
}

async function fetchTab(tabName, { env, required }) {
  const url = process.env[env];
  let text;
  let source;

  if (url) {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) {
      throw new Error(`[fetch-sheets] ${tabName} fetch failed: ${res.status} ${res.statusText}`);
    }
    // Force UTF-8 — Google Sheets sometimes serves the published CSV
    // without a charset in Content-Type, which lets res.text() fall
    // back to the wrong encoding and produces mojibake on Unicode
    // characters like CO₂ (E2 82 82 → "â‚‚" in Latin-1).
    const buf = await res.arrayBuffer();
    text = new TextDecoder('utf-8').decode(buf);
    source = 'sheet';
  } else {
    const fallback = resolve(TEMPLATES_DIR, `${tabName}.csv`);
    try {
      text = await readFile(fallback, 'utf8');
      source = 'template';
    } catch {
      console.warn(`[fetch-sheets] ${env} unset and no ${fallback} — writing empty ${tabName}.json`);
      return { records: [], source: 'empty' };
    }
  }

  const records = normalize(rowsToObjects(parseCsv(text)));
  validate(records, required, tabName);
  return { records, source };
}

// For each person row whose photo_filename is empty, look for a photo in
// /public/people/ whose stem matches the slug (case-insensitive). This means
// uploading "pablo-busch.jpg" is enough — no Sheet edit required.
async function resolvePeoplePhotos(records) {
  let files;
  try {
    files = await readdir(PHOTOS_DIR);
  } catch {
    return { records, autoMatched: 0 };
  }
  const photos = files.filter((f) => PHOTO_EXT_RE.test(f));
  if (photos.length === 0) return { records, autoMatched: 0 };

  // Build a lowercase-stem → actual-filename map (first-write-wins on collision).
  const stemMap = new Map();
  for (const f of photos) {
    const stem = f.replace(PHOTO_EXT_RE, '').toLowerCase();
    if (!stemMap.has(stem)) stemMap.set(stem, f);
  }

  let autoMatched = 0;
  const updated = records.map((p) => {
    if (p.photo_filename) return p;
    const guess = stemMap.get((p.slug ?? '').toLowerCase());
    if (!guess) return p;
    autoMatched++;
    return { ...p, photo_filename: guess };
  });
  return { records: updated, autoMatched };
}

// Treat any truthy non-"false"/"no" value in the `ignore` column as a hide
// signal. So "TRUE", "IGNORE", "yes", "hide" all hide the row; "", "FALSE",
// "no", "0" keep it visible.
function isIgnored(v) {
  if (v === true) return true;
  if (v === false || v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s !== '' && s !== 'false' && s !== 'no' && s !== '0';
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const [name, spec] of Object.entries(tabs)) {
    try {
      let { records, source } = await fetchTab(name, spec);
      let extra = '';
      if (name === 'people') {
        const { records: r2, autoMatched } = await resolvePeoplePhotos(records);
        records = r2;
        if (autoMatched > 0) extra = ` (auto-matched ${autoMatched} photo${autoMatched === 1 ? '' : 's'} by slug)`;
      }
      if (name === 'publications') {
        const before = records.length;
        records = records.filter((r) => !isIgnored(r.ignore));
        const hidden = before - records.length;
        if (hidden > 0) extra += ` (hid ${hidden} ignore=TRUE row${hidden === 1 ? '' : 's'})`;
      }
      const out = resolve(OUT_DIR, `${name}.json`);
      await writeFile(out, JSON.stringify(records, null, 2));
      const tag = source === 'sheet' ? '   sheet' : source === 'template' ? 'template' : '   empty';
      console.log(`[fetch-sheets] [${tag}] wrote ${records.length.toString().padStart(4)} rows → ${out}${extra}`);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }
}

main();
