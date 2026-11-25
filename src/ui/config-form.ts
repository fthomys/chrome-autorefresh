import {
  UNIT_SECONDS,
  splitSeconds,
  validateInterval,
  type IntervalConfig,
  type IntervalError,
  type TimerConfig,
  type Unit,
} from '../shared/config';
import { h, icon } from './dom';
import { t } from './i18n';

const INTERVAL_ERRORS: Record<IntervalError, string> = {
  notANumber: 'errNotANumber',
  tooShort: 'errTooShort',
  tooLong: 'errTooLong',
  minNotBelowMax: 'errMinMax',
};

export function isValidSelector(selector: string): boolean {
  try {
    document.createDocumentFragment().querySelector(selector);
    return true;
  } catch {
    return false;
  }
}

function amountField(id: string, label: string) {
  const input = h('input', { id, type: 'number', min: 1, step: 1, inputmode: 'numeric', required: true });
  const unit = h(
    'select',
    { id: `${id}-unit` },
    ...(['s', 'm', 'h'] as Unit[]).map((u) => h('option', { value: u }, t(`unit${u.toUpperCase()}`))),
  );
  const el = h(
    'div',
    { class: 'amount' },
    h('label', { class: 'field', for: id }, h('span', { class: 'field-label' }, label), input),
    h('label', { class: 'field', for: `${id}-unit` }, h('span', { class: 'field-label' }, t('fieldUnit')), unit),
  );
  return {
    el,
    input,
    get: () => (input.value.trim() === '' ? NaN : Number(input.value)) * UNIT_SECONDS[unit.value as Unit],
    set: (seconds: number) => {
      const s = splitSeconds(seconds);
      input.value = String(s.value);
      unit.value = s.unit;
    },
  };
}

function switchRow(id: string, label: string) {
  const input = h('input', { id, type: 'checkbox', role: 'switch', class: 'switch' });
  return { el: h('label', { class: 'switch-row', for: id }, h('span', {}, label), input), input };
}

export interface ConfigForm {
  el: HTMLElement;
  /** Validates and shows errors; returns null when something is invalid. */
  read(): TimerConfig | null;
  write(c: TimerConfig): void;
  /** Current values for display, without validating. */
  peek(): TimerConfig;
  onChange(cb: () => void): void;
}

export function createConfigForm(prefix: string): ConfigForm {
  const id = (s: string) => `${prefix}-${s}`;

  const modeInputs = (['fixed', 'random'] as const).map((mode) =>
    h('input', { type: 'radio', name: id('mode'), value: mode, id: id(`mode-${mode}`) }),
  );
  const segmented = h(
    'div',
    { class: 'segmented', role: 'radiogroup', 'aria-label': t('modeLabel') },
    ...modeInputs.map((input) =>
      h(
        'label',
        { for: input.id },
        input,
        h('span', { class: 'segmented-text' }, icon('check'), t(input.value === 'fixed' ? 'modeFixed' : 'modeRandom')),
      ),
    ),
  );

  const fixed = amountField(id('every'), t('fieldEvery'));
  const min = amountField(id('min'), t('fieldMin'));
  const max = amountField(id('max'), t('fieldMax'));
  const randomRows = h('div', { class: 'stack' }, min.el, max.el);
  const intervalError = h('p', { class: 'field-error', id: id('interval-error'), hidden: true });

  const detect = switchRow(id('detect'), t('detectEnabled'));
  const selectorInput = h('input', {
    id: id('selector'),
    type: 'text',
    spellcheck: 'false',
    autocomplete: 'off',
    'aria-describedby': id('selector-hint'),
  });
  const selectorHint = h('p', { class: 'field-hint', id: id('selector-hint') }, t('detectSelectorHint'));
  const selectorError = h('p', { class: 'field-error', id: id('selector-error'), hidden: true }, t('errSelector'));
  const stopOnChange = switchRow(id('stop'), t('detectStop'));
  const detectRows = h(
    'div',
    { class: 'stack' },
    h('label', { class: 'field', for: selectorInput.id }, h('span', { class: 'field-label' }, t('detectSelector')), selectorInput),
    selectorHint,
    selectorError,
    stopOnChange.el,
  );

  const el = h(
    'div',
    { class: 'config-form' },
    h('fieldset', {}, h('legend', {}, t('intervalLegend')), segmented, fixed.el, randomRows, intervalError),
    h('fieldset', {}, h('legend', {}, t('detectLegend')), detect.el, detectRows),
  );

  const mode = () => (modeInputs[1].checked ? 'random' : 'fixed');

  function sync() {
    fixed.el.hidden = mode() !== 'fixed';
    randomRows.hidden = mode() !== 'random';
    detectRows.hidden = !detect.input.checked;
  }

  function interval(): IntervalConfig {
    return mode() === 'fixed'
      ? { mode: 'fixed', seconds: fixed.get() }
      : { mode: 'random', minSeconds: min.get(), maxSeconds: max.get() };
  }

  function peek(): TimerConfig {
    return {
      interval: interval(),
      detect: { enabled: detect.input.checked, selector: selectorInput.value.trim(), stopOnChange: stopOnChange.input.checked },
    };
  }

  function showError(p: HTMLElement, inputs: HTMLInputElement[], message: string | null) {
    p.hidden = message === null;
    if (message !== null) p.textContent = message;
    for (const input of inputs) {
      if (message !== null) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
      const described = (input.getAttribute('aria-describedby') ?? '').split(' ').filter((x) => x && x !== p.id);
      if (message !== null) described.push(p.id);
      input.setAttribute('aria-describedby', described.join(' '));
    }
  }

  function read(): TimerConfig | null {
    const c = peek();
    const intervalErr = validateInterval(c.interval);
    const amountInputs = mode() === 'fixed' ? [fixed.input] : [min.input, max.input];
    showError(intervalError, [fixed.input, min.input, max.input], null);
    showError(intervalError, amountInputs, intervalErr && t(INTERVAL_ERRORS[intervalErr]));

    const selectorOk = !c.detect.enabled || !c.detect.selector || isValidSelector(c.detect.selector);
    showError(selectorError, [selectorInput], selectorOk ? null : t('errSelector'));

    if (intervalErr) amountInputs[0].focus();
    else if (!selectorOk) selectorInput.focus();
    return intervalErr || !selectorOk ? null : c;
  }

  function write(c: TimerConfig) {
    modeInputs[c.interval.mode === 'fixed' ? 0 : 1].checked = true;
    if (c.interval.mode === 'fixed') {
      fixed.set(c.interval.seconds);
      min.set(c.interval.seconds);
      max.set(c.interval.seconds * 2);
    } else {
      min.set(c.interval.minSeconds);
      max.set(c.interval.maxSeconds);
      fixed.set(c.interval.minSeconds);
    }
    detect.input.checked = c.detect.enabled;
    selectorInput.value = c.detect.selector;
    stopOnChange.input.checked = c.detect.stopOnChange;
    showError(intervalError, [fixed.input, min.input, max.input], null);
    showError(selectorError, [selectorInput], null);
    sync();
  }

  const listeners: (() => void)[] = [];
  el.addEventListener('change', () => {
    sync();
    for (const cb of listeners) cb();
  });

  return { el, read, write, peek, onChange: (cb) => listeners.push(cb) };
}
