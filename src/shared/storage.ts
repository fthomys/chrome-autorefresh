import { DEFAULT_CONFIG, type TimerConfig } from './config';

export type SiteAccess = 'yes' | 'no' | 'protected' | 'unknown';

export interface TabTimer {
  tabId: number;
  config: TimerConfig;
  ruleId: string | null;
  url: string | null;
  title: string | null;
  status: 'running' | 'stoppedOnChange';
  nextAt: number;
  cycleMs: number;
  siteAccess: SiteAccess;
  awaitingCheck: boolean;
  baseline: string | null;
  selectorMissing: boolean;
  lastReloadAt: number | null;
  lastSkippedAt: number | null;
  lastChangeAt: number | null;
}

export type Timers = Record<string, TabTimer>;

export interface Rule {
  id: string;
  pattern: string;
  enabled: boolean;
  config: TimerConfig;
}

// Session storage: survives worker restarts, not browser restarts (tab ids don't either).
export async function getTimers(): Promise<Timers> {
  const { timers } = await chrome.storage.session.get('timers');
  return (timers as Timers | undefined) ?? {};
}

export function setTimers(timers: Timers): Promise<void> {
  return chrome.storage.session.set({ timers });
}

// Tabs where the user stopped a rule timer; rules skip them until the tab closes.
export async function getSuppressed(): Promise<number[]> {
  const { suppressed } = await chrome.storage.session.get('suppressed');
  return (suppressed as number[] | undefined) ?? [];
}

export function setSuppressed(ids: number[]): Promise<void> {
  return chrome.storage.session.set({ suppressed: ids });
}

export async function getDefaults(): Promise<TimerConfig> {
  const { defaults } = await chrome.storage.sync.get('defaults');
  return (defaults as TimerConfig | undefined) ?? DEFAULT_CONFIG;
}

export function setDefaults(defaults: TimerConfig): Promise<void> {
  return chrome.storage.sync.set({ defaults });
}

export async function getRules(): Promise<Rule[]> {
  const { rules } = await chrome.storage.sync.get('rules');
  return (rules as Rule[] | undefined) ?? [];
}

export function setRules(rules: Rule[]): Promise<void> {
  return chrome.storage.sync.set({ rules });
}
