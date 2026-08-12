"use node";

import { action } from "./_generated/server";

export const diag = action({
  args: {},
  handler: async (): Promise<Record<string, unknown>> => {
    const key = process.env.VLY_INTEGRATION_KEY;
    const base = process.env.VLY_INTEGRATION_BASE_URL;
    const out: Record<string, unknown> = { keySet: !!key, baseUrl: base ?? null };
    const urls = [
      "https://integrations.vly.ai/v1/llm/chat/completions",
      "https://integrations.vly.ai/llm/chat/completions",
      "https://integrations.vly.ai/v1/llm",
      "https://integrations.vly.ai/api/v1/llm/chat/completions",
    ];
    for (const url of urls) {
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: "oi" }],
            max_tokens: 5,
          }),
          signal: AbortSignal.timeout(12000),
        });
        out[url] = { status: r.status, body: (await r.text()).slice(0, 120) };
      } catch (e) {
        out[url] = { err: (e as Error).message };
      }
    }
    return out;
  },
});
