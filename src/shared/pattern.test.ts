import { describe, expect, it } from 'vitest';
import { matchesUrl, originForUrl, parsePattern, type ParsedPattern } from './pattern';

function parse(input: string): ParsedPattern {
  const r = parsePattern(input);
  if (!r.ok) throw new Error(r.error);
  return r.pattern;
}

describe('parsePattern', () => {
  it('fills in scheme and path', () => {
    expect(parse('example.com')).toMatchObject({ scheme: '*', host: 'example.com', path: '/*', origin: '*://example.com/*' });
  });
  it('keeps an explicit scheme and port', () => {
    expect(parse('https://localhost:8080/app/*')).toMatchObject({ scheme: 'https', host: 'localhost', port: '8080', origin: 'https://localhost/*' });
  });
  it('reports errors', () => {
    expect(parsePattern('  ')).toEqual({ ok: false, error: 'empty' });
    expect(parsePattern('ftp://example.com')).toEqual({ ok: false, error: 'scheme' });
    expect(parsePattern('exa*mple.com')).toEqual({ ok: false, error: 'host' });
    expect(parsePattern('example.com/a b')).toEqual({ ok: false, error: 'path' });
  });
});

describe('matchesUrl', () => {
  it('matches the whole site by default', () => {
    const p = parse('example.com');
    expect(matchesUrl(p, 'https://example.com/')).toBe(true);
    expect(matchesUrl(p, 'http://example.com/a/b?c=1')).toBe(true);
    expect(matchesUrl(p, 'https://www.example.com/')).toBe(false);
  });
  it('handles subdomain wildcards', () => {
    const p = parse('*.example.com/tickets/*');
    expect(matchesUrl(p, 'https://shop.example.com/tickets/42')).toBe(true);
    expect(matchesUrl(p, 'https://example.com/tickets/42')).toBe(true);
    expect(matchesUrl(p, 'https://badexample.com/tickets/42')).toBe(false);
    expect(matchesUrl(p, 'https://shop.example.com/news')).toBe(false);
  });
  it('treats a path without a wildcard as exact', () => {
    const p = parse('example.com/status');
    expect(matchesUrl(p, 'https://example.com/status')).toBe(true);
    expect(matchesUrl(p, 'https://example.com/status?x=1')).toBe(false);
  });
  it('respects scheme and port', () => {
    expect(matchesUrl(parse('https://example.com'), 'http://example.com/')).toBe(false);
    expect(matchesUrl(parse('localhost:3000'), 'http://localhost:3000/')).toBe(true);
    expect(matchesUrl(parse('localhost:3000'), 'http://localhost:4000/')).toBe(false);
  });
  it('never matches non-web pages', () => {
    expect(matchesUrl(parse('*'), 'chrome://settings')).toBe(false);
    expect(matchesUrl(parse('*'), 'not a url')).toBe(false);
  });
});

describe('originForUrl', () => {
  it('returns an origin pattern for web pages only', () => {
    expect(originForUrl('https://example.com/a?b')).toBe('https://example.com/*');
    expect(originForUrl('chrome://extensions')).toBeNull();
    expect(originForUrl('https://chromewebstore.google.com/detail/x')).toBeNull();
    expect(originForUrl(undefined)).toBeNull();
  });
});
