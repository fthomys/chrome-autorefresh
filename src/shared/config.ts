export const MIN_SECONDS = 5;
export const MAX_SECONDS = 24 * 60 * 60;

export type Unit = 's' | 'm' | 'h';
export const UNIT_SECONDS: Record<Unit, number> = { s: 1, m: 60, h: 3600 };

export type IntervalConfig =
  | { mode: 'fixed'; seconds: number }
  | { mode: 'random'; minSeconds: number; maxSeconds: number };

export interface DetectConfig {
  enabled: boolean;
  selector: string;
  stopOnChange: boolean;
}

export interface TimerConfig {
  interval: IntervalConfig;
  detect: DetectConfig;
}

export const DEFAULT_CONFIG: TimerConfig = {
  interval: { mode: 'fixed', seconds: 60 },
  detect: { enabled: false, selector: '', stopOnChange: false },
};

export type IntervalError = 'notANumber' | 'tooShort' | 'tooLong' | 'minNotBelowMax';

function checkSeconds(s: number): IntervalError | null {
  if (!Number.isInteger(s)) return 'notANumber';
  if (s < MIN_SECONDS) return 'tooShort';
  if (s > MAX_SECONDS) return 'tooLong';
  return null;
}

export function validateInterval(i: IntervalConfig): IntervalError | null {
  if (i.mode === 'fixed') return checkSeconds(i.seconds);
  const err = checkSeconds(i.minSeconds) ?? checkSeconds(i.maxSeconds);
  if (err) return err;
  return i.minSeconds < i.maxSeconds ? null : 'minNotBelowMax';
}

export function nextDelayMs(i: IntervalConfig, random: () => number = Math.random): number {
  if (i.mode === 'fixed') return i.seconds * 1000;
  return Math.round((i.minSeconds + random() * (i.maxSeconds - i.minSeconds)) * 1000);
}

export function splitSeconds(seconds: number): { value: number; unit: Unit } {
  if (seconds >= 3600 && seconds % 3600 === 0) return { value: seconds / 3600, unit: 'h' };
  if (seconds >= 60 && seconds % 60 === 0) return { value: seconds / 60, unit: 'm' };
  return { value: seconds, unit: 's' };
}

export function sameConfig(a: TimerConfig, b: TimerConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// Badge text has room for about 4 characters.
export function formatBadge(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.ceil(s / 60)}m`;
  return `${Math.ceil(s / 3600)}h`;
}
