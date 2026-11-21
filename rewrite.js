(() => {
  if (globalThis.siteLinkRewriterActive) return;
  globalThis.siteLinkRewriterActive = true;

  const selector = "a[href], area[href]";
  const originals = new WeakMap();
  let settings;
  let activeOnPage = false;
  let contextLink;
  let longPress;
  let touchMenu;
  let touchMenuLink;
  let touchMenuDismissHandler;
  let suppressTouchClick;

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

  function closeTouchMenu() {
    if (!touchMenu) return;
    touchMenu.remove();
    touchMenu = null;
    touchMenuLink = null;
    document.removeEventListener("pointerdown", touchMenuDismissHandler, true);
    window.removeEventListener("keydown", onTouchMenuKeydown, true);
    window.removeEventListener("scroll", closeTouchMenu, true);
  }

  function onTouchMenuKeydown(event) {
    if (event.key === "Escape") closeTouchMenu();
  }

  function sendTouchMenuAction(type, url) {
    const navigateToUrl = () => {
      try {
        window.top.location.href = url;
      } catch (error) {
        console.error("Could not navigate to the original link.", error);
      }
    };
    chrome.runtime.sendMessage({ type, url }).then((response) => {
      if (type === "navigate-link" && response?.opened !== true) {
        navigateToUrl();
      } else if (response?.opened !== true) {
        console.error("Could not open the link.");
      }
    }).catch((error) => {
      if (type === "navigate-link") navigateToUrl();
      else console.error("Could not open the link.", error);
    });
  }

  function showTouchMenu(link, x, y) {
    if (!activeOnPage) return false;
    const url = originalUrl(link);
    if (!url) return false;

    rewrite(link);
    const archivedHref = originals.get(link)?.rewrittenHref;
    if (!archivedHref) return false;

    closeTouchMenu();
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `
      :host {
        all: initial;
        color-scheme: light;
        font: 16px/1.4 system-ui, sans-serif;
        position: fixed !important;
        z-index: 2147483647 !important;
        -webkit-tap-highlight-color: transparent;
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
      }
      [role="menu"] {
        box-sizing: border-box;
        width: 224px;
        padding: 6px;
        border: 1px solid #888;
        border-radius: 10px;
        background: #fff;
        color: #111;
        box-shadow: 0 3px 14px #0005;
        -webkit-user-select: none;
        user-select: none;
      }
      [role="menu"] button {
        all: unset;
        box-sizing: border-box;
        display: block;
        width: 100%;
        min-height: 48px;
        padding: 12px;
        border-radius: 6px;
        color: inherit;
        cursor: pointer;
        touch-action: manipulation;
        -webkit-user-select: none;
        user-select: none;
      }
      [role="menu"] button:focus-visible,
      [role="menu"] button:active {
        outline: 2px solid #1769aa;
        background: #e8f1fa;
      }
    `;
    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Choose link destination");

    for (const [label, type, href] of [
      ["Archived link", "open-link", archivedHref],
      ["Original link", "navigate-link", url.href]
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.setAttribute("aria-label", `Open ${label}`);
      button.textContent = label;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeTouchMenu();
        sendTouchMenuAction(type, href);
      });
      menu.append(button);
    }

    shadow.append(style, menu);
    host.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    document.documentElement.append(host);
    const left = Math.max(8, Math.min(x, window.innerWidth - 232));
    const top = Math.max(8, Math.min(y, window.innerHeight - 128));
    host.style.cssText = `left:${left}px;top:${top}px`;
    touchMenu = host;
    touchMenuLink = link;
    touchMenuDismissHandler = (event) => {
      if (!event.composedPath().includes(host)) closeTouchMenu();
    };
    document.addEventListener("pointerdown", touchMenuDismissHandler, true);
    window.addEventListener("keydown", onTouchMenuKeydown, true);
    window.addEventListener("scroll", closeTouchMenu, true);
    suppressTouchClick = { link, expires: Date.now() + 2000 };
    return true;
  }

  function cancelLongPress(event) {
    if (event && longPress && event.pointerId !== longPress.pointerId) return;
    if (longPress) clearTimeout(longPress.timer);
    longPress = null;
  }

  window.addEventListener("pointerdown", (event) => {
    if (!activeOnPage || !event.isTrusted || event.pointerType !== "touch" ||
        !event.isPrimary || event.button !== 0) return;

    if (touchMenu && event.composedPath().includes(touchMenu)) return;
    closeTouchMenu();
    const link = linkFromEvent(event);
    if (!link) return;

    const press = {
      link,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      timer: null
    };
    longPress = press;
    press.timer = setTimeout(() => {
      if (longPress === press && showTouchMenu(link, press.x, press.y)) {
        press.triggered = true;
      }
    }, 550);
  }, { capture: true });

  window.addEventListener("pointermove", (event) => {
    if (!longPress || event.pointerId !== longPress.pointerId) return;
    if (Math.hypot(event.clientX - longPress.x, event.clientY - longPress.y) > 18) {
      cancelLongPress();
    }
  }, { capture: true });

  window.addEventListener("pointerup", (event) => {
    if (!longPress || event.pointerId !== longPress.pointerId) return;
    const triggered = longPress.triggered;
    cancelLongPress();
    if (triggered && suppressTouchClick) suppressTouchClick.expires = Date.now() + 2000;
  }, { capture: true });

  window.addEventListener("pointercancel", cancelLongPress, { capture: true });

  window.addEventListener("contextmenu", (event) => {
    if (!activeOnPage || !event.isTrusted) return;

    contextLink = null;
    const link = linkFromEvent(event);
    const url = link && originalUrl(link);
    if (!url) return;

    const isTouch = event.pointerType === "touch" ||
      longPress?.link === link ||
      touchMenuLink === link;
    if (isTouch) {
      const menuShown = touchMenuLink === link ||
        showTouchMenu(link, event.clientX, event.clientY);
      if (menuShown) {
        if (longPress?.link === link) longPress.triggered = true;
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }

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

    if (suppressTouchClick?.link === link && Date.now() <= suppressTouchClick.expires) {
      suppressTouchClick = null;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

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
    cancelLongPress();
    closeTouchMenu();
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
