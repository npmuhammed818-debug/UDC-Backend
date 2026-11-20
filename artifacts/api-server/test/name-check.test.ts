import test from "node:test";
import assert from "node:assert/strict";
import { looksLikeFullName } from "../src/whatsapp/nameCheck.ts";

test("real names are accepted", () => {
  for (const n of ["Asha Verma", "Omar Said", "Lena Park", "Jean-Luc O'Brien", "Dr. A. P. J. Abdul Kalam", "محمد النعيمي", "李小龍", "Muhammed Np", "Ng"]) assert.equal(looksLikeFullName(n), true, n);
});
test("commands, questions, sentences and junk are rejected", () => {
  for (const n of ["Show my requirement", "What is my status?", "how do I register", "I need 500 MT copper", "please help me", "status", "A", "", "  ", "asha@verma.example", "a b c d e f g", "x".repeat(81), "Give me the seller contact", "menu"]) assert.equal(looksLikeFullName(n), false, JSON.stringify(n));
});

import { looksLikeCompanyName } from "../src/whatsapp/nameCheck.ts";

test("real company names are accepted", () => {
  for (const n of ["Updowncircle", "Siman Ltd", "UpDownCircle Trading LLC", "3M", "Al-Rashid & Sons", "Tata Steel Ltd.", "A B Exports (India)", "Malayalam Traders", "Tamil Nadu Minerals", "Kerala Cashew Company", "Indian Oil Corporation", "China Harbour Engineering"]) assert.equal(looksLikeCompanyName(n), true, n);
});
test("requests, questions, sentences and language-switch text are not company names", () => {
  for (const n of ["Pls explain in Malayalam", "please explain in Malayalam", "Explain in Malayalam", "Speak Tamil please", "What is my status", "Show my requirement", "We seller copper", "Updowncircle company name We seller copper", "I need 500 MT copper", "എന്ത്", "99.9", "", "A", "Send me the vault link for", "My price is 5600usd per mt"]) assert.equal(looksLikeCompanyName(n), false, JSON.stringify(n));
});
