// Dev-side client for the UDC staging human relay. Never prints the secret.
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
const BASE = "https://udc-staging-api.onrender.com";
const secret = readFileSync("/home/sandbox/.vault/whatsapp-app-secret-udc-staging-render-38d955/password", "utf8").trim();
const sig = (v) => "sha256=" + createHmac("sha256", secret).update(v).digest("hex");
const [cmd, phone, voiceFlag] = process.argv.slice(2);
if (cmd === "status" || cmd === "pending" || cmd === "emaildrafts") {
  if (cmd === "emaildrafts") {
    const r = await fetch(`${BASE}/api/akif-relay/email-drafts`, { headers: { "x-udc-relay-signature": sig("read-relay") } });
    console.log(r.status); console.log(JSON.stringify(await r.json(), null, 2));
  } else {
  const r = await fetch(`${BASE}/api/akif-relay/${cmd}`, { headers: { "x-udc-relay-signature": sig("read-relay") } });
  console.log(r.status); console.log(JSON.stringify(await r.json(), null, 2));
  }
} else if (cmd === "emailsend") {
  const body = JSON.stringify({ draftId: phone });
  const r = await fetch(`${BASE}/api/akif-relay/email-send`, { method: "POST", headers: { "content-type": "application/json", "x-udc-relay-signature": sig(body) }, body });
  console.log(r.status); console.log(JSON.stringify(await r.json()));
} else if (cmd === "reply" || cmd === "skip") {
  let body;
  if (cmd === "skip") body = JSON.stringify({ phone });
  else {
    const text = readFileSync(0, "utf8");
    body = JSON.stringify({ phone, text, ...(voiceFlag === "voice" ? { voice: true } : {}) });
  }
  const r = await fetch(`${BASE}/api/akif-relay/${cmd}`, { method: "POST", headers: { "content-type": "application/json", "x-udc-relay-signature": sig(body) }, body });
  console.log(r.status); console.log(JSON.stringify(await r.json()));
} else if (cmd === "replyaudio") {
  const audio = readFileSync(voiceFlag);
  const body = JSON.stringify({ phone, audioBase64: audio.toString("base64") });
  const r = await fetch(`${BASE}/api/akif-relay/reply`, { method: "POST", headers: { "content-type": "application/json", "x-udc-relay-signature": sig(body) }, body });
  console.log(r.status); console.log(JSON.stringify(await r.json()));
} else if (cmd === "brief") {
  const text = readFileSync(0, "utf8");
  const body = JSON.stringify({ phone, text });
  const r = await fetch(`${BASE}/api/akif-relay/brief`, { method: "POST", headers: { "content-type": "application/json", "x-udc-relay-signature": sig(body) }, body });
  console.log(r.status); console.log(JSON.stringify(await r.json()));
} else if (cmd === "dismiss") {
  // Completion without sending: claim ownership is checked by the server.
  const [workerId, contact, itemId] = process.argv.slice(3);
  const reason = readFileSync(0, "utf8").trim();
  if (!workerId || !contact || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(itemId ?? "") || !reason || reason.length > 200) {
    console.error("usage: dismiss <workerId> <phone> <itemId> < reason (1-200 characters)");
    process.exit(1);
  }
  const body = JSON.stringify({ phone: contact, itemId, workerId, reason });
  const r = await fetch(`${BASE}/api/akif-relay/dismiss`, { method: "POST", headers: { "content-type": "application/json", "x-udc-relay-signature": sig(body) }, body });
  console.log(r.status); console.log(JSON.stringify(await r.json()));
  if (!r.ok) process.exitCode = 1;
} else if (cmd === "ask") {
  const text = readFileSync(0, "utf8");
  const body = JSON.stringify({ phone, text });
  const r = await fetch(`${BASE}/api/akif-relay/ask`, { method: "POST", headers: { "content-type": "application/json", "x-udc-relay-signature": sig(body) }, body });
  console.log(r.status); console.log(JSON.stringify(await r.json(), null, 2));
} else if (cmd === "doclink") {
  const body = JSON.stringify({ phone: a1 ?? phone });
  const r = await fetch(`${BASE}/api/akif-relay/doclink`, { method: "POST", headers: { "content-type": "application/json", "x-udc-relay-signature": sig(body) }, body });
  console.log(r.status); console.log(JSON.stringify(await r.json()));
} else { console.log("usage: relay.mjs status|pending|emaildrafts|emailsend <draftId>|reply <phone> [voice] < text|replyaudio <phone> <file.ogg>|skip <phone>|ask <phone> < text|brief <phone> < text|dismiss <workerId> <phone> <itemId> < reason"); }
