import add from '@material-symbols/svg-400/rounded/add.svg?raw';
import check from '@material-symbols/svg-400/rounded/check.svg?raw';
import del from '@material-symbols/svg-400/rounded/delete.svg?raw';
import edit from '@material-symbols/svg-400/rounded/edit.svg?raw';
import error from '@material-symbols/svg-400/rounded/error.svg?raw';
import info from '@material-symbols/svg-400/rounded/info.svg?raw';
import settings from '@material-symbols/svg-400/rounded/settings.svg?raw';
import warning from '@material-symbols/svg-400/rounded/warning.svg?raw';
import notifications from '@material-symbols/svg-400/rounded/notifications.svg?raw';

const ICONS = { add, check, delete: del, edit, error, info, settings, warning, notifications };
export type IconName = keyof typeof ICONS;

export function icon(name: IconName): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'icon';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = ICONS[name];
  return span;
}

type Attrs = Record<string, string | number | boolean | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

export type NoticeTone = 'info' | 'warning' | 'error' | 'change';

const TONE_ICON: Record<NoticeTone, IconName> = { info: 'info', warning: 'warning', error: 'error', change: 'notifications' };

export function notice(tone: NoticeTone, text: string, action?: HTMLElement): HTMLDivElement {
  return h('div', { class: `notice notice-${tone}` }, icon(TONE_ICON[tone]), h('p', {}, text), action);
}
