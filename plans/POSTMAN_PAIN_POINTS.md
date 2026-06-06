# What Users Hate About Postman — A Comprehensive Review

> 📋 Track progress: [[TODO]] &nbsp;|&nbsp; 📖 Solutions: [[IMPLEMENTATION_ROADMAP]]

> Research compiled from Hacker News, Reddit, developer forums, and competitor landing pages (2022–2026)

---

## Table of Contents
1. [Forced Account & Cloud Lock-in](#1-forced-account--cloud-lock-in)
2. [Bloated & Slow Performance](#2-bloated--slow-performance)
3. [Memory Hog — 300–800MB RAM at Idle](#3-memory-hog)
4. [Electron Bloat — 500MB+ Binary](#4-electron-bloat)
5. [Online-Only — No Offline Mode](#5-online-only)
6. [Not Git-Friendly — Collections as JSON Blobs](#6-not-git-friendly)
7. [Complex, Cluttered UI](#7-complex-cluttered-ui)
8. [Pricing & Feature Gating](#8-pricing--feature-gating)
9. [Poor for CI/CD](#9-poor-for-cicd)
10. [Data Privacy Concerns](#10-data-privacy-concerns)
11. [Competitive Landscape](#11-competitive-landscape)
12. [Key Takeaways for GoPost](#12-key-takeaways-for-gopost)

---

## 1. Forced Account & Cloud Lock-in

**The #1 complaint across every platform.**

Postman began requiring a mandatory account in 2023. Users can no longer use the desktop app without logging in. This was the tipping point that triggered a mass exodus to alternatives like Bruno, Hoppscotch, and Insomnia.

> *"I was annoyed that Postman needed an account and an internet connection just to send a GET request."*
> — [Volt creator on HN](https://news.ycombinator.com/item?id=47323484)

**User sentiment:**
- "I don't want my API requests synced to your cloud. I'm testing localhost endpoints."
- "Why do I need to log in to test an API on my own machine?"
- "Postman holding my data hostage behind a login wall is unacceptable for enterprise security."

**Impact:** Teams in regulated industries (finance, healthcare, government) cannot use Postman because data leaves their network. The account requirement alone disqualifies it from many corporate security policies.

---

## 2. Bloated & Slow Performance

**Second most frequent complaint.**

Postman's startup time has grown from ~2 seconds (v7) to **3–8 seconds** (v10+). Every update adds features most users don't need — collaboration, workspaces, API documentation generators, mock servers, monitoring dashboards.

> *"My team is looking to migrate away from Postman as our API client because it has become very bloated and slow."*
> — [Ask HN: What's the Best Postman Alternative?](https://news.ycombinator.com/item?id=41648918)

**User sentiment:**
- "I just want to send a POST request. Why is Postman loading 47 modules?"
- "Every update makes it slower. v7 was the last good version."
- "The UI freezes for 2 seconds when switching between tabs."

**Startup comparison (from competitor benchmarks):**

| Tool | Startup Time | Binary Size |
|---|---|---|
| Postman | 3–8 seconds | ~500 MB |
| Bruno | <1 second | ~80 MB |
| Volt (Zig) | 42ms | ~4 MB |
| Hoppscotch | Instant (web) | N/A |

---

## 3. Memory Hog

Postman consumes **300–800 MB of RAM at idle** — more than many IDEs. This is particularly painful for developers running multiple Electron apps (VS Code, Slack, Discord, Postman) simultaneously.

> *"RAM idle: ~5 MB (Postman: 300-800 MB)"*
> — [Volt benchmarks](https://github.com/volt-api/volt/blob/main/BENCHMARKS.md)

Opening multiple tabs or collections pushes memory usage past 1.5 GB. This is Electron overhead — Chromium, Node.js, and the app itself all running in one process.

---

## 4. Electron Bloat

Postman is built on Electron. The binary is **~500 MB** — larger than most operating system installers. It bundles an entire Chromium browser.

**User sentiment:**
- "500 MB to send HTTP requests. Think about that."
- "It's literally curl with a GUI. Why is it half a gigabyte?"

**Native alternatives proving this matters:**
- **Bruno** (Electron-free, ~80 MB)
- **Volt** (Zig, 4 MB single binary)
- **Kreya** (Rust + Tauri, <20 MB)
- **RecipeUI** (Rust + Tauri, <20 MB)

---

## 5. Online-Only

The mandatory account means Postman requires internet connectivity even for localhost testing. This is infuriating for:
- Developers on airplanes, trains, or remote locations
- Testing against local services during network outages
- Air-gapped environments (government, defense, finance)

**Competitor response:** Bruno explicitly markets "Offline-First" as its primary differentiator. Hoppscotch works as a PWA with full offline support. Insomnia stores everything locally.

---

## 6. Not Git-Friendly

Postman stores collections as monolithic JSON files with internal IDs, timestamps, and metadata that create **unreadable diffs** when version-controlled. Every trivial change produces dozens of lines of diff noise.

**The problem:**
- Renaming a request → 80 lines of JSON diff (IDs, timestamps, ordering changes)
- Merge conflicts are essentially unresolvable — you must re-import
- No way to review a teammate's collection change in a PR

**Competitor solutions:**
- **Bruno** uses plain-text `.bru` files (markdown-like DSL) — clean git diffs
- **Volt** uses `.volt` files — text-based, version-controlled
- **Hoppscotch** exports as clean JSON without internal metadata
- **`.http` files** (IntelliJ, VS Code REST Client) — just the request text

---

## 7. Complex, Cluttered UI

Postman's UI has accumulated features over a decade:
- Request builder → Collections → Environments → Tests → Pre-request scripts → Monitors → Mock servers → Documentation → API flows → Workspaces → Team management

The result is a **cluttered interface** where the core task (build + send + inspect) is buried under tabs, sidebars, and panels that most users never touch.

**User sentiment:**
- "I can't find the Send button anymore."
- "Why are there 6 different places to set authentication?"
- "The environment variable picker is hidden behind 3 clicks."

**What users actually want:**
1. Type a URL and method
2. Add headers/body
3. Send
4. See the response (status, headers, body)

Everything else distracts from the core workflow.

---

## 8. Pricing & Feature Gating

Postman's free tier has been progressively restricted. Features that were previously free are now behind paid plans:

| Feature | Was Free | Now Requires |
|---|---|---|
| Unlimited collections | ✓ | Team plan |
| Collection runners | ✓ | Basic+ plan |
| API documentation | ✓ | Professional plan |
| Mock servers (unlimited calls) | ✓ | Enterprise plan |
| SSO | — | Enterprise only |
| Audit logs | — | Enterprise only |

**User sentiment:**
- "They keep moving features behind paywalls. What's next — charging per request?"
- "Postman's pricing page is longer than their API docs."
- "Enterprise pricing isn't even listed — 'Contact Sales' = we can't afford it."

---

## 9. Poor for CI/CD

Running Postman collections in CI is painful:
- Requires Newman (separate CLI tool), not built-in
- Newman is slow (Node.js, serial execution)
- Environment management across CI pipelines is fragile
- No native GitHub Actions integration (community-maintained only)
- Test results are hard to parse programmatically

> *"For CI, you copy one binary and run `volt test`. No npm, no Docker, no runtime."*
> — Volt creator

**What's missing:**
- Single-binary CLI runner (like `gopost test ./collection.gopost`)
- Native GitHub Actions / GitLab CI output
- JUnit XML / JSON test result output
- Parallel execution

---

## 10. Data Privacy Concerns

Postman syncs collections, environments, and request history to their cloud servers by default. For many organizations, this is a **security non-starter**.

**Concerns:**
- API keys, tokens, and secrets stored on Postman's servers
- No way to audit where data is stored (US? EU? Which region?)
- Government/defense contractors cannot use it
- GDPR compliance is murky — where is the data processed?
- No self-hosted option for the sync service

**Competitor response:** Nearly every Postman alternative markets "local-only" or "self-hosted" as their headline feature.

---

## 11. Competitive Landscape

The market has exploded with Postman alternatives, each targeting specific pain points:

| Tool | Key Differentiator | Tech Stack |
|---|---|---|
| **Bruno** | Git-friendly `.bru` files, offline-first, open source | Electron-free |
| **Hoppscotch** | PWA, self-hostable, open source | Vue.js |
| **Insomnia** | Local-first, GraphQL support, open source | Electron |
| **Kreya** | gRPC + REST, native desktop | C# / .NET |
| **Volt** | 4MB binary, 42ms startup, Zig | Zig |
| **Yaak** | Fun UI, REST + GraphQL + gRPC | Tauri + React |
| **HTTPie** | Terminal-first, beautiful CLI output | Python |
| **Scalar** | OpenAPI-native, interactive docs | Vue.js |
| **Firecamp** | Multi-protocol, open source | Electron |
| **RecipeUI** | TypeScript-typed requests | Tauri + Next.js |
| **ApiArk** | Local-first, open source | Go |

**The common themes across all alternatives:**
- Local-first / offline-capable
- Git-friendly file formats
- No mandatory account
- Open source
- Small binary / fast startup

---

## 12. Key Takeaways for GoPost

### What GoPost Already Gets Right
- ✅ **No account required** — local JSON storage in `~/.gopost/`
- ✅ **Native desktop** — Wails + Go, not Electron (smaller, faster)
- ✅ **Dark theme by default** — multiple themes built in
- ✅ **Curl import** — paste curl → populate request
- ✅ **Built-in terminal** — real PTY shell via WebSocket
- ✅ **Tab-based editor** — like a real IDE
- ✅ **Horizontal tabs** — Postman-style workflow

### Opportunities to Differentiate Further

**1. Git-Friendly File Format (HIGH PRIORITY)**
Replace monolithic JSON with a directory-per-collection structure:
```
my-api.gopost/
├── collection.json        # Just name + metadata
├── get-users.request.json  # One file per request
├── create-user.request.json
└── environment.json
```
Clean diffs, mergeable, reviewable in PRs.

**2. CLI Runner for CI/CD (HIGH PRIORITY)**
```bash
gopost run ./my-api.gopost --env staging --reporter junit
```
Single binary, no dependencies. Output JUnit XML for GitHub Actions.

**3. Local-First Marketing (MEDIUM)**
Emphasize: "Your data never leaves your machine. No cloud sync. No account. No telemetry."

**4. Performance Benchmarks (MEDIUM)**
Publish comparison: startup time, RAM usage, binary size vs Postman/Insomnia/Bruno.

**5. `.http` File Support (LOW)**
Parse and execute standard `.http` files — compatibility with VS Code REST Client and IntelliJ HTTP Client ecosystems.

**6. Request Scripting (FUTURE)**
Pre-request and post-response scripts — a key Postman feature that most alternatives lack. Could use Go's built-in scripting or a lightweight JavaScript runtime.

**7. GraphQL & WebSocket Support (FUTURE)**
Postman added these late and poorly. First-class GraphQL (schema introspection, autocomplete) and WebSocket (message log, connection state) would be genuine differentiators.

---

## Conclusion

The Postman exodus is real and accelerating. The mandatory account requirement (2023) was the breaking point, but the underlying frustrations — bloat, slowness, cloud lock-in, pricing — have been building for years.

GoPost's positioning as a **native, local-first, no-account-required desktop app built with Go** aligns perfectly with where the market is heading. The opportunity is to capture the developers who want Postman's core workflow (collections, environments, request building, history) without Postman's baggage (accounts, cloud sync, Electron bloat).

**The winning formula:** Fast + Native + Local + Git-Friendly + Free.
