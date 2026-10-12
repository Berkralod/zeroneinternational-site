// The real @anthropic-ai/sdk client with only the HTTP layer mocked: checks the exact request that
// reaches the Messages API and that the SDK's response object is handled correctly.
import { test } from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { createApp } from "../src/app.js";
import { setup, reply, ORIGIN, siteData } from "./helpers.js";

test("the official SDK sends the structured-output request and the Worker reads its answer", async () => {
  const requests = [];
  const sdkFetch = async (url, init) => {
    requests.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-haiku-5-5",
      content: [
        { type: "thinking", thinking: "", signature: "abc" },
        { type: "text", text: JSON.stringify(reply({ reply: "Hello from the SDK path.", links: ["contact"] })) },
      ],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 1200, output_tokens: 80, cache_read_input_tokens: 1100, cache_creation_input_tokens: 0 },
    }), { status: 200, headers: { "Content-Type": "application/json", "request-id": "req_1" } });
  };
  const t = setup();
  const app = createApp({
    siteData,
    makeClient: (env) => new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 0, fetch: sdkFetch }),
    fetchImpl: async (url) => {
      if (String(url).includes("siteverify")) return new Response(JSON.stringify({ success: true, hostname: "zeroneinternational.com" }));
      return new Response("{}", { status: 200 });
    },
  });
  const response = await app.fetch(new Request("https://w.example/chat", {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.10" },
    body: JSON.stringify(t.chatBody("Hello")),
  }), t.env, { waitUntil() {} });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.reply, "Hello from the SDK path.");
  assert.deepEqual(data.links.map((l) => l.id), ["contact"]);

  assert.equal(requests.length, 1);
  const { url, headers, body } = requests[0];
  assert.equal(url, "https://api.anthropic.com/v1/messages");
  assert.equal(headers.get("x-api-key"), "test-key");
  assert.equal(body.model, "claude-haiku-5-5");
  assert.equal(body.output_config.effort, "low");
  assert.equal(body.output_config.format.type, "json_schema");
  assert.equal(body.output_config.format.schema.additionalProperties, false);
  assert.deepEqual(body.system[0].cache_control, { type: "ephemeral" });
  assert.equal("temperature" in body || "top_p" in body || "thinking" in body, false);
});
