# Open-Source Web Scraping & Crawling Frameworks on GitHub (state as of 2026-11-25)

Method note: Star, fork, license, language and last-push figures below were pulled live from the GitHub REST API (`https://api.github.com/repos/{owner}/{repo}`) on 2026-11-25, so they are current as of that date. Feature claims come from each project's README on its default branch (fetched the same day) unless another source is cited. The unauthenticated API rate limit (60 calls) ran out before several secondary repos (camoufox, patchright, curl_cffi, agent-browser, chrome-devtools-mcp, midscene, splash, SingleFile, automa) could be queried, so their stats are missing (see Gaps).

## Q1. Who are the major projects, and what are their basics (repo, stars, license, language, last activity, self-host vs hosted)?

### Takeaway
The field splits into four groups. (a) Classic crawl frameworks: Scrapy, Crawlee, Colly, Katana, spider-rs, Nutch and Heritrix. (b) AI/LLM-oriented scrape-to-markdown engines: Firecrawl, Crawl4AI, Scrapling, Jina Reader and ScrapeGraphAI. (c) AI browser agents: browser-use, Stagehand and Skyvern. (d) No-code platforms: Maxun and Crawlab. Firecrawl (~209k stars), browser-use (~122k), Scrapling (~106k), Playwright (~101k) and Crawl4AI (~88k) now lead on stars, ahead of the long-established Scrapy (~66k). Most AI-era tools are "open core": an AGPL or MIT repo paired with a paid hosted cloud.

### Cited Findings

Core table. All rows come from the GitHub API on 2026-11-25. "Last push" is the `pushed_at` date. The Hosted / self-host column is from the README.

| Project | Repo | Stars | License | Lang | Last push | Hosted / self-host |
|---|---|---|---|---|---|---|
| Firecrawl | https://github.com/firecrawl/firecrawl | 208,716 | AGPL-3.0 | TypeScript | 2026-11-24 | Firecrawl Local (single Rust binary), full self-host server (`apps/api`), Firecrawl Cloud (hosted) |
| microsoft/markitdown (adjacent: docs→markdown) | https://github.com/microsoft/markitdown | 198,246 | MIT | Python | 2026-11-07 | Library/CLI |
| browser-use | https://github.com/browser-use/browser-use | 121,928 | MIT | Python | 2026-11-24 | OSS Python library + CLI + Browser Use Cloud |
| Scrapling | https://github.com/D4Vinci/Scrapling | 105,514 | BSD-3-Clause | Python | 2026-11-23 | Library/CLI/MCP; self-run only |
| Playwright | https://github.com/microsoft/playwright | 100,982 | Apache-2.0 | TypeScript | 2026-11-24 | Library |
| Puppeteer | https://github.com/puppeteer/puppeteer | 95,896 | Apache-2.0 | TypeScript | 2026-11-24 | Library |
| Crawl4AI | https://github.com/unclecode/crawl4ai | 87,752 | Apache-2.0 | Python | 2026-11-23 | Library, self-hosted Docker server, Crawl4AI Cloud API |
| Scrapy | https://github.com/scrapy/scrapy | 65,560 | BSD-3-Clause | Python | 2026-11-23 | Library (maintained by Zyte; Zyte sells hosting) |
| Lightpanda (headless browser for AI) | https://github.com/lightpanda-io/browser | 42,482 | AGPL-3.0 | Zig | 2026-11-24 | Self-run binary (CDP server) + cloud |
| Playwright MCP | https://github.com/microsoft/playwright-mcp | 40,099 | Apache-2.0 | TypeScript | 2026-11-18 | MCP server |
| changedetection.io | https://github.com/dgtlmoon/changedetection.io | 36,008 | Apache-2.0 | Python | 2026-11-24 | Self-host + hosted |
| ScrapeGraphAI | https://github.com/ScrapeGraphAI/Scrapegraph-ai | 32,917 | MIT | Python | 2026-10-06 | OSS library + ScrapeGraphAI.com API |
| Crawlee (JS) | https://github.com/apify/crawlee | 26,537 | Apache-2.0 | TypeScript | 2026-11-24 | Library; deploy to Apify platform or anywhere (Dockerfiles) |
| Stagehand | https://github.com/browserbase/stagehand | 26,131 | MIT | TypeScript | 2026-11-24 | SDK; local browser or Browserbase cloud |
| Colly | https://github.com/gocolly/colly | 25,607 | Apache-2.0 | Go | 2026-10-16 | Library |
| Skyvern | https://github.com/Skyvern-AI/skyvern | 23,506 | AGPL-3.0 | Python | 2026-11-24 | Docker self-host with web UI + Skyvern Cloud |
| gpt-crawler | https://github.com/BuilderIO/gpt-crawler | 22,409 | ISC | TypeScript | 2025-07-07 (**stale, ~16 months**) | CLI |
| Maxun | https://github.com/getmaxun/maxun | 18,556 | AGPL-3.0 | TypeScript | 2026-11-24 | Self-host (Docker or local) + Maxun cloud |
| Katana | https://github.com/projectdiscovery/katana | 17,894 | MIT | Go | 2026-11-24 | CLI/library |
| Apify MCP server | https://github.com/apify/apify-mcp-server | 17,715 | MIT | TypeScript | 2026-11-24 | MCP server to the Apify platform |
| browserless | https://github.com/browserless/browserless | 13,960 | NOASSERTION (free for non-commercial use, per description) | TypeScript | 2026-11-24 | Docker or cloud |
| Crawlab | https://github.com/crawlab-team/crawlab | 12,298 | BSD-3-Clause | Go | 2026-02-10 (**slowing, ~9 months**) | Self-host admin UI |
| Jina Reader | https://github.com/jina-ai/reader | 12,277 | Apache-2.0 | TypeScript | 2026-05-22 (**~6 months, slower**) | Hosted r.jina.ai / s.jina.ai + OSS branch |
| Crawlee for Python | https://github.com/apify/crawlee-python | 9,686 | Apache-2.0 | Python | 2026-11-24 | Library |
| Steel Browser | https://github.com/steel-dev/steel-browser | 8,009 | Apache-2.0 | TypeScript | 2026-11-24 | Self-host browser API + cloud |
| Firecrawl MCP server | https://github.com/firecrawl/firecrawl-mcp-server | 7,900 | MIT | JavaScript | 2026-11-24 | MCP |
| Trafilatura | https://github.com/adbar/trafilatura | 7,170 | Apache-2.0 | Python | 2026-11-23 | Library/CLI |
| llm-scraper | https://github.com/mishushakov/llm-scraper | 6,960 | MIT | TypeScript | 2026-10-26 | Library |
| nodriver (anti-detect) | https://github.com/ultrafunkamsterdam/nodriver | 4,960 | AGPL-3.0 | Python | 2026-10-26 | Library |
| Heritrix 3 | https://github.com/internetarchive/heritrix3 | 3,354 | NOASSERTION | Java | 2026-11-24 | Self-host archival crawler |
| Apache Nutch | https://github.com/apache/nutch | 3,313 | Apache-2.0 | Java | 2026-11-21 | Self-host (Hadoop-scale) |
| spider-rs/spider | https://github.com/spider-rs/spider | 2,863 | MIT | Rust | 2026-11-20 | Library + spider.cloud managed |
| scrapy-playwright | https://github.com/scrapy-plugins/scrapy-playwright | 1,470 | BSD-3-Clause | Python | 2026-11-02 | Scrapy plugin |
| browsertrix-crawler | https://github.com/webrecorder/browsertrix-crawler | 1,202 | AGPL-3.0 | TypeScript | 2026-11-24 | Docker |
| Apify SDK (JS) | https://github.com/apify/apify-sdk-js | 187 | Apache-2.0 | TypeScript | 2026-11-24 | For Apify Actors (hosted) |
| Apify SDK (Python) | https://github.com/apify/apify-sdk-python | 180 | Apache-2.0 | Python | 2026-11-24 | For Apify Actors (hosted) |

All rows: [GitHub REST API, queried 2026-11-25](https://api.github.com/repos/firecrawl/firecrawl). The same endpoint pattern was used for every repo.

Supporting and contextual findings:
- Firecrawl offers three modes. "Firecrawl Local" runs on your machine as a single binary (`cargo install firecrawl-local`) with no database, queue or container. A full self-hosted server lives in `apps/api` with its own queues, workers and databases. Firecrawl Cloud is the hosted service. — [Firecrawl README](https://github.com/firecrawl/firecrawl)
- Firecrawl Local vs Cloud: Local gives markdown, HTML, raw HTML and links, plus crawl, map, batch scrape and PDF/Office parsing. Cloud adds structured JSON, summaries, screenshots, browser actions, Search, Interact, Agent and Monitor. — [Firecrawl README](https://github.com/firecrawl/firecrawl)
- Crawl4AI deploys "anywhere": a local Python library or CLI, a self-run Docker server secured with a token, or a Crawl4AI Cloud API key. — [Crawl4AI README](https://github.com/unclecode/crawl4ai)
- Licensing conflict: Apify's comparison says Crawl4AI is MIT-licensed. The GitHub API reports Apache-2.0 for the repo today, so the Apify article is outdated on this point. — [Apify blog, Crawl4AI vs Firecrawl](https://blog.apify.com/crawl4ai-vs-firecrawl/) vs [GitHub API](https://api.github.com/repos/unclecode/crawl4ai)
- Historical growth: in July 2025 Crawl4AI had about 49k stars and Firecrawl about 43k. As of 2026-11-25 they have about 87.8k and about 208.7k. Firecrawl roughly 4.8x'd in about 16 months and overtook Crawl4AI. — [Apify blog](https://blog.apify.com/crawl4ai-vs-firecrawl/); [GitHub API](https://api.github.com/repos/firecrawl/firecrawl)
- Scrapling (repo created 2024-10-13) first hit #1 on GitHub Trending on 2026-02-25. Reported star counts were about 59.4k (2026-06-03, DEV post) and about 89.8k (Star History, 2026-10-26). The API reports 105.5k on 2026-11-25. — [Trendshift](https://trendshift.io/repositories/14244); [Star History](https://www.star-history.com/d4vinci/scrapling/); [andrew.ooo review](https://andrew.ooo/posts/scrapling-review-python-web-scraping-framework-mcp/)
- Scrapy is maintained by Zyte (formerly Scrapinghub) and requires Python 3.11+. — [Scrapy README](https://github.com/scrapy/scrapy)
- Crawlee JS requires Node.js 22.13+ and ships a CLI (`npx crawlee create`). — [Crawlee README](https://github.com/apify/crawlee)
- browser-use offers three paths: a fully hosted cloud, a CLI that gives existing agents (Claude Code, Codex, Cursor and others) browser access, and an OSS Python library. — [browser-use README](https://github.com/browser-use/browser-use)
- Maxun is AGPLv3 and self-hosts via Docker Compose or without Docker. — [Maxun README](https://github.com/getmaxun/maxun)
- Jina Reader: in April 2026 the OSS branch was "re-synchronized" with the SaaS code. MongoDB storage was stripped, so the OSS branch runs stateless. The service is primarily the hosted `r.jina.ai`. — [Jina Reader README](https://github.com/jina-ai/reader)
- Skyvern runs with Docker Compose and a web UI on localhost:8080. It also has a Python SDK/cloud API (`pip install skyvern`) and a TypeScript client. — [Skyvern README](https://github.com/Skyvern-AI/skyvern)
- spider-rs: the crawler runs alone with "No key, no service". An optional `spider_cloud` feature routes through the managed Spider Cloud ("Smart" mode uses proxies first and escalates to stealth only when blocked). — [spider README](https://github.com/spider-rs/spider)

### Inferences
- By stars, the AI-first tools (Firecrawl, browser-use, Scrapling, Crawl4AI) have overtaken classic frameworks. Scrapy, Crawlee and Colly are still actively maintained (pushes in Oct–Nov 2026) and remain the reference designs for crawl control.
- Open-core is the dominant business model. The OSS repo is AGPL or MIT/Apache, and features like stealth proxies, agents, search and monitoring sit behind a hosted cloud (Firecrawl, Crawl4AI Cloud, browser-use Cloud, Skyvern Cloud, ScrapeGraphAI API, spider.cloud, Maxun cloud, Apify).
- Star counts for "AI" repos may be inflated by hype or trending dynamics relative to real production use. Treat them as a popularity signal, not a quality signal.

### Gaps
- No API stats were gathered for camoufox, patchright, curl_cffi, apify/fingerprint-suite, vercel-labs/agent-browser, ChromeDevTools/chrome-devtools-mcp, web-infra-dev/midscene, scrapinghub/splash, SingleFile or Automa (rate limit hit).
- No authoritative per-month star growth figures (beyond the snapshots above) were collected for most repos.
- Apify SDK repos have very low stars because they are thin wrappers. Usage happens via Crawlee and the Apify platform, so stars understate their adoption.

## Q2. What feature set does each project offer (crawl control, concurrency, retries, proxies, anti-bot, browser vs HTTP, extraction, markdown, screenshots/PDF, storage, export, scheduling, API/MCP, UI)?

### Takeaway
Classic frameworks (Scrapy, Crawlee, Colly, spider-rs, Katana) are strongest at crawl control: queues, depth, scope rules, robots.txt, sitemaps, throttling, retries, storage and export. AI-era tools are strongest at markdown and LLM output, schema/LLM extraction and MCP integration. Crawlee and Scrapling are the most "complete" hybrids. Crawlee has the deepest anti-blocking in a permissive library. Scrapling combines stealth, Scrapy-like spiders, markdown and MCP.

### Cited Findings

**Crawlee (JS)** — [README](https://github.com/apify/crawlee)
- Single interface for HTTP and headless browser crawling. Playwright and Puppeteer use the same interface (Chrome, Firefox, WebKit). Headless and headful modes.
- Persistent URL queue (breadth- and depth-first). Pluggable storage of tabular data and files (datasets and key-value stores).
- Automatic scaling with available system resources, configurable routing, error handling and retries, and lifecycle hooks.
- Integrated proxy rotation and session management, browser-like headers, TLS fingerprint replication, zero-config human-like browser fingerprints, and HTTP/2 even through proxies.
- Cheerio and JSDOM parsers, JSON API scraping, JS rendering and screenshots, CLI scaffolding and Dockerfiles.

**Crawlee for Python** — [README](https://github.com/apify/crawlee-python)
- Unified HTTP and headless browser crawling, automatic parallelism based on system resources, and automatic retries on errors or when blocked.
- Proxy rotation and session management, request routing, a persistent URL queue, pluggable storage (datasets and key-value stores), asyncio and full type hints.

**Apify SDK (JS/Python)** — [apify-sdk-python](https://github.com/apify/apify-sdk-python), [apify-sdk-js](https://github.com/apify/apify-sdk-js)
- The official library for building "Apify Actors: serverless cloud programs". Scheduling, hosted storage, proxies and a UI come from the Apify platform rather than the SDK. The Apify MCP server exposes Actors to AI agents. — [apify-mcp-server](https://github.com/apify/apify-mcp-server)

**Scrapy** — [Scrapy overview docs](https://docs.scrapy.org/en/latest/intro/overview.html)
- CSS and XPath selectors with regex helpers, and an interactive IPython-aware shell.
- Feed exports in JSON, CSV and XML to FTP, S3 or the local filesystem. A media pipeline auto-downloads images and files.
- Middlewares and extensions cover cookies and sessions, compression, auth, caching, user-agent spoofing, robots.txt and depth restriction.
- The AutoThrottle extension tunes crawl speed. Download delays and per-domain concurrency limits are configurable.
- SitemapSpider and XML/CSV feed spiders, a caching DNS resolver, and signals, pipelines and extensions for extensibility.
- An "official plugin for coding agents" is mentioned in the current overview.
- Headless browser support comes via plugins such as scrapy-playwright. — [scrapy-playwright](https://github.com/scrapy-plugins/scrapy-playwright)
- Scheduling and deployment are external (e.g., Scrapyd or Zyte Scrapy Cloud). This is not verified in this session; see Gaps.

**Firecrawl** — [README](https://github.com/firecrawl/firecrawl)
- Endpoints/features: Scrape, Crawl, Map (URL discovery), Batch Scrape, Search, Interact (click, navigate, operate pages), Agent (autonomous data gathering), Monitor (change tracking) and Parse (uploaded files).
- Output: "clean markdown, structured JSON, screenshots and more". In Local mode, crawl writes one markdown file per page (`--limit 50 --out ./pages`).
- Renders JS with a local Chrome when needed, and parses PDFs and Office docs.
- `firecrawl-local init` auto-registers Firecrawl as an MCP server in Claude Code, Claude Desktop, Cursor, Windsurf, Gemini CLI and Codex. `serve` exposes a Firecrawl v2-compatible REST API on port 3002.
- SDKs in Python, JS, Go, Java, Rust, Ruby, .NET, PHP and Elixir. Integrations with Zapier, n8n and Lovable, plus a "Skills" catalog.
- Claims coverage of 96% of the web and a P95 latency of 3.4s (vendor claim).
- Per Apify's comparison: Firecrawl Cloud has a built-in stealth proxy network, geo-hints, automatic retries, and a FIRE-1 agent that can solve basic CAPTCHAs. Its markdown claims about 67% token reduction (vendor claim relayed). — [Apify blog](https://blog.apify.com/crawl4ai-vs-firecrawl/)

**Crawl4AI** — [README](https://github.com/unclecode/crawl4ai)
- Markdown: clean markdown, plus "Fit Markdown" filters (Pruning, BM25 query-based, LLM-based) and citations as a numbered reference list.
- Extraction: CSS, XPath and regex schemas with no LLM. `generate_schema` uses an LLM once to write a reusable schema. `LLMExtractionStrategy` extracts to typed JSON with any provider. Chunking strategies and cosine-similarity chunk selection.
- Browser: persistent profiles, remote CDP browsers, sessions, proxies with auth and rotation, stealth mode plus an undetected-browser adapter, and Chromium, Firefox and WebKit.
- Crawl control: deep crawl with BFS, DFS and best-first strategies and crash-recovery `resume_state`. `AdaptiveCrawler` stops when enough information has been gathered. `AsyncUrlSeeder` discovers URLs from sitemaps and Common Crawl.
- Dynamic pages: JS execution, wait-for, full-page scroll for infinite scroll. Also screenshots and PDFs, media and link extraction, caching, hooks, and `arun_many` with a memory-adaptive dispatcher.
- Server: REST API (`/md`, `/html`, `/crawl`, `/crawl/stream`, `/screenshot`, `/pdf`, `/execute_js`), MCP, monitoring dashboard and playground, pre-warmed browser pool, AMD64/ARM64 images, and search and SERP APIs.

**Scrapling** — [README](https://github.com/D4Vinci/Scrapling)
- Fetchers: a fast HTTP `Fetcher` with TLS fingerprint and header impersonation and HTTP/3. `StealthyFetcher` does browser automation with fingerprint spoofing and claims Cloudflare Turnstile/Interstitial bypass.
- Also: persistent sessions, a `ProxyRotator` (cyclic or custom), domain and ad blocking (about 3,500 domains), DNS-over-HTTPS leak prevention, remote CDP browsers, and background API (XHR) capture.
- Spiders: configurable concurrency, per-domain throttling and download delays, and multi-session routing (HTTP and stealth browser in one spider). Streaming items, blocked-request detection with retry, optional robots.txt compliance (Disallow, Crawl-delay, Request-rate).
- Spider templates: CrawlSpider, SitemapSpider and XMLFeed. Also a dev-mode response cache and a LinkExtractor with allow/deny patterns and domain and extension filters.
- Export: built-in JSON, JSONL, CSV and XML.
- Parsing: CSS, XPath, text and regex search, plus "adaptive" element tracking that relocates elements after site redesigns. Also similar-element finding and auto selector generation.
- AI: an MCP server (HTTP requests, browser actions, screenshots, saved login state), an Agent Skill, and RAG-ready Markdown (`page.markdown()`) for a page or a whole-site Markdown corpus.
- Interactive shell, CLI with no code required, and drop-in Scrapy integration.

**Colly (Go)** — [README](https://github.com/gocolly/colly)
- Claims >1k requests/sec on a single core. Per-domain request delays and max concurrency, automatic cookies and sessions.
- Sync, async and parallel scraping, caching, automatic encoding of non-Unicode responses, robots.txt support, distributed scraping, env-var config and extensions. HTTP only; no built-in browser.

**Katana (Go, security-oriented)** — [README](https://github.com/projectdiscovery/katana)
- Standard (HTTP) and headless modes, JavaScript parsing and crawling, and customizable automatic form filling.
- Scope control with preconfigured fields (rdn, fqdn, dn) and regex. An ML "knowledge base" classifies page types and forms.
- Input from STDIN, URL or a list; output to STDOUT, a file or JSON.
- Headless mode uses a legitimate browser TLS and user-agent fingerprint. Authenticated crawling replays Chrome DevTools Recorder JSON and skips logout URLs.
- Regex field extraction (e.g., emails, phones) and match/filter by status, tech or CDN.

**spider-rs/spider (Rust)** — [README](https://github.com/spider-rs/spider)
- A "concurrency-first" engine that streams pages via `subscribe`. `crawl_smart()` is HTTP-first and launches headless Chrome only when a page needs JS.
- `with_depth`, `with_respect_robots_txt` and `with_stealth`. Scales from a single script to a distributed fleet.
- Exports Markdown, JSON or WARC. A firewall/blocklist feature. Optional Spider Cloud proxy and stealth escalation.

**ScrapeGraphAI** — [README](https://github.com/ScrapeGraphAI/Scrapegraph-ai)
- An LLM plus "direct graph logic" to build scraping pipelines for websites and local docs (XML, HTML, JSON, Markdown). `SmartScraperGraph` extracts from a page given a natural-language prompt. Supports local models (e.g., `ollama/llama3.2`).
- Integrations: LangChain, LlamaIndex, CrewAI, Agno and CamelAI, plus low-code tools (Zapier, n8n, Dify, Bubble, Pipedream). An MCP server and a hosted API with Python/JS SDKs.

**Jina Reader** — [README](https://github.com/jina-ai/reader)
- `r.jina.ai/<url>` returns LLM-friendly content and `s.jina.ai/<query>` searches. Engine is headless Chrome or `curl-impersonate`, chosen automatically.
- Parses PDFs (PDF.js), MS Office documents (via LibreOffice) and images (VLM captions).
- Output formats via `x-respond-with`: markdown, html, text, screenshot, pageshot (full page) and frontmatter.
- Request headers: `x-proxy-url`, caching controls, `x-target-selector` and `x-wait-for-selector`, `x-max-tokens` and `x-token-budget` (token-budgeted output), `x-respond-timing` (html, visible-content, mutation-idle, network-idle and others), and image alt generation.

**browser-use** — [README](https://github.com/browser-use/browser-use)
- An LLM agent drives a real Chrome over CDP through a persistent Python REPL. Typed structured output via `output_model_schema`.
- File uploads and downloads, secrets that are domain-scoped and redacted, and domain allow/block lists. Custom tools, an "ultrafast" accessibility-tree mode, a post-run LLM "judge", and built-in web search.
- Can use your local Chrome profile with its logins. Cloud adds stealth browsers, profiles, recordings, and enterprise SSO and audit.

**Stagehand** — [README](https://github.com/browserbase/stagehand)
- Primitives: `act()` (natural-language actions that "self-heal" on redesigns), `observe()` (returns real selectors, so credentials never reach the model) and `extract()` (Zod schema-validated data). Has an agent mode, a local browser with a `userDataDir`, and TypeScript and Python SDKs.

**Skyvern** — [README](https://github.com/Skyvern-AI/skyvern)
- Vision- and LLM-based navigation with no predetermined XPaths, so it resists layout changes. Workflow blocks include browser task, action, data extraction, validation, loops, file parsing, email, HTTP request and custom code.
- Supports 2FA (QR/TOTP, email, SMS) and credential vaults (Bitwarden, custom). Has a web UI.

**Maxun (no-code)** — [README](https://github.com/getmaxun/maxun)
- Recorder Mode (record browser actions into reusable "robots") and AI Mode (natural-language extraction).
- Scrape full pages to Markdown or HTML with screenshots, crawl entire sites, and run an Agent that discovers where the data lives. Also search with time filters, change monitoring and notifications, and document extraction.
- Dashboard UI, API, SDK, CLI and MCP.

**Lightpanda (headless browser, not Chromium-based)** — [README](https://github.com/lightpanda-io/browser)
- Written in Zig with a V8 JS engine and no graphical rendering. Serves CDP and WebDriver BiDi, so it is a drop-in backend for Playwright and Puppeteer.
- DOM and Markdown dump, proxy support, network interception, `--obey-robots` and an adblocker. A built-in MCP server with session sharing.

**Playwright / Puppeteer** — [Playwright](https://github.com/microsoft/playwright), [Puppeteer](https://github.com/puppeteer/puppeteer)
- Browser automation libraries (Chromium, Firefox, WebKit for Playwright; Chrome and Firefox for Puppeteer) used as the rendering layer under Crawlee, Crawl4AI, Scrapling, Stagehand and others. Playwright MCP (40k stars) exposes Playwright to agents. — [playwright-mcp](https://github.com/microsoft/playwright-mcp)

### Inferences
Feature matrix synthesized from the cited READMEs. Y = built-in. P = via plugin or cloud only. "-" = not found in README.

| Feature | Scrapy | Crawlee | Colly | Katana | spider-rs | Firecrawl | Crawl4AI | Scrapling | Jina Reader | ScrapeGraphAI | browser-use/Stagehand | Maxun |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Queue/depth/scope | Y | Y | Y | Y | Y | Y (crawl/map, limit) | Y (BFS/DFS/best-first) | Y | - | - | - | Y (crawl) |
| robots.txt | Y | ? | Y | - | Y | - | - | Y | - | - | - | - |
| Sitemaps | Y | ? | - | - | - | Y (map) | Y (seeder) | Y | - | - | - | - |
| Autoscale/throttle | Y (AutoThrottle) | Y (resource-based) | Y (per-domain) | - | Y | cloud | Y (memory-adaptive) | Y | n/a | - | - | - |
| Retries | Y | Y | - | - | - | cloud | user code (per Apify) | Y | - | - | - | - |
| Proxy rotation | P | Y | P | - | Y/cloud | cloud | Y | Y | Y (header) | - | cloud | - |
| Anti-bot fingerprints | P | Y (TLS + browser) | - | Y (TLS) | Y (stealth) | cloud | Y (stealth) | Y (Turnstile claim) | curl-impersonate | - | cloud | - |
| HTTP + headless | HTTP (+plugin) | both | HTTP | both | both (smart) | both | browser | both | both (auto) | both | browser | browser |
| Selectors | Y | Y | Y | regex | - | - | Y | Y (adaptive) | CSS target | - | NL to selectors | recorder |
| LLM/schema extraction | - | - | - | - | - | Y (cloud JSON) | Y | - | - | Y | Y | Y (AI mode) |
| Markdown output | - | - | - | - | Y | Y | Y | Y | Y | Y | - | Y |
| Screenshots/PDF | P | Y (screenshots) | - | - | - | cloud | Y/Y | Y (MCP screenshots) | Y | - | Y | Y |
| Storage/export | Y (JSON/CSV/XML, S3/FTP) | Y (datasets, KV) | - | JSON | MD/JSON/WARC | files/API | API | JSON/JSONL/CSV/XML | API | JSON | typed output | API/UI |
| Scheduling | external | Apify platform | - | - | cloud | Monitor (cloud) | - | - | - | - | cloud | Y (monitoring) |
| REST API | - | - | - | - | cloud | Y | Y | - | Y | cloud | cloud | Y |
| MCP server | - | via Apify MCP | - | - | - | Y | Y | Y | - | Y | Playwright MCP / CLI | Y |
| No-code UI | - | via Apify | - | - | - | playground | dashboard/playground | - | - | - | Skyvern UI | Y |

Reading the matrix: standard features are queueing and depth, concurrency and throttling, retries, HTTP and headless modes, CSS/XPath selectors and JSON/CSV export. Advanced or differentiating features are TLS and browser fingerprint impersonation, adaptive selectors, resource-based autoscaling, HTTP-first-escalate-to-browser routing (Crawlee, spider-rs, Jina, Scrapling) and crash-resumable crawls.

### Gaps
- Several feature cells are "?" or "-" only because the README did not mention the feature. Crawlee's robots.txt and sitemap support (its docs reportedly include a `Sitemap` helper and `respectRobotsTxtFile`) was not verified in this session.
- Scrapyd and Zyte Scrapy Cloud scheduling, and Scrapy's RetryMiddleware, are well known but were not fetched and cited here.
- Firecrawl's self-host server feature list (vs Local and Cloud) and its self-hosted anti-bot capability were not verified. Apify's article mentions a community "firecrawl-simple" fork.
- No independent benchmarks were verified. Vendor claims such as Firecrawl's "96% of web", Colly's ">1k req/s" and Scrapling's Cloudflare bypass are unverified.

## Q3. Which features are emerging trends (LLM extraction, MCP servers, markdown output, agentic browsing)?

### Takeaway
Four trends dominate 2025–2026. First, LLM-ready Markdown (often token-budgeted) as a default output. Second, MCP servers and "agent skills" shipped by nearly every major tool. Third, natural-language and schema-based LLM extraction that sits alongside or generates selectors. Fourth, agentic browsing (act/observe/extract, autonomous agents). Supporting trends: HTTP-first smart escalation to a browser, AI-specific lightweight headless browsers (Lightpanda), search APIs bundled with scrapers, change monitoring, and an open-core plus hosted-cloud model.

### Cited Findings
- **MCP everywhere:**
  - Firecrawl: `init` auto-installs its MCP server into Claude Code, Cursor and others. — [Firecrawl README](https://github.com/firecrawl/firecrawl)
  - Crawl4AI ships MCP on its Docker server. — [Crawl4AI README](https://github.com/unclecode/crawl4ai)
  - Scrapling ships an MCP server plus an Agent Skill. — [Scrapling README](https://github.com/D4Vinci/Scrapling)
  - Maxun ships MCP. — [Maxun README](https://github.com/getmaxun/maxun)
  - ScrapeGraphAI ships MCP. — [ScrapeGraphAI README](https://github.com/ScrapeGraphAI/Scrapegraph-ai)
  - Lightpanda has a built-in MCP server. — [Lightpanda README](https://github.com/lightpanda-io/browser)
  - Dedicated MCP repos have large star counts: Playwright MCP 40.1k, Apify MCP 17.7k, Firecrawl MCP 7.9k. — [GitHub API](https://api.github.com/repos/microsoft/playwright-mcp)
- **Agent skills and coding-agent plugins** are a 2026 addition:
  - Scrapy's overview now lists "An official plugin for coding agents". — [Scrapy docs](https://docs.scrapy.org/en/latest/intro/overview.html)
  - Firecrawl has a Skills catalog (`npx skills add firecrawl/skills`). — [Firecrawl README](https://github.com/firecrawl/firecrawl)
  - Scrapling has an Agent Skill. — [Scrapling README](https://github.com/D4Vinci/Scrapling)
- **Markdown/LLM-ready output as the default:**
  - Crawl4AI "Fit Markdown" with BM25 and LLM filters and citations. — [Crawl4AI](https://github.com/unclecode/crawl4ai)
  - Jina Reader `x-max-tokens` and `x-token-budget`. — [Jina Reader](https://github.com/jina-ai/reader)
  - Scrapling `page.markdown()` and a site-to-Markdown corpus. — [Scrapling](https://github.com/D4Vinci/Scrapling)
  - spider-rs Markdown export. — [spider](https://github.com/spider-rs/spider)
  - Lightpanda Markdown dump. — [Lightpanda](https://github.com/lightpanda-io/browser)
- **LLM extraction patterns:**
  - Prompt-to-JSON in ScrapeGraphAI's SmartScraperGraph. — [ScrapeGraphAI](https://github.com/ScrapeGraphAI/Scrapegraph-ai)
  - LLM generates a reusable CSS schema once, then extraction runs without an LLM (Crawl4AI `generate_schema`). — [Crawl4AI](https://github.com/unclecode/crawl4ai)
  - Schema-validated extract with Zod (Stagehand). — [Stagehand](https://github.com/browserbase/stagehand)
  - Typed agent output (browser-use `output_model_schema`). — [browser-use](https://github.com/browser-use/browser-use)
  - Record or AI mode (Maxun). — [Maxun](https://github.com/getmaxun/maxun)
- **Agentic browsing:**
  - browser-use (122k stars): model, REPL and CDP. — [browser-use](https://github.com/browser-use/browser-use)
  - Stagehand act/observe/extract with self-healing. — [Stagehand](https://github.com/browserbase/stagehand)
  - Skyvern vision-based workflows with 2FA. — [Skyvern](https://github.com/Skyvern-AI/skyvern)
  - Firecrawl Interact and Agent. — [Firecrawl](https://github.com/firecrawl/firecrawl)
  - Maxun Agent mode. — [Maxun](https://github.com/getmaxun/maxun)
- **Selector resilience without LLMs:** Scrapling's "adaptive" element tracking relocates elements after site changes. — [Scrapling](https://github.com/D4Vinci/Scrapling)
- **Adaptive and goal-directed crawling:** Crawl4AI's `AdaptiveCrawler` stops when it has learned enough to answer a query, and supports best-first deep crawl. — [Crawl4AI](https://github.com/unclecode/crawl4ai)
- **Search bundled with scraping:**
  - Firecrawl Search. — [Firecrawl](https://github.com/firecrawl/firecrawl)
  - Jina `s.jina.ai`. — [Jina Reader](https://github.com/jina-ai/reader)
  - Crawl4AI `/search` and `/serp`. — [Crawl4AI](https://github.com/unclecode/crawl4ai)
  - browser-use web search. — [browser-use](https://github.com/browser-use/browser-use)
  - Maxun Search. — [Maxun](https://github.com/getmaxun/maxun)
- **Change monitoring as a feature:**
  - Firecrawl Monitor. — [Firecrawl](https://github.com/firecrawl/firecrawl)
  - Maxun Monitoring. — [Maxun](https://github.com/getmaxun/maxun)
  - changedetection.io (36k stars). — [GitHub API](https://api.github.com/repos/dgtlmoon/changedetection.io)
- **AI-specific headless browsers:** Lightpanda (42.5k stars) is a non-Chromium Zig browser built for AI and automation that pitches lower RAM/CPU than Chrome. — [Lightpanda README](https://github.com/lightpanda-io/browser)
- **Background API capture** (reading XHR/JSON instead of DOM): Scrapling `record_requests=True`. — [Scrapling](https://github.com/D4Vinci/Scrapling)
- **Document ingestion alongside the web:**
  - Firecrawl and Jina parse PDFs and Office files. — [Firecrawl](https://github.com/firecrawl/firecrawl); [Jina Reader](https://github.com/jina-ai/reader)
  - MarkItDown (198k stars) converts Office files to markdown. — [GitHub API](https://api.github.com/repos/microsoft/markitdown)
- **Bias caveat:** most "best scraping tools 2026" comparison articles are vendor-published (Firecrawl, Bright Data, Apify) or affiliate-driven. One critical view (ScrapeOps) calls many AI scrapers "over-engineered HTTP wrappers" while rating Crawl4AI promising. — [WebSearch summary of ScrapeOps / Firecrawl / Bright Data posts](https://scrapeops.io/web-scraping-playbook/best-ai-web-scraping-tools/)

### Inferences
- The baseline for a 2026 tool has shifted. Beyond crawl control and export, users now expect clean Markdown, an LLM/schema extraction path and an MCP server. Tools lacking these (Colly, Katana, classic Scrapy) remain popular for engineering-heavy or security use cases but are not where star growth is.
- A Chrome extension crawler in this space would likely be judged on four things: (1) Markdown or LLM-ready export, (2) schema- or prompt-based extraction, (3) an MCP or agent hook, and (4) record-and-replay or no-code selector building (Maxun-style). It would also be expected to meet classic crawl controls (depth, URL filters, robots.txt and sitemaps, throttling).

### Gaps
- No quantitative adoption data (downloads, production usage) was gathered to confirm that the trends reflect real usage rather than star hype.
- Star-history time series were not pulled for each repo. Growth claims rely on snapshots (Apify July 2025, Star History October 2026, API November 2026).
