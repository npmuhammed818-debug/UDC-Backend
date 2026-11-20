import assert from "node:assert/strict";
import { test } from "node:test";
import { captureBareAnswer } from "../src/akif/knownFacts.ts";

const askName = [{ role: "assistant", content: "Sure! To start your agent registration, could you share your full name?" }];
test("an email sent while a full name is awaited is saved as email, never as the name", () => {
  const f: Record<string, string> = {};
  assert.equal(captureBareAnswer(askName, "npmuhammed818+wa1@gmail.com", f), "email");
  assert.equal(f.email, "npmuhammed818+wa1@gmail.com");
  assert.equal(f.full_name, undefined);
});
test("a real name after the full name question is still captured", () => {
  const f: Record<string, string> = {};
  assert.equal(captureBareAnswer(askName, "Muhammed np", f), "full_name");
  assert.equal(f.full_name, "Muhammed np");
});
test("a command-like or sentence reply is not stored as a name", () => {
  const f: Record<string, string> = {};
  assert.equal(captureBareAnswer(askName, "Show my requirement", f), null);
  assert.equal(f.full_name, undefined);
});
test("an existing email is not overwritten by a later email", () => {
  const f: Record<string, string> = { email: "a@b.co" };
  assert.equal(captureBareAnswer(askName, "c@d.co", f), null);
  assert.equal(f.email, "a@b.co");
});
