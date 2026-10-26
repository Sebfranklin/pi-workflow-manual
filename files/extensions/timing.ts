import type { AssistantMessage } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/**
 * Response timing.
 *
 * Shows, for every model response, how long it took:
 *   - ttft      time to first streamed token (thinking or text)
 *   - total     start of request -> end of response
 *   - tok/s     output tokens per second over the streaming window
 *
 * Three places to look:
 *   - under each reply, a one-line marker (stored in the session, never sent to the model)
 *   - the footer status line, updated after each response
 *   - /timing, a table of every response in this session
 *
 * Zero model calls, no network. Totals come from the assistant messages pi
already stores (`timestamp`, `durationMs`); only ttft is measured live.
 */

interface Timing {
  model: string;
  startedAt: number;
  ttftMs?: number;
  totalMs: number;
  outputTokens: number;
  inputTokens: number;
  error?: string;
}

// Live measurement for the response currently streaming.
// `message_start` fires when Pi begins building the assistant message, which is
// already after the provider replied — measuring ttft from it reported ~5ms for
// a 9.5s request. The assistant message's own `timestamp` is the request start,
// so ttft is wall-clock now minus that.
let ttftMs: number | undefined;

// ttft per assistant-message timestamp, so /timing can show it for this run
const ttftByTimestamp = new Map<number, number>();

function fmtMs(ms: number | undefined): string {
  if (ms === undefined || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function label(m: AssistantMessage): string {
  return `${m.provider}/${m.responseModel ?? m.model}`;
}

function collect(ctx: ExtensionContext): Timing[] {
  const rows: Timing[] = [];
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type !== "message") continue;
    const m = entry.message;
    if (m.role !== "assistant") continue;
    const a = m as AssistantMessage;
    const total =
      a.durationMs ??
      (a.timestamp ? Date.now() - a.timestamp : 0);
    rows.push({
      model: label(a),
      startedAt: a.timestamp,
      ttftMs: ttftByTimestamp.get(a.timestamp),
      totalMs: total,
      outputTokens: a.usage?.output ?? 0,
      inputTokens: a.usage?.input ?? 0,
      error: a.errorMessage ?? (a.stopReason === "error" ? "error" : undefined),
    });
  }
  return rows;
}

function rate(t: Timing): string {
  // Without a live ttft the streaming window is unknown; report nothing rather
  // than dividing output tokens by the whole request (which understates it).
  if (t.ttftMs === undefined) return "—";
  const streamMs = t.totalMs - t.ttftMs;
  if (!t.outputTokens || streamMs < 100) return "—";
  return `${((t.outputTokens / streamMs) * 1000).toFixed(1)} tok/s`;
}

export default function (pi: ExtensionAPI) {
  pi.registerEntryRenderer<Timing>("timing", (entry, _opts, theme) => {
    const t = entry.data;
    if (!t) return undefined;
    const failed = Boolean(t.error);
    const parts = [
      theme.fg(failed ? "error" : "success", `${failed ? "✗" : "⏱"} ${fmtMs(t.totalMs)}`),
      theme.fg("dim", `ttft ${fmtMs(t.ttftMs)}`),
      theme.fg("dim", rate(t)),
      theme.fg("dim", `${t.outputTokens} tok`),
      theme.fg("muted", t.model),
    ].filter((p) => p && !p.endsWith(" —"));
    if (failed) parts.push(theme.fg("error", t.error as string));
    return new Text(parts.join(theme.fg("dim", " · ")), 1, 0);
  });
  pi.on("message_start", async (event) => {
    if (event.message.role !== "assistant") return;
    ttftMs = undefined;
  });

  pi.on("message_update", async (event) => {
    if (ttftMs !== undefined) return;
    const t = event.assistantMessageEvent.type;
    if (t !== "text_delta" && t !== "thinking_delta" && t !== "toolcall_delta") return;
    const a = event.message as AssistantMessage;
    if (!a.timestamp) return;
    ttftMs = Math.max(0, Date.now() - a.timestamp);
    ttftByTimestamp.set(a.timestamp, ttftMs);
  });

  pi.on("message_end", async (event, ctx) => {
    if (event.message.role !== "assistant") return;
    const a = event.message as AssistantMessage;
    const total = a.durationMs ?? (a.timestamp ? Date.now() - a.timestamp : 0);
    if (a.timestamp && ttftMs !== undefined) ttftByTimestamp.set(a.timestamp, ttftMs);

    const theme = ctx.ui.theme;
    const t: Timing = {
      model: label(a),
      startedAt: a.timestamp,
      ttftMs,
      totalMs: total,
      outputTokens: a.usage?.output ?? 0,
      inputTokens: a.usage?.input ?? 0,
      error: a.errorMessage,
    };
    const failed = Boolean(a.errorMessage) || a.stopReason === "error";
    const head = theme.fg(failed ? "error" : "accent", `${failed ? "✗" : "⏱"} ${fmtMs(total)}`);
    const detail = theme.fg("dim", ` · ttft ${fmtMs(ttftMs)} · ${rate(t)}`);
    ctx.ui.setStatus("timing", head + detail);

    // One durable marker per reply, rendered under it. Never sent to the model.
    pi.appendEntry("timing", t);
  });

  pi.on("session_start", async (_event, ctx) => {
    const rows = collect(ctx);
    const last = rows[rows.length - 1];
    if (last) {
      ctx.ui.setStatus(
        "timing",
        ctx.ui.theme.fg("dim", `⏱ last ${fmtMs(last.totalMs)} · ${rate(last)}`),
      );
    }
  });

  pi.registerCommand("timing", {
    description: "Show response time for every model reply in this session",
    handler: async (_args, ctx) => {
      const rows = collect(ctx);
      if (rows.length === 0) {
        ctx.ui.notify("No model responses in this session yet", "info");
        return;
      }
      const lines = rows.map((r, i) => {
        const n = String(i + 1).padStart(2, " ");
        const bad = r.error ? ` !${r.error}` : "";
        return (
          `${n}. ${fmtMs(r.totalMs).padStart(7)}  ttft ${fmtMs(r.ttftMs).padStart(7)}  ` +
          `${rate(r).padStart(10)}  out ${r.outputTokens}  ${r.model}${bad}`
        );
      });
      const slowest = rows.reduce((a, b) => (b.totalMs > a.totalMs ? b : a));
      const fastest = rows.reduce((a, b) => (b.totalMs < a.totalMs ? b : a));
      const avg = rows.reduce((s, r) => s + r.totalMs, 0) / rows.length;
      lines.push("");
      lines.push(
        `n=${rows.length}  avg ${fmtMs(avg)}  fastest ${fmtMs(fastest.totalMs)}  slowest ${fmtMs(slowest.totalMs)}`,
      );
      await ctx.ui.select("Response timing", lines);
    },
  });
}
