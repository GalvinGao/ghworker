// Chrome treats `word/path` typed in the omnibox as a URL (http://word/path), so `t/repo#123`
// never reaches the search engine. When such a single-label host fails to resolve, hand the
// whole input to ghworker instead. Hosts that do resolve (intranet, tailnet) are untouched.

const ENDPOINT = "https://ghworker.galvin.workers.dev/?q=";

chrome.webNavigation.onErrorOccurred.addListener(({ tabId, frameId, url, error }) => {
  if (frameId !== 0 || error !== "net::ERR_NAME_NOT_RESOLVED") return;
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol) || u.port || u.hostname.includes(".") || u.pathname === "/") return;
  const q = u.hostname + safeDecode(u.pathname) + u.search + u.hash;
  chrome.tabs.update(tabId, { url: ENDPOINT + encodeURIComponent(q) });
});

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
