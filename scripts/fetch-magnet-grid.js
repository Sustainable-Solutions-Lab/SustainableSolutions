/**
 * scripts/fetch-magnet-grid.js
 *
 * Puts the magnet explorer's scenario grid where the build expects it,
 * src/tools/magnets/scenarios*.json.
 *
 * The grid is model output, not source: dozens of files, hundreds of megabytes,
 * replaced whole at every regrid. In git each regrid added all of it to the
 * repository's history for good. It lives in Dropbox instead and is fetched at
 * build time, as the sheets are.
 *
 * Where it comes from, first match wins:
 *
 *   1. MAGNET_GRID_DIR, or the default Dropbox folder if it exists (a laptop):
 *      the files are copied from there.
 *   2. MAGNET_GRID_URL (Vercel): a Dropbox shared-folder link. The folder is
 *      downloaded as one zip and unpacked. A build that has already fetched
 *      this version of the grid reuses its copy from the build cache.
 *   3. Neither, but the files are already in place (a checkout from before the
 *      grid left the repository): nothing to do.
 *
 * WHICH grid is wanted is written in the repository, in
 * src/tools/magnets/grid-manifest.json: a version, and every file with its size
 * and SHA-256. A download that does not match it fails the build, so neither a
 * Dropbox folder caught halfway through a sync nor a file changed by someone
 * holding the link can be deployed. After a regrid:
 *
 *     node scripts/fetch-magnet-grid.js --write-manifest
 *
 * and commit the manifest. That commit is what makes Vercel fetch the new grid.
 *
 * If no source yields a grid the build FAILS. The explorer cannot be built
 * without one, and a page that silently shipped an old or empty grid would be
 * worse than no deployment.
 */

import { createWriteStream, existsSync, mkdirSync, readdirSync, copyFileSync, statSync, rmSync, readFileSync, writeFileSync, constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// MAGNET_GRID_TARGET exists for testing this script against a scratch folder.
const TARGET = process.env.MAGNET_GRID_TARGET || join(ROOT, 'src', 'tools', 'magnets');
const DEFAULT_DIR = join(homedir(), 'Library', 'CloudStorage', 'Dropbox', 'Sites',
  'SustainableSolutions-data', 'magnets-grid');
const CACHE = join(ROOT, 'node_modules', '.cache', 'magnets-grid');
const MANIFEST = join(ROOT, 'src', 'tools', 'magnets', 'grid-manifest.json');
const IS_GRID = /^scenarios[.\w-]*\.json$/;

const manifest = () => (existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : null);
const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

/** What in `dir` disagrees with the manifest; empty when it is the grid wanted.
 *  Contents are hashed only when asked: it reads every byte of the grid. */
function mismatches(dir, want, { contents = false } = {}) {
  const have = gridFiles(dir);
  const out = [];
  for (const [f, { bytes, sha256 }] of Object.entries(want.files)) {
    if (!have.includes(f)) out.push(`${f} is missing`);
    else if (statSync(join(dir, f)).size !== bytes) out.push(`${f} is ${statSync(join(dir, f)).size} bytes, not ${bytes}`);
    else if (contents && digest(join(dir, f)) !== sha256) out.push(`${f} does not have the contents recorded`);
  }
  for (const f of have) if (!(f in want.files)) out.push(`${f} is not in the manifest`);
  return out;
}

function writeManifest(dir) {
  const names = gridFiles(dir).sort();
  if (!names.includes('scenarios.json')) throw new Error(`${dir} holds no scenarios.json`);
  const files = Object.fromEntries(names.map((f) => [f,
    { bytes: statSync(join(dir, f)).size, sha256: digest(join(dir, f)) }]));
  // The version is a digest of the digests, so it changes when any file does
  // and at no other time.
  const version = createHash('sha256').update(names.map((f) => files[f].sha256).join('')).digest('hex').slice(0, 12);
  writeFileSync(MANIFEST, `${JSON.stringify({ version, files }, null, 2)}\n`);
  console.log(`[magnet-grid] manifest written: version ${version}, ${names.length} files`);
}

const gridFiles = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => IS_GRID.test(f)) : []);
const complete = (dir) => gridFiles(dir).includes('scenarios.json');

/** The repository sits in Dropbox and so does the grid. Without this the copy
 *  the build reads would be synced as well, and the grid stored twice. */
function keepOutOfDropbox(file) {
  if (process.platform !== 'darwin' || !file.includes('/Dropbox/')) return;
  for (const attr of ['com.dropbox.ignored', 'com.apple.fileprovider.ignore#P']) {
    try { execFileSync('xattr', ['-w', attr, '1', file], { stdio: 'ignore' }); } catch { /* best effort */ }
  }
}

function copyGrid(from, why) {
  const files = gridFiles(from);
  if (!files.includes('scenarios.json')) throw new Error(`${from} holds no scenarios.json`);
  mkdirSync(TARGET, { recursive: true });
  // A file the new grid does not have must not survive from the old one: the
  // loader finds files by name and would pair new cells with old flows.
  for (const stale of gridFiles(TARGET).filter((f) => !files.includes(f))) rmSync(join(TARGET, stale));
  let copied = 0;
  for (const f of files) {
    const src = join(from, f), dst = join(TARGET, f);
    const a = statSync(src);
    if (existsSync(dst)) {
      const b = statSync(dst);
      if (b.size === a.size && b.mtimeMs >= a.mtimeMs) { keepOutOfDropbox(dst); continue; }
    }
    // A clone where the filesystem has them (APFS): no second copy on disk.
    copyFileSync(src, dst, constants.COPYFILE_FICLONE);
    keepOutOfDropbox(dst);
    copied += 1;
  }
  const mb = files.reduce((n, f) => n + statSync(join(TARGET, f)).size, 0) / 1e6;
  console.log(`[magnet-grid] ${files.length} files, ${mb.toFixed(0)} MB, from ${why} (${copied} copied)`);
}

async function download(url, want) {
  const { Unzip, UnzipInflate } = await import('fflate');
  const version = want.version;
  const dir = join(CACHE, version);
  if (complete(dir) && mismatches(dir, want).length === 0) {
    copyGrid(dir, `the build cache, version ${version}`);
    return;
  }
  rmSync(CACHE, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  // dl=1 makes Dropbox send the folder as a zip rather than a page about it.
  const u = new URL(url);
  u.searchParams.set('dl', '1');
  const res = await fetch(u, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`Dropbox answered ${res.status} for the grid folder`);
  const writes = [];
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.onfile = (file) => {
    const name = basename(file.name);
    if (!IS_GRID.test(name)) return;
    const out = createWriteStream(join(dir, name));
    writes.push(new Promise((ok, fail) => { out.on('finish', ok); out.on('error', fail); }));
    file.ondata = (err, chunk, final) => {
      if (err) { out.destroy(err); return; }
      out.write(chunk);
      if (final) out.end();
    };
    file.start();
  };
  let bytes = 0;
  for await (const chunk of res.body) { bytes += chunk.length; unzip.push(chunk, false); }
  unzip.push(new Uint8Array(0), true);
  await Promise.all(writes);
  console.log(`[magnet-grid] downloaded ${(bytes / 1e6).toFixed(0)} MB`);
  const wrong = mismatches(dir, want, { contents: true });
  if (wrong.length) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(`the Dropbox folder is not grid ${version}: ${wrong.slice(0, 5).join('; ')}`
      + (wrong.length > 5 ? `; and ${wrong.length - 5} more` : ''));
  }
  copyGrid(dir, `Dropbox, version ${version}`);
}

const GRID_BASE = 'https://pub-4152429430274d988725593fd52db3ae.r2.dev/magnets-grid';

/** CI path: the slices are fetched by the BROWSER from R2 now (interp.ts
 *  builds their URLs from the manifest), so a build needs exactly one grid
 *  file - the bundled core. Fetched from the same versioned R2 prefix the
 *  runtime uses, sha-verified against the manifest, cached by version.
 *  After a regrid: --write-manifest, then
 *    rclone copy <grid-dir> r2:ssl-data/magnets-grid/<version>/ --include "scenarios*.json"
 *  and commit the manifest. */
async function fetchCore(want) {
  const version = want.version;
  const rec = want.files['scenarios.json'];
  if (!rec) throw new Error('manifest lists no scenarios.json');
  const dir = join(CACHE, version);
  const cached = join(dir, 'scenarios.json');
  if (!(existsSync(cached) && statSync(cached).size === rec.bytes
        && digest(cached) === rec.sha256)) {
    mkdirSync(dir, { recursive: true });
    const url = `${GRID_BASE}/${version}/scenarios.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`R2 answered ${res.status} for ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(cached, buf);
    if (statSync(cached).size !== rec.bytes || digest(cached) !== rec.sha256) {
      rmSync(cached, { force: true });
      throw new Error(`R2 copy of scenarios.json does not match manifest ${version}`);
    }
    console.log(`[magnet-grid] core downloaded from R2 (${(rec.bytes / 1e6).toFixed(0)} MB)`);
  }
  mkdirSync(TARGET, { recursive: true });
  copyFileSync(cached, join(TARGET, 'scenarios.json'));
  keepOutOfDropbox(join(TARGET, 'scenarios.json'));
  console.log(`[magnet-grid] core in place, version ${version}; slices served from R2 at runtime`);
}

async function main() {
  const local = process.env.MAGNET_GRID_DIR || DEFAULT_DIR;
  if (process.argv.includes('--write-manifest')) { writeManifest(local); return; }
  const want = manifest();
  if (complete(local)) {
    copyGrid(local, local);
    // On a laptop the folder may hold a grid newer than the one committed; say
    // so, since what is deployed is the manifest's.
    const wrong = want ? mismatches(local, want) : ['there is no manifest'];
    if (wrong.length) {
      console.warn(`[magnet-grid] this grid is not the one in grid-manifest.json (${wrong[0]}`
        + `${wrong.length > 1 ? `, and ${wrong.length - 1} more` : ''}). `
        + 'Run with --write-manifest and commit it to deploy this grid.');
    }
    return;
  }
  if (want) {
    try { await fetchCore(want); return; }
    catch (err) {
      if (!process.env.MAGNET_GRID_URL) throw err;
      console.warn(`[magnet-grid] R2 fetch failed (${err.message}); falling back to Dropbox zip`);
    }
  }
  if (process.env.MAGNET_GRID_URL) {
    if (!want) throw new Error('src/tools/magnets/grid-manifest.json is missing');
    await download(process.env.MAGNET_GRID_URL, want);
    return;
  }
  if (complete(TARGET)) {
    console.log(`[magnet-grid] ${gridFiles(TARGET).length} files already in place; no source configured`);
    return;
  }
  throw new Error('no scenario grid: set MAGNET_GRID_DIR (a folder) or MAGNET_GRID_URL '
    + '(a Dropbox shared-folder link). See docs/magnet-grid.md');
}

main().catch((err) => {
  console.error(`[magnet-grid] ${err.message}`);
  process.exit(1);
});
