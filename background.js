chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

const linkActions = {
  "context-open-archived": "Open Archived link",
  "context-open-original": "Open Original link"
};

let menuUpdate = Promise.resolve();

function updateLinkMenus() {
  menuUpdate = menuUpdate.then(async () => {
    const { settings } = await chrome.storage.local.get("settings");
    const hostnames = settings?.hostnames ?? (settings?.hostname ? [settings.hostname] : []);
    await chrome.contextMenus.removeAll();
    if (!hostnames.length) return;

    const documentUrlPatterns = hostnames.map((hostname) => `*://${hostname}/*`);
    for (const [id, title] of Object.entries(linkActions)) {
      await new Promise((resolve, reject) => {
        chrome.contextMenus.create({
          id,
          title,
          contexts: ["link"],
          documentUrlPatterns,
          targetUrlPatterns: ["*://*/*"]
        }, () => {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error(error.message));
          else resolve();
        });
      });
    }
  }).catch((error) => console.error("Could not update the link menu.", error));
}

async function restoreLinkScript() {
  const id = "rewrite-site-links";
  const [registered] = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
  if (registered) return;

  const { settings } = await chrome.storage.local.get("settings");
  const hostnames = settings?.hostnames ?? (settings?.hostname ? [settings.hostname] : []);
  const origins = hostnames.flatMap((hostname) => [
    `http://${hostname}/*`, `https://${hostname}/*`
  ]);
  const checks = await Promise.all(origins.map((origin) =>
    chrome.permissions.contains({ origins: [origin] })
  ));
  const matches = origins.filter((origin, index) => checks[index]);
  if (!matches.length) return;

  await chrome.scripting.registerContentScripts([{
    id,
    matches,
    js: ["rewrite.js"],
    allFrames: true,
    runAt: "document_start"
  }]);
}

function initialize() {
  updateLinkMenus();
  restoreLinkScript().catch((error) => console.error("Could not restore link rewriting.", error));
}

chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(initialize);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) updateLinkMenus();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!Object.hasOwn(linkActions, info.menuItemId) || tab?.id == null || !info.linkUrl) return;

  try {
    if (info.menuItemId === "context-open-archived") {
      const { settings } = await chrome.storage.local.get("settings");
      if (!settings?.prefix) return;
      let href = info.linkUrl;
      while (href.startsWith(settings.prefix) &&
             /^https?:\/\//i.test(href.slice(settings.prefix.length))) {
        href = href.slice(settings.prefix.length);
      }
      const url = new URL(href);
      if (url.protocol !== "https:" && url.protocol !== "http:") return;
      url.search = "";
      await chrome.tabs.create({ url: settings.prefix + url.href, windowId: tab.windowId });
      return;
    }

    const link = await chrome.tabs.sendMessage(tab.id, {
      type: "get-context-link",
      linkUrl: info.linkUrl
    }, { frameId: info.frameId ?? 0 });
    if (link?.originalHref) {
      await chrome.tabs.update(tab.id, { url: link.originalHref });
    }
  } catch (error) {
    console.error("Could not open the link from the context menu.", error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if ((message?.type !== "open-link" && message?.type !== "open-original-link" &&
       message?.type !== "navigate-link") ||
      sender.tab?.id == null || typeof message.url !== "string") return;

  let url;
  try {
    url = new URL(message.url);
  } catch {
    return;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return;

  const action = message.type === "navigate-link"
    ? chrome.tabs.update(sender.tab.id, { url: url.href })
    : chrome.tabs.create({ url: url.href, windowId: sender.tab.windowId });
  action.then(
    () => sendResponse({ opened: true }),
    (error) => {
      console.error("Could not open the link.", error);
      sendResponse({ opened: false });
    }
  );
  return true;
});
