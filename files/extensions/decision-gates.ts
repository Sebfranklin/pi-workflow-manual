import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Decision Gates — deterministic implementation of AGENTS.md §4E.
 *
 * DESIGN RULES (avoiding the "unlimited loop check" failure mode):
 *   1. ZERO model calls. Every gate is regex / path / counter logic. Free, instant, offline.
 *   2. Every counter is bounded. G6 hard-caps at 3 retries in code, not by prompt.
 *   3. Fail-closed only where a mistake is unrecoverable (G1 on denylisted commands).
 *      Everything else fails open, matching §4E.
 *   4. Advisory gates never block and never ask. They append one line and continue.
 *
 * Gate coverage here: G1 (safety), G4 (review plan), G6 (loop cap), G8 (tier), G9 (scope).
 * G2/G3/G5/G7/G10/G11 need a model or a hook pi does not expose; they stay advisory
 * one-liners rather than half-built stubs that would silently do nothing.
 */

// ── G1: command denylist (pre-check, code, free) ────────────────────────────
// Matched against a normalized command string. Any hit blocks the call.
const DENYLIST: Array<[RegExp, string]> = [
  [/\bgit\s+push\b.*\s(-f|--force)\b/, "force push"],
  [/\bgit\s+push\b.*\b(main|master)\b/, "push to protected branch"],
  [/\bgit\s+merge\b/, "merge (do it in a PR)"],
  [/\bgit\s+reset\s+--hard\b/, "destructive reset"],
  [/\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)+(\/|~|\$HOME)\s*$/, "rm of home or root"],
  // Only the Termux root and its critical top-level dirs. The previous form
  // matched ANY path under /data/data/com.termux, so clearing a file in
  // usr/tmp was blocked as "rm of Termux root" — a false positive that forced
  // the user to run routine cleanup by hand.
  [/\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)+\/data\/data\/com\.termux(\/(usr|home|bin|etc|lib|libexec|var|opt|share))?\/?\s*$/,
    "rm of Termux root"],
  [/\bmkfs\b|\bdd\s+.*of=\/dev\//, "disk write"],
  [/\bchmod\s+-R\s+777\s+\//, "world-writable root"],
  [/\binfisical\s+(login|secrets|export|run)\b/, "Infisical secret access is user-only (AGENTS.md §0B)"],
  [/\binfisical\s+sm\s+(secrets|export|run|agent-proxy)\b/, "Infisical secret access is user-only (AGENTS.md §0B)"],
  // Only an actual env-dump invocation. An earlier `\benv\b` matched any command
  // merely mentioning "env" (a grep pattern, a config path), which blocked
  // legitimate work. Anchor to command position instead.
  [/(^|[;&|]\s*|\s)(printenv|env|export\s+-p)(\s|$|[|>])/, "environment dump (may contain secrets)"],
  [/\bcat\b[^|;]*\.(env|dev\.vars)\b/, "reading an env file"],
  [/\b(age|gpg|openssl)\s+(-d|--decrypt)\b/, "decrypting a vault"],
  [/\bcurl\b[^|;]*\b(-H|--header)\b[^|;]*\b["']?(Authorization|X-API-Key)\b/i, "inline credential in curl"],
  [/\bsupabase\s+(start|stop|migration|db|functions|secrets|link)\b/, "Supabase CLI is replaced by MCP (§4B)"],
];

// Commands that are fine as a single simple command. Kept for reference: the denylist
// above already inspects the full string, so composition is not silently allowed.
// eslint-disable-next-line no-unused-vars
const SAFE_PREFIXES = [
  "ls", "cat", "head", "tail", "wc", "grep", "rg", "find", "sed", "awk",
  "git status", "git diff", "git log", "git add", "git commit", "git branch",
  "node", "npm", "npx", "python3", "pip", "oxlint", "gitleaks", "fallow",
  "which", "command", "echo", "pwd", "cd", "test", "mkdir", "cp", "mv",
  "du", "df", "ps", "curl", "jq", "tar", "chmod", "pi", "ripwire",
];

function normalize(cmd: string): string {
  return cmd.replace(/\s+/g, " ").trim();
}

function checkSafety(cmd: string): { blocked: boolean; reason?: string } {
  const norm = normalize(cmd);
  for (const [re, label] of DENYLIST) {
    if (re.test(norm)) return { blocked: true, reason: label };
  }
  return { blocked: false };
}

// ── G4: review plan (path rules, code, free) ────────────────────────────────
const FORCED_REVIEW_PATHS = [
  /(^|\/)(auth|login|session|oauth|jwt|password)/i,
  /(^|\/)(payment|billing|stripe|checkout)/i,
  /(^|\/)(migrations?|schema\.sql)/i,
  /(^|\/)(\.env|secrets?|credentials?)/i,
  // Must be a path SEGMENT that begins with the word. The previous form
  // `/(^|\/)delete|destroy|drop/i` let the alternation escape the group, so
  // `dropdown.tsx`, `backdrop.css` and `src/dropdown/` were all flagged as
  // deletion paths and forced a critic on unrelated UI work.
  /(^|\/)(delete|destroy|drop)([^a-z0-9]|$)/i,
];

const UI_PATHS = /\.(tsx|jsx|vue|svelte|html|css|scss)$|(^|\/)(components|pages|app)\//;

// Files written/edited during the current turn, so G4 can be derived from what
// actually changed instead of only when the model remembers to ask gate_check.
const touched = new Set<string>();

/** Normalise a tool input's path argument. write/edit use `path`; bash has none. */
function pathFromInput(toolName: string, input: any): string | null {
  if (toolName !== "write" && toolName !== "edit") return null;
  const p = input?.path;
  return typeof p === "string" && p.length > 0 ? p : null;
}

function reviewPlan(files: string[]): {
  level: "forced" | "normal" | "inline";
  ui: boolean;
  security: boolean;
} {
  const forced = files.some((f) => FORCED_REVIEW_PATHS.some((re) => re.test(f)));
  const ui = files.some((f) => UI_PATHS.test(f));
  const security = files.some((f) => /(^|\/)(auth|login|oauth|payment|migrations?)/i.test(f));
  if (forced) return { level: "forced", ui, security: true };
  if (files.length <= 1) return { level: "inline", ui, security };
  return { level: "normal", ui, security };
}

// ── G6: loop cap (code-enforced, capped at 3) ───────────────────────────────
const RETRY_CAP = 3;
const failures = new Map<string, number>();

function signature(toolName: string, output: string): string {
  // First two lines carry the failure identity in almost every runner.
  const head = output.split("\n").filter((l) => l.trim()).slice(0, 2).join(" ");
  return `${toolName}::${head.slice(0, 200)}`;
}

// ── G12: success cap (code-enforced) ────────────────────────────────────────
// The failure mode this catches: an artifact is already working, but the agent
// keeps re-probing it (curl again, curl the other route, then a handshake test)
// instead of reporting. First green ends the turn; the second identical green
// command is interrupted with a stop instruction.
const GREEN_CAP = 2;
const greens = new Map<string, number>();
// Commands that are legitimately repeated and never count as verification.
const REPEATABLE = /\b(sleep|watch|while|until|tail\s+-f|logcat)\b/;

function greenSignature(
  toolName: string,
  input: Record<string, unknown> | undefined,
): string | null {
  if (toolName !== "bash") return null;
  const cmd = normalize(String(input?.command ?? ""));
  if (!cmd || REPEATABLE.test(cmd)) return null;
  return cmd.slice(0, 300);
}

// ── G8: tier (heuristic, no model) ──────────────────────────────────────────
function estimateTier(task: string): "trivial" | "standard" | "hard" {
  const t = task.toLowerCase();
  if (t.length < 120 && /(typo|rename|one[- ]line|comment|format|bump|version)/.test(t)) return "trivial";
  if (/(refactor|architect|migrat|redesign|multi[- ]file|across|system)/.test(t)) return "hard";
  return "standard";
}

export default function (pi: ExtensionAPI) {
  // ── G1 ────────────────────────────────────────────────────────────────────
  pi.on("tool_call", async (event, ctx) => {
    // Track every file the model writes or edits. G4 uses this at turn_end so the
    // review decision no longer depends on remembering to call gate_check.
    const touchedPath = pathFromInput(event.toolName, event.input);
    if (touchedPath) touched.add(touchedPath);

    if (event.toolName !== "bash") return;
    const cmd = String(event.input?.command ?? "");
    if (!cmd) return;

    const { blocked, reason } = checkSafety(cmd);
    if (blocked) {
      ctx.ui.notify(`[G1] blocked: ${reason}`, "warning");
      return {
        block: true,
        reason: `[G1 safety] Blocked: ${reason}. This command is denylisted in decision-gates.ts. Ask the user to run it themselves if it is genuinely needed.`,
      };
    }
  });

  // ── G6 ────────────────────────────────────────────────────────────────────
  pi.on("tool_result", async (event, ctx) => {
    const ev = event as any;
    const text = String(ev.content?.[0]?.text ?? "");
    const sig = signature(ev.toolName ?? "?", text);

    // A success against the same signature proves the obstacle is gone.
    if (ev.isError !== true) {
      failures.delete(sig);

      // G12: the same green command a second time means the artifact was already
      // verified. Surface the output plus one instruction to stop, and reset so
      // this nudges once instead of nagging.
      const g = greenSignature(ev.toolName ?? "?", ev.input);
      if (g) {
        const seen = (greens.get(g) ?? 0) + 1;
        greens.set(g, seen);
        if (seen >= GREEN_CAP) {
          greens.delete(g);
          ctx.ui.notify("[G12] already verified — reporting instead of re-checking", "info");
          return {
            content: [
              {
                type: "text",
                text:
                  `${text.slice(0, 1200)}\n\n` +
                  `[G12 success cap] This exact command already succeeded in this session.\n` +
                  `The artifact is verified. Do not re-run it, do not probe another route, do not re-read the file.\n` +
                  `Report what passed and end the turn (AGENTS.md §8 rule 3).`,
              },
            ],
          };
        }
      }
      return;
    }

    const n = (failures.get(sig) ?? 0) + 1;
    failures.set(sig, n);

    if (n >= RETRY_CAP) {
      failures.delete(sig);
      ctx.ui.notify(`[G6] same failure ${n}× — forcing re-debug`, "warning");
      return {
        content: [
          {
            type: "text",
            text:
              `[G6 loop cap] This exact failure has now occurred ${n} times.\n` +
              `Stop retrying. Re-read the failing code, form a different hypothesis, and change the approach.\n` +
              `Original output:\n${text.slice(0, 800)}`,
          },
        ],
        isError: true,
      };
    }
    return;
  });

  // ── G4 + G9: registered as an explicit tool, so they cost nothing until asked ──
  pi.registerTool(
    defineTool({
      name: "gate_check",
      label: "Decision Gate Check",
      description:
        "Run the deterministic decision gates (no model calls). G4 review plan from changed paths, G8 tier for a task, G9 scope comparison. Use before a review or before declaring done.",
      promptSnippet: "Check review level, task tier, or scope conformance deterministically",
      parameters: Type.Object({
        gate: Type.Union([Type.Literal("review"), Type.Literal("tier"), Type.Literal("scope")]),
        files: Type.Optional(Type.Array(Type.String(), { description: "Changed file paths (review/scope)" })),
        task: Type.Optional(Type.String({ description: "Task description (tier)" })),
      }),
      async execute(_id, params) {
        if (params.gate === "review") {
          const plan = reviewPlan(params.files ?? []);
          return {
            content: [
              {
                type: "text",
                text:
                  `G4 review plan\n` +
                  `  review_level: ${plan.level}\n` +
                  `  needs_isolated_critic: ${plan.level === "forced" || plan.level === "normal"}\n` +
                  `  needs_security_scan: ${plan.security}\n` +
                  `  needs_browser_review: ${plan.ui}\n` +
                  (plan.ui ? `  breakpoints: 375, 430, 768, 1280, 1440, 1920\n` : "") +
                  (plan.level === "forced" ? `  NOTE: auth/secrets/payments/migration path — critic is mandatory.\n` : ""),
              },
            ],
            details: plan,
          };
        }
        if (params.gate === "tier") {
          const tier = estimateTier(params.task ?? "");
          return {
            content: [{ type: "text", text: `G8 tier: ${tier}` }],
            details: { tier },
          };
        }
        const files = params.files ?? [];
        const suspicious = files.filter((f) =>
          /node_modules|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock)$|dist\/|build\//.test(f),
        );
        return {
          content: [
            {
              type: "text",
              text:
                `G9 scope\n  changed files: ${files.length}\n` +
                (suspicious.length
                  ? `  out_of_scope suspects: ${suspicious.join(", ")}\n  justify or revert each.\n`
                  : `  no obvious out-of-scope files.\n`),
            },
          ],
          details: { files, suspicious },
        };
      },
    }),
  );

  // ── G4 at turn boundary: derive the review decision from files actually touched ──
  // Previously G4 only ran when the model called gate_check, so a forced-review path
  // (auth/secrets/payments/migrations/delete) could be written with no warning at all.
  // This appends one advisory entry per turn and never blocks or loops.
  let reviewAnnounced = "";
  pi.on("turn_end", async (event, ctx) => {
    if (touched.size === 0) return;
    const files = [...touched];
    // Clear immediately: the next turn reports only what *it* changed. Without this
    // the accumulated set re-fires the same conclusion on every later turn.
    touched.clear();
    const plan = reviewPlan(files);
    const key = `${plan.level}|${files.sort().join(",")}`;
    if (key === reviewAnnounced) return; // same conclusion twice is noise
    reviewAnnounced = key;

    if (plan.level === "inline") return; // single non-sensitive file: G4 says no critic

    const lines = [
      `[G4 review plan] level=${plan.level} files=${files.length}`,
      ...files.map((f) => `  - ${f}`),
      plan.security ? "  security-relevant path touched" : "",
      plan.ui ? "  UI paths touched — browser review required at 375/430/768/1280/1440/1920" : "",
      plan.level === "forced"
        ? "  ACTION: critic is mandatory for this path. Dispatch reviewer before claiming done."
        : "  ACTION: multi-file change — an isolated critic is expected.",
    ].filter(Boolean);

    ctx.ui.notify(`[G4] ${plan.level} review required (${files.length} files)`, "info");
    return {
      entries: [
        {
          type: "custom_message" as const,
          customType: "g4-review-plan",
          content: lines.join("\n"),
          display: true,
        },
      ],
    };
  });

  // ── G6 reset is per-signature on success, NOT per turn ─────────────────────
  // Clearing on turn_end made the cap unreachable: a model that retries the same
  // failing command across turns resets the counter every time.
}
