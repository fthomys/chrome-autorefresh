import '@fontsource-variable/roboto-flex/wght.css';
import '../ui/tokens.css';
import '../ui/base.css';
import './popup.css';
import { formatCountdown, sameConfig, type IntervalConfig } from '../shared/config';
import { send } from '../shared/messages';
import { originForUrl } from '../shared/pattern';
import { getDefaults, getTimers, type TabTimer } from '../shared/storage';
import { createConfigForm } from '../ui/config-form';
import { h, icon, notice } from '../ui/dom';
import { clockTime, localize, t } from '../ui/i18n';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const pageEl = $('page');
const clockEl = $('clock');
const countdownEl = $('countdown');
const captionEl = $('caption');
const toggleEl = $<HTMLButtonElement>('toggle');
const noticesEl = $('notices');
const formEl = $<HTMLFormElement>('form');
const optionsLink = $<HTMLAnchorElement>('open-options');

localize();
optionsLink.append(icon('settings'));
optionsLink.addEventListener('click', (e) => {
  e.preventDefault();
  void chrome.runtime.openOptionsPage();
});

const form = createConfigForm('popup');
formEl.append(form.el);
formEl.hidden = true;

let tab: chrome.tabs.Tab | undefined;
let timer: TabTimer | undefined;
let origin: string | null = null;
let hasAccess = false;
let failed = false;
let busy = false;

const host = () => {
  try {
    return tab?.url ? new URL(tab.url).hostname : '';
  } catch {
    return '';
  }
};

function idleCountdown(i: IntervalConfig): { text: string; range: boolean } {
  if (i.mode === 'fixed') return { text: Number.isFinite(i.seconds) ? formatCountdown(i.seconds * 1000) : '-:--', range: false };
  const ok = Number.isFinite(i.minSeconds) && Number.isFinite(i.maxSeconds);
  return { text: ok ? `${formatCountdown(i.minSeconds * 1000)}-${formatCountdown(i.maxSeconds * 1000)}` : '-:--', range: true };
}

function renderClock() {
  const running = timer?.status === 'running';
  if (running) {
    countdownEl.textContent = formatCountdown(timer!.nextAt - Date.now());
    countdownEl.classList.remove('is-range');
  } else {
    const idle = idleCountdown(form.peek().interval);
    countdownEl.textContent = idle.text;
    countdownEl.classList.toggle('is-range', idle.range);
  }
}

let lastNotices = '';

function renderNotices() {
  const items: HTMLElement[] = [];
  const detectOn = (timer?.config ?? form.peek()).detect.enabled;
  const running = timer?.status === 'running';

  if (failed) items.push(notice('error', t('noticeBackgroundError')));
  if (!origin && (running || detectOn)) items.push(notice('info', t('noticeProtected')));
  if (origin && !hasAccess && (running || detectOn)) {
    const allow = h('button', { type: 'button', class: 'btn btn-text' }, t('allowAccess', host()));
    allow.addEventListener('click', () => {
      void chrome.permissions.request({ origins: [origin!] }).then((granted) => {
        hasAccess = granted;
        render();
      });
    });
    items.push(notice('warning', t('noticeNoAccess', host()), allow));
  }
  if (timer?.lastSkippedAt) items.push(notice('info', t('noticeSkipped', clockTime(timer.lastSkippedAt))));
  if (timer?.lastChangeAt && running) items.push(notice('change', t('noticeChanged', clockTime(timer.lastChangeAt))));
  if (timer?.selectorMissing && timer.config.detect.enabled) {
    items.push(notice('warning', t('noticeSelectorMissing', timer.config.detect.selector)));
  }

  const key = items.map((i) => i.textContent).join('|');
  if (key === lastNotices) return;
  lastNotices = key;
  noticesEl.replaceChildren(...items);
}

function render() {
  if (!tab?.id) return;
  const running = timer?.status === 'running';
  clockEl.dataset.state = running ? 'running' : 'idle';
  pageEl.textContent = host() || tab.title || t('thisPage');
  pageEl.title = tab.url ?? '';

  toggleEl.disabled = busy;
  toggleEl.textContent = running ? t('stopReloading') : timer ? t('startAgain') : t('startReloading');

  if (running) captionEl.textContent = t('captionNext', clockTime(timer!.nextAt));
  else if (timer?.status === 'stoppedOnChange' && timer.lastChangeAt) captionEl.textContent = t('captionStopped', clockTime(timer.lastChangeAt));
  else captionEl.textContent = t('captionIdle');

  renderClock();
  renderNotices();
}

async function act(fn: () => Promise<{ ok: boolean }>) {
  busy = true;
  render();
  const res = await fn();
  failed = !res.ok;
  busy = false;
  render();
}

toggleEl.addEventListener('click', () => {
  if (!tab?.id) return;
  const tabId = tab.id;
  if (timer?.status === 'running') {
    void act(() => send({ type: 'stop', tabId }));
    return;
  }
  const config = form.read();
  if (!config) return;
  void act(() => send({ type: 'start', tabId, config, url: tab!.url ?? null, title: tab!.title ?? null }));
});

form.onChange(() => {
  if (timer?.status === 'running' && tab?.id) {
    const config = form.read();
    if (config && !sameConfig(config, timer.config)) {
      const tabId = tab.id;
      void act(() => send({ type: 'start', tabId, config, url: tab!.url ?? null, title: tab!.title ?? null }));
      return;
    }
  }
  render();
});

async function init() {
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      clockEl.dataset.state = 'idle';
      captionEl.textContent = t('noticeNoTab');
      return;
    }
    origin = originForUrl(tab.url);
    const [timers, defaults, access] = await Promise.all([
      getTimers(),
      getDefaults(),
      origin ? chrome.permissions.contains({ origins: [origin] }) : Promise.resolve(false),
    ]);
    timer = timers[tab.id];
    hasAccess = access;
    form.write(timer?.config ?? defaults);
    formEl.hidden = false;
    toggleEl.disabled = false;
    render();
  } catch {
    failed = true;
    clockEl.dataset.state = 'idle';
    captionEl.textContent = '';
    renderNotices();
    return;
  }

  chrome.storage.session.onChanged.addListener((changes) => {
    if (!changes.timers || !tab?.id) return;
    const next = (changes.timers.newValue as Record<string, TabTimer> | undefined)?.[tab.id];
    const formFocused = formEl.contains(document.activeElement);
    if (next && !formFocused && (!timer || !sameConfig(next.config, timer.config))) form.write(next.config);
    timer = next;
    render();
  });
  chrome.permissions.onAdded.addListener(() => {
    if (!origin) return;
    void chrome.permissions.contains({ origins: [origin] }).then((granted) => {
      hasAccess = granted;
      render();
    });
  });
  setInterval(renderClock, 250);
}

void init();
