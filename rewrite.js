(() => {
  if (globalThis.siteLinkRewriterActive) return;
  globalThis.siteLinkRewriterActive = true;

  const selector = "a[href], area[href]";
  const originals = new WeakMap();
  let settings;
  let activeOnPage = false;
  let contextLink;

  function rewrite(link) {
    const currentHref = link.getAttribute("href");
    const currentTarget = link.getAttribute("target");
    const previous = originals.get(link);
    let href = previous && currentHref === previous.rewrittenHref
      ? previous.href
      : currentHref;
    const target = previous && currentTarget === "_blank" ? previous.target : currentTarget;
    let rewrittenHref;

    if (activeOnPage && href !== null) {
      try {
        // A tab may contain links rewritten by an earlier script instance.
        while (href.startsWith(settings.prefix) &&
               /^https?:\/\//i.test(href.slice(settings.prefix.length))) {
          href = href.slice(settings.prefix.length);
        }
        const url = new URL(href, link.baseURI);
        if (url.protocol === "https:" || url.protocol === "http:") {
          url.search = "";
          rewrittenHref = settings.prefix + url.href;
        }
      } catch {
        // An invalid link has no destination to rewrite.
      }
    }

    if (rewrittenHref) {
      originals.set(link, { href, target, rewrittenHref });
      if (currentHref !== rewrittenHref) link.setAttribute("href", rewrittenHref);
      if (currentTarget !== "_blank") link.setAttribute("target", "_blank");
    } else if (previous) {
      originals.delete(link);
      if (currentHref !== href) link.setAttribute("href", href);
      if (currentTarget !== target) {
        if (target === null) link.removeAttribute("target");
        else link.setAttribute("target", target);
      }
    }
  }

  function linkFromEvent(event) {
    return event.composedPath().find((node) => node.matches?.(selector));
  }

  function originalUrl(link) {
    const currentHref = link.getAttribute("href");
    const original = originals.get(link);
    const href = original && original.rewrittenHref === currentHref ? original.href : currentHref;
    try {
      const url = new URL(href, link.baseURI);
      if (url.protocol === "https:" || url.protocol === "http:") return url;
    } catch {
      // The link has no usable web destination.
    }
  }

  window.addEventListener("contextmenu", (event) => {
    if (!activeOnPage || !event.isTrusted) return;

    contextLink = null;
    const link = linkFromEvent(event);
    const url = link && originalUrl(link);
    if (!url) return;

    contextLink = { linkUrl: link.href, originalHref: url.href };
  }, { capture: true });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "get-context-link" && activeOnPage &&
        contextLink && contextLink.linkUrl === message.linkUrl) {
      sendResponse(contextLink);
    }
  });

  window.addEventListener("click", (event) => {
    if (!activeOnPage || !event.isTrusted || event.button !== 0) return;

    const link = linkFromEvent(event);
    if (!link) return;

    // Preserve native behavior for other modifier keys.
    if (!event.shiftKey && (event.altKey || event.ctrlKey || event.metaKey)) return;

    if (!event.shiftKey) rewrite(link);
    const href = event.shiftKey ? originalUrl(link)?.href : originals.get(link)?.rewrittenHref;
    if (!href) return;

    // A site's click handler may navigate using its own copy of the original URL.
    event.preventDefault();
    event.stopImmediatePropagation();
    chrome.runtime.sendMessage({ type: "open-link", url: href }).catch((error) => {
      console.error("Could not open the link.", error);
    });
  }, { capture: true });

  function scan(root) {
    if (root.matches?.(selector)) rewrite(root);
    root.querySelectorAll?.(selector).forEach(rewrite);
  }

  function configure(value) {
    settings = value;
    contextLink = null;
    activeOnPage = (settings?.hostnames ?? [settings?.hostname]).includes(location.hostname);
    scan(document);
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") {
        if (record.target.matches(selector) || originals.has(record.target)) rewrite(record.target);
      } else {
        record.addedNodes.forEach(scan);
      }
    }
  });
  observer.observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["href", "target"]
  });

  let settingsChanged = false;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings) {
      settingsChanged = true;
      configure(changes.settings.newValue);
    }
  });
  chrome.storage.local.get("settings").then((result) => {
    if (!settingsChanged) configure(result.settings);
  });
})();
