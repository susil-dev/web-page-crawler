// Clicking the toolbar icon opens the dashboard in a new tab, pointed at the current page.
// The dashboard (a full extension page) does the crawling, so long crawls are not cut off
// the way they would be in a popup or an idle service worker.
chrome.action.onClicked.addListener(async (tab) => {
  const params = new URLSearchParams();
  if (tab.id !== undefined) params.set("tabId", String(tab.id));
  if (tab.url) params.set("url", tab.url);
  await chrome.tabs.create({
    url: chrome.runtime.getURL(`dashboard.html?${params}`),
    index: (tab.index ?? 0) + 1,
  });
});
