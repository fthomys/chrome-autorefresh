import { describe, expect, it } from 'vitest';
import { formatBadge, formatCountdown, nextDelayMs, splitSeconds, validateInterval } from './config';

describe('validateInterval', () => {
  it('accepts the bounds', () => {
    expect(validateInterval({ mode: 'fixed', seconds: 5 })).toBeNull();
    expect(validateInterval({ mode: 'fixed', seconds: 86400 })).toBeNull();
  });
  it('rejects out of range and fractional values', () => {
    expect(validateInterval({ mode: 'fixed', seconds: 4 })).toBe('tooShort');
    expect(validateInterval({ mode: 'fixed', seconds: 86401 })).toBe('tooLong');
    expect(validateInterval({ mode: 'fixed', seconds: 1.5 })).toBe('notANumber');
    expect(validateInterval({ mode: 'fixed', seconds: NaN })).toBe('notANumber');
  });
  it('requires min below max', () => {
    expect(validateInterval({ mode: 'random', minSeconds: 30, maxSeconds: 30 })).toBe('minNotBelowMax');
    expect(validateInterval({ mode: 'random', minSeconds: 30, maxSeconds: 90 })).toBeNull();
    expect(validateInterval({ mode: 'random', minSeconds: 2, maxSeconds: 90 })).toBe('tooShort');
  });
});

describe('nextDelayMs', () => {
  it('is fixed for fixed intervals', () => {
    expect(nextDelayMs({ mode: 'fixed', seconds: 30 })).toBe(30000);
  });
  it('stays within min and max', () => {
    const i = { mode: 'random', minSeconds: 30, maxSeconds: 90 } as const;
    expect(nextDelayMs(i, () => 0)).toBe(30000);
    expect(nextDelayMs(i, () => 0.5)).toBe(60000);
    expect(nextDelayMs(i, () => 0.999999)).toBeLessThanOrEqual(90000);
  });
});

describe('formatting', () => {
  it('formats the countdown', () => {
    expect(formatCountdown(59_001)).toBe('1:00');
    expect(formatCountdown(5_000)).toBe('0:05');
    expect(formatCountdown(3_661_000)).toBe('1:01:01');
    expect(formatCountdown(-10)).toBe('0:00');
  });
  it('keeps badge text short', () => {
    expect(formatBadge(45_000)).toBe('45s');
    expect(formatBadge(60_000)).toBe('1m');
    expect(formatBadge(61_000)).toBe('2m');
    expect(formatBadge(86_400_000)).toBe('24h');
  });
  it('splits seconds into the largest even unit', () => {
    expect(splitSeconds(90)).toEqual({ value: 90, unit: 's' });
    expect(splitSeconds(120)).toEqual({ value: 2, unit: 'm' });
    expect(splitSeconds(7200)).toEqual({ value: 2, unit: 'h' });
  });
});
