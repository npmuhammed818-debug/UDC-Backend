import test from "node:test";
import assert from "node:assert/strict";
import { replySinkEnabled, sinkReadAuthorized } from "../src/whatsapp/replySink.ts";
import { getWhatsAppConfig } from "../src/whatsapp/client.ts";

test("sink is off unless the flag is exactly 'store' (default behaviour unchanged)", () => {
  for (const v of [undefined, "", "true", "1", "STORE", "off"]) assert.equal(replySinkEnabled({ AKIF_WHATSAPP_REPLY_SINK: v } as NodeJS.ProcessEnv), false);
  assert.equal(replySinkEnabled({ AKIF_WHATSAPP_REPLY_SINK: "store" } as NodeJS.ProcessEnv), true);
});
test("flag off: sending config still needs token and phone id", () => {
  assert.equal(getWhatsAppConfig({} as NodeJS.ProcessEnv), null);
  assert.equal(getWhatsAppConfig({ WHATSAPP_ACCESS_TOKEN: "t" } as NodeJS.ProcessEnv), null);
  assert.ok(getWhatsAppConfig({ WHATSAPP_ACCESS_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "p" } as NodeJS.ProcessEnv));
});
test("sink readout needs a valid signature and a configured secret", () => {
  assert.equal(sinkReadAuthorized(undefined, { WHATSAPP_APP_SECRET: "x".repeat(20) } as NodeJS.ProcessEnv), false);
  assert.equal(sinkReadAuthorized("sha256=bad", { WHATSAPP_APP_SECRET: "x".repeat(20) } as NodeJS.ProcessEnv), false);
  assert.equal(sinkReadAuthorized("sha256=" + "0".repeat(64), {} as NodeJS.ProcessEnv), false);
});
test("allowlist: recipients still need the sink on and a digits match", async () => {
  const { replySinkSendAllowlist, replySinkSendAllowed } = await import("../src/whatsapp/replySink.ts");
  assert.deepEqual(replySinkSendAllowlist({ AKIF_WHATSAPP_REPLY_ALLOWLIST: "+91 70220 32531, 15555550101,,abc" } as NodeJS.ProcessEnv), ["917022032531", "15555550101"]);
  assert.equal(replySinkSendAllowlist({} as NodeJS.ProcessEnv).length, 0);
  const env = { AKIF_WHATSAPP_REPLY_SINK: "store", AKIF_WHATSAPP_REPLY_ALLOWLIST: "+917022032531" } as NodeJS.ProcessEnv;
  assert.equal(replySinkSendAllowed("917022032531", env), true);
  assert.equal(replySinkSendAllowed("+917022032531", env), true);
  assert.equal(replySinkSendAllowed("15555550107", env), false);
  assert.equal(replySinkSendAllowed("917022032531", { AKIF_WHATSAPP_REPLY_ALLOWLIST: "+917022032531" } as NodeJS.ProcessEnv), false); // sink off: no bypass concept
});
test("allowlisted sends use real credentials, never sink placeholders", () => {
  const env = { AKIF_WHATSAPP_REPLY_SINK: "store", AKIF_WHATSAPP_REPLY_ALLOWLIST: "+917022032531", WHATSAPP_ACCESS_TOKEN: "real-token", WHATSAPP_PHONE_NUMBER_ID: "real-pnid" } as NodeJS.ProcessEnv;
  const cfg = getWhatsAppConfig(env);
  assert.equal(cfg?.accessToken, "real-token");
  assert.equal(cfg?.phoneNumberId, "real-pnid");
  const noCreds = getWhatsAppConfig({ AKIF_WHATSAPP_REPLY_SINK: "store", AKIF_WHATSAPP_REPLY_ALLOWLIST: "+917022032531" } as NodeJS.ProcessEnv);
  assert.equal(noCreds?.accessToken, "sink");
});
