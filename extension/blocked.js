import { getBlockedSites, isBlockedUrl } from "./blocklist.js";

// The redirect rule passes the original address in the hash: blocked.html#https://...
const blockedUrl = location.hash.slice(1);
const host = parseHost(blockedUrl);
const displayHost = host.replace(/^www\./, "");

const ui = {
  title: document.getElementById("title"),
  host: document.getElementById("host"),
  lead: document.getElementById("lead"),
  back: document.getElementById("back"),
  proceed: document.getElementById("continue"),
};

if (displayHost) {
  document.title = `Blocked: ${displayHost}`;
  ui.host.textContent = displayHost;
  ui.host.hidden = false;
}

const canGoBack = history.length > 1;
ui.back.textContent = canGoBack ? "Go back" : "Close tab";
ui.back.addEventListener("click", async () => {
  if (canGoBack) {
    history.back();
    return;
  }
  const tab = await chrome.tabs.getCurrent();
  if (tab) chrome.tabs.remove(tab.id);
});

// The service worker sends this after it updates the rules. If our site was
// unblocked meanwhile, take the user back to the page they were trying to open.
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "rules-updated" || !host) return;
  isStillBlocked().then((blocked) => {
    if (!blocked) location.replace(blockedUrl);
  });
});

// Opened after the site was already unblocked (e.g. a restored tab): offer a
// way through instead of claiming it's still blocked.
if (host && !(await isStillBlocked())) {
  document.title = displayHost;
  ui.title.textContent = "This site is no longer blocked";
  ui.lead.textContent = "It has been removed from your block list.";
  ui.proceed.textContent = `Continue to ${displayHost}`;
  ui.proceed.href = blockedUrl;
  ui.proceed.hidden = false;
  ui.back.hidden = true;
}

async function isStillBlocked() {
  return isBlockedUrl(blockedUrl, await getBlockedSites());
}

/** Hostname of an http(s) URL, or "" for anything else. */
function parseHost(url) {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "http:" || protocol === "https:" ? hostname : "";
  } catch {
    return "";
  }
}
