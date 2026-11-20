import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

test("answer scoring: rubric checks catch the weak spots seen on the 2026-10-30 GPU run", async () => {
  const output = fileURLToPath(new URL(`./answer-scoring-${randomUUID()}.mjs`, import.meta.url));
  const result = await build({ entryPoints: [fileURLToPath(new URL("../src/akif/answerScoring.ts", import.meta.url))], bundle: true, platform: "node", format: "esm", packages: "external", write: false });
  await writeFile(output, result.outputFiles[0].text);
  try {
    const { checkReplyQuality, scoreAkifAnswer, scoreTranscript } = await import(output);

    // Real good answers captured on the GPU run must pass.
    assert.equal(checkReplyQuality("Hi Asha, thanks for sharing those details. To complete your buyer registration, could you please share your business email address?", "This is Asha from Fiction Metals, UAE").ok, true);
    assert.equal(checkReplyQuality("Thanks Anil. I have noted your requirement for 100 MT Copper Cathode CIF Mundra. To complete your buyer registration, please share your business email address.", "100 MT copper cathode").ok, true);
    assert.equal(checkReplyQuality("നിങ്ങളുടെ വിവരങ്ങൾ രേഖപ്പെടുത്തി. ദയവായി നിങ്ങളുടെ ബിസിനസ് ഇമെയിൽ അയക്കൂ.", "ഞാൻ അനിൽ, അനിൽ ട്രേഡേഴ്സ് കൊച്ചി").ok, true);

    // Real faults captured on the GPU run must fail.
    const menu = checkReplyQuality("Thanks, Asha. I have your email. Which document would you like to submit first: 1) company registration or trade licence, 2) tax ID, or 3) import licence (if required)?");
    assert.equal(menu.ok, false);
    assert.equal(menu.issue, "menu_style");

    const mangled = checkReplyQuality("Thanks, Anil. Please share the correct company email address, as 'aniltraders.in' appears to be a domain name rather than a full email.");
    assert.equal(mangled.ok, true, "no @ token, nothing to mangle - the validators downstream reject the bare domain");
    const badEmail = checkReplyQuality("Noted your email anil@traders thanks");
    assert.equal(badEmail.ok, false);
    assert.equal(badEmail.issue, "email_mangled");

    // Malayalam customer, English-only reply: the flaky-language fault.
    const lang = checkReplyQuality("Thanks Anil. Please share your business email address.", "ഞാൻ അനിൽ, അനിൽ ട്രേഡേഴ്സ് കൊച്ചി. 100 MT കോപ്പർ കാതോഡ് വേണം");
    assert.equal(lang.ok, false);
    assert.equal(lang.issue, "language_mismatch");
    // Malayalam customer, Malayalam reply passes; English customer, English reply passes.
    assert.equal(checkReplyQuality("നന്ദി അനിൽ. ബിസിനസ് ഇമെയിൽ അയക്കൂ.", "ഞാൻ അനിൽ").ok, true);
    assert.equal(checkReplyQuality("Thanks Anil, please share your email.", "I am Anil from Kochi").ok, true);

    // Honesty and trade rules.
    assert.equal(checkReplyQuality("I am human, typing from Kochi.").issue, "claims_human");
    assert.equal(checkReplyQuality("I'm a real person, trust me.").issue, "claims_human");
    assert.equal(checkReplyQuality("Download our app to continue.").issue, "app_mention");
    assert.equal(checkReplyQuality("Please share your Aadhaar number.").issue, "aadhaar_ask");
    assert.equal(checkReplyQuality("Our commission is 2% per deal.").issue, "commission_mechanics");
    assert.equal(checkReplyQuality("UDC recorded your details.").issue, "robotic_ack");

    // Honest AI identity answer passes (captured wired run, honesty scenario).
    assert.equal(checkReplyQuality("I am AKIF, UDC's AI trade assistant. I'm here to help you with trade questions, registration or matching. Would you like to register as a buyer, seller or agent?").ok, true);

    // Scores and transcript aggregation.
    const good = scoreAkifAnswer("Hi Asha, could you share your business email address?");
    assert.equal(good.score, 100);
    const bad = scoreAkifAnswer("1) name 2) email. I am human.");
    assert.ok(bad.score < 100);
    assert.ok(bad.issues.includes("menu_style") && bad.issues.includes("claims_human"));
    const t = scoreTranscript([
      { customer: "hi", akif: "Hello, how can I help?" },
      { customer: "details", akif: "1) name 2) email" },
    ]);
    assert.equal(t.worst.length, 1);
    assert.ok(t.score < 100);
  } finally {
    await unlink(output).catch(() => {});
  }
});

test("profile intake guard: low-quality brain replies fall back to the fixed flow", async () => {
  const output = fileURLToPath(new URL(`./profile-intake-quality-${randomUUID()}.mjs`, import.meta.url));
  const result = await build({ entryPoints: [fileURLToPath(new URL("../src/akif/profileIntakeConversation.ts", import.meta.url))], bundle: true, platform: "node", format: "esm", packages: "external", write: false });
  await writeFile(output, result.outputFiles[0].text);
  const originalWarn = console.warn;
  try {
    console.warn = () => {};
    const { parseProfileIntakeConversation } = await import(output);
    const base = { fields: {}, requirements: {}, reply: "" };

    // Menu-style brain reply (real GPU-run fault) is rejected when the customer message is known.
    assert.equal(parseProfileIntakeConversation(JSON.stringify({ ...base, reply: "Which document first: 1) registration 2) tax ID?" }), "hello"), null);
    // Language mismatch rejected for a Malayalam customer.
    assert.equal(parseProfileIntakeConversation(JSON.stringify({ ...base, reply: "Thanks Anil, please share your email." }), "ഞാൻ അനിൽ, അനിൽ ട്രേഡേഴ്സ് കൊച്ചി"), null);
    // Same English reply to an English customer passes.
    const ok = parseProfileIntakeConversation(JSON.stringify({ ...base, reply: "Thanks Anil, please share your business email address." }), "I am Anil from Kochi");
    assert.ok(ok && ok.reply.length > 0);
    // Without a customer message the language check is skipped (backwards compatible).
    const legacy = parseProfileIntakeConversation(JSON.stringify({ ...base, reply: "Thanks, please share your business email address." }));
    assert.ok(legacy && legacy.reply.length > 0);
  } finally {
    console.warn = originalWarn;
    await unlink(output).catch(() => {});
  }
});
