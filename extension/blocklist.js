// Shared helpers for reading, editing and matching the block list.
// Used by the service worker, the popup and the blocked page.

export const STORAGE_KEY = "blockedSites";

// Blocked out of the box. redd.it hosts Reddit's short links and media
// (i.redd.it, v.redd.it), so it's blocked alongside reddit.com.
export const DEFAULT_SITES = Object.freeze(["reddit.com", "redd.it"]);

const LABEL_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/** True for lowercase ASCII hostnames with at least two labels, e.g. "reddit.com". */
export function isValidHostname(host) {
  return (
    typeof host === "string" &&
    host.length <= 253 &&
    host.includes(".") &&
    host.split(".").every((label) => LABEL_RE.test(label))
  );
}

/**
 * Turns user input such as "Reddit.com", "https://www.reddit.com/r/all" or
 * "*.reddit.com" into a bare hostname ("reddit.com"). Returns null if the input
 * isn't a usable domain.
 */
export function normalizeSite(input) {
  let value = String(input ?? "").trim().toLowerCase().replace(/^\*\./, "");
  if (!value) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(value)) value = `http://${value}`;

  let host;
  try {
    host = new URL(value).hostname; // Also converts international domains to punycode.
  } catch {
    return null;
  }
  host = host.replace(/\.$/, "");
  if (host.startsWith("www.") && host.slice(4).includes(".")) host = host.slice(4);
  return isValidHostname(host) ? host : null;
}

/** Returns the entry in `sites` that blocks `host` (the host itself or a parent domain), or null. */
export function findBlockingEntry(host, sites) {
  const h = String(host).toLowerCase().replace(/\.$/, "");
  return sites.find((site) => h === site || h.endsWith(`.${site}`)) ?? null;
}

/** True if `url` is an http(s) page on a blocked site. */
export function isBlockedUrl(url, sites) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  return findBlockingEntry(parsed.hostname, sites) !== null;
}

function cleanList(list) {
  return [...new Set(list.filter(isValidHostname))].sort();
}

/** Converts the stored value into a site list. Nothing stored yet means the defaults. */
export function sitesFromStorage(value) {
  if (value === undefined) return cleanList(DEFAULT_SITES);
  return Array.isArray(value) ? cleanList(value) : [];
}

export async function getBlockedSites() {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  return sitesFromStorage(stored[STORAGE_KEY]);
}

export async function setBlockedSites(sites) {
  await chrome.storage.sync.set({ [STORAGE_KEY]: cleanList(sites) });
}

let editQueue = Promise.resolve();

/** Read-modify-write of the block list. Edits are queued so quick successive ones can't clobber each other. */
export function editBlockedSites(edit) {
  const result = editQueue.then(async () => setBlockedSites(edit(await getBlockedSites())));
  editQueue = result.catch(() => {});
  return result;
}

/** URL of the page shown in place of blocked sites. */
export function getBlockedPageUrl() {
  return chrome.runtime.getURL("blocked.html");
}

/** If `url` is the blocked page, returns the address it's standing in for; otherwise null. */
export function originalUrlFromBlockedPage(url) {
  const prefix = `${getBlockedPageUrl()}#`;
  return url.startsWith(prefix) ? url.slice(prefix.length) : null;
}
