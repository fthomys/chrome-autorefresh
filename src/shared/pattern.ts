export interface ParsedPattern {
  scheme: '*' | 'http' | 'https';
  host: string;
  port: string | null;
  path: string;
  origin: string;
}

export type PatternError = 'empty' | 'scheme' | 'host' | 'path';

export type PatternResult = { ok: true; pattern: ParsedPattern } | { ok: false; error: PatternError };

const HOST_RE = /^(\*|(?:\*\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*)(?::(\d{1,5}))?$/i;

export function parsePattern(raw: string): PatternResult {
  const input = raw.trim();
  if (!input) return { ok: false, error: 'empty' };

  let scheme: ParsedPattern['scheme'] = '*';
  let rest = input;
  const sep = input.indexOf('://');
  if (sep !== -1) {
    const s = input.slice(0, sep).toLowerCase();
    if (s !== 'http' && s !== 'https' && s !== '*') return { ok: false, error: 'scheme' };
    scheme = s;
    rest = input.slice(sep + 3);
  }

  const slash = rest.indexOf('/');
  const hostPart = slash === -1 ? rest : rest.slice(0, slash);
  const path = slash === -1 ? '/*' : rest.slice(slash);

  const m = HOST_RE.exec(hostPart);
  if (!m) return { ok: false, error: 'host' };
  if (/[\s#]/.test(path)) return { ok: false, error: 'path' };

  const host = m[1].toLowerCase();
  return {
    ok: true,
    pattern: { scheme, host, port: m[2] ?? null, path, origin: `${scheme}://${host}/*` },
  };
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function hostMatches(pattern: string, hostname: string): boolean {
  if (pattern === '*') return true;
  if (pattern.startsWith('*.')) {
    const base = pattern.slice(2);
    return hostname === base || hostname.endsWith(`.${base}`);
  }
  return hostname === pattern;
}

export function matchesUrl(p: ParsedPattern, url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const proto = u.protocol.slice(0, -1);
  if (proto !== 'http' && proto !== 'https') return false;
  if (p.scheme !== '*' && p.scheme !== proto) return false;
  if (!hostMatches(p.host, u.hostname)) return false;
  if (p.port !== null && u.port !== p.port) return false;
  return globToRegExp(p.path).test(u.pathname + u.search);
}

// Null for pages Chrome never grants host access to (chrome://, Web Store).
export function originForUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.hostname === 'chromewebstore.google.com' || (u.hostname === 'chrome.google.com' && u.pathname.startsWith('/webstore'))) return null;
    return `${u.protocol}//${u.hostname}/*`;
  } catch {
    return null;
  }
}
