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
