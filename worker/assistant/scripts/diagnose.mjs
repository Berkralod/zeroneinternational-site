// One-off check of the live Anthropic request the Worker makes (same model, prompt, schema and limits).
// Run by .github/workflows/assistant-diagnose.yml with ANTHROPIC_API_KEY. Prints only status codes,
// stop reasons, token counts, block types and a short excerpt of the reply; never the key.
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { MODEL, outputSchema, staticPrompt, requestPrompt } from "../src/prompt.js";
import { LIMITS } from "../src/app.js";

const siteData = JSON.parse(readFileSync(new URL("../src/site-data.json", import.meta.url), "utf8"));
const system = staticPrompt(siteData);
const schema = outputSchema(Object.keys(siteData.links));
const rawKey = process.env.ANTHROPIC_API_KEY || "";
const client = new Anthropic({ apiKey: rawKey, maxRetries: 0 });

// Shape of the key only (never the key itself): length, prefix, stray whitespace or unusual characters.
function keyShape(key) {
  const odd = [...key].filter((c) => c.charCodeAt(0) < 33 || c.charCodeAt(0) > 126);
  return `length=${key.length} starts_with_sk-ant=${key.startsWith("sk-ant-")} trimmed_differs=${key.trim() !== key} ` +
    `odd_chars=${odd.length} odd_codes=${[...new Set(odd.map((c) => c.charCodeAt(0)))].join("/") || "-"}`;
}
function redact(text) {
  let out = String(text || "");
  for (const part of rawKey.split(/\s+/).filter((p) => p.length >= 6)) out = out.split(part).join("[KEY]");
  return out.replace(/sk-ant-[A-Za-z0-9_\-]*/g, "[KEY]").replace(/"[^"]*"/g, '"…"').slice(0, 200);
}

async function attempt(label, maxTokens) {
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system: [
        { type: "text", text: system, cache_control: { type: "ephemeral" } },
        { type: "text", text: requestPrompt({ nameLang: "tr", pageLang: "tr", pagePath: "/tr/", attachment: false }) },
      ],
      messages: [{ role: "user", content: [{ type: "text", text: "eBay ilanlarımı otomatikleştirebilir misiniz?" }] }],
      output_config: { effort: "low", format: { type: "json_schema", schema } },
    });
    const text = (response.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    let parsed = "no";
    try { JSON.parse(text); parsed = "yes"; } catch {}
    console.log(`${label}: OK stop=${response.stop_reason} blocks=${(response.content || []).map((b) => b.type).join(",")} usage=${JSON.stringify(response.usage)} json_parses=${parsed}`);
    console.log(`${label}: reply excerpt: ${text.slice(0, 300).replace(/\s+/g, " ")}`);
  } catch (error) {
    const body = error && error.error ? JSON.stringify(error.error).slice(0, 500) : "";
    console.log(`${label}: ERROR status=${error && error.status} name=${error && error.name} body=${redact(body)} message=${redact(error && error.message)} cause=${redact(error && error.cause && error.cause.message)}`);
  }
}

console.log(`key: ${keyShape(rawKey)}`);
console.log(`model=${MODEL} system_chars=${system.length} link_ids=${Object.keys(siteData.links).length} worker_max_tokens=${LIMITS.maxTokens}`);
await attempt("A (worker settings)", LIMITS.maxTokens);
await attempt("B (max_tokens 2000)", 2000);
