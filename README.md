# Website Blocker

A small Chrome extension (Manifest V3) that blocks distracting websites.
**Reddit is blocked out of the box.**

## Install

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the [`extension`](extension) folder in this repo.
4. Optional: pin it from the puzzle-piece menu for one-click access.

Reddit is blocked as soon as it's installed: `reddit.com` and `redd.it`,
including every subdomain (`www.`, `old.`, `i.redd.it`, ...). Reddit tabs that
are already open switch to the blocked page.

> Extensions don't run in Incognito by default. To block sites there too, open
> the extension's **Details** page and turn on **Allow in Incognito**.

## Use

Click the toolbar icon:

- **Block** next to the current site blocks it.
- Type a domain (or paste any URL) into the box to block another site.
- **✕** next to a site unblocks it. Tabs showing the blocked page for it go back to the site.

Right-click the icon → **Options** opens the same list in a full tab.

Blocking a domain also blocks its subdomains, so `reddit.com` covers
`old.reddit.com`. Embedded content from blocked sites (e.g. Reddit posts embedded
in news articles) is blocked as well.

## How it works

- Blocking uses Chrome's [`declarativeNetRequest`](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)
  rules. Page loads on blocked domains are redirected to `blocked.html` before
  any request is sent, and blocked domains embedded in other pages are dropped.
- The block list lives in `chrome.storage.sync`. Whenever it changes, the
  service worker rebuilds the rules.
- Rules only affect new requests, so when a site is newly blocked the service
  worker also switches over tabs that already have it open. It also catches
  pages restored from the back/forward cache, which skip the network entirely.

| File | Purpose |
| --- | --- |
| `manifest.json` | Extension manifest |
| `background.js` | Service worker: keeps rules in sync, handles open tabs |
| `blocklist.js` | Shared helpers: storage, defaults, domain parsing and matching |
| `popup.html/.css/.js` | Toolbar popup (also used as the options page) |
| `blocked.html/.css/.js` | Page shown in place of a blocked site |
| `icons/` | Toolbar and store icons |

To change the sites blocked on first install, edit `DEFAULT_SITES` in
`blocklist.js`. After editing any file, click the reload icon on the extension's
card in `chrome://extensions`.

## Permissions

| Permission | Why |
| --- | --- |
| `declarativeNetRequest` | The blocking rules |
| Access to all sites | Chrome only lets an extension redirect requests on sites it has access to. It's also needed to see and switch over tabs that already have a blocked site open. |
| `scripting` | Switches an open tab to the blocked page without leaving the blocked site in its back history |
| `storage` | Saves the block list |
| `favicon` | Shows site icons in the list |

Nothing is collected or sent anywhere. If you restrict the extension's site
access in `chrome://extensions`, blocking stops working on the sites it can't access.
