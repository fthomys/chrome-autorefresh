import type { TimerConfig } from './config';

export type Request =
  | { type: 'start'; tabId: number; config: TimerConfig; url: string | null; title: string | null }
  | { type: 'stop'; tabId: number }
  | { type: 'focusTab'; tabId: number };

export type Response = { ok: true } | { ok: false; error: string };

export async function send(req: Request): Promise<Response> {
  try {
    const res = (await chrome.runtime.sendMessage(req)) as Response | undefined;
    return res ?? { ok: false, error: 'noResponse' };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
