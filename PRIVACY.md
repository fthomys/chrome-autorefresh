# Privacy Policy for Autorefresh

Last updated: November 25, 2026

Autorefresh is a Chrome extension that reloads tabs on a timer and can tell you when a page changes. It does not collect, sell or share any personal data, and it makes no network requests of its own.

## What Autorefresh stores

All data stays in your browser.

- **Settings and rules:** your default interval, URL patterns and CSS selectors are saved with `chrome.storage.sync`. If Chrome Sync is turned on, Google syncs them between your browsers as part of your Google account. Autorefresh has no server and never receives them.
- **Running timers:** for each tab that is reloading, Autorefresh keeps the tab's ID, its URL and title, the time of the next reload, and a fingerprint (a hash) of the content it watches. These are saved with `chrome.storage.session` and are deleted when you close the browser.

## What Autorefresh reads on web pages

Only on sites you gave access to, and only for two things:

1. Before a reload, it checks whether a form on the page contains text you typed, so it can skip the reload and you don't lose your input.
2. After a reload, if change detection is on, it computes a hash of the page's text (or of the element you chose) and compares it with the previous one.

The page text itself is not stored and not sent anywhere. Only the hash is kept, as described above.

## Permissions

- `storage`: saves settings, rules and running timers.
- `alarms`: schedules the next reload.
- `activeTab`: lets you start a timer on the current tab from the popup.
- `scripting`: runs the two checks described above.
- `notifications`: tells you when a watched page changed.
- Site access: optional, requested per site when you allow it in the popup or save a rule.

## Deleting your data

Stop a timer or close its tab to remove its data. Delete rules in the extension's settings. Removing the extension deletes everything it stored.

## Changes

If this policy changes, the new version will be published at this address with a new date.

## Contact

post@fthomys.me
