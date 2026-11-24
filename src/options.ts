import { LOAD_MODES, MAX_DEPTH, MODELS, TITLE_SOURCES, loadSettings, saveSettings, type LoadMode, type TitleSource } from "./settings";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const options = (list: { id: string; label: string }[], current: string) =>
  list.map((m) => `<option value="${m.id}" ${m.id === current ? "selected" : ""}>${esc(m.label)}</option>`).join("");

(async () => {
  const s = await loadSettings();
  $<HTMLSelectElement>("model").innerHTML = options(MODELS, s.model);
  $<HTMLSelectElement>("titleSource").innerHTML = options(TITLE_SOURCES, s.titleSource);
  $<HTMLSelectElement>("loadMode").innerHTML = options(LOAD_MODES, s.loadMode);
  $<HTMLInputElement>("apiKey").value = s.apiKey;
  $<HTMLInputElement>("maxPages").value = String(s.maxPages);
  $<HTMLInputElement>("concurrency").value = String(s.concurrency);
  $<HTMLInputElement>("sameDomainOnly").checked = s.sameDomainOnly;
  $<HTMLInputElement>("maxDepth").value = String(s.maxDepth);
  $<HTMLInputElement>("saveImageFiles").checked = s.saveImageFiles;
  $<HTMLInputElement>("maxImageKB").value = String(s.maxImageKB);
})();

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const clamp = (id: string, lo: number, hi: number, d: number) =>
    Math.round(Math.min(hi, Math.max(lo, Number($<HTMLInputElement>(id).value) || d)));
  await saveSettings({
    apiKey: $<HTMLInputElement>("apiKey").value.trim(),
    model: $<HTMLSelectElement>("model").value,
    maxPages: clamp("maxPages", 1, 500, 50),
    concurrency: clamp("concurrency", 1, 10, 4),
    sameDomainOnly: $<HTMLInputElement>("sameDomainOnly").checked,
    maxDepth: clamp("maxDepth", 1, MAX_DEPTH, 1),
    titleSource: $<HTMLSelectElement>("titleSource").value as TitleSource,
    loadMode: $<HTMLSelectElement>("loadMode").value as LoadMode,
    saveImageFiles: $<HTMLInputElement>("saveImageFiles").checked,
    maxImageKB: clamp("maxImageKB", 16, 51200, 2048),
  });
  $("status").textContent = "Saved.";
  setTimeout(() => ($("status").textContent = ""), 2000);
});
