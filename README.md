# Autorefresh

Chrome extension (Manifest V3) that reloads tabs on a timer, skips the reload while a page has unsaved input, and notifies you when a page changes.

## Develop

```sh
npm install
npm run build      # type-check and build into dist/
npm run watch      # rebuild on change
npm test           # unit tests for interval, pattern and formatting logic
```

Load `dist/` via `chrome://extensions` with Developer mode on, then "Load unpacked".

## Notes

- Colors come from one seed in `scripts/tokens.mjs`. Run `npm run tokens` after changing it.
- The icons in `public/icons/` are placeholders (grey square with an X). Replace them before publishing.
- Only `public/_locales/en/messages.json` is edited by hand. Other languages come from Crowdin.
- Intervals under 30 seconds run on a `setTimeout` in the service worker, with a `chrome.alarms` backstop, because alarms don't fire sooner than 30s.
