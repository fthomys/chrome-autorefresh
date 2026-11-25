// These run inside the page via chrome.scripting.executeScript, which serializes
// the function source. They must stay self-contained: no imports, no outer variables.
// All calls share the extension's isolated world, so state on `window` persists between them.

type EditWindow = { __autorefreshEdits?: Map<Element, string> };

/**
 * Remembers fields the user really typed into. Pages that fill in values by script
 * (tracking numbers, search boxes) don't fire trusted input events, so they don't count.
 */
export function watchInput(): void {
  const w = window as unknown as EditWindow;
  if (w.__autorefreshEdits) return;
  const edits = new Map<Element, string>();
  const originals = new Map<Element, string>();
  w.__autorefreshEdits = edits;

  const valueOf = (el: Element): string | null => {
    if (el instanceof HTMLInputElement) return el.type === 'checkbox' || el.type === 'radio' ? String(el.checked) : el.value;
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return el.value;
    if (el instanceof HTMLElement && el.isContentEditable) return el.textContent ?? '';
    return null;
  };
  const target = (e: Event) => e.composedPath()[0] as Element;

  // The timer may start after the user already typed into the focused field.
  const focused = document.activeElement;
  if (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement) {
    if (focused.value !== focused.defaultValue) edits.set(focused, focused.defaultValue);
  }

  document.addEventListener(
    'focusin',
    (e) => {
      const el = target(e);
      const v = e.isTrusted ? valueOf(el) : null;
      if (v !== null && !originals.has(el)) originals.set(el, v);
    },
    true,
  );
  const onEdit = (e: Event) => {
    const el = target(e);
    if (!e.isTrusted || edits.has(el)) return;
    const original = originals.get(el);
    if (original !== undefined) edits.set(el, original);
  };
  document.addEventListener('input', onEdit, true);
  document.addEventListener('change', onEdit, true);
  document.addEventListener(
    'submit',
    (e) => {
      for (const el of [...edits.keys()]) if ((e.target as Element).contains(el)) edits.delete(el);
    },
    true,
  );
}

/** True when a field the user edited still differs from its value before editing. */
export function hasUnsavedInput(): boolean {
  const edits = (window as unknown as EditWindow).__autorefreshEdits;
  if (!edits) return false;
  for (const [el, original] of edits) {
    if (!el.isConnected) continue;
    let now: string;
    if (el instanceof HTMLInputElement) now = el.type === 'checkbox' || el.type === 'radio' ? String(el.checked) : el.value;
    else if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) now = el.value;
    else now = el.textContent ?? '';
    if (now !== original) return true;
  }
  return false;
}

export type Snapshot = { found: true; hash: string } | { found: false };

// Not crypto.subtle: it's missing on plain http pages.
export function snapshotPage(selector: string): Snapshot {
  let el: Element | null;
  try {
    el = selector ? document.querySelector(selector) : document.body;
  } catch {
    return { found: false };
  }
  if (!el) return { found: false };
  const text = ((el as HTMLElement).innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return { found: true, hash: `${(h2 >>> 0).toString(16)}${(h1 >>> 0).toString(16)}:${text.length}` };
}
