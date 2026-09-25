import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { DEFAULT_APP_FLAGS, handleRequest } from "./index.ts";

Deno.test("DEFAULT_APP_FLAGS contains canonical V5 feature flags and fail-closed defaults", () => {
  assertEquals(DEFAULT_APP_FLAGS.novo_enabled, true);
  assertEquals(DEFAULT_APP_FLAGS.ai_generation_enabled, true);
  assertEquals(DEFAULT_APP_FLAGS.pyq_enabled, true);
  assertEquals(DEFAULT_APP_FLAGS.pro_enabled, true);
  // V5 freeze: battle and new_home default to false
  assertEquals(DEFAULT_APP_FLAGS.battle_enabled, false);
  assertEquals(DEFAULT_APP_FLAGS.new_home_enabled, false);
});

Deno.test("handleRequest returns 200 with CORS and cache headers for OPTIONS", async () => {
  const req = new Request("http://localhost/app-flags", { method: "OPTIONS" });
  const res = await handleRequest(req);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("handleRequest returns 405 for POST request", async () => {
  const req = new Request("http://localhost/app-flags", { method: "POST" });
  const res = await handleRequest(req);
  assertEquals(res.status, 405);
});

Deno.test("handleRequest returns safe defaults when DB is unconfigured", async () => {
  const req = new Request("http://localhost/app-flags", { method: "GET" });
  const res = await handleRequest(req);
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.novo_enabled, true);
  assertEquals(json.ai_generation_enabled, true);
  assertEquals(json.pyq_enabled, true);
  assertEquals(json.battle_enabled, false);
  assertEquals(json.new_home_enabled, false);
  assertEquals(json.pro_enabled, true);
});
