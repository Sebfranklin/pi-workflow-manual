import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * KiosAPI Rate Guard & Model Helper for Pi
 *
 * Prevents 429 rate limits on KiosAPI free models by:
 * 1. Pacing requests with a polite cooldown between consecutive calls.
 * 2. Monitoring HTTP status codes and alerting on 429/upstream congestion.
 * 3. Providing interactive /kios command for model switching.
 */

const MIN_INTERVAL_MS = 650; // Safe inter-request spacing for free tier
let lastRequestTime = 0;

export default function(pi: ExtensionAPI) {
  // Pacing hook before sending request to provider
  pi.on("before_provider_request", async (_event, ctx) => {
    const model = ctx.model;
    if (model && model.provider === "kiosapi") {
      const now = Date.now();
      const elapsed = now - lastRequestTime;
      if (elapsed < MIN_INTERVAL_MS) {
        const waitTime = MIN_INTERVAL_MS - elapsed;
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
      lastRequestTime = Date.now();
    }
  });

  // Response monitor hook for 429 and rate limit detection
  pi.on("after_provider_response", (event, ctx) => {
    const model = ctx.model;
    if (model && model.provider === "kiosapi") {
      if (event.status === 429) {
        ctx.ui.notify(
          `[KiosAPI] Rate limit reached on ${model.id}. Waiting before retry or switch model with /model.`,
          "warning"
        );
      } else if (event.status >= 500) {
        ctx.ui.notify(
          `[KiosAPI] Upstream server error (${event.status}) on ${model.id}. Consider switching to gpt-5.6-luna or deepseek-v4-flash.`,
          "error"
        );
      }
    }
  });

  // Command to list and cycle KiosAPI free models
  pi.registerCommand("kios", {
    description: "Show recommended KiosAPI free models and status",
    handler: async (_args, ctx) => {
      const msg = [
        "🌟 KiosAPI Recommended Free Models:",
        "1. kiosapi/gpt-5.6-luna - Fastest & best all-rounder (1.1M context)",
        "2. kiosapi/deepseek-v4-flash - Top reasoning & code synthesis (1M context)",
        "3. kiosapi/glm-5.3-flash - High throughput multimodal agent model (1M context)",
        "4. kiosapi/qwen3.8-flash - Fast instruction following (1M context)",
        "5. kiosapi/openai/gpt-oss-20b - Lightweight OpenAI open model",
        "",
        "💡 Tip: To switch model anytime, type /model kiosapi/<model-id>",
      ].join("\n");

      ctx.ui.notify(msg, "info");
    },
  });
}
