# Autorefresh

Chrome extension (Manifest V3) that reloads tabs on a timer, skips the reload while a page has unsaved input, and notifies you when a page changes.

## Develop

```sh
npm install
npm run build      # type-check and build into dist/
npm run watch      # rebuild on change
npm test           # unit tests for interval, pattern and formatting logic
npm run zip        # build and pack autorefresh-<version>.zip for the Web Store
```

Load `dist/` via `chrome://extensions` with Developer mode on, then "Load unpacked".

## Notes

- Colors come from one seed in `scripts/tokens.mjs`. Run `npm run tokens` after changing it.
- `public/icons/` holds PNG renders of `design/icon.svg` at 16, 32, 48 and 128px. Re-render them after changing the SVG.
- Only `public/_locales/en/messages.json` is edited by hand. Other languages come from Crowdin.
- Intervals under 30 seconds run on a `setTimeout` in the service worker, with a `chrome.alarms` backstop, because alarms don't fire sooner than 30s.
- The privacy policy is `PRIVACY.md`.
- Bump `version` in both `package.json` and `public/manifest.json` before each upload; `npm run zip` refuses mismatched versions.

## Disclaimer

This project was built with the help of AI (Anthropic's Claude).
