// Clicking the toolbar icon opens the side panel (sidepanel.html) beside the page in the active tab.
// Its "Open full view" button opens the dashboard in a tab: crawling runs there, as a full extension
// page, so long crawls aren't cut off the way they would be in an idle service worker.

const panelOnClick = async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (err) {
    console.error("Side panel unavailable", err);
  }
};
chrome.runtime.onInstalled.addListener(() => void panelOnClick());
chrome.runtime.onStartup.addListener(() => void panelOnClick());
void panelOnClick();

// Fires only if the click didn't open the panel (behavior not yet set, or a browser without side panels).
chrome.action.onClicked.addListener(async (tab) => {
  if (chrome.sidePanel?.open && tab.windowId !== undefined) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      return;
    } catch {
      /* fall through */
    }
  }
  const params = new URLSearchParams();
  if (tab.id !== undefined) params.set("tabId", String(tab.id));
  if (tab.url && /^https?:/.test(tab.url)) params.set("url", tab.url);
  await chrome.tabs.create({ url: chrome.runtime.getURL(`dashboard.html?${params}`), index: (tab.index ?? 0) + 1 });
});
