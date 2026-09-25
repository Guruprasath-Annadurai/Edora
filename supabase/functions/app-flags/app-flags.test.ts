import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { DEFAULT_APP_FLAGS, handleRequest } from "./index.ts";

Deno.test("DEFAULT_APP_FLAGS contains all required V5 feature flags enabled by default", () => {
  const expectedFlags = [
    "novo_enabled",
    "ai_generation_enabled",
    "pyq_enabled",
    "battle_enabled",
    "new_home_enabled",
    "pro_enabled",
  ];

  for (const flag of expectedFlags) {
    assertEquals(DEFAULT_APP_FLAGS[flag], true, `Flag ${flag} must be enabled by default`);
  }
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
});
