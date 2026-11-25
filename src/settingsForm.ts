// The Settings form, shown as the Settings tab in both the full view and the side panel.

import { testConnection } from "./notion";
import { LOAD_MODES, MAX_DEPTH, MODELS, TITLE_SOURCES, loadSettings, saveSettings, type LoadMode, type Settings, type TitleSource } from "./settings";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const options = (list: { id: string; label: string }[], current: string) =>
  list.map((m) => `<option value="${m.id}" ${m.id === current ? "selected" : ""}>${esc(m.label)}</option>`).join("");

function formHtml(s: Settings): string {
  return `<form class="settings" novalidate>
  <section class="settings-group">
    <h2>Claude summaries</h2>
    <label>Anthropic API key
      <input name="apiKey" type="password" autocomplete="off" placeholder="sk-ant-…" value="${esc(s.apiKey)}">
      <small>Stored only in this browser's extension storage; sent only to api.anthropic.com. Get one at console.anthropic.com.</small>
    </label>
    <label>Summary model <select name="model">${options(MODELS, s.model)}</select></label>
  </section>

  <section class="settings-group">
    <h2>Crawling</h2>
    <label>Max pages per crawl <input name="maxPages" type="number" min="1" max="500" value="${s.maxPages}"></label>
    <label>Pages fetched in parallel <input name="concurrency" type="number" min="1" max="10" value="${s.concurrency}">
      <small>Keep this low to be polite to the sites you crawl.</small></label>
    <label class="check"><input name="sameDomainOnly" type="checkbox" ${s.sameDomainOnly ? "checked" : ""}> Show only same-domain links by default</label>
    <label>Default crawl depth <input name="maxDepth" type="number" min="1" max="${MAX_DEPTH}" value="${s.maxDepth}">
      <small>Link hops from the starting page. 1 = only the links on that page; 2 = also the links on those pages. You can change it per crawl on the Crawl tab.</small></label>
    <label>Name pages by <select name="titleSource">${options(TITLE_SOURCES, s.titleSource)}</select>
      <small>Used in the tree, the library and downloaded file names. Applies to pages read after you change it.</small></label>
    <label>Load pages by <select name="loadMode">${options(LOAD_MODES, s.loadMode)}</select>
      <small>A fetch sends this browser's cookies but doesn't run the page's JavaScript, so apps that build the page in JavaScript or sign in with tokens come back empty. A browser tab opens the page in the background with your full session, waits for it to render, reads it and closes it.</small></label>
  </section>

  <section class="settings-group">
    <h2>Images</h2>
    <label class="check"><input name="saveImageFiles" type="checkbox" ${s.saveImageFiles ? "checked" : ""}> Keep image files, not just image details</label>
    <small class="indent">With this on, Save also stores each image file, Download .md writes the images next to the .md file, and you can export them inside JSON.</small>
    <label>Skip images larger than (KB) <input name="maxImageKB" type="number" min="16" max="51200" value="${s.maxImageKB}"></label>
  </section>

  <section class="settings-group">
    <h2>Pagination</h2>
    <label class="check"><input name="followPagination" type="checkbox" ${s.followPagination ? "checked" : ""}> Follow "Next page" links when crawling</label>
    <label>Next pages to follow per list <input name="maxNextPages" type="number" min="1" max="100" value="${s.maxNextPages}"></label>
    <label>Infinite scroll: scroll to the bottom up to this many times <input name="scrollTimes" type="number" min="0" max="50" value="${s.scrollTimes}">
      <small>0 = off. Applies to pages read in a browser tab. Background tabs may not load more on scroll.</small></label>
    <label class="check"><input name="clickLoadMore" type="checkbox" ${s.clickLoadMore ? "checked" : ""}> While scrolling, press "Load more" / "Show more" buttons</label>
  </section>

  <section class="settings-group">
    <h2>Notion</h2>
    <label>Notion integration token
      <input name="notionToken" type="password" autocomplete="off" placeholder="ntn_… or secret_…" value="${esc(s.notionToken)}">
      <small>Create an internal integration at notion.so/profile/integrations and copy its token. Sent only to api.notion.com.</small></label>
    <label>Notion parent page
      <input name="notionParent" type="url" placeholder="https://www.notion.so/My-research-1a2b3c…" value="${esc(s.notionParent)}">
      <small>Pages and tables are created under this page. In Notion, open it → ••• → Connections → add your integration.</small></label>
    <div class="row-between"><button type="button" class="notion-test">Test connection</button></div>
    <p class="notion-result small-text" role="status"></p>
  </section>

  <div class="save-bar">
    <button type="submit" class="primary">Save settings</button>
    <span class="muted save-status" role="status"></span>
    <span class="spacer"></span>
    <span class="muted small-text">Version ${esc(chrome.runtime.getManifest().version)}</span>
  </div>
</form>`;
}

/** Render the Settings form into `root`. `onSaved` runs after each save. */
export async function mountSettings(root: HTMLElement, onSaved?: (s: Settings) => void): Promise<void> {
  root.innerHTML = formHtml(await loadSettings());
  const form = root.querySelector("form")!;
  const el = <T extends HTMLElement>(name: string) => form.querySelector(`[name="${name}"]`) as T;
  const status = form.querySelector<HTMLElement>(".save-status")!;
  form.addEventListener("input", () => (status.textContent = "Unsaved changes"));
  const testBtn = form.querySelector<HTMLButtonElement>(".notion-test")!;
  const result = form.querySelector<HTMLElement>(".notion-result")!;
  testBtn.addEventListener("click", async () => {
    testBtn.disabled = true;
    result.className = "notion-result small-text muted";
    result.textContent = "Checking with Notion…";
    try {
      // Uses what's typed in the form, saved or not.
      result.textContent = await testConnection({ token: el<HTMLInputElement>("notionToken").value, parent: el<HTMLInputElement>("notionParent").value });
      result.className = "notion-result small-text ok";
    } catch (err) {
      result.textContent = String((err as Error)?.message ?? err);
      result.className = "notion-result small-text error";
    } finally {
      testBtn.disabled = false;
    }
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const num = (name: string, lo: number, hi: number, d: number) => {
      const v = Number(el<HTMLInputElement>(name).value);
      return Math.round(Math.min(hi, Math.max(lo, Number.isFinite(v) && el<HTMLInputElement>(name).value !== "" ? v : d)));
    };
    const s: Settings = {
      ...(await loadSettings()), // keep values set elsewhere (e.g. "Merge same-layout" on the Crawl tab)
      apiKey: el<HTMLInputElement>("apiKey").value.trim(),
      model: el<HTMLSelectElement>("model").value,
      maxPages: num("maxPages", 1, 500, 50),
      concurrency: num("concurrency", 1, 10, 4),
      sameDomainOnly: el<HTMLInputElement>("sameDomainOnly").checked,
      maxDepth: num("maxDepth", 1, MAX_DEPTH, 1),
      titleSource: el<HTMLSelectElement>("titleSource").value as TitleSource,
      loadMode: el<HTMLSelectElement>("loadMode").value as LoadMode,
      saveImageFiles: el<HTMLInputElement>("saveImageFiles").checked,
      maxImageKB: num("maxImageKB", 16, 51200, 2048),
      followPagination: el<HTMLInputElement>("followPagination").checked,
      maxNextPages: num("maxNextPages", 1, 100, 5),
      scrollTimes: num("scrollTimes", 0, 50, 0),
      clickLoadMore: el<HTMLInputElement>("clickLoadMore").checked,
      notionToken: el<HTMLInputElement>("notionToken").value.trim(),
      notionParent: el<HTMLInputElement>("notionParent").value.trim(),
    };
    await saveSettings(s);
    status.textContent = "Saved.";
    setTimeout(() => status.textContent === "Saved." && (status.textContent = ""), 2500);
    onSaved?.(s);
  });
}
