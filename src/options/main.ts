import '@fontsource-variable/roboto-flex/wght.css';
import '../ui/tokens.css';
import '../ui/base.css';
import './options.css';
import { DEFAULT_CONFIG, formatCountdown } from '../shared/config';
import { send } from '../shared/messages';
import { parsePattern, type PatternError } from '../shared/pattern';
import { getDefaults, getRules, getTimers, setDefaults, setRules, type Rule, type TabTimer } from '../shared/storage';
import { createConfigForm } from '../ui/config-form';
import { h, icon, notice } from '../ui/dom';
import { describeConfig, localize, t } from '../ui/i18n';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

localize();

const runningEl = $('running');
const rulesEl = $('rules');
const loadError = $('load-error');
const addRuleBtn = $<HTMLButtonElement>('add-rule');
addRuleBtn.append(icon('add'), t('addRule'));

let timers: Record<string, TabTimer> = {};
let rules: Rule[] = [];

const hostOf = (url: string | null) => {
  try {
    return url ? new URL(url).hostname : '';
  } catch {
    return '';
  }
};

function showLoadError() {
  loadError.textContent = t('loadError');
  loadError.hidden = false;
}

function renderRunning() {
  runningEl.removeAttribute('aria-busy');
  const list = Object.values(timers).sort((a, b) => a.nextAt - b.nextAt);
  if (!list.length) {
    runningEl.replaceChildren(h('li', { class: 'row-empty' }, t('runningEmpty')));
    return;
  }
  runningEl.replaceChildren(
    ...list.map((tm) => {
      const remaining = h('span', { class: 'remaining', 'data-next': tm.nextAt });
      const status =
        tm.status === 'running'
          ? h('span', {}, t('runningNext'), ' ', remaining)
          : h('span', {}, t('runningStopped'));
      const go = h('button', { type: 'button', class: 'btn btn-text' }, t('goToTab'));
      go.addEventListener('click', () => void send({ type: 'focusTab', tabId: tm.tabId }));
      const stop = h('button', { type: 'button', class: 'btn btn-tonal' }, t('stop'));
      stop.addEventListener('click', () => void send({ type: 'stop', tabId: tm.tabId }));
      return h(
        'li',
        { class: 'row' },
        h(
          'div',
          { class: 'row-main' },
          h('p', { class: 'row-title', title: tm.url ?? '' }, tm.title || hostOf(tm.url) || t('thisPage')),
          h('p', { class: 'row-meta' }, status, ' · ', describeConfig(tm.config)),
        ),
        h('div', { class: 'row-actions' }, go, stop),
      );
    }),
  );
  tickRemaining();
}

function tickRemaining() {
  for (const el of runningEl.querySelectorAll<HTMLElement>('[data-next]')) {
    el.textContent = formatCountdown(Number(el.dataset.next) - Date.now());
  }
}

async function hasOriginAccess(pattern: string): Promise<{ origin: string; host: string } | null> {
  const p = parsePattern(pattern);
  if (!p.ok) return null;
  const granted = await chrome.permissions.contains({ origins: [p.pattern.origin] });
  return granted ? null : { origin: p.pattern.origin, host: p.pattern.host };
}

async function renderRules() {
  rulesEl.removeAttribute('aria-busy');
  if (!rules.length) {
    rulesEl.replaceChildren(h('li', { class: 'row-empty' }, t('rulesEmpty')));
    return;
  }
  const rows = await Promise.all(
    rules.map(async (rule) => {
      const enabled = h('input', {
        type: 'checkbox',
        role: 'switch',
        class: 'switch',
        'aria-label': t('ruleEnabled', rule.pattern),
        checked: rule.enabled,
      });
      enabled.addEventListener('change', () => {
        void saveRules(rules.map((r) => (r.id === rule.id ? { ...r, enabled: enabled.checked } : r)));
      });
      const edit = h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('editRule', rule.pattern), title: t('editRuleShort') }, icon('edit'));
      edit.addEventListener('click', () => openRuleDialog(rule));
      const del = h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('deleteRule', rule.pattern), title: t('delete') }, icon('delete'));
      del.addEventListener('click', () => confirmDelete(rule));

      const missing = await hasOriginAccess(rule.pattern);
      let accessNotice: HTMLElement | null = null;
      if (missing) {
        const allow = h('button', { type: 'button', class: 'btn btn-text' }, t('allowAccess', missing.host));
        allow.addEventListener('click', () => void chrome.permissions.request({ origins: [missing.origin] }).then(renderRules));
        accessNotice = notice('warning', t('ruleNoAccess', missing.host), allow);
      }

      return h(
        'li',
        { class: 'row' },
        h(
          'div',
          { class: 'row-main' },
          h('p', { class: 'row-title pattern' }, rule.pattern),
          h('p', { class: 'row-meta' }, rule.enabled ? describeConfig(rule.config) : t('ruleOff')),
        ),
        h('div', { class: 'row-actions' }, enabled, edit, del),
        accessNotice,
      );
    }),
  );
  rulesEl.replaceChildren(...rows);
}

async function saveRules(next: Rule[]) {
  try {
    await setRules(next);
  } catch {
    showLoadError();
  }
}

const PATTERN_ERRORS: Record<PatternError, string> = {
  empty: 'errPatternEmpty',
  scheme: 'errPatternScheme',
  host: 'errPatternHost',
  path: 'errPatternPath',
};

const ruleDialog = $<HTMLDialogElement>('rule-dialog');
const ruleTitle = $('rule-dialog-title');
const ruleForm = $<HTMLFormElement>('rule-form');
const patternInput = $<HTMLInputElement>('rule-pattern');
const patternError = $('rule-pattern-error');
const ruleConfig = createConfigForm('rule');
$('rule-config').append(ruleConfig.el);
let editing: Rule | null = null;

function setPatternError(message: string | null) {
  patternError.hidden = message === null;
  patternError.textContent = message ?? '';
  if (message) {
    patternInput.setAttribute('aria-invalid', 'true');
    patternInput.setAttribute('aria-describedby', 'rule-pattern-hint rule-pattern-error');
  } else {
    patternInput.removeAttribute('aria-invalid');
    patternInput.setAttribute('aria-describedby', 'rule-pattern-hint');
  }
}

function openRuleDialog(rule: Rule | null) {
  editing = rule;
  ruleTitle.textContent = t(rule ? 'dialogEditTitle' : 'dialogAddTitle');
  patternInput.value = rule?.pattern ?? '';
  setPatternError(null);
  void getDefaults().then((d) => ruleConfig.write(rule?.config ?? d));
  ruleDialog.showModal();
  patternInput.focus();
}

addRuleBtn.addEventListener('click', () => openRuleDialog(null));
$('rule-cancel').addEventListener('click', () => ruleDialog.close());

ruleForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const parsed = parsePattern(patternInput.value);
  setPatternError(parsed.ok ? null : t(PATTERN_ERRORS[parsed.error]));
  if (!parsed.ok) {
    patternInput.focus();
    return;
  }
  const config = ruleConfig.read();
  if (!config) return;

  // permissions.request needs the click's user gesture, so it runs before any other await.
  void chrome.permissions.request({ origins: [parsed.pattern.origin] }).then(async (granted) => {
    if (!granted) {
      setPatternError(t('errPermissionDenied', parsed.pattern.host));
      patternInput.focus();
      return;
    }
    const pattern = patternInput.value.trim();
    const next = editing
      ? rules.map((r) => (r.id === editing!.id ? { ...r, pattern, config } : r))
      : [...rules, { id: crypto.randomUUID(), pattern, enabled: true, config }];
    await saveRules(next);
    ruleDialog.close();
  });
});

const deleteDialog = $<HTMLDialogElement>('delete-dialog');
let deleting: Rule | null = null;

function confirmDelete(rule: Rule) {
  deleting = rule;
  $('delete-dialog-body').textContent = t('confirmDeleteBody', rule.pattern);
  deleteDialog.showModal();
  $('delete-cancel').focus();
}

$('delete-cancel').addEventListener('click', () => deleteDialog.close());
$('delete-confirm').addEventListener('click', () => {
  if (deleting) void saveRules(rules.filter((r) => r.id !== deleting!.id));
  deleteDialog.close();
});

const defaultsForm = createConfigForm('defaults');
const defaultsStatus = $('defaults-status');
$('defaults').append(defaultsForm.el);
let statusTimer: ReturnType<typeof setTimeout> | undefined;

defaultsForm.onChange(() => {
  const config = defaultsForm.read();
  if (!config) return;
  void setDefaults(config).then(
    () => {
      defaultsStatus.textContent = t('saved');
      clearTimeout(statusTimer);
      statusTimer = setTimeout(() => (defaultsStatus.textContent = ''), 3000);
    },
    showLoadError,
  );
});

async function init() {
  try {
    [timers, rules] = await Promise.all([getTimers(), getRules()]);
    defaultsForm.write(await getDefaults().catch(() => DEFAULT_CONFIG));
  } catch {
    showLoadError();
    return;
  }
  renderRunning();
  await renderRules();

  chrome.storage.session.onChanged.addListener((changes) => {
    if (!changes.timers) return;
    timers = (changes.timers.newValue as Record<string, TabTimer> | undefined) ?? {};
    renderRunning();
  });
  chrome.storage.sync.onChanged.addListener((changes) => {
    if (changes.rules) {
      rules = (changes.rules.newValue as Rule[] | undefined) ?? [];
      void renderRules();
    }
  });
  chrome.permissions.onAdded.addListener(() => void renderRules());
  chrome.permissions.onRemoved.addListener(() => void renderRules());
  setInterval(tickRemaining, 250);
}

void init();
