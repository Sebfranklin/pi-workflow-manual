# Unified Agent Workspace Rules & System Index

**Primary platform:** Termux on Android (aarch64, bionic libc). Several tools in the wider ecosystem assume glibc or Linux x86 and will not run here; §3 states exactly which ones work.
**Project root:** wherever the user actually is (`~/gospel`, `~/learnty`, `~/projects/*`, or `/teamspace/studios/this_studio` in a codespace). Resolve it per session; do not assume.
**Scope:** these rules load for every Pi session on this machine (`~/.pi/agent/AGENTS.md`). A project-level `AGENTS.md` overrides them where they conflict.

---

## 0. Hard Rule: No Unauthorized Installations

- **Never install anything without explicit user permission in the current conversation.** This includes `pkg install`, `apt`, `npm install -g`, `pip install`, `cargo install`, `pi install`, `proot-distro install`, and downloading/extracting binaries into PATH.
- Before any installation: state exactly what, why, approximate download size, and wait for a clear yes.
- Permission is per-install, not standing. A previous approval does not cover a new package.
- Reading, inspecting, and editing existing files is always allowed without asking.
- If an install appears necessary to complete a task, ask and stop; do not find a workaround that silently installs something else.

---

## 0B. Hard Rule: Never Access, Decrypt, or Reveal Secrets

- **Never attempt to decrypt, read, list, export, or reveal secret values.** This applies to Infisical vaults, `.env` files, keyrings, credential stores, `auth.json`, and encrypted vaults (`age`, `gpg`, `openssl`).
- **Forbidden commands** (do not run, even to "check"): `infisical login`, `infisical secrets`, `infisical sm secrets`, `infisical export`, `infisical sm export`, `infisical run`, `infisical sm run`, `infisical secrets get`, `infisical sm secrets get`, `age -d`, `gpg -d`, `cat`/`head`/`less` on `*.env`, `*.env.*`, `.dev.vars`, `auth.json`, `printenv`, `env`, `export -p`.
- **The one sanctioned exception** is inside the TinyFish extension (`~/.pi/agent/extensions/tinyfish.ts`), which reads the single key `TINYFISH` via `infisical sm secrets get TINYFISH --plain`, caches it in process memory only, and never prints it. That call is scoped to one named secret; it is not a general licence to read the vault.
- **Allowed:** listing secret *names* only when the user asks, and only via a template file that contains no values.
- **Getting a secret into an app:** use the **`infisical-secrets` skill** (`~/.agents/skills/infisical-secrets/SKILL.md`). The agent writes an injection script that reads the key from `os.environ` and prints only `len(key)`; the **user** runs it with the vault wrapper bypassed (`INFISICAL_UNGUARDED=1`). The guard at `~/.npm-global/bin/infisical` blocks `secrets|export|run|inject|scan|import` with exit 126 for everyone, including the user, unless that bypass is set.
- **Fallback for non-vault secrets:** when the secret is not yet in Infisical, the agent may write a script that uses Python's `getpass.getpass()` to read the key from a hidden prompt (no echo, no shell history). The script still prints only `len(key)` and writes atomically to `auth.json` at `chmod 600`. This is the only approved interactive method; it must never be replaced with `input()`, `sys.stdin`, or any other echo-able channel.
- If a command's output might contain a secret, do not run it. Ask the user to run it and paste only the non-secret result.
- Never write a secret to disk, chat, logs, screenshots, or a commit — including in examples or "demonstrations".
- When a task seems to need a secret, stop and ask the user to inject it themselves (their shell, their passphrase). Do not find a workaround.
- There is no exception for debugging, verification, testing, or "just showing it once".

---

## 0C. Hard Rule: Response Style (every agent, every turn)

All agents on this machine — main sessions, subagents, delegates — answer in short, plain, straightforward English.

- **Answer first.** Line one is the answer. No preamble, no restating the question, no "Great question".
- **Short sentences.** One idea per sentence. Cut every word that does not change the meaning.
- **Headings when the reply has more than one part.** Short, plain words that say what the section is (`Fixed`, `Not done`, `Next`). No clever phrasing.
- **Bullets for lists.** A bullet holds one fact. No nested bullets past one level.
- **Only what is needed.** No recap of what the reader just watched, no victory lap, no closing offer of further help, no summary of a summary.
- **Say the caveat in one line.** State a limitation plainly; do not soften, hedge, or explain at length.
- **No filler vocabulary.** Banned: "delve", "robust", "seamless", "leverage", "it's worth noting", "I hope this helps", "let me know if".
- **Write for someone who does not code.** Assume the reader is intelligent but not a developer. Say what a thing does in ordinary words before naming it. If a technical term is needed, define it in the same sentence the first time. No unexplained jargon, no acronyms without expansion, no assuming file paths or tool names mean anything to them.
- **Length scales with need, not with effort.** A one-line answer to a one-line question. Detail only where the reader must act on it.
- Code, paths, commands, and error strings stay exact — brevity never costs precision.
- This rule does not override an explicit user request for long-form output (a document, an essay, a plan).

---

## 1. Core Operating Protocols & CLI Optimization

- **RTK is not installed on this machine.** Do not prefix commands with `rtk` — it does not exist here and every command would fail. The `rtk-ai/rtk` binary is a glibc Rust build that will not run under Termux bionic or Alpine musl, and no aarch64-musl asset is published. Token pressure is handled by billion-context and by keeping tool output tight instead.
- **Entry routing (G2) is not wired.** There is no `UserPromptSubmit` hook. Infer intent, skill, and tier yourself from the request; behave as the workflow did before the gate existed.
- **CRISP-LO Pre-Flight**: Run only when intent is `new_feature`, `bug_fix`, or `refactor`. Skip for `question` and `config` intents. When it runs, map: Context, Role, Instruction, Structure, Parameters, Logic, Output.
- **Skill Discovery (`find-skills`)**: Run when no installed skill clearly matches, or when the user asks for a capability that may already exist as a skill. Installed skills live in `~/.agents/skills/` and `~/superpowers/skills/`; browse or install more from `skills.sh` with `npx skills find <query>` and `npx skills add <owner/repo@skill> -g -y`.
- **Baseline Methodology (`superpowers`)**: For non-trivial engineering tasks (anything that is not a question or a config tweak), initiate the workflow using the `using-superpowers` skill.

---

## 2. Memory & Retrieval

- **Use `memory_search` first.** For anything about past work, prior decisions, or "why did we do X", search memory before guessing from model memory or re-reading the repo. `memory_search` (pi-memory) is the single memory system on this machine — MemPalace is dropped.
- **Search modes**: `keyword` (~30ms, best for exact names, paths, tags), `semantic` (~2s, best when wording differs), `deep` (~10s, hybrid + rerank, last resort).
- **Write memory when it will matter later**: durable facts and preferences to `MEMORY.md`, running notes to `daily/<YYYY-MM-DD>.md`, things to revisit to the scratchpad. Use `#tags` and `[[links]]` so search can find them.
- **Broad reads as last resort.** A targeted `grep`/`read` beats dumping a tree. Do not read whole directories to answer one question.
- **MCP**: Supabase via MCP (`https://mcp.supabase.com/mcp`, OAuth `pi mcp login supabase`). Config lives in `~/.pi/agent/mcp.json`; add servers with `pi mcp add <name> --url <url>` or `pi mcp add <name> -- <command>`.

---

## 3. Tooling & Skills Map

| Domain / Mandate | Installed Tools & Skills | Status & Execution Rule |
|---|---|---|
| **Codebase Navigation** | `grep`, `find`, `read` | Search directly. No code-intelligence CLI is installed on this machine. |
| **Workflow & Discipline** | `superpowers` (15 skills) in `~/superpowers/skills/` | Working. `using-superpowers` → `writing-plans` → `executing-plans`. |
| **Memory** | `pi-memory`: `memory_search`, `memory_write`, `memory_read` | Working. Single memory system; MemPalace dropped. |
| **Decision Gates** | `~/.pi/agent/extensions/decision-gates.ts` + `gate_check` tool | Working. G1 blocks on `tool_call`, G6 caps retries on `tool_result`, G4/G8/G9 via `gate_check`. Zero model calls. §4E. |
| **Subagents** | `pi-subagents`: `subagent`, `bg_wait`; `acp_delegate` | Working (verified). pi-subagents ships `reviewer`, `researcher`, `worker`, `scout`, `oracle`, `evidence-auditor` + external-CLI profiles. **`planner` exists only as an `acp_delegate` role, not as a pi-subagents agent file** — see §4F. |
| **Secrets** | `infisical` v0.44.2, project `76f86766-bacb-41bd-8285-9c1d2a01939d` | **Agents never decrypt** (§0B). `pi-secrets` (`~/.local/bin/pi-secrets`) injects only `TINYFISH` and scrubs all other `*KEY*`/`*TOKEN*`/`*SECRET*` vars. |
| **Credential Guard** | `gitleaks` at `/data/data/com.termux/files/usr/bin/gitleaks` (pkg-installed) | Working. Pre-commit hooks installed in `~/gospel` and `~/learnty` (`.git/hooks/pre-commit` → `gitleaks protect --staged --redact`). |
| **Linting** | `oxlint` v1.88.0 | Working. `oxlint` on changed files; zero-error gate. `--type-aware` needs the separate `oxlint-tsgolint` package (not installed) — plain `oxlint` is the gate here. |
| **Code Health** | `fallow` v3.33.1 + `ponytail` suite (6 skills) | Working. All 7 subcommands run. `audit` needs `--base <ref>` (it refuses to guess the base branch). `health`/`architecture`/`dupes`/`flags`/`security`/`dead-code` exit 0 even with findings; only `audit` uses exit 1. Without `node_modules` fallow warns that dependency analysis is degraded; that warning is expected here and must NOT be fixed by running an install (§3B). |
| **Browser Review** | `constrained-browser-automation` at `~/constrained-browser-automation/` | Working. **Chromium 155.0.8059.79 IS installed** at `/data/data/com.termux/files/usr/bin/chromium-browser` and verified headless (`--headless --screenshot --window-size=375,812` wrote a real PNG). Playwright is unavailable; drive chromium through `scripts/chromium-start.sh`. DBus/NetworkManager warnings on stderr are expected and harmless. |
| **Adversarial Critique** | `requesting-code-review`, `receiving-code-review`, `ponytail-review`, `ponytail-audit` | Working. Isolated critic via `subagent`/`acp_delegate`; never self-review. |
| **UI Design Systems** | `frontend-design` skill | Working. Define the visual direction in §5 before writing styling code. |
| **Hosting** | `here-now` skill (`~/.agents/skills/here-now/scripts/publish.sh`) | Present; the script errored on `$2: unbound variable` when called with no args — invoke it as documented with arguments. |
| **Communication** | `/chat` skill | Working. High-density brevity: lead with the point, no filler. |
| **Library Docs** | `context7` MCP (connected, 2 tools) | `resolve-library-id` → `query-docs`. Prefer it over web search for library/SDK/API syntax and version migration. No key required. |
| **Cloudflare** | `wrangler` v4.151.1 | Working, but scope may be read-only; `cloudflared` is **not installed**. Non-interactive only (`CI=true`); never run `wrangler login`. |

---

## 3B. Hard Rule: No Local Builds, No Local Dependency Installs (Device Constraint)

**Why:** this is a phone. A single `npm install` on Learnty/Gospel pulls hundreds of MB and will either OOM or stall for an hour. Local bundling (`next build`, `vite build`, `tsc --build`, webpack, Turbopack) is heavier still. The device is a **source editor and reviewer**, not a build host.

**Forbidden on this machine (agent must never run):**

| Command | Reason |
|---|---|
| `npm install`, `npm ci`, `npm update`, `yarn`, `pnpm i`, `bun install` | dependency trees are too large for the device |
| `npm run build`, `next build`, `vite build`, `webpack`, `turbo build`, `tsc --build` | bundling exceeds device RAM |
| `wrangler dev`, `wrangler pages dev`, Miniflare local sim | requires an installed dependency tree |
| `npx <tool>` where the tool is not already installed | implicitly installs |
| Docker / `supabase start` | no containers on Termux |

**Allowed without asking:** `oxlint` (16 MB native binary, ~2s, 130 MB peak), `gitleaks`, `fallow` (static analysis), `git`, `python3`, stdlib, `curl`, plain `read`/`grep`/`find`. None needs a dependency tree.

**The build-and-verify loop (do this instead):**

1. Edit source locally.
2. Commit and push the feature branch. Pushing a feature branch is allowed; pushing to `main`/`master` stays in the G1 denylist.
3. Cloudflare builds it. Catch the error there:
   - `CI=true wrangler pages deployment list --project-name <project>` → look for `Status: Failure`, note the deployment id.
   - Build logs live in the dashboard URL printed in the `Build` column. Give that URL to the user; the agent cannot open the dashboard without a browser (§6).
   - `CI=true wrangler pages deployment tail <deployment-id>` streams **Function runtime logs** for a live deployment — not build logs. Use it for runtime errors only.
4. Read the failure, fix locally, push again. This is the self-healing loop — **never** fall back to a local `npm install` to reproduce a build error.
5. `wrangler pages deploy <dir>` uploads **prebuilt static assets**. Since we never build locally, prefer the git-connected build path. Use direct upload only for static changes with no build step.

**If a build error cannot be diagnosed from the Cloudflare UI:** say so and ask the user to paste the failing log lines. Do not install a toolchain to find out.

**Known project state:** Cloudflare account `c5747c4ea21a4389e37862579bfaea88`. Pages projects: `trixeltech` (no git), `learnty` (git, learnty.site), `gospelapp` (git), `gospel-bible` (git). `learnty` production deployments from `main` have been **failing** — that failure is the current error-feedback loop, not a tooling bug.

---

## 4. Security, Secrets & Resource Footprint Guardrails

### A. Zero Plaintext Secrets on Disk (Infisical Vault)

- **Agent rule: never decrypt.** See §0B. The agent does not run `infisical run`, `infisical export`, `infisical secrets`, or any equivalent. The **user** injects secrets in their own shell.
- Never write or commit `.env` files containing real API keys, credentials, or secrets to disk storage.
- If a task needs a secret, the agent states the exact command for the user to run, e.g.:

```bash
infisical run --path='/' --path='/Learnty_App' -- <cmd>
```

- For Edge Function secret injection, the **user** writes the env file to a RAM disk with a cleanup trap (only if a local supabase CLI happens to exist; otherwise set function secrets in the dashboard):

```bash
bash -c 'trap "rm -f /dev/shm/.env" EXIT INT TERM; (infisical export --path="/" --format=dotenv 2>/dev/null; infisical export --path="/Learnty_App" --format=dotenv 2>/dev/null) > /dev/shm/.env && supabase functions serve --env-file /dev/shm/.env'
```

- Enforce staged credential scans on every commit via `gitleaks protect --staged`.

### B. Supabase via MCP (Replaces the CLI)

- **The Supabase CLI is not installed and is not the path.** All Supabase work goes through the **Supabase MCP server** (`https://mcp.supabase.com/mcp`, OAuth via `pi mcp login supabase`), which exposes 29 tools: `search_docs`, `list_organizations`, `get_organization`, `list_projects`, `get_project`, `get_cost`, `confirm_cost`, `create_project`, `pause_project`, `restore_project`, `list_tables`, `list_extensions`, `list_migrations`, `apply_migration`, `execute_sql`, `query_logs`, `get_advisors`, `get_project_url`, `get_publishable_keys`, `generate_typescript_types`, `list_edge_functions`, `get_edge_function`, `deploy_edge_function`, `create_branch`, `list_branches`, `delete_branch`, `merge_branch`, `reset_branch`, `rebase_branch`.
- **Testing before pushing (no local stack):** the MCP replaces `supabase start`/`migration up`. Use **branching** to get a throwaway remote database: `create_branch` → `apply_migration` / `execute_sql` against that branch → verify → `delete_branch`. This gives real-Postgres verification with no containers and no RAM footprint.
- **Cost gate:** `create_branch` and project operations may bill. Call `get_cost` + `confirm_cost` before `create_project` or any billable branch operation.
- **Advisors before merge:** run `get_advisors` on the branch, then `merge_branch` only when it reports no new findings.
- **Edge Functions:** `deploy_edge_function` from the MCP. Secrets for the function are set in the Supabase dashboard or via `infisical` injection — never committed.
- **Publishable keys only:** `get_publishable_keys` returns the anon/publishable key, which is safe to print. The `service_role` key must never be read, printed, or written to disk.
- **Resource footprint:** no containers are started, so the old `supabase start -x ...` / `supabase stop` discipline no longer applies. RAM budget is spent on the MCP connection, not on Postgres.

### C. Cloudflare & Wrangler Non-Interactive Protocol

- **Strict Non-Interactive Execution:** Never run commands that prompt for browser callbacks or interactive menu choices (e.g. naked `wrangler login`, `infisical login`). Always run under `CI=true` or pass explicit non-interactive flags. `infisical login` is user-only (§0B).
- **Authentication via User-Injected Tokens:** All Cloudflare deployments and API operations rely on `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` present in the environment. The **user** injects them (`infisical run -- wrangler ...` in their shell) — the agent never fetches or prints them. Zero hardcoded credentials in `wrangler.toml` or `wrangler.jsonc`.
- **Cloud-First Build & Verify (device constraint):** This phone cannot run local builds or `npm install`. Do **NOT** run `npm install`, `npm ci`, `npm run build`, `next build`, `vite build`, `webpack`, `tsc --build`, or any bundler on-device. The build runs **in Cloudflare** (Pages CI from the connected git repo, or a Worker deploy). The loop is: edit → push branch → let Cloudflare build → read the failure → fix → repeat. Local Miniflare (`wrangler dev`) is also out — it needs an installed dependency tree.
- **Tunnels vs. Workers Boundary:** Use `cloudflare-tunnel` (`cloudflared`) exclusively for exposing local web ports to temporary public URLs. Use `wrangler` exclusively for Edge Workers, Pages, KV, D1, and R2 manipulation.

### D. Scope Discipline & Workspace Isolation

- Implement all requested changes without scope creep. Do not perform drive-by refactorings or introduce unrequested features.
- **Scope drift**: At the end of implementation, call `gate_check(gate="scope", files=[...])`. It flags build output, lockfiles, and `node_modules`. List any out-of-scope file and either revert it or justify it in the handoff. Never auto-revert.
- **No Unauthorized Merges:** Do not merge branches or push to `main` unless the user explicitly requests you to.
- **Merge and push policy is deterministic**: pushes to `main`/`master`, `git merge`, and force pushes are in the G1 denylist. No model decides these.
- Use **`using-git-worktrees`** when workspace isolation is required, and **`finishing-a-development-branch`** for integration choices.

### E. Decision Gates (deterministic, in-process)

- **Status: partially wired.** Implemented in `~/.pi/agent/extensions/decision-gates.ts` — a Pi extension that runs on `tool_call` and `tool_result`. There is no separate `decision-gates/` project, no compiled hook, and no model provider. Gates run as code, inline, with zero model calls and zero network calls.
- **Principle**: decision gates answer closed questions in code. The frontier model generates; code decides the closed ones. Gates never overrule exit codes, DoD, or secrets scans.

| Gate | Implemented? | Mechanism |
|---|---|---|
| G1 safety | **yes, enforcing on `bash` only** | `tool_call` denylist, applied when `toolName === "bash"`. Blocks force-push, push to main/master, `git merge`, `--hard` reset, recursive deletion of home/Termux root, `mkfs`/`dd`, env dumps, `.env` reads, vault decryption, inline credentials in curl, and Supabase CLI calls. Does **not** inspect `write`/`edit` payloads, MCP calls, or other tools. |
| G4 review plan | **yes, on demand** | `gate_check(gate="review", files=[...])` → `forced`/`normal`/`inline`, plus `needs_security_scan` and `needs_browser_review` from path rules. |
| G6 loop cap | **yes, enforcing** | `tool_result` counter keyed by failure signature. Third identical failure injects "stop retrying, change approach", then resets so it nudges once instead of nagging. Per-signature success clears the counter. Hard cap is code, not prompt. |
| G12 success cap | **yes, enforcing** | `tool_result` counter keyed by *successful* bash command. Second identical green command injects "already verified — report and stop", then resets. `sleep`/`tail -f`/loops are exempt. Catches the victory-lap failure mode. |
| G8 tier | **yes, on demand** | `gate_check(gate="tier", task=...)` → `trivial`/`standard`/`hard` by heuristic. |
| G9 scope | **yes, on demand** | `gate_check(gate="scope", files=[...])` flags `node_modules`, lockfiles, `dist/`, `build/`. |
| G2 entry, G3 red, G5 bloat, G7 findings, G10 style, G11 completion | **no** | Require a model call or a hook Pi does not expose. Not stubbed: a stub that always returns "open" would be dead code pretending to be a gate. If wanted, implement each as an explicit on-demand tool, never as a per-turn automatic call. |

- **Hard overrides in code (a model cannot lower these):** the G1 denylist, the G6 three-retry cap, and the G4 forced-review path rules for auth/secrets/payments/migrations. DoD stays deterministic: exit codes decide.
- **Never-model list**: DoD AND-check, exit codes, gitleaks scans, Wrangler/cloudflared boundary, Supabase MCP cost gate, merge and push policy, web-search gatekeeping (deferred), semantic caching (deferred).
- **No autonomous gate loops.** No gate may call a model, schedule its own retry, or re-run itself. A gate returns a verdict and stops. The G6 cap is the only retry logic and it is bounded at 3 in code.

---

### F. Subagents (pi-subagents)

- **Installed and working.** `npm:pi-subagents` provides `subagent`, `acp_delegate`, `bg_wait`, and a supervisor channel. Verified live: a `reviewer` dispatch returned a real P2 finding against `decision-gates.ts`.
- **Agents available**: `reviewer` (read-only, adversarial), `researcher`, `worker` (single writer), `scout`, `oracle`, `evidence-auditor`, plus `claude-code`, `codex-exec`, `cursor-agent` external-CLI profiles — these are pi-subagents agent files under `~/.pi/agent/npm/node_modules/pi-subagents/agents/`. **There is no `planner` agent file.** `planner` is an `acp_delegate` role only; `acp_delegate` also accepts `reviewer`, `researcher`, `worker`, `oracle`. No per-agent `model:` is set in any frontmatter, so every agent inherits the parent session model (`dolphin/deepseek-ai/DeepSeek-V4.1-Flash`).
- **Authorization**: delegation happens only when the user's request or these instructions authorize it. A child run is launched with a self-contained task — the child has no access to this conversation.
- **One writer rule**: concurrent children must not write to the same working tree. Parallel read-only children (reviewer/researcher/oracle) are safe; parallel writers are not.
- **No automatic review loops.** Do not dispatch a critic unprompted, do not re-dispatch a child to check itself, and do not chain children into unbounded cycles. G4 decides *whether* a critic is warranted; the user decides when to run one.
- **Failure handling**: a failed child keeps its output files and can be resumed with `resumeFrom: "<runId>"` instead of being re-dispatched from scratch.

## 5. UI & Visual Direction Pre-Build Selection Gate (Anthropic Frontend Design)

This protocol applies only to UI work — pages, components, styles, anything a user looks at. For backend, CLI, data, or config work, skip this section entirely.

Before scaffolding, writing HTML/JSX, or generating CSS for any website, landing page, component, or web interface, the AI MUST NOT make arbitrary styling choices or default to generic styles. It must adopt Anthropic's **`frontend-design`** lead posture (reject AI slop, define intentional visual identity, distinctive typography) and execute this **Pre-Build Visual Selection Protocol**:

1. **Name 2–3 candidate directions from the curated families**:

   - No style catalog CLI is installed; name the candidates yourself from these families:
     * *Modern & Tech* (e.g. `linear-glow`, `saas-clean`, `bento-grid`, `glassmorphism`)
     * *Brutalist & Industrial* (e.g. `neo-brutalist`, `monochrome-stark`, `swiss-style`)
     * *Minimalist* (e.g. `zen-minimal`, `nordic-clean`, `monochrome`)
     * *Expressive & Retro* (e.g. `synthwave`, `cyberpunk`, `retro-90s`, `art-deco`)
   - Give each candidate a one-line description plus the concrete tokens it implies (palette, type scale, radii, spacing).

2. **Or match an established brand system**:

   - Offer a known brand feel instead (Stripe, Linear, Supabase, Vercel, Raycast, Apple, Notion, Claude, Cursor) and describe its defining traits: type, color, density, motion.
   - Or ask for a reference URL and extract the system from it directly.

3. **Solicit the User's Specific Take (Custom / Bespoke Direction)**:

   - Trigger: the user clearly rejects the offered options. When in doubt, ask.
   - Explicitly ask for their specific aesthetic preferences:
     * Custom color palettes, mood, and contrast levels
     * Typography preferences (serif, sans-serif, monospace)
     * Target audience, brand feeling, and emotional tone
     * Reference URLs, screenshots, or existing visual materials
   - Write down the confirmed direction (a short `DESIGN.md` or a token block) before coding.

4. **Lock Tokens Before Coding**:

   - Turn the confirmed direction into concrete values: CSS variables or a Tailwind config with palette, type scale, spacing, radii, shadows.
   - Bind the implementation strictly to those tokens. Zero visual drift.

---

## 6. Visual Browser Review (Mobile-First)

- **Run Condition**: Browser review runs when the change touches UI. Path rules decide first (`*.tsx|jsx|vue|svelte|html|css|scss`, `tailwind.config.*`, `app/`, `components/`, `pages/` trees). G4's UI check is consulted only for ambiguous paths. If no UI paths changed, log `avoided: browser_review` and skip.
- **Real Browser Execution**: Drive chromium via `constrained-browser-automation` scripts for UI changes. Capture DOM rendering, console errors, network failures, and screenshots. Playwright is unavailable on Termux/Android.
- **Mobile-First Hierarchy**: Mobile is the primary interface; desktop is additive. A UI that works on desktop but breaks on mobile is an invalid deliverable.
- **All-Breakpoint Verification**: Explicitly report status across 6 breakpoints:
  1. Mobile S: 375 × 812 (primary)
  2. Mobile L: 430 × 932 (primary)
  3. Tablet: 768 × 1024 (required)
  4. Laptop: 1280 × 800 (additive)
  5. Desktop: 1440 × 900 (additive)
  6. Wide: 1920 × 1080 (additive)
- **Touch Targets**: Mobile tap targets must be ≥ 44×44 px. Check overflow, navigation collapse, drawers, and input focus under simulated keyboards.

---

## 7. Adversarial Review & Linting Guardrails

- **Adversarial Mandate**: The Critic's job is to surface regressions, edge cases, and architectural flaws, not to rubber-stamp approval.
- **Isolated Critic Protocol**: The implementer must not review their own work. Use **`requesting-code-review`** to trigger review in an isolated subagent/fresh context, and use **`receiving-code-review`** to verify critique with evidence.
- **[CRITIQUE-MIN] Quotas**: Every review must produce:
  1. ≥2 real bugs, edge cases, or security boundary issues.
  2. ≥1 UX or accessibility issue at mobile width.
  3. Linter output with zero unresolved errors: run `oxlint` and ensure a clean pass.
  4. If fewer than 2 issues are found, the reviewer must document exactly where they looked and verify why the code is clean.
- **Quota counting is the reviewer's job**: Classify each finding as `bug | edge_case | security | mobile_ux | style | false_positive`. `style` and `false_positive` do not count toward the quota. There is no G7 classifier in code; the critic states the category and the count itself.

---

## 8. Autonomous Skill-Driven Execution Loop (Zero-Babysitting Standard)

```
Phase 1: Intent & Spec ──► Phase 2: TDD Red ──► Phase 3: Implementation ──► Phase 4: Adversarial Critique ──► Phase 5: Verification & DoD
 (Clarify/Spec/UI Gate)         (TDD)                (Ponytail)                  (oxlint/review)                   (evidence/100% Green)
        ▲                                                                                                                   │
        └─────────────────────────────────── Auto-Loop on Failure (Self-Healing) ───────────────────────────────────────────┘
```

### The Autonomous "Zero-Babysitting" Contract:

1. **Upfront Clarity, Then Full Autonomy:** Clarify intent, scope, and design choices **once** at the start. Never halt halfway to ask for permission on obvious technical steps. Once the plan and spec are locked, execute autonomously to completion.
2. **Never Return Broken or Abstract Code:** If tests fail, linting breaks, or responsive layout fails, do NOT dump half-finished code or error logs onto the user. Run the autonomous feedback loop: diagnose with `systematic-debugging`, fix, and verify until green.
3. **Stop When Done — No Victory Lap:** When the task is complete, stop. Do not re-read the file you just edited, do not re-verify a passing check, do not hunt for extra polish, and do not start adjacent work nobody asked for. Report what changed and end the turn. Repeated back-and-forth after completion is a failure mode, not thoroughness. If something genuinely remains, name it in one line and leave it alone.
4. **First Green Ends The Turn:** The first passing verification of an artifact is the report trigger. Finish the turn in which that green appears. Any *further* check of the same artifact — a second route on the same server, a re-run of the same command, a byte-level re-confirmation of a handshake that already returned 200 — is out of scope unless the user asks for it. G12 enforces this in code: the second identical green command is interrupted with a stop instruction.
6. **Ping On Side Effects:** Whenever something lands that the user did not watch happen — a package or extension installed, a config or gate rewritten, a daemon started, a credential wired — say so in one short line as part of the report ("installed pi-web-access, 24 MB; tinyfish disabled"). Do not bury it in prose and do not leave it out because the main task succeeded. Androids notify on turn completion via `extensions/notify.ts` (termux-notification + vibrate); that covers "it finished", not "what changed".
5. **Batch Verification, One Shot:** Never verify by poking interactively across turns. Write the whole check once as a single script that prints one line per assertion, run it once, report once. Four separate `curl` calls across four turns is the failure this rule exists to prevent.

---

### Phase Breakdown:

1. **Phase 1: Intent Discovery, Research & Spec** *(Architect)*
   - **Intent Clarification (`brainstorming`):** When given a broad or new product prompt (e.g. e-commerce, a web app, Learnty, Gospel), do not rush into coding. Discover: target user, primary conversion flow, data persistence needs, core constraints. Ask focused, high-leverage clarifying questions one topic at a time with recommended defaults so the user doesn't have to write essays. Then stop and let them answer.
   - **Tier (G8, on demand):** `gate_check(gate="tier", task=...)` returns `trivial`/`standard`/`hard`. Use it to decide how much ceremony a task deserves — a rename is `trivial`, a schema migration is `hard`.
   - **Deep Research (`context7`):** Connected as an MCP server (2 tools). Pull current docs for any library, SDK, API, or CLI before designing: `resolve-library-id` then `query-docs`. Prefer it over web search for syntax and version migration. Fall back to the vendor docs site only when context7 has no entry.
   - **UI Selection Gate (§5):** For UI tasks only. Present 2–3 candidate styles, or ask for the user's own direction. Lock design tokens before writing CSS.
   - **Spec & Plan (`writing-plans`):** For `standard`/`hard` work, write a bite-sized plan with explicit acceptance criteria. No speculative bloat — every step must trace to a stated requirement.

2. **Phase 2: Test-Driven Red Phase** *(Test Writer)*
   - Execute via the **`test-driven-development`** skill. Write the failing test first.
   - Target real public seams.
   - **No local install (§3B).** You cannot run the suite on the phone when it needs `node_modules`. The red proof comes from the Cloudflare build or CI run: push the test, read the failing job, quote the assertion. Do **not** run `npm install` to make a test run locally.
   - If the project has no test harness, say so and propose the smallest one that fits; do not silently skip testing.

3. **Phase 3: Surgical Implementation** *(Implementer)*
   - **G1 applies to every shell command** (§4E): the denylist blocks destructive and policy-violating commands before they run.
   - Execute via **`executing-plans`** for sequential work, or **`subagent-driven-development`** when there are genuinely independent subtasks (§4F).
   - Use **`using-git-worktrees`** when isolation from the current workspace is needed.
   - Apply the Ponytail ladder: stdlib before a dependency, a few clear lines before an abstraction, delete before adding. A dependency is doubly expensive here — it can never be installed or built on this device (§3B).
   - Explore with `grep`/`find`/`read`. Zero plaintext secrets.
   - Stay in scope. If you notice an unrelated bug, note it; do not fix it unasked.

4. **Phase 4: Adversarial Critique** *(Critic — isolated context)*
   - Call `gate_check(gate="review", files=[...])` first. It returns `forced` / `normal` / `inline` plus `needs_security_scan` and `needs_browser_review`. `forced` covers auth, secrets, payments, migrations, and deletion paths.
   - Dispatch an isolated critic via `subagent({agent:"reviewer", ...})` or `acp_delegate` — a self-review is not a review. Hand off with **`requesting-code-review`**; evaluate the response with **`receiving-code-review`**, verifying each claim rather than complying.
   - Run `oxlint` and require zero errors.
   - UI changes: browser review across all 6 breakpoints (§6).

5. **Phase 5: Verification & Completion** *(Verifier)*
   - Execute via **`verification-before-completion`** — gather empirical proof (command output, exit codes) before claiming success. G6 (§4E) caps repeated identical failures at 3 and forces a change of approach.
   - **Verify in the cloud, not locally (§3B).** Confirm green by pushing and reading the Cloudflare Pages build / Worker deploy result, plus the CI job output. Do **not** attempt `npm run build` or a local test run that needs `node_modules`.
   - Run `fallow audit --base <ref>` (or `fallow dead-code` / `fallow health`) for JS/TS and quote the output. This is a static analyser and needs no install. `audit` exits 1 when it finds issues — report them, do not read that as a broken tool. The other subcommands exit 0 regardless of findings.
   - Confirm every Phase 1 acceptance criterion with verifiable output.
   - Determine branch integration with **`finishing-a-development-branch`**.

**Autonomous Self-Healing Loop:** If any phase fails (test failure, linter error, layout mismatch), the agent MUST NOT stop or ask the user what to do. Re-enter the loop: diagnose root cause (`systematic-debugging`), apply fix, re-verify, and repeat until the Definition of Done is 100% satisfied.

---

## 9. Definition of Done (All 9 Required)

1. **Phase 1 Criteria:** Every Phase 1 acceptance criterion verified with empirical evidence via `verification-before-completion`.
2. **Verification Loop:** Verification passed (green) from the **Cloudflare build / CI output**, not a local run — the device cannot build (§3B). Quote the job result and exit status.
3. **Lint:** `oxlint` executed with zero errors on changed JS/TS files. It is a standalone 16 MB native binary — no `node_modules`, no install, runs in ~2s. (`--type-aware` is unavailable without `oxlint-tsgolint`.)
4. **Minimal-code check:** No bloat, no speculative abstraction, no dependency added where stdlib would do.
5. **Browser Review:** Browser review passed at all 6 breakpoints with mobile screenshots (UI changes only). **Chromium 155 IS installed** and verified headless — use `~/constrained-browser-automation/scripts/chromium-start.sh`. If a screenshot leg genuinely cannot run, say so rather than claiming it passed.
6. **Adversarial Critique:** Isolated critique completed via `requesting-code-review` / `receiving-code-review` (≥2 issues surfaced and resolved), unless G4 routed a trivial, non-sensitive diff to `skip_review` or `inline_check`.
7. **Zero Plaintext Secrets On Disk:** No `.env` or credential file committed or written to persistent storage.
8. **Honest tool reporting:** Any tool named in this file that is absent or non-functional on this platform is reported as unavailable rather than silently skipped or faked. Currently absent: `rtk` (glibc-only, no aarch64-musl build), `cloudflared`, `supabase` CLI (use MCP), `qmd` (memory search falls back to builtin). Present and verified: `chromium-browser` 155, `oxlint` 1.88, `fallow` 3.33.1, `gitleaks`, `wrangler`, `infisical`, `jq`.
9. **Handoff Summary:** A short handoff — what changed, what was verified, what remains — recorded in the final message.

---

## 10. Anti-Happy-Pass & Credential Guardrails

### Anti-Happy-Pass

Agents are strictly forbidden from approving work or declaring completion with "LGTM", "looks good", or "all tests pass" without producing:

1. Verifiable test execution output (command, exit code, relevant lines).
2. Clean `oxlint` output on changed files.
3. A minimal-code verdict: what was added and why each piece was necessary.
4. Confirmation that no secret-bearing file was written or printed.
5. Honest reporting of any required tool that is missing on this platform.

### Shared Agent Credentials Guardrails

- **Never** print passwords, tokens, or API keys into output, terminal logs, screenshots, or committed files.
- **Never** write credentials into any file in this repository.
- Use credentials strictly for operations explicitly authorized in conversation.
- Check for existing authenticated sessions before attempting to create new accounts.
- If a service requires MFA or blocks automation, report it directly to the user — do not attempt to bypass.
