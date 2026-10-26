import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Android notifications for Termux.
 *
 * pi-bell writes a BEL character, which Termux only sounds when the terminal
 * bell is explicitly enabled in its settings. This extension uses the
 * Termux:API instead, so a finished turn raises a real Android notification
 * and a short vibration even when Termux is backgrounded.
 *
 * Fires only when the session has a UI, so subagent and print-mode runs stay
 * silent. Every call is best-effort: a missing Termux:API never breaks a turn.
 */

const TITLE = "pi";

// Termux:API calls normally return in ~2.3s, but MIUI freezes the Termux:API app
// in the background and a frozen peer never answers, so the call blocks forever.
// `timeout` (coreutils) bounds every call, and MIN_GAP_MS keeps a burst of turns
// from launching one blocking child per turn.
const API_TIMEOUT_S = "4";
const API_KILL_AFTER_S = "1";
const MIN_GAP_MS = 5000;

let lastAt = 0;

function run(cmd: string, args: string[]): void {
  const now = Date.now();
  if (now - lastAt < MIN_GAP_MS) return;
  lastAt = now;
  try {
    const child = spawn(
      "timeout",
      ["-k", API_KILL_AFTER_S, API_TIMEOUT_S, cmd, ...args],
      { detached: true, stdio: "ignore" },
    );
    child.on("error", () => {});
    child.unref();
  } catch {
    // no Termux:API, no notification — never fail the agent over this
  }
}

export default function (pi: ExtensionAPI) {
  let startedAt = 0;

  pi.on("agent_start", async () => {
    startedAt = Date.now();
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    const secs = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;
    const body = secs > 0 ? `turn done · ${secs}s` : "turn done";

    run("termux-vibrate", ["-d", "180"]);
    run("termux-notification", [
      "--title", TITLE,
      "--content", body,
      "--id", "pi-turn",
      "--priority", "default",
      "--vibrate", "180",
    ]);
  });
}
