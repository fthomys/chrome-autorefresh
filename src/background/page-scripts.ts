// These run inside the page via chrome.scripting.executeScript, which serializes
// the function source. They must stay self-contained: no imports, no outer variables.

export function hasUnsavedInput(): boolean {
  // A focused but empty field (autofocused search boxes) is not typing; edited values are.
  if ((document.activeElement as HTMLElement | null)?.isContentEditable) return true;
  for (const el of Array.from(document.querySelectorAll('input, textarea, select'))) {
    if (el instanceof HTMLInputElement) {
      if (el.type === 'checkbox' || el.type === 'radio') {
        if (el.checked !== el.defaultChecked) return true;
      } else if (el.type !== 'hidden' && el.type !== 'file' && el.value !== el.defaultValue) {
        return true;
      }
    } else if (el instanceof HTMLTextAreaElement) {
      if (el.value !== el.defaultValue) return true;
    } else if (el instanceof HTMLSelectElement) {
      if (Array.from(el.options).some((o) => o.selected !== o.defaultSelected)) return true;
    }
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
