const scriptId = "rewrite-site-links";
const form = document.querySelector("form");
const siteInput = document.querySelector("#site");
const prefixInput = document.querySelector("#prefix");
const preview = document.querySelector("#preview");
const saveButton = document.querySelector("button");
const status = document.querySelector("#status");

function readHostnames(value) {
  const hostnames = value.split(/[,\n]/).map((entry) => entry.trim()).filter(Boolean);
  if (!hostnames.length) throw new Error("Enter at least one hostname.");

  const normalized = hostnames.map((hostname) => {
    if (/[\s:/?#@*\\%]/.test(hostname)) {
      throw new Error(`Enter a hostname without a URL scheme, port, or path: ${hostname}`);
    }
    return new URL(`https://${hostname}`).hostname;
  });
  return [...new Set(normalized)];
}

function readPrefix(value) {
  const prefix = value.trim();
  const url = new URL(prefix);
  if (!/^https?:\/\//i.test(prefix) || url.username || url.password || /[?#]/.test(prefix)) {
    throw new Error("Enter an HTTP or HTTPS prefix without credentials, a query, or a fragment.");
  }
  return url.href.replace(/\/+$/, "") + "/";
}

function updatePreview() {
  try {
    const [site] = readHostnames(siteInput.value || siteInput.placeholder);
    const prefix = readPrefix(prefixInput.value || prefixInput.placeholder);
    preview.textContent = `${prefix}https://${site}/article/`;
  } catch {
    preview.textContent = "";
  }
}

async function loadSettings() {
  try {
    const { settings } = await chrome.storage.local.get("settings");
    if (settings) {
      siteInput.value = (settings.hostnames ?? [settings.hostname]).join("\n");
      prefixInput.value = settings.prefix;
    } else {
      const response = await fetch(chrome.runtime.getURL("defaults.json"));
      if (!response.ok) throw new Error("Could not load defaults.json.");
      const defaults = await response.json();
      if (!Array.isArray(defaults.hostnames) || !defaults.hostnames.every((host) => typeof host === "string") ||
          typeof defaults.prefix !== "string") {
        throw new Error("defaults.json must specify a hostnames array of strings and a prefix string.");
      }
      siteInput.value = defaults.hostnames.join("\n");
      prefixInput.value = defaults.prefix;
    }
    updatePreview();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    saveButton.disabled = false;
  }
}

form.addEventListener("input", updatePreview);
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveButton.disabled = true;
  status.textContent = "";

  try {
    const hostnames = readHostnames(siteInput.value);
    const prefix = readPrefix(prefixInput.value);
    const origins = hostnames.flatMap((hostname) => [
      `http://${hostname}/*`, `https://${hostname}/*`
    ]);
    const granted = await chrome.permissions.request({ origins });
    if (!granted) {
      status.textContent = "Allow access to the sites to save these settings.";
      return;
    }

    const registration = {
      id: scriptId,
      matches: origins,
      js: ["rewrite.js"],
      allFrames: true,
      runAt: "document_start"
    };
    const [previous] = await chrome.scripting.getRegisteredContentScripts({ ids: [scriptId] });
    if (previous) {
      await chrome.scripting.updateContentScripts([registration]);
    } else {
      await chrome.scripting.registerContentScripts([registration]);
    }
    await chrome.storage.local.set({ settings: { hostnames, prefix } });

    const currentOrigins = new Set([...origins, ...hostnames.map((hostname) => `*://${hostname}/*`)]);
    const oldOrigins = (previous?.matches ?? []).filter((origin) =>
      !currentOrigins.has(origin)
    );
    if (oldOrigins.length) {
      await chrome.permissions.remove({ origins: oldOrigins });
    }
    const openTabs = await chrome.tabs.query({ url: origins });
    const injections = await Promise.allSettled(openTabs.map(({ id }) =>
      chrome.scripting.executeScript({ target: { tabId: id }, files: ["rewrite.js"] })
    ));
    const failed = injections.filter(({ status }) => status === "rejected").length;
    if (failed) {
      status.textContent = "Settings saved. Some open tabs could not be updated. Reload those pages.";
    } else if (openTabs.length) {
      status.textContent = "Settings saved and applied to open tabs on the configured sites.";
    } else {
      status.textContent = "Settings saved. Open a page on one of the configured hostnames to try it.";
    }
  } catch (error) {
    status.textContent = error.message;
  } finally {
    saveButton.disabled = false;
  }
});

loadSettings();
