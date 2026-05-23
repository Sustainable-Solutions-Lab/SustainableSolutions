import type { Spec } from '../types';

// Base64-URL encode/decode of the Spec object, used to round-trip the
// current view through location.hash so any explorer state is shareable.
//
// Rejects malformed input gracefully: bad payloads fall back to the
// caller's default spec rather than throwing. This keeps a stale or
// hand-edited URL from breaking the page.

function utf8ToBase64Url(s: string): string {
  if (typeof window === 'undefined') return '';
  // btoa requires Latin-1; encode UTF-8 bytes first.
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return window.btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUtf8(s: string): string {
  if (typeof window === 'undefined') return '';
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = window.atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeSpec(spec: Spec): string {
  return utf8ToBase64Url(JSON.stringify(spec));
}

export function decodeSpec(encoded: string): Spec | null {
  try {
    const json = base64UrlToUtf8(encoded);
    const parsed = JSON.parse(json);
    if (!isValidSpec(parsed)) return null;
    return parsed as Spec;
  } catch {
    return null;
  }
}

// Minimal structural validation. Keeps malformed URLs from crashing the app
// without trying to be a full schema validator — selector code downstream
// is responsible for clamping bad values (e.g. unknown region ids).
function isValidSpec(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  if (typeof s.chart !== 'string') return false;
  if (typeof s.measure !== 'string') return false;
  if (!Array.isArray(s.yearRange) || s.yearRange.length !== 2) return false;
  if (typeof s.yearRange[0] !== 'number' || typeof s.yearRange[1] !== 'number') return false;
  if (!s.filters || typeof s.filters !== 'object') return false;
  return true;
}

export function readSpecFromHash(): Spec | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;
  return decodeSpec(hash);
}

export function writeSpecToHash(spec: Spec): void {
  if (typeof window === 'undefined') return;
  const encoded = encodeSpec(spec);
  const newHash = `#${encoded}`;
  if (window.location.hash === newHash) return;
  // history.replaceState avoids polluting the back/forward stack with every
  // knob tweak. Users navigate back to the page they came from, not through
  // a hundred intermediate spec mutations.
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${newHash}`);
}
