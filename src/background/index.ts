import { nextDelayMs, formatBadge, sameConfig, type TimerConfig } from '../shared/config';
import { matchesUrl, originForUrl, parsePattern } from '../shared/pattern';
import { BADGE_ATTENTION, BADGE_RUNNING } from '../shared/palette';
import type { Request, Response } from '../shared/messages';
import {
  getRules,
  getSuppressed,
  getTimers,
  setSuppressed,
  setTimers,
  type Rule,
  type SiteAccess,
  type TabTimer,
  type Timers,
} from '../shared/storage';
import { hasUnsavedInput, snapshotPage, watchInput, type Snapshot } from './page-scripts';

// Gives late-rendering pages a moment before comparing content.
const SETTLE_MS = 2000;
const ALARM_PREFIX = 'reload:';
const BADGE_ALARM = 'badge';

let queue: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

async function mutate<T>(fn: (timers: Timers) => Promise<T> | T): Promise<T> {
  return locked(async () => {
    const timers = await getTimers();
    const result = await fn(timers);
    await setTimers(timers);
    return result;
  });
}

// chrome.alarms won't fire sooner than 30s, so intervals below that rely on setTimeout.
// The alarm stays as a backstop in case the worker was shut down in between.
const handles = new Map<number, ReturnType<typeof setTimeout>>();

function arm(t: TabTimer): void {
  void chrome.alarms.create(ALARM_PREFIX + t.tabId, { when: Math.max(t.nextAt, Date.now() + 1000) });
  clearTimeout(handles.get(t.tabId));
  handles.set(t.tabId, setTimeout(() => void fire(t.tabId), Math.max(0, t.nextAt - Date.now())));
}

function disarm(tabId: number): void {
  void chrome.alarms.clear(ALARM_PREFIX + tabId);
  clearTimeout(handles.get(tabId));
  handles.delete(tabId);
}

function accessFor(url: string | null): SiteAccess {
  return originForUrl(url) ? 'no' : 'protected';
}

async function runInTab<T>(tabId: number, func: (...args: never[]) => T, args: unknown[] = []): Promise<Awaited<T> | undefined> {
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: func as () => T, args: args as [] });
    return res?.result as Awaited<T> | undefined;
  } catch {
    return undefined;
  }
}

async function start(tabId: number, config: TimerConfig, url: string | null, title: string | null, ruleId: string | null): Promise<void> {
  const cycleMs = nextDelayMs(config.interval);
  const t: TabTimer = {
    tabId,
    config,
    ruleId,
    url,
    title,
    status: 'running',
    nextAt: Date.now() + cycleMs,
    cycleMs,
    siteAccess: 'unknown',
    awaitingCheck: false,
    baseline: null,
    selectorMissing: false,
    lastReloadAt: null,
    lastSkippedAt: null,
    lastChangeAt: null,
  };
  await mutate((timers) => {
    timers[tabId] = t;
  });
  arm(t);
  await runInTab(tabId, watchInput);
  if (config.detect.enabled) await captureBaseline(tabId);
  await tick();
}

async function stop(tabId: number, byUser: boolean): Promise<void> {
  const removed = await mutate((timers) => {
    const t = timers[tabId];
    delete timers[tabId];
    return t;
  });
  disarm(tabId);
  if (byUser && removed?.ruleId) {
    const ids = await getSuppressed();
    if (!ids.includes(tabId)) await setSuppressed([...ids, tabId]);
  }
  await chrome.action.setBadgeText({ tabId, text: '' }).catch(() => undefined);
  await tick();
}

async function fire(tabId: number): Promise<void> {
  await mutate(async (timers) => {
    const t = timers[tabId];
    if (!t || t.status !== 'running') return;
    const now = Date.now();
    if (now < t.nextAt - 750) {
      arm(t);
      return;
    }

    const typing = await runInTab(tabId, hasUnsavedInput);
    t.siteAccess = typing === undefined ? accessFor(t.url) : 'yes';

    if (typing === true) {
      t.lastSkippedAt = now;
    } else {
      try {
        await chrome.tabs.reload(tabId);
      } catch {
        delete timers[tabId];
        disarm(tabId);
        return;
      }
      t.lastReloadAt = now;
      t.lastSkippedAt = null;
      t.awaitingCheck = t.config.detect.enabled;
    }
    t.cycleMs = nextDelayMs(t.config.interval);
    t.nextAt = now + t.cycleMs;
    arm(t);
  });
  await tick();
}

async function captureBaseline(tabId: number): Promise<void> {
  const t = (await getTimers())[tabId];
  if (!t) return;
  const snap = await runInTab<Snapshot>(tabId, snapshotPage as (...a: never[]) => Snapshot, [t.config.detect.selector]);
  await mutate((timers) => {
    const cur = timers[tabId];
    if (!cur) return;
    if (!snap) {
      cur.siteAccess = accessFor(cur.url);
      return;
    }
    cur.siteAccess = 'yes';
    cur.selectorMissing = !snap.found;
    if (snap.found) cur.baseline = snap.hash;
  });
}

async function checkForChange(tabId: number): Promise<void> {
  const t = (await getTimers())[tabId];
  if (!t?.awaitingCheck) return;
  const snap = await runInTab<Snapshot>(tabId, snapshotPage as (...a: never[]) => Snapshot, [t.config.detect.selector]);

  const changed = await mutate((timers) => {
    const cur = timers[tabId];
    if (!cur) return null;
    cur.awaitingCheck = false;
    if (!snap) {
      cur.siteAccess = accessFor(cur.url);
      return null;
    }
    cur.siteAccess = 'yes';
    cur.selectorMissing = !snap.found;
    if (!snap.found) return null;
    if (cur.baseline === null || cur.baseline === snap.hash) {
      cur.baseline = snap.hash;
      return null;
    }
    cur.baseline = snap.hash;
    cur.lastChangeAt = Date.now();
    if (cur.config.detect.stopOnChange) {
      cur.status = 'stoppedOnChange';
      disarm(tabId);
    }
    return cur;
  });

  if (changed) {
    const host = changed.url ? new URL(changed.url).hostname : '';
    chrome.notifications.create(`changed:${tabId}:${Date.now()}`, {
      type: 'basic',
      iconUrl: 'icons/icon-128.png',
      title: chrome.i18n.getMessage(changed.status === 'stoppedOnChange' ? 'notifyStoppedTitle' : 'notifyChangedTitle'),
      message: changed.title || host,
      contextMessage: host,
    });
    await tick();
  }
}

let tickHandle: ReturnType<typeof setTimeout> | undefined;

// Minutes are enough until the last minute, so the worker only stays busy per second then.
async function tick(): Promise<void> {
  clearTimeout(tickHandle);
  const timers = Object.values(await getTimers());
  const now = Date.now();
  let soonest = Infinity;

  for (const t of timers) {
    const running = t.status === 'running';
    const colors = running ? BADGE_RUNNING : BADGE_ATTENTION;
    const remaining = t.nextAt - now;
    if (running) soonest = Math.min(soonest, remaining);
    await Promise.all([
      chrome.action.setBadgeText({ tabId: t.tabId, text: running ? formatBadge(remaining) : '!' }),
      chrome.action.setBadgeBackgroundColor({ tabId: t.tabId, color: colors.background }),
      chrome.action.setBadgeTextColor({ tabId: t.tabId, color: colors.text }),
    ]).catch(() => undefined);
  }

  if (soonest === Infinity) {
    await chrome.alarms.clear(BADGE_ALARM);
    return;
  }
  if (!(await chrome.alarms.get(BADGE_ALARM))) await chrome.alarms.create(BADGE_ALARM, { periodInMinutes: 0.5 });
  if (soonest <= 61_000) {
    tickHandle = setTimeout(() => void tick(), (((soonest % 1000) + 1000) % 1000) + 20);
  }
}

async function ruleFor(url: string, rules?: Rule[]): Promise<Rule | null> {
  for (const rule of rules ?? (await getRules())) {
    if (!rule.enabled) continue;
    const p = parsePattern(rule.pattern);
    if (p.ok && matchesUrl(p.pattern, url)) return rule;
  }
  return null;
}

async function applyRules(tab: chrome.tabs.Tab, rules?: Rule[]): Promise<void> {
  if (tab.id === undefined || !tab.url) return;
  const timers = await getTimers();
  if (timers[tab.id] || (await getSuppressed()).includes(tab.id)) return;
  const rule = await ruleFor(tab.url, rules);
  if (rule) await start(tab.id, rule.config, tab.url, tab.title ?? null, rule.id);
}

async function syncWithRules(): Promise<void> {
  const rules = await getRules();
  for (const t of Object.values(await getTimers())) {
    if (!t.ruleId) continue;
    const rule = rules.find((r) => r.id === t.ruleId && r.enabled);
    const p = rule && parsePattern(rule.pattern);
    if (!rule || !p?.ok || (t.url && !matchesUrl(p.pattern, t.url))) {
      await stop(t.tabId, false);
    } else if (!sameConfig(rule.config, t.config)) {
      await start(t.tabId, rule.config, t.url, t.title, rule.id);
    }
  }
  for (const tab of await chrome.tabs.query({})) await applyRules(tab, rules);
}

chrome.runtime.onMessage.addListener((req: Request, _sender, reply: (r: Response) => void) => {
  const done = () => reply({ ok: true });
  const fail = (e: unknown) => reply({ ok: false, error: String(e) });
  if (req.type === 'start') start(req.tabId, req.config, req.url, req.title, null).then(done, fail);
  else if (req.type === 'stop') stop(req.tabId, true).then(done, fail);
  else if (req.type === 'focusTab') focusTab(req.tabId).then(done, fail);
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === BADGE_ALARM) void tick();
  else if (alarm.name.startsWith(ALARM_PREFIX)) void fire(Number(alarm.name.slice(ALARM_PREFIX.length)));
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status !== 'complete') return;
  void (async () => {
    const t = (await getTimers())[tabId];
    if (!t) return applyRules(tab);
    if (tab.url && (tab.url !== t.url || tab.title !== t.title)) {
      if (t.ruleId) {
        const rule = (await getRules()).find((r) => r.id === t.ruleId);
        const p = rule && parsePattern(rule.pattern);
        if (!p?.ok || !matchesUrl(p.pattern, tab.url)) return stop(tabId, false);
      }
      await mutate((timers) => {
        if (!timers[tabId]) return;
        timers[tabId].url = tab.url ?? null;
        timers[tabId].title = tab.title ?? null;
      });
    }
    await runInTab(tabId, watchInput);
    if (t.awaitingCheck) setTimeout(() => void checkForChange(tabId), SETTLE_MS);
    await tick();
  })();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void (async () => {
    if ((await getTimers())[tabId]) await stop(tabId, false);
    const ids = await getSuppressed();
    if (ids.includes(tabId)) await setSuppressed(ids.filter((id) => id !== tabId));
  })();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.rules) void syncWithRules();
});

chrome.permissions.onAdded.addListener(() => {
  void (async () => {
    for (const t of Object.values(await getTimers())) {
      if (t.config.detect.enabled && t.baseline === null) await captureBaseline(t.tabId);
    }
    await syncWithRules();
  })();
});

async function focusTab(tabId: number): Promise<void> {
  const tab = await chrome.tabs.update(tabId, { active: true });
  if (tab?.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
}

chrome.notifications.onClicked.addListener((id) => {
  const [kind, tabId] = id.split(':');
  if (kind === 'changed') void focusTab(Number(tabId)).catch(() => undefined);
  chrome.notifications.clear(id);
});

chrome.runtime.onInstalled.addListener(() => void syncWithRules());
chrome.runtime.onStartup.addListener(() => void syncWithRules());

// The worker may have been restarted: put back the in-memory timeouts.
void getTimers().then((timers) => {
  for (const t of Object.values(timers)) if (t.status === 'running') arm(t);
  void tick();
});
