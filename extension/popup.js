import {
  STORAGE_KEY,
  editBlockedSites,
  findBlockingEntry,
  getBlockedSites,
  normalizeSite,
  originalUrlFromBlockedPage,
  sitesFromStorage,
} from "./blocklist.js";

const ui = {
  current: document.getElementById("current"),
  currentIcon: document.getElementById("current-icon"),
  currentHost: document.getElementById("current-host"),
  blockCurrent: document.getElementById("block-current"),
  currentStatus: document.getElementById("current-status"),
  form: document.getElementById("add-form"),
  input: document.getElementById("site-input"),
  message: document.getElementById("message"),
  count: document.getElementById("count"),
  list: document.getElementById("site-list"),
  empty: document.getElementById("empty"),
  template: document.getElementById("site-template"),
};

let sites = [];
let currentHost = null;
let messageTimer;

ui.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!ui.input.value.trim()) return;
  if (await addSite(ui.input.value)) ui.input.value = "";
  ui.input.focus();
});

ui.blockCurrent.addEventListener("click", () => addSite(currentHost));

// Keeps the list current, whether the change came from here, another window or sync.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !(STORAGE_KEY in changes)) return;
  sites = sitesFromStorage(changes[STORAGE_KEY].newValue);
  render();
});

const [ownTab, initialSites, host] = await Promise.all([
  chrome.tabs.getCurrent(),
  getBlockedSites(),
  getCurrentHost(),
]);
// getCurrent() only returns a tab when we're open as the options page, not the popup.
if (ownTab) document.documentElement.classList.add("in-tab");
sites = initialSites;
currentHost = host;
render();

/** Hostname of the active tab's site, or null for pages that can't be blocked. */
async function getCurrentHost() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return null;
  // On the blocked page, show the site it's standing in for.
  const url = originalUrlFromBlockedPage(tab.url) ?? tab.url;
  return /^https?:\/\//i.test(url) ? normalizeSite(url) : null;
}

function render() {
  if (currentHost) {
    const blocked = findBlockingEntry(currentHost, sites) !== null;
    ui.currentHost.textContent = currentHost;
    ui.currentIcon.src = faviconUrl(currentHost);
    ui.blockCurrent.hidden = blocked;
    ui.currentStatus.hidden = !blocked;
    ui.current.hidden = false;
  }
  ui.count.textContent = sites.length ? `(${sites.length})` : "";
  ui.list.replaceChildren(...sites.map(renderSite));
  ui.list.hidden = sites.length === 0;
  ui.empty.hidden = sites.length > 0;
}

function renderSite(site) {
  const item = ui.template.content.firstElementChild.cloneNode(true);
  item.querySelector(".favicon").src = faviconUrl(site);
  item.querySelector(".host").textContent = site;
  const remove = item.querySelector(".remove");
  remove.title = `Unblock ${site}`;
  remove.setAttribute("aria-label", `Unblock ${site}`);
  remove.addEventListener("click", () => removeSite(site));
  return item;
}

async function addSite(input) {
  const site = normalizeSite(input);
  if (!site) {
    showMessage("Enter a valid domain, like example.com", "error");
    return false;
  }
  const blockedBy = findBlockingEntry(site, sites);
  if (blockedBy) {
    showMessage(blockedBy === site ? `${site} is already blocked` : `${site} is already blocked by ${blockedBy}`);
    return false;
  }
  try {
    await editBlockedSites((list) => [...list, site]);
  } catch (error) {
    showMessage(`Couldn't save: ${error.message}`, "error");
    return false;
  }
  showMessage(`Blocked ${site}`, "success");
  return true;
}

async function removeSite(site) {
  try {
    await editBlockedSites((list) => list.filter((entry) => entry !== site));
    showMessage(`Unblocked ${site}`, "success");
  } catch (error) {
    showMessage(`Couldn't save: ${error.message}`, "error");
  }
}

function showMessage(text, kind = "info") {
  ui.message.textContent = text;
  ui.message.dataset.kind = kind;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => {
    ui.message.textContent = "";
  }, 4000);
}

/** Chrome's cached favicon for a site (needs the "favicon" permission). */
function faviconUrl(site) {
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", `https://${site}`);
  url.searchParams.set("size", "32");
  return url.href;
}
