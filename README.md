# Site Link Rewriter

A Manifest V3 extension for Brave and Chrome. It rewrites HTTP and HTTPS links on pages served by the hostnames you configure. It strips the query string, keeps any fragment, puts your configured URL prefix before the cleaned destination, and sets the link to open in a new tab.

On a configured site, hold **Shift** while clicking a web link to open its original destination in a new tab in the same window, including any query parameters.

Right-click or long-press a web link on a configured site and choose **Open Archived link** to open the rewritten destination in a new tab, or **Open Original link** to open the original destination in the current tab, including any query parameters.

Use `https://archive.is/newest/` as the URL prefix to open the newest available Archive.is snapshot. If there is no snapshot, Archive.is shows its results page. For an existing installation using `https://archive.is/`, update the prefix in the extension settings and save.

## Package your defaults

Edit `defaults.json` in the extension folder before installing or sharing it. List each exact hostname and set the URL prefix to use for all of them.

```json
{
  "hostnames": ["www.washingtonpost.com", "news.example.org"],
  "prefix": "https://example.com"
}
```

Keep `defaults.json` next to `manifest.json`. Run `python3 package_plugin.py` to create or overwrite `packaged bookmark/site-link.zip`. The archive contains only the extension files listed by the packager, not source-control data or workspace files. The recipient can unzip it and follow the installation steps below. The packaged values prefill the settings on first use. Click **Save settings** and grant access to activate rewriting. Existing installations use their saved settings.

## Install and configure

1. Open `brave://extensions` in Brave or `chrome://extensions` in Chrome.
2. Turn on **Developer mode**, select **Load unpacked**, and choose the folder containing `manifest.json`.
3. Open **Site Link Rewriter** from the extensions menu, or open **Details → Extension options** on the extensions page.
4. Enter or review the exact hostnames of the pages to rewrite, one per line or separated by commas. Enter or review the shared URL prefix. Click **Save settings** and grant access to those hosts.
5. The extension applies settings to open tabs when you save. If a tab cannot be updated immediately, reload that page. If you previously loaded the extension, click **Reload** on its card in the Extensions page to pick up the new files, then save the settings again.

For example, `https://www.washingtonpost.com/dc-md-va/2026/11/13/spanberger-reverse-decision-participate-trumps-school-vouchers/?x1b=123` becomes `https://example.com/https://www.washingtonpost.com/dc-md-va/2026/11/13/spanberger-reverse-decision-participate-trumps-school-vouchers/`.

The hostname applies to the page containing the links. Relative links are resolved against the page before rewriting, and links to other sites on that page are also rewritten. The extension handles links added or updated after the page loads. It operates on ordinary HTML links and image-map links, including inside frames served by the configured hostname. The prefix destination needs to accept the cleaned URL in its path for the resulting link to work.
