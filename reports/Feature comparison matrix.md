# Feature comparison: Page Crawler & Summarizer vs existing scrapers

Our app's column comes from this repo's code ([settings.ts](../src/settings.ts), [dashboard.ts](../src/dashboard.ts), [ai.ts](../src/ai.ts)) and the README. The other columns come from the research in [Web scraper extensions and repos.md](Web%20scraper%20extensions%20and%20repos.md), as of 2026-11-25.

**Key:** ✅ present · ⚠️ partial, or only on a paid/cloud plan · ❌ not present · ? not documented in the sources we found

## Where our app differs

**Only our app has all of these together**
- A crawl tree up to 5 levels deep, built from the page you're on, where you tick individual pages and sub-pages.
- Clean Markdown output for every page it crawls, not just one page at a time.
- Fetches pages first and opens a background tab only when needed, which uses your signed-in session.
- Detects duplicate pages through redirects, canonical address or identical content.
- Won't auto-tick links that look like sign-out, delete or approve actions.
- Summarises pages with Claude using your own API key, and keeps everything stored locally with no account.

**What our app lacks that others have**
- **Data extraction:** structured fields and tables, CSV/XLSX export, automatic detection of lists and tables, and handling of pagination and infinite scroll.
- **Crawl rules:** robots.txt and crawl-delay, sitemap.xml, include/exclude URL patterns, and a delay between requests.
- **Automation:** scheduling and change monitoring, connections to Google Sheets and other apps, and an API or MCP server.

## Matrix

| Feature | **Our app** (Page Crawler & Summarizer) | Instant Data Scraper | Web Scraper (webscraper.io) | Data Miner | Listly | Thunderbit (AI) | Browse AI (AI) | Markdown clippers (MarkDownload, LLMFeeder) | moe-copy-ai (open source) | Firecrawl (framework) | Crawl4AI (framework) | Scrapy (framework) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Kind / where it runs** | MV3 Chrome extension, local | Extension, local | Extension + paid cloud | Extension + cloud | Extension + cloud | Extension + vendor servers | Extension records, cloud runs | Extension, local | MV3 extension, local | Server / API (self-host or cloud) | Python library / server | Python framework |
| **Price** | Free; only the user's Claude API usage | Free | Free locally; cloud $50–$200+/mo | 500 pages/mo free; $19.99–$200/mo | Free tier; advanced features paid | 6 pages/mo free; $15–$38/mo credits | Credits, reset monthly | Free | Free (AGPL) | Open source (AGPL) + paid cloud | Free (Apache-2.0) | Free (BSD) |
| **Account needed** | ❌ No | ❌ No | ❌ Not for local use | ✅ Yes | ⚠️ Guest mode | ✅ Yes | ✅ Yes | ❌ No | ❌ No | ⚠️ Cloud only | ❌ No | ❌ No |
| **Start from the page you're on (one click)** | ✅ Icon opens a dashboard for the current tab | ✅ | ⚠️ Build a sitemap first | ✅ With recipe | ✅ | ✅ | ⚠️ Record a robot | ✅ | ✅ | ❌ Give it a URL | ❌ Code | ❌ Code |
| **Auto-detect lists and tables** | ❌ | ✅ Core feature | ⚠️ AI Sitemap Wizard | ⚠️ Via recipes | ✅ Click one item | ✅ AI suggests columns | ✅ | ❌ | ❌ | ⚠️ LLM extraction | ⚠️ LLM extraction | ❌ |
| **Choose fields by clicking or CSS/XPath** | ❌ | ❌ | ✅ Typed selectors | ✅ | ✅ | ⚠️ AI-defined columns | ✅ | ❌ | ⚠️ Pick a page region | ❌ | ✅ CSS/XPath schemas | ✅ CSS/XPath |
| **Pagination (next button / infinite scroll)** | ❌ (waits ≤5 s for JS on the start page only) | ✅ / ✅ | ✅ / ✅ | ✅ / ? | ✅ / ✅ | ✅ / ✅ | ✅ | ❌ | ✅ Next button | ⚠️ Via actions | ✅ Scroll / JS hooks | ✅ Code |
| **Follow links to detail pages (1 hop)** | ✅ | ❌ | ✅ | ⚠️ Paid | ✅ | ✅ Subpage enrichment | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Multi-level crawl** | ✅ Depth 1–5 | ❌ | ⚠️ Through a selector tree | ⚠️ Paid automation | ❌ | ❌ | ❌ | ❌ | ⚠️ List + next page | ✅ Depth limit | ✅ BFS/DFS/best-first | ✅ Depth limit |
| **Visual crawl tree, tick pages individually** | ✅ Per-page checkboxes, "all/none" under each page, "+N links" at the depth limit | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ Link list | ❌ | ❌ | ❌ |
| **Same-domain restriction** | ✅ On by default | n/a | ⚠️ Through selectors | ? | ? | ? | ? | n/a | ✅ Domain filter | ✅ | ✅ Domain filter | ✅ allowed_domains |
| **Include/exclude URL patterns** | ⚠️ Text filter on URL, link text and title (contains only, no exclude) | ❌ | ⚠️ URL ranges | ? | ? | ? | ? | n/a | ✅ Regex | ✅ include/exclude paths | ✅ Filter chains | ✅ allow/deny regex |
| **robots.txt / crawl-delay** | ❌ | ❌ | ? | ? | ? | ? | ? | n/a | ❌ | ? | ? | ✅ |
| **Seed from sitemap.xml** | ❌ | ❌ | ✅ Sitemap.xml selector | ? | ? | ❌ | ? | n/a | ❌ | ✅ Map endpoint | ✅ | ✅ SitemapSpider |
| **Parallel requests / throttling** | ⚠️ Parallel requests setting (default 4); no delay between requests | ⚠️ Delay setting | ✅ Delay per selector | ? | ? | ? | ⚠️ Cloud | n/a | ? | ✅ | ✅ Scales to available CPU/memory | ✅ AutoThrottle |
| **Pages that need JavaScript** | ✅ Background tab, includes shadow DOM and same-origin frames | ✅ Live page | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Live page | ✅ | ✅ | ✅ Headless browser | ⚠️ Plugin |
| **Fetch first, browser only if needed** | ✅ "Automatic": fetch; tab if under 40 words or 401/403 (≤2 tabs) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ User picks fetch/tab | ✅ | ❌ Browser | ❌ HTTP |
| **Signed-in / company pages** | ✅ Your cookies and session | ✅ Live page | ✅ Login setup step | ✅ | ✅ | ⚠️ Browser mode | ⚠️ Saved cookies | ✅ | ✅ | ⚠️ Pass headers | ⚠️ Browser profile | ⚠️ Code |
| **Detect duplicate pages** | ✅ Redirects, canonical URL + title, identical content → "same page" row | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | n/a | ? | ⚠️ URL dedupe | ⚠️ URL dedupe | ✅ Duplicate-request filter |
| **Protection from risky links** | ✅ Sign-out, delete and approve links never auto-ticked | n/a | ❌ | ❌ | ❌ | ❌ | ❌ | n/a | ❌ | ❌ | ❌ | ❌ |
| **Page limit per run** | ✅ Max pages (default 50) | n/a | ✅ Pagination limit | ✅ Plan quota | ? | ✅ Credits | ✅ Credits | n/a | ? | ✅ limit | ✅ max_pages | ✅ CLOSESPIDER |
| **Resume a stopped crawl** | ⚠️ Press "Crawl selected" again | ❌ | ? | ? | ? | ? | ✅ Cloud | n/a | ? | ✅ Cloud jobs | ✅ resume_state | ✅ JOBDIR |
| **Markdown output** | ✅ Readability + Turndown, front matter, per page or whole library | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ One page at a time | ✅ | ✅ | ✅ "Fit Markdown" | ❌ |
| **Markdown trimmed to fit an AI model's limit** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ LLMFeeder shows token count | ✅ Token counts | ⚠️ | ✅ BM25/LLM filters | ❌ |
| **CSV / Excel export** | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ CSV |
| **JSON export** | ✅ Whole library, optionally with images | ❌ | ⚠️ Cloud | ❌ | ? | ? | ✅ API | ❌ | ? | ✅ | ✅ | ✅ |
| **Google Sheets / Airtable / Notion / Zapier** | ❌ | ❌ | ⚠️ Cloud | ⚠️ Paid | ✅ Sheets | ✅ | ✅ | ❌ | ❌ | ⚠️ Integrations | ❌ | ❌ |
| **Images** | ✅ Details always; files optional (stored as Blobs, written to a `_files/` folder, base64 in JSON) | ❌ | ✅ Image selector | ? | ? | ✅ | ? | ✅ Optional download | ⚠️ ZIP export | ✅ Screenshots | ✅ Media extraction | ⚠️ Images pipeline |
| **Structured fields (e.g. price, author)** | ❌ (headings, excerpt and text only) | ✅ Columns | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ JSON schema | ✅ CSS or LLM schema | ✅ |
| **AI field detection / extraction** | ❌ | ❌ | ⚠️ AI wizard | ❌ | ❌ | ✅ | ✅ | ❌ | ⚠️ | ✅ | ✅ | ❌ |
| **AI summaries** | ✅ Claude (Opus/Sonnet/Haiku), TL;DR + key topics + notable details | ❌ | ❌ | ❌ | ❌ | ⚠️ AI transforms | ❌ | ❌ | ✅ | ⚠️ | ⚠️ | ❌ |
| **Saved library with search** | ✅ IndexedDB, grouped by crawl, search, re-summarise, delete | ❌ | ⚠️ Sitemaps stored locally | ⚠️ Recipes | ? | ⚠️ Cloud history | ✅ Cloud | ❌ | ? | ⚠️ Cloud | ❌ | ❌ |
| **Does data leave your machine?** | Only to api.anthropic.com, only for summaries | No | Only on Cloud | Yes (account) | Yes | Yes (discloses page content and personal data) | Yes | No | Optional AI | Yes (cloud) / no (self-host) | No (self-host) | No |
| **Scheduling / change monitoring** | ❌ | ❌ | ⚠️ Cloud cron | ⚠️ Enterprise | ? | ✅ | ✅ Core | ❌ | ❌ | ✅ Monitor (cloud) | ❌ | ⚠️ Scrapyd |
| **API / MCP for AI agents** | ❌ | ❌ | ⚠️ Cloud API | ❌ | ? | ❌ | ✅ API, webhooks | ❌ | ❌ | ✅ API + MCP | ✅ API + MCP | ❌ |
| **Licence** | Own repo (no licence file) | Proprietary | Proprietary (old version LGPL) | Proprietary | Proprietary | Proprietary | Proprietary | Apache-2.0 (MarkDownload) | AGPL-3.0 | AGPL-3.0 | Apache-2.0 | BSD-3 |

## Notes
- "?" means the sources we found didn't say. It doesn't mean the feature is missing.
- Our app's "no delay between requests" and "doesn't read robots.txt" come from the code and the README's Limits section.
- In our app, only AI summaries need the user's Claude API key. Crawling, Markdown, saving and exports work without one.
