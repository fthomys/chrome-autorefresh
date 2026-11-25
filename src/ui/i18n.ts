import { splitSeconds, type IntervalConfig, type TimerConfig } from '../shared/config';

export function t(key: string, subs?: string | string[]): string {
  return chrome.i18n.getMessage(key, subs) || key;
}

export function localize(root: ParentNode = document): void {
  document.documentElement.lang = t('langCode');
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) el.textContent = t(el.dataset.i18n!);
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-aria-label]')) el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel!));
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle!);
}

export function duration(seconds: number): string {
  const { value, unit } = splitSeconds(seconds);
  return t(unit === 'h' ? 'durH' : unit === 'm' ? 'durM' : 'durS', String(value));
}

export function describeInterval(i: IntervalConfig): string {
  return i.mode === 'fixed' ? t('everyDuration', duration(i.seconds)) : t('randomDuration', [duration(i.minSeconds), duration(i.maxSeconds)]);
}

export function describeConfig(c: TimerConfig): string {
  const parts = [describeInterval(c.interval)];
  if (c.detect.enabled) {
    parts.push(c.detect.selector ? t('detectSummarySelector', c.detect.selector) : t('detectSummaryPage'));
    if (c.detect.stopOnChange) parts.push(t('detectSummaryStops'));
  }
  return parts.join(', ');
}

export function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(t('langCode'), { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
