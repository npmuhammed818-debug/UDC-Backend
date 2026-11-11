import { test } from "node:test";
import assert from "node:assert/strict";
import {
  __setRelayPersistenceForTests,
  claimHumanRelay,
  resetHumanRelay,
} from "../src/akif/humanRelay.ts";
import { receiveLiveEmailRelay } from "../src/channels/emailRelayChannel.ts";
import { liveEmailToEvent, pollLiveEmailInbox, type LiveImapClient } from "../src/channels/emailLiveInbound.ts";
import { buildRelayEmailPayload, sendRelayEmail } from "../src/channels/emailOutbound.ts";
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

test("live gate needs staging plus the mailbox password", async () => {
  assert.equal(await receiveLiveEmailRelay(event(), noAccount, { ...ENV, UDC_APP_ENV: "production" }), "disabled");
  assert.equal(await receiveLiveEmailRelay(event(), noAccount, { ...ENV, UDC_EMAIL_IMAP_PASS: "" }), "disabled");
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
  assert.deepEqual(first, { seen: 1, held: 1, errors: 0 });
  assert.deepEqual(seenAdded, [11]);
  assert.equal([...claims.rows.values()][0].state, "processed");
  assert.match(claimHumanRelay("w")?.text ?? "", /First offer text/);

  // Second poll: the claim row says processed, so it is only marked seen.
  resetHumanRelay();
  const second = await pollLiveEmailInbox(ports, ENV, parse);
  assert.deepEqual(second, { seen: 0, held: 0, errors: 0 });
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
  assert.deepEqual(result, { seen: 1, held: 0, errors: 0 });
  assert.equal(claimHumanRelay("w"), null);
  assert.equal([...claims.rows.values()][0].state, "processed");
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

test("sendRelayEmail posts the exact approved payload and refuses a bad key", async () => {
  const calls: Array<{ body: Record<string, unknown> }> = [];
  const fetchImpl = async (_url: unknown, init: { body: string }) => {
    calls.push({ body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ id: "re_123" }), { status: 200 });
  };
  const payload = buildRelayEmailPayload({ to: "a@b.example", text: "approved words" }, {});
  const result = await sendRelayEmail(payload, { apiKey: "re_abcdefgh123", fetchImpl: fetchImpl as never });
  assert.equal(result.id, "re_123");
  assert.equal(calls[0].body.from, "udc@updowncircle.site");
  assert.deepEqual(Object.keys(calls[0].body).sort(), ["from", "subject", "text", "to"], "only the approved fields go out");

  await assert.rejects(() => sendRelayEmail(payload, { apiKey: "not-a-key", fetchImpl: fetchImpl as never }), /resend_not_configured/);
});
