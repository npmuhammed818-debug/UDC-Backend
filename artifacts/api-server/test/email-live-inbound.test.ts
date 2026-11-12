import { test } from "node:test";
import assert from "node:assert/strict";
import {
  __setRelayPersistenceForTests,
  claimHumanRelay,
  resetHumanRelay,
} from "../src/akif/humanRelay.ts";
import { receiveLiveEmailRelay } from "../src/channels/emailRelayChannel.ts";
import { liveEmailToEvent, pollLiveEmailInbox, type LiveImapClient } from "../src/channels/emailLiveInbound.ts";
import { buildRelayEmailPayload, outboundDepsFromEnv, sendRelayEmail, smtpConfigFromEnv } from "../src/channels/emailOutbound.ts";
import { sendEmailRelayAnswer } from "../src/channels/emailRelaySend.ts";
import type { EmailEvidence } from "../src/channels/emailPilot.ts";

const ENV = {
  UDC_APP_ENV: "staging",
  UDC_EMAIL_IMAP_PASS: "fixture-password",
  SESSION_SECRET: "x".repeat(40),
} as NodeJS.ProcessEnv;

function event(overrides: Partial<EmailEvidence> = {}): EmailEvidence {
  return {
    eventId: "imap-1",
    messageId: "<m1@sender.example>",
    threadId: "<m1@sender.example>",
    from: "seller@quarry.example",
    to: ["udc@updowncircle.site"],
    cc: [],
    subject: "Aluminium slabs offer",
    text: "Hello, please find our LOI attached.",
    autoSubmitted: false,
    bulk: false,
    attachments: [],
    ...overrides,
  };
}

const noAccount = { resolveAccount: async () => null };

test("the live gate is the mailbox password alone - the launch service runs as production", async () => {
  assert.equal(await receiveLiveEmailRelay(event(), noAccount, { ...ENV, UDC_EMAIL_IMAP_PASS: "" }), "disabled");
  assert.equal(await receiveLiveEmailRelay(event(), noAccount, { ...ENV, UDC_EMAIL_IMAP_PASS: undefined }), "disabled");
  __setRelayPersistenceForTests(null);
  resetHumanRelay();
  // UDC_APP_ENV=production with the password set is exactly the launch
  // configuration: the email must be held, not refused.
  const status = await receiveLiveEmailRelay(event(), noAccount, { ...ENV, UDC_APP_ENV: "production" });
  assert.equal(status, "held_for_human_relay");
});

test("a live email with a clean document stores it privately and still reaches the workers", async () => {
  __setRelayPersistenceForTests(null);
  resetHumanRelay();
  const pdf = Buffer.from("%PDF-1.4 live fixture loi");
  const stored: Array<{ from: string; attachments: number; synthetic: boolean }> = [];
  const ports = {
    ...noAccount,
    storeEmailAttachments: async (input: { from: string; attachments: unknown[]; synthetic: boolean }) => {
      stored.push({ from: input.from, attachments: input.attachments.length, synthetic: input.synthetic });
      return { stored: input.attachments.length };
    },
  };
  const status = await receiveLiveEmailRelay(
    event({ attachments: [{ id: "a1", name: "loi.pdf", type: "application/pdf", bytes: pdf.length, contentB64: pdf.toString("base64") }] }),
    ports,
    ENV,
  );
  assert.equal(status, "held_for_human_relay");
  assert.deepEqual(stored, [{ from: "seller@quarry.example", attachments: 1, synthetic: false }]);
  const claimed = claimHumanRelay("worker-test");
  assert.match(claimed?.customerNote ?? "", /stored privately/);
});

test("live: an unsafe document never drops the customer's text", async () => {
  __setRelayPersistenceForTests(null);
  resetHumanRelay();
  const ports = {
    ...noAccount,
    storeEmailAttachments: async () => { throw new Error("must not be called"); },
  };
  const status = await receiveLiveEmailRelay(
    event({ attachments: [{ id: "a1", name: "x.exe", type: "application/x-msdownload", bytes: 10, contentB64: Buffer.from("0123456789").toString("base64") }] }),
    ports,
    ENV,
  );
  assert.equal(status, "held_for_human_relay", "the message still reaches the workers");
  const claimed = claimHumanRelay("worker-test");
  assert.match(claimed?.customerNote ?? "", /could not store/);
  assert.match(claimed?.text ?? "", /please find our LOI attached/);
});

test("live: a store failure keeps the email with the workers and says so", async () => {
  __setRelayPersistenceForTests(null);
  resetHumanRelay();
  const pdf = Buffer.from("%PDF-1.4 live fixture loi");
  const ports = {
    ...noAccount,
    storeEmailAttachments: async () => { throw new Error("bucket down"); },
  };
  const status = await receiveLiveEmailRelay(
    event({ attachments: [{ id: "a1", name: "loi.pdf", type: "application/pdf", bytes: pdf.length, contentB64: pdf.toString("base64") }] }),
    ports,
    ENV,
  );
  assert.equal(status, "held_attachment_store_failed");
  const claimed = claimHumanRelay("worker-test");
  assert.match(claimed?.customerNote ?? "", /NOT stored \(store error\)/);
});

test("liveEmailToEvent maps a parsed mail and flags bulk/auto-submitted", () => {
  const pdf = Buffer.from("pdf");
  const parsed = {
    messageId: "<real@mail>",
    references: ["<root@mail>"],
    from: { value: [{ address: "buyer@imports.example" }] },
    to: { value: [{ address: "udc@updowncircle.site" }] },
    cc: { value: [] },
    subject: "Order",
    text: "  Please quote.  ",
    headers: new Map([["auto-submitted", "auto-generated"]]),
    attachments: [{ filename: "spec.pdf", contentType: "application/pdf", content: pdf }],
  };
  const e = liveEmailToEvent(7, parsed)!;
  assert.equal(e.from, "buyer@imports.example");
  assert.equal(e.messageId, "<real@mail>");
  assert.equal(e.threadId, "<root@mail>");
  assert.equal(e.text, "Please quote.");
  assert.equal(e.autoSubmitted, true);
  assert.equal(e.attachments[0].bytes, pdf.length);
  assert.equal(liveEmailToEvent(7, { text: "" }), null, "no sender/body -> unusable");
});

function fakeImap(messages: Array<{ uid: number; source: Buffer }>, seenAdded: number[]): LiveImapClient {
  return {
    getMailboxLock: async () => ({ release: () => {} }),
    search: async () => messages.map((m) => m.uid),
    fetchOne: async (uid) => {
      const m = messages.find((x) => x.uid === uid);
      return m ? { source: m.source } : false;
    },
    messageFlagsAdd: async (uid) => { seenAdded.push(uid); },
    logout: async () => {},
  };
}

function fakeClaims() {
  const rows = new Map<string, { state: string; meta?: Record<string, unknown> }>();
  return {
    rows,
    claimLookup: async (h: string) => rows.get(h) ?? null,
    claimInsert: async (h: string, meta: Record<string, unknown>) => { rows.set(h, { state: String(meta.state), meta }); },
    claimUpdate: async (h: string, state: string) => { rows.set(h, { ...rows.get(h)!, state }); },
  };
}

test("one poll cycle claims, holds, marks seen, and never processes one email twice", async () => {
  __setRelayPersistenceForTests(null);
  resetHumanRelay();
  const seenAdded: number[] = [];
  const claims = fakeClaims();
  const source = Buffer.from("fake rfc822 source");
  const ports = {
    ...noAccount,
    connect: async () => fakeImap([{ uid: 11, source }], seenAdded),
    ...claims,
  };
  const parse = async () => ({
    messageId: "<first@mail>",
    from: { value: [{ address: "seller@quarry.example" }] },
    to: { value: [{ address: "udc@updowncircle.site" }] },
    subject: "Offer",
    text: "First offer text",
    headers: new Map(),
    attachments: [],
  });

  const first = await pollLiveEmailInbox(ports, ENV, parse);
  assert.deepEqual(first, { seen: 1, held: 1, ignored: 0, errors: 0 });
  assert.deepEqual(seenAdded, [11]);
  assert.equal([...claims.rows.values()][0].state, "processed");
  assert.match(claimHumanRelay("w")?.text ?? "", /First offer text/);

  // Second poll: the claim row says processed, so it is only marked seen.
  resetHumanRelay();
  const second = await pollLiveEmailInbox(ports, ENV, parse);
  assert.deepEqual(second, { seen: 0, held: 0, ignored: 0, errors: 0 });
  assert.equal(claimHumanRelay("w"), null, "no duplicate relay item");
});

test("bulk mail is ignored but still marked seen", async () => {
  __setRelayPersistenceForTests(null);
  resetHumanRelay();
  const seenAdded: number[] = [];
  const claims = fakeClaims();
  const ports = {
    ...noAccount,
    connect: async () => fakeImap([{ uid: 12, source: Buffer.from("x") }], seenAdded),
    ...claims,
  };
  const parse = async () => ({
    messageId: "<news@list>",
    from: { value: [{ address: "news@bulk.example" }] },
    to: { value: [{ address: "udc@updowncircle.site" }] },
    subject: "Newsletter",
    text: "Hello",
    headers: new Map([["precedence", "bulk"]]),
    attachments: [],
  });
  const result = await pollLiveEmailInbox(ports, ENV, parse);
  assert.deepEqual(result, { seen: 1, held: 0, ignored: 1, errors: 0 });
  assert.equal(claimHumanRelay("w"), null);
  assert.equal([...claims.rows.values()][0].state, "ignored_bulk_precedence");
});

test("the approved send payload threads under the customer's email and only leaves from the udc mailbox", () => {
  const payload = buildRelayEmailPayload(
    { to: "seller@quarry.example", text: "Thank you, we received your LOI." },
    { subject: "Re: Aluminium slabs offer", messageId: "<m1@sender.example>", references: ["<m1@sender.example>"] },
  );
  assert.equal(payload.from, "udc@updowncircle.site");
  assert.deepEqual(payload.to, ["seller@quarry.example"]);
  assert.equal(payload.subject, "Re: Aluminium slabs offer", "never doubles Re:");
  assert.equal(payload.headers?.["In-Reply-To"], "<m1@sender.example>");
  assert.match(payload.headers?.References ?? "", /<m1@sender\.example>/);

  const bare = buildRelayEmailPayload({ to: "a@b.example", text: "hi" }, {});
  assert.equal(bare.subject, "Re: your message to UDC");
  assert.equal(bare.headers, undefined);
});

test("sendRelayEmail delivers the exact approved payload and refuses a missing mailbox password", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const sendMail = async (payload: Record<string, unknown>) => {
    calls.push(payload);
    return { id: "<sent-1@smtp.example>" };
  };
  const payload = buildRelayEmailPayload({ to: "a@b.example", text: "approved words" }, {});
  const result = await sendRelayEmail(payload, { config: null, sendMail: sendMail as never });
  assert.equal(result.id, "<sent-1@smtp.example>");
  assert.equal(calls[0].from, "udc@updowncircle.site");
  assert.deepEqual(Object.keys(calls[0]).sort(), ["from", "subject", "text", "to"], "only the approved fields go out");

  await assert.rejects(() => sendRelayEmail(payload, { config: null }), /smtp_not_configured/);

  // Resend transport: chosen only by UDC_EMAIL_OUTBOUND=resend, posts the
  // exact payload, and a bad key is refused before any network call.
  const resendDeps = outboundDepsFromEnv({ UDC_EMAIL_OUTBOUND: "resend", RESEND_API_KEY: "re_abcdefgh123", UDC_EMAIL_IMAP_PASS: "x" });
  assert.equal(resendDeps.resendApiKey, "re_abcdefgh123");
  assert.equal(outboundDepsFromEnv({ UDC_EMAIL_IMAP_PASS: "x" }).resendApiKey, undefined, "smtp stays the default");
  const resendCalls: Array<Record<string, unknown>> = [];
  const fetchImpl = async (_url: unknown, init: { body: string }) => {
    resendCalls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ id: "re_msg_1" }), { status: 200 });
  };
  const viaResend = await sendRelayEmail(payload, { ...resendDeps, fetchImpl: fetchImpl as never });
  assert.equal(viaResend.id, "re_msg_1");
  assert.equal(resendCalls[0].from, "udc@updowncircle.site");
  await assert.rejects(
    () => sendRelayEmail(payload, { config: null, resendApiKey: "bad", fetchImpl: fetchImpl as never }),
    /resend_not_configured/,
  );
  const failFetch = async () => new Response("no", { status: 403 });
  await assert.rejects(
    () => sendRelayEmail(payload, { config: null, resendApiKey: "re_abcdefgh123", fetchImpl: failFetch as never }),
    /email_send_failed_resend_403/,
  );

  const config = smtpConfigFromEnv({ UDC_EMAIL_IMAP_PASS: "  secret  " });
  assert.deepEqual(config, { host: "smtp.titan.email", port: 465, secure: true, user: "udc@updowncircle.site", pass: "secret" });
  assert.equal(smtpConfigFromEnv({}), null, "no mailbox password, no outbound");
});

test("a worker answer auto-sends to a live customer and only drafts for synthetic items", async () => {
  const sent: Array<Record<string, unknown>> = [];
  const recorded: Array<{ to: string; messageId: string }> = [];
  const drafts: Array<{ to: string }> = [];
  const ports = (thread: Record<string, unknown> | null) => ({
    findLatestLiveThread: async () => thread,
    recordSent: async (input: { to: string; text: string; messageId: string }) => { recorded.push(input); },
    recordDraft: async (input: { to: string; text: string }) => { drafts.push(input); },
  });
  const sendMail = async (payload: Record<string, unknown>) => {
    sent.push(payload);
    return { id: "<auto-1@smtp.example>" };
  };

  // Live customer (poller claim exists): real threaded send, audit recorded.
  const live = await sendEmailRelayAnswer(
    { to: "buyer@example.com", text: "How much butter oil do you need?" },
    ports({ subject: "butter oil", messageId: "<m9@buyer.example>", references: ["<m9@buyer.example>"] }) as never,
    { config: null, sendMail: sendMail as never },
  );
  assert.deepEqual(live, { delivered: true });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, ["buyer@example.com"]);
  assert.equal(sent[0].from, "udc@updowncircle.site");
  assert.equal(sent[0].subject, "Re: butter oil");
  assert.equal(recorded.length, 1);
  assert.equal(drafts.length, 0);

  // Synthetic fixture (no live claim): draft only, nothing real leaves.
  const syn = await sendEmailRelayAnswer(
    { to: "fixture@example.com", text: "hello" },
    ports(null) as never,
    { config: null, sendMail: sendMail as never },
  );
  assert.deepEqual(syn, { delivered: true });
  assert.equal(sent.length, 1, "no second send");
  assert.equal(drafts.length, 1);

  // SMTP failure: not delivered, reason carried, nothing recorded as sent.
  const fail = await sendEmailRelayAnswer(
    { to: "buyer@example.com", text: "retry me" },
    ports({ subject: "s" }) as never,
    { config: null },
  );
  assert.equal(fail.delivered, false);
  assert.match(fail.reason ?? "", /smtp_not_configured/);
  assert.equal(recorded.length, 1, "no sent record on failure");
});

test("the bulk filter ignores promos, noreply senders and historic mail, but never a real customer", async () => {
  __setRelayPersistenceForTests(null);
  resetHumanRelay();
  const seenAdded: number[] = [];
  const claims = fakeClaims();
  const mk = (uid: number) => ({ uid, source: Buffer.from("x") });
  const ports = {
    ...noAccount,
    connect: async () => fakeImap([mk(21), mk(22), mk(23), mk(24), mk(25)], seenAdded),
    ...claims,
  };
  const mails: Record<number, object> = {
    21: { messageId: "<p1>", from: { value: [{ address: "hamia@17track.com" }] }, to: { value: [{ address: "udc@updowncircle.site" }] }, subject: "Promo", text: "Buy now", date: new Date("2026-11-11T04:00:00Z"), headers: new Map([["list-unsubscribe", "<mailto:x>"]]), attachments: [] },
    22: { messageId: "<p2>", from: { value: [{ address: "no-reply@bounce.17track.net" }] }, to: { value: [{ address: "udc@updowncircle.site" }] }, subject: "Receipt", text: "Track", date: new Date("2026-11-11T04:00:00Z"), headers: new Map(), attachments: [] },
    23: { messageId: "<p3>", from: { value: [{ address: "donotreply@go4worldbusiness.com" }] }, to: { value: [{ address: "udc@updowncircle.site" }] }, subject: "Leads", text: "New leads", date: new Date("2026-11-11T04:00:00Z"), headers: new Map(), attachments: [] },
    24: { messageId: "<p4>", from: { value: [{ address: "feedback@exportersindia.com" }] }, to: { value: [{ address: "udc@updowncircle.site" }] }, subject: "Old", text: "Old mail", date: new Date("2026-11-04T14:18:00Z"), headers: new Map(), attachments: [] },
    25: { messageId: "<p5>", from: { value: [{ address: "fatima@realsupplier.com" }] }, to: { value: [{ address: "udc@updowncircle.site" }] }, subject: "Copper cathodes", text: "We can supply 500MT.", date: new Date("2026-11-11T04:00:00Z"), headers: new Map(), attachments: [] },
  };
  const parse = async (source: Buffer) => mails[Number(source.readUInt32BE?.(0) ?? 0)] ?? null;
  // map uid -> mail via fetchOne source marker: fakeImap sources are all "x", so key off order instead
  let call = 0;
  const orderedParse = async () => mails[[21, 22, 23, 24, 25][call++]] as never;
  const result = await pollLiveEmailInbox(ports, ENV, orderedParse);
  assert.deepEqual(result, { seen: 5, held: 1, ignored: 4, errors: 0 });
  const states = [...claims.rows.values()].map((r) => r.state);
  assert.deepEqual(states.filter((s) => s.startsWith("ignored_")).sort(), ["ignored_before_go_live", "ignored_list_mail", "ignored_vendor_sender", "ignored_vendor_sender"]);
  const claimed = claimHumanRelay("w");
  assert.match(claimed?.text ?? "", /Copper cathodes/, "the real supplier reaches the workers");
  assert.equal(claimHumanRelay("w2"), null, "nothing else was held");
});

test("a quarantined sender never reaches the worker queue and is marked seen", async () => {
  __setRelayPersistenceForTests(null);
  resetHumanRelay();
  const seenAdded: number[] = [];
  const claims = fakeClaims();
  const ports = {
    ...noAccount,
    connect: async () => fakeImap([{ uid: 13, source: Buffer.from("x") }], seenAdded),
    ...claims,
  };
  const parse = async () => ({
    messageId: "<lost-phone@claim>",
    from: { value: [{ address: "Owner-Claim@Gmail.example" }] },
    to: { value: [{ address: "udc@updowncircle.site" }] },
    subject: "I lost my phone",
    text: "Can you text here instead",
    headers: new Map(),
    attachments: [],
  });
  const env = { ...ENV, UDC_EMAIL_RELAY_QUARANTINE: "owner-claim@gmail.example" } as NodeJS.ProcessEnv;
  const result = await pollLiveEmailInbox(ports, env, parse);
  assert.deepEqual(result, { seen: 1, held: 0, ignored: 1, errors: 0 });
  assert.deepEqual(seenAdded, [13]);
  assert.equal(claimHumanRelay("w"), null, "quarantined mail never becomes a relay item");
  assert.equal([...claims.rows.values()][0].state, "ignored_quarantined_sender");

  // No quarantine env: the same mail would be held for the workers.
  __setRelayPersistenceForTests(null);
  resetHumanRelay();
  const claims2 = fakeClaims();
  const ports2 = { ...noAccount, connect: async () => fakeImap([{ uid: 14, source: Buffer.from("x") }], []), ...claims2 };
  const second = await pollLiveEmailInbox(ports2, ENV, parse);
  assert.equal(second.held, 1);
});
