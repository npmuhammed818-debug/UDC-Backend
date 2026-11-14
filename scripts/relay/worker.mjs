// Relay pool worker client. Usage:
//   node worker.mjs claim <workerId>
//   node worker.mjs answer <workerId> <phone> <itemId>   (reply text on stdin)
//   node worker.mjs ask <phone>                           (question text on stdin)
// Reads the relay HMAC secret from the sandbox vault file; never prints it.
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
const BASE = "https://udc-staging-api.onrender.com";
const secret = readFileSync("/home/sandbox/.vault/whatsapp-app-secret-udc-staging-render-38d955/password", "utf8").trim();
const sig = (v) => "sha256=" + createHmac("sha256", secret).update(v).digest("hex");
const [cmd, a1, a2, a3, a4] = process.argv.slice(2);
if (cmd === "claim") {
  // Wake-on-arrival: the server holds this call open up to 25s and answers
  // the moment a claimable item arrives, so pickup no longer waits a poll.
  // Deploy cutovers on the free instance briefly 502 every request; a claim
  // has no side effect, so retry quietly instead of surfacing proxy noise.
  const body = JSON.stringify({ workerId: a1, waitMs: 25000 });
  let lastErr = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 2500));
    try {
      const r = await fetch(`${BASE}/api/akif-relay/claim`, { method: "POST", headers: { "content-type": "application/json", "x-udc-relay-signature": sig(body) }, body });
      const text = await r.text();
      try {
        console.log(r.status); console.log(JSON.stringify(JSON.parse(text)));
        process.exit(0);
      } catch {
        lastErr = `${r.status} non-JSON (${text.slice(0, 60)})`;
      }
    } catch (e) { lastErr = String(e); }
  }
  console.log("claim failed after retries: " + lastErr); process.exit(1);
} else if (cmd === "answer") {
  const text = readFileSync(0, "utf8");
  const body = JSON.stringify({ phone: a2, text, itemId: a3, workerId: a1 });
  const r = await fetch(`${BASE}/api/akif-relay/reply`, { method: "POST", headers: { "content-type": "application/json", "x-udc-relay-signature": sig(body) }, body });
  console.log(r.status); console.log(JSON.stringify(await r.json()));
} else if (cmd === "ask") {
  const text = readFileSync(0, "utf8");
  const body = JSON.stringify({ phone: a1, text });
  const r = await fetch(`${BASE}/api/akif-relay/ask`, { method: "POST", headers: { "content-type": "application/json", "x-udc-relay-signature": sig(body) }, body });
  console.log(r.status); console.log(JSON.stringify(await r.json()));
} else if (cmd === "doclink") {
  const body = JSON.stringify({ phone: a1 });
  const r = await fetch(`${BASE}/api/akif-relay/doclink`, { method: "POST", headers: { "content-type": "application/json", "x-udc-relay-signature": sig(body) }, body });
  console.log(r.status); console.log(JSON.stringify(await r.json()));
} else if (cmd === "answer-v") {
  // Voice-lane answer as text: the backend turns it into a voice note in the
  // customer's language (free neural voice, no audio file needed).
  const text = readFileSync(0, "utf8");
  const body = JSON.stringify({ phone: a2, text, voice: true, itemId: a3, workerId: a1 });
  const r = await fetch(`${BASE}/api/akif-relay/reply`, { method: "POST", headers: { "content-type": "application/json", "x-udc-relay-signature": sig(body) }, body });
  console.log(r.status); console.log(JSON.stringify(await r.json()));
} else if (cmd === "answer-voice") {
  // Worker-generated voice note (ogg opus mono 48k) as the reply: answer-voice <workerId> <phone> <itemId> <file.ogg>
  const audioBase64 = readFileSync(a4).toString("base64");
  const body = JSON.stringify({ phone: a2, audioBase64, itemId: a3, workerId: a1 });
  const r = await fetch(`${BASE}/api/akif-relay/reply`, { method: "POST", headers: { "content-type": "application/json", "x-udc-relay-signature": sig(body) }, body });
  console.log(r.status); console.log(JSON.stringify(await r.json()));
} else if (cmd === "skip") {
  const body = JSON.stringify({ phone: a1 });
  const r = await fetch(`${BASE}/api/akif-relay/skip`, { method: "POST", headers: { "content-type": "application/json", "x-udc-relay-signature": sig(body) }, body });
  console.log(r.status); console.log(JSON.stringify(await r.json()));
} else { console.log("usage: worker.mjs claim <workerId> | answer <workerId> <phone> <itemId> < text | answer-v <workerId> <phone> <itemId> (text on stdin, sent as voice) | answer-voice <workerId> <phone> <itemId> <file.ogg> | ask <phone> < text | doclink <phone> | skip <phone>"); }
