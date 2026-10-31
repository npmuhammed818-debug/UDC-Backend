import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../src/whatsapp/guidedChat.ts", import.meta.url), "utf8");
test("profile edit tells the user why a change was not applied", () => {
  assert.match(src, /notes\.push\(reason\)/);
  assert.match(src, /NO_DETAIL_NOTE='I am sorry, I did not quite catch that\./);
  assert.match(src, /EMAIL_TAKEN_NOTE='This email already belongs to a UDC account\./);
  assert.match(src, /kind:'review' as const,purpose,data,note:brainReply\?\?notes\[0\]/);
});
