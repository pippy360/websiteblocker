import { STORAGE_KEY, getBlockedPageUrl, getBlockedSites, isBlockedUrl } from "./blocklist.js";

const REDIRECT_RULE_ID = 1;
const EMBED_RULE_ID = 2;

chrome.runtime.onInstalled.addListener(() => syncRules());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && STORAGE_KEY in changes) syncRules();
});

// Safety net for pages that load without a network request the rules can see,
// e.g. pages restored from the back/forward cache.
chrome.tabs.onUpdated.addListener(async (tabId, { url }) => {
  if (url && isBlockedUrl(url, await getBlockedSites())) await showBlockedPage(tabId, url);
});

let syncing = Promise.resolve();

/** Rebuilds the blocking rules from storage. Runs are queued so they apply in order. */
function syncRules() {
  syncing = syncing
    .then(applyRules)
    .catch((error) => console.error("Website Blocker: couldn't update rules", error));
  return syncing;
}

async function applyRules() {
  const sites = await getBlockedSites();
  const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: oldRules.map((rule) => rule.id),
    addRules: sites.length ? buildRules(sites) : [],
  });

  // Rules only apply to new requests, so also switch over tabs that already
  // have a newly blocked site open.
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs
      .filter((tab) => tab.url && isBlockedUrl(tab.url, sites))
      .map((tab) => showBlockedPage(tab.id, tab.url)),
  );

  // Tell open blocked pages, so they can reload their site if it was unblocked.
  chrome.runtime.sendMessage({ type: "rules-updated" }).catch(() => {});
}

function buildRules(sites) {
  return [
    {
      // Show the blocked page instead of the site. \0 is the full original URL,
      // passed along in the hash so the page can say what was blocked.
      id: REDIRECT_RULE_ID,
      priority: 1,
      action: {
        type: "redirect",
        redirect: { regexSubstitution: `${getBlockedPageUrl()}#\\0` },
      },
      condition: { regexFilter: "^.+$", requestDomains: sites, resourceTypes: ["main_frame"] },
    },
    {
      // Blocked sites embedded in other pages (e.g. embedded Reddit posts).
      id: EMBED_RULE_ID,
      priority: 1,
      action: { type: "block" },
      condition: { requestDomains: sites, resourceTypes: ["sub_frame"] },
    },
  ];
}

/**
 * Replaces a tab's blocked site with the blocked page. Uses location.replace so
 * the blocked site's history entry is overwritten and Back doesn't return to it.
 */
async function showBlockedPage(tabId, url) {
  const blockedPage = `${getBlockedPageUrl()}#${url}`;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (target) => location.replace(target),
      args: [blockedPage],
      injectImmediately: true,
    });
  } catch {
    // Some tabs can't be scripted (e.g. error pages, discarded tabs), so navigate them instead.
    await chrome.tabs.update(tabId, { url: blockedPage }).catch(() => {});
  }
}
