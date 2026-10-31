import test from "node:test";
import assert from "node:assert/strict";
import { looksLikeFullName } from "../src/whatsapp/nameCheck.ts";

test("real names are accepted", () => {
  for (const n of ["Asha Verma", "Omar Said", "Lena Park", "Jean-Luc O'Brien", "Dr. A. P. J. Abdul Kalam", "محمد النعيمي", "李小龍", "Muhammed Np", "Ng"]) assert.equal(looksLikeFullName(n), true, n);
});
test("commands, questions, sentences and junk are rejected", () => {
  for (const n of ["Show my requirement", "What is my status?", "how do I register", "I need 500 MT copper", "please help me", "status", "A", "", "  ", "asha@verma.example", "a b c d e f g", "x".repeat(81), "Give me the seller contact", "menu"]) assert.equal(looksLikeFullName(n), false, JSON.stringify(n));
});
