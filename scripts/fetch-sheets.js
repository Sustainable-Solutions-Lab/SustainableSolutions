// scripts/fetch-sheets.js
// Build-time fetcher: pulls each published-CSV URL, parses, validates, writes JSON.
// Runs as `prebuild`. Skips quietly when env vars are missing (so dev still works).

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const OUT_DIR = resolve('src/data');

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

function rowsToObjects(rows) {
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = (r[i] ?? '').trim();
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
  if (key === 'themes' || key === 'lab_authors') {
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
  if (!url) {
    console.warn(`[fetch-sheets] ${env} not set — writing empty ${tabName}.json`);
    return [];
  }
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`[fetch-sheets] ${tabName} fetch failed: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  const records = normalize(rowsToObjects(parseCsv(text)));
  validate(records, required, tabName);
  return records;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const [name, spec] of Object.entries(tabs)) {
    try {
      const records = await fetchTab(name, spec);
      const out = resolve(OUT_DIR, `${name}.json`);
      await writeFile(out, JSON.stringify(records, null, 2));
      console.log(`[fetch-sheets] wrote ${records.length.toString().padStart(4)} rows → ${out}`);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }
}

main();
