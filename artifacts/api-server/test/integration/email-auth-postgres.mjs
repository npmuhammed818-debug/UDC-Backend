// Dedicated loopback QA DB only. Real routes, SQL transactions/locks and scrypt;
// email is intercepted at bundle time, never sent. No runtime test bypass exists.
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHmac } from "node:crypto";
import { readFile, mkdtemp, rm, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const url = new URL(
  process.env.UDC_EMAIL_QA_DATABASE_URL ?? "http://missing.invalid",
);
assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
assert.ok(
  !url.searchParams.has("host") ||
    ["localhost", "127.0.0.1"].includes(url.searchParams.get("host")),
);
assert.match(url.pathname, /^\/udc_qa_email_[a-z0-9_]+$/);
for (const key of Object.keys(process.env))
  if (
    /^(SUPABASE_|WHATSAPP_|AKIF_|NVIDIA_|OPENAI_|HERMES_|SESSION_SECRET)/.test(
      key,
    )
  )
    delete process.env[key];
Object.assign(process.env, {
  SUPABASE_DATABASE_URL: url.href,
  SESSION_SECRET: randomBytes(32).toString("hex"),
  NODE_ENV: "test",
});
const fixture = { outbox: [], fail: false };
globalThis.__emailAuthQA = fixture;
await mkdir(new URL("../../tmp/", import.meta.url), { recursive: true });
const directory = await mkdtemp(
  fileURLToPath(new URL("../../tmp/qa-email-", import.meta.url)),
);
let server, pool;
const beforeFetch = globalThis.fetch;
let origin;
globalThis.fetch = async (input, init) => {
  assert.equal(
    new URL(String(input)).origin,
    origin,
    "never contact external services",
  );
  return beforeFetch(input, init);
};
try {
  await build({
    stdin: {
      contents: `import express from 'express';import cookieParser from 'cookie-parser';import auth from './src/routes/auth';import email from './src/routes/emailAuth';import profile from './src/routes/profile';import {loadAuth} from './src/auth/middleware';export {pool,db} from '@workspace/db';export {createPhoneRecoveryService} from './src/whatsapp/phoneRecovery';export {hashPassword,verifyPassword} from './src/auth/passwords';export {createEmailAuthService} from './src/auth/emailAuth';export {handleEmailVerification} from './src/whatsapp/emailVerification';const app=express();app.set('trust proxy','loopback');app.use(express.json());app.use(cookieParser());app.use(loadAuth);app.use(auth);app.use(email);app.use(profile);export default app;`,
      resolveDir: fileURLToPath(new URL("../../", import.meta.url)),
    },
    outfile: directory + "/app.mjs",
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["pg-native"],
    banner: {
      js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);",
    },
    logLevel: "silent",
    plugins: [
      {
        name: "mock-email-only",
        setup(b) {
          b.onResolve({ filter: /\/emailDelivery$/ }, () => ({
            path: "mock-email",
            namespace: "qa",
          }));
          b.onLoad({ filter: /.*/, namespace: "qa" }, () => ({
            contents: `export const sendAuthEmail=async message=>{const f=globalThis.__emailAuthQA;if(f.fail)throw new Error('synthetic upstream failure with secret content');f.outbox.push(message);};`,
          }));
        },
      },
    ],
  });
  const app = await import(directory + "/app.mjs");
  pool = app.pool;
  await pool.query(
    await readFile(
      new URL(
        "../../../../lib/db/migrations/20261023_email_authentication.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await pool.query(
    await readFile(
      new URL(
        "../../../../lib/db/migrations/20261023_email_authentication.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  // Disposable CI Postgres may not predefine Supabase's NOLOGIN client roles.
  // Create them ONLY in this isolated QA container to test effective grants.
  await pool.query("DO $ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $");
  const phoneMigration = await readFile(new URL("../../../../lib/db/migrations/20261024_whatsapp_phone_recovery.sql",import.meta.url),"utf8");
  await pool.query(phoneMigration);
  await pool.query(phoneMigration);
  server = app.default.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  origin = `http://127.0.0.1:${server.address().port}`;
  let ipCounter = 1,
    checks = 0;
  async function post(
    path,
    body,
    cookie = "",
    ip = `198.18.${Math.floor(ipCounter / 250)}.${ipCounter++ % 250}`,
  ) {
    const response = await fetch(origin + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": ip,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    });
    return {
      response,
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  }
  const pass = (label) => {
    checks++;
    console.log("PASSED: " + label);
  };
  const changedEmail = `changed-${randomUUID()}@example.invalid`;
  const email = `qa-${randomUUID()}@example.invalid`,
    password = "Fictional-Original-Password8!";
  const registered = await post("/auth/register", {
    full_name: "UDC QA Email Buyer",
    email,
    password,
    role: "buyer",
    accepted_terms: true,
    adult_business_user: true,
  });
  assert.equal(registered.status, 201);
  const userId = registered.body.user.id,
    cookie = registered.cookie;
  assert.ok(cookie);
  assert.equal(registered.body.user.status, "pending");
  const [u] = (await pool.query("select * from users where id=$1", [userId]))
    .rows;
  assert.equal(u.password_recovery_enabled, true);
  assert.equal(u.email_verified_at, null);
  pass(
    "new password registration explicitly eligible; no fabricated ownership or company approval",
  );
  assert.equal(
    (await post("/auth/email/verification/request", {})).status,
    401,
  );
  const unknown = await post("/auth/password/recovery/request", {
    email: "unknown@example.invalid",
  });
  const unverified = await post("/auth/password/recovery/request", { email });
  assert.equal(unknown.status, 202);
  assert.equal(unverified.status, 202);
  assert.equal(unknown.body.message, unverified.body.message);
  assert.equal(fixture.outbox.length, 0);
  pass(
    "unknown and unverified reset accounts receive generic response with no mail",
  );
  let issued = await post("/auth/email/verification/request", {}, cookie);
  assert.equal(issued.status, 202);
  let letter = fixture.outbox.at(-1);
  assert.equal(letter.to, email);
  assert.match(letter.code, /^\d{6}$/);
  assert.equal(letter.purpose, "verify_email");
  assert.ok(!JSON.stringify(issued.body).includes(letter.code));
  const stored = (
    await pool.query("select * from email_auth_challenges where id=$1", [
      issued.body.challengeId,
    ])
  ).rows[0];
  assert.notEqual(stored.code_hash, letter.code);
  assert.match(stored.code_hash, /^[a-f0-9]{64}$/);
  assert.equal(
    stored.expires_at.getTime() - stored.created_at.getTime(),
    600000,
  );
  pass(
    "six-digit code is delivered only to mock email; DB stores keyed digest with ten-minute expiry",
  );
  const firstId = issued.body.challengeId,
    firstCode = letter.code;
  assert.equal(
    (await post("/auth/email/verification/request", {}, cookie)).status,
    429,
  );
  assert.equal(fixture.outbox.length, 1);
  pass("one-minute resend cooldown");
  const bad = firstCode === "000000" ? "000001" : "000000";
  for (let n = 0; n < 5; n++)
    assert.equal(
      (
        await post(
          "/auth/email/verification/confirm",
          { challengeId: firstId, code: bad },
          cookie,
        )
      ).status,
      400,
    );
  assert.equal(
    (
      await post(
        "/auth/email/verification/confirm",
        { challengeId: firstId, code: firstCode },
        cookie,
      )
    ).status,
    400,
  );
  pass("five wrong guesses consume the code; correct code then fails");
  // Only this isolated QA database is advanced to exercise resend/expiry without sleeps.
  await pool.query(
    "update email_auth_limits set last_attempt_at=last_attempt_at-interval '61 seconds'",
  );
  issued = await post("/auth/email/verification/request", {}, cookie);
  letter = fixture.outbox.at(-1);
  assert.equal(issued.status, 202);
  await pool.query(
    "update email_auth_challenges set expires_at=now()-interval '1 second' where id=$1",
    [issued.body.challengeId],
  );
  assert.equal(
    (
      await post(
        "/auth/email/verification/confirm",
        { challengeId: issued.body.challengeId, code: letter.code },
        cookie,
      )
    ).status,
    400,
  );
  pass("expired code cannot verify email");
  await pool.query(
    "update email_auth_limits set last_attempt_at=last_attempt_at-interval '61 seconds'",
  );
  issued = await post("/auth/email/verification/request", {}, cookie);
  letter = fixture.outbox.at(-1);
  const swapped = await post("/auth/password/recovery/confirm", {
    email,
    challengeId: issued.body.challengeId,
    code: letter.code,
    password: "Fictional-Replacement9!",
  });
  assert.equal(swapped.status, 400);
  const confirmations = await Promise.all(
    [1, 2].map(() =>
      post(
        "/auth/email/verification/confirm",
        { challengeId: issued.body.challengeId, code: letter.code },
        cookie,
      ),
    ),
  );
  assert.deepEqual(confirmations.map((x) => x.status).sort(), [200, 400]);
  const verified = (
    await pool.query("select * from users where id=$1", [userId])
  ).rows[0];
  assert.equal(verified.verified_email, email);
  assert.ok(verified.email_verified_at);
  assert.equal(verified.status, "pending");
  pass(
    "purpose isolation, atomic single use under concurrency, no company auto-approval",
  );
  const login = await post("/auth/login", { email, password });
  assert.equal(login.status, 200);
  const oldSession = login.cookie;
  assert.ok(oldSession);
  const resetRequest = await post("/auth/password/recovery/request", { email });
  assert.equal(resetRequest.status, 202);
  const resetLetter = fixture.outbox.at(-1);
  assert.equal(resetLetter.purpose, "reset_password");
  assert.equal(
    (
      await post("/auth/password/recovery/confirm", {
        email,
        challengeId: resetRequest.body.challengeId,
        code: resetLetter.code,
        password: "weak",
      })
    ).status,
    400,
  );
  const resets = await Promise.all(
    [1, 2].map(() =>
      post("/auth/password/recovery/confirm", {
        email,
        challengeId: resetRequest.body.challengeId,
        code: resetLetter.code,
        password: "Fictional-Replacement9!",
      }),
    ),
  );
  assert.deepEqual(resets.map((x) => x.status).sort(), [200, 400]);
  assert.equal((await post("/auth/login", { email, password })).status, 401);
  assert.equal(
    (await post("/auth/login", { email, password: "Fictional-Replacement9!" }))
      .status,
    200,
  );
  const me = await fetch(origin + "/auth/me", {
    headers: { cookie: oldSession },
  });
  assert.equal(me.status, 401);
  await me.arrayBuffer();
  assert.equal(
    Number(
      (
        await pool.query(
          "select count(*) from auth_sessions where user_id=$1 and revoked_at is not null",
          [userId],
        )
      ).rows[0].count,
    ) >= 2,
    true,
  );
  pass(
    "strong replacement password, atomic reset/replay rejection, old password rejected and all prior sessions revoked",
  );
  const newLogin = await post("/auth/login", {
    email,
    password: "Fictional-Replacement9!",
  });
  const change = await fetch(origin + "/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json", cookie: newLogin.cookie },
    body: JSON.stringify({ email: changedEmail }),
  });
  assert.equal(change.status, 403);
  await change.arrayBuffer();
  const authorizedChange = await fetch(origin + "/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json", cookie: newLogin.cookie },
    body: JSON.stringify({
      email: changedEmail,
      current_password: "Fictional-Replacement9!",
    }),
  });
  assert.equal(authorizedChange.status, 200);
  await authorizedChange.arrayBuffer();
  let changed = (await pool.query("select * from users where id=$1", [userId]))
    .rows[0];
  assert.equal(changed.email_verified_at, null);
  assert.equal(changed.verified_email, null);
  pass(
    "email change requires password reauthentication and invalidates ownership proof",
  );
  // WhatsApp random hashes and unclassified legacy hashes are not password recovery eligibility.
  const waId = randomUUID(),
    waEmail = `wa-${randomUUID()}@example.invalid`,
    phone = "1000" + Date.now();
  await pool.query(
    "insert into users(id,email,phone,password_hash,role,status,verified_email,email_verified_at) values($1,$2,$3,$4,$5,$6,$2,now())",
    [
      waId,
      waEmail,
      phone,
      await app.hashPassword(randomUUID()),
      "agent",
      "pending",
    ],
  );
  const count = fixture.outbox.length;
  await post("/auth/password/recovery/request", { email: waEmail });
  assert.equal(fixture.outbox.length, count);
  const legacyEmail = `legacy-${randomUUID()}@example.invalid`,
    legacyPassword = "Fictional-Legacy9!";
  await pool.query(
    "insert into users(email,password_hash,role,status) values($1,$2,$3,$4)",
    [legacyEmail, await app.hashPassword(legacyPassword), "admin", "active"],
  );
  await post("/auth/password/recovery/request", { email: legacyEmail });
  assert.equal(fixture.outbox.length, count);
  const legacyLogin = await post("/auth/login", {
    email: legacyEmail,
    password: legacyPassword,
  });
  assert.equal(legacyLogin.status, 200);
  assert.equal(
    (
      await pool.query(
        "select password_recovery_enabled from users where email=$1",
        [legacyEmail],
      )
    ).rows[0].password_recovery_enabled,
    true,
  );
  pass(
    "WhatsApp-only accounts cannot gain passwords through recovery; legacy eligibility requires actual password proof",
  );
  const service = app.createEmailAuthService({
    send: async (message) => fixture.outbox.push(message),
  });
  // Exercise trigger on out-of-band email change away and back; old codes stay dead.
  const legacyId = (
    await pool.query("select id from users where email=$1", [legacyEmail])
  ).rows[0].id;
  const proof = await service.requestVerification(legacyId),
    proofLetter = fixture.outbox.at(-1);
  assert.equal(
    (
      await post(
        "/auth/email/verification/confirm",
        { challengeId: proof.challengeId, code: proofLetter.code },
        newLogin.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await pool.query(
        "select attempts from email_auth_challenges where id=$1",
        [proof.challengeId],
      )
    ).rows[0].attempts,
    0,
  );
  pass("challenge is user-bound; another authenticated user cannot consume it");
  await pool.query("update users set email=$1 where id=$2", [
    `away-${randomUUID()}@example.invalid`,
    legacyId,
  ]);
  await pool.query("update users set email=$1 where id=$2", [
    legacyEmail,
    legacyId,
  ]);
  await assert.rejects(
    service.verify(legacyId, proof.challengeId, proofLetter.code),
    (e) => e.kind === "invalid_code",
  );
  pass(
    "database trigger invalidates codes even after out-of-band email change away and back",
  );
  // Signed webhook calls this handler after consent; credentials are consumed before AI.
  await pool.query(
    "update users set verified_email=null,email_verified_at=null where id=$1",
    [waId],
  );
  assert.equal(
    await app.handleEmailVerification(phone, "ordinary conversation"),
    null,
  );
  assert.match(
    await app.handleEmailVerification(phone, "Verify email"),
    /6-digit/,
  );
  const waLetter = fixture.outbox.at(-1);
  assert.match(
    await app.handleEmailVerification(phone, "Email code " + waLetter.code),
    /ownership is verified/,
  );
  assert.equal(
    (
      await pool.query(
        "select password_recovery_enabled,status from users where id=$1",
        [waId],
      )
    ).rows[0].password_recovery_enabled,
    false,
  );
  pass(
    "WhatsApp ownership verification preserves passwordless status and consumes code locally",
  );
  // Simulated clock tests the complete hourly window without waiting or changing production clocks.
  const limitedId = randomUUID(),
    limitedEmail = `limits-${randomUUID()}@example.invalid`,
    limitedPassword = "Fictional-Limits-Password8!";
  await pool.query(
    "insert into users(id,email,password_hash,password_recovery_enabled,role,status) values($1,$2,$3,true,$4,$5)",
    [
      limitedId,
      limitedEmail,
      await app.hashPassword(limitedPassword),
      "buyer",
      "pending",
    ],
  );
  let clock = Date.now();
  const timed = app.createEmailAuthService({
    now: () => new Date(clock),
    send: async (m) => fixture.outbox.push(m),
  });
  let latest, latestLetter, obsolete, obsoleteLetter;
  for (let n = 0; n < 5; n++) {
    latest = await timed.requestVerification(limitedId);
    latestLetter = fixture.outbox.at(-1);
    if (n === 0) {
      obsolete = latest;
      obsoleteLetter = latestLetter;
    }
    clock += 61000;
  }
  await assert.rejects(
    timed.requestVerification(limitedId),
    (e) => e.kind === "rate_limited",
  );
  await assert.rejects(
    timed.verify(limitedId, obsolete.challengeId, obsoleteLetter.code),
    (e) => e.kind === "invalid_code",
  );
  await timed.verify(limitedId, latest.challengeId, latestLetter.code);
  pass(
    "five-per-hour limit, durable resend invalidation and newest-code verification",
  );
  const raceRequest = await post("/auth/password/recovery/request", {
    email: limitedEmail,
  });
  const raceLetter = fixture.outbox.at(-1);
  const [raceLogin, raceReset] = await Promise.all([
    post("/auth/login", { email: limitedEmail, password: limitedPassword }),
    post("/auth/password/recovery/confirm", {
      email: limitedEmail,
      challengeId: raceRequest.body.challengeId,
      code: raceLetter.code,
      password: "Fictional-Race-Replacement9!",
    }),
  ]);
  assert.equal(raceReset.status, 200);
  assert.ok([200, 401].includes(raceLogin.status));
  if (raceLogin.cookie) {
    const r = await fetch(origin + "/auth/me", {
      headers: { cookie: raceLogin.cookie },
    });
    assert.equal(r.status, 401);
    await r.arrayBuffer();
  }
  assert.equal(
    (
      await post("/auth/login", {
        email: limitedEmail,
        password: limitedPassword,
      })
    ).status,
    401,
  );
  pass(
    "concurrent old-password login cannot retain a session after reset commits",
  );
  await pool.query(
    "update email_auth_limits set last_attempt_at=last_attempt_at-interval '61 seconds'",
  );
  const suspendedRequest = await post("/auth/password/recovery/request", {
    email: limitedEmail,
  });
  const suspendedLetter = fixture.outbox.at(-1);
  await pool.query("update users set status='suspended' where id=$1", [
    limitedId,
  ]);
  assert.equal(
    (
      await post("/auth/password/recovery/confirm", {
        email: limitedEmail,
        challengeId: suspendedRequest.body.challengeId,
        code: suspendedLetter.code,
        password: "Fictional-Blocked-Replacement9!",
      })
    ).status,
    400,
  );
  const beforeSuspended = fixture.outbox.length;
  await post("/auth/password/recovery/request", { email: limitedEmail });
  assert.equal(fixture.outbox.length, beforeSuspended);
  await pool.query("update users set status='pending' where id=$1", [
    limitedId,
  ]);
  pass(
    "suspension is rechecked before code use and prevents recovery requests",
  );
  fixture.fail = true;
  await pool.query(
    "update email_auth_limits set last_attempt_at=last_attempt_at-interval '61 seconds'",
  );
  const providerFailure = await post(
    "/auth/email/verification/request",
    {},
    legacyLogin.cookie,
  );
  assert.equal(providerFailure.status, 503);
  assert.equal(providerFailure.body.error, "email_auth_unavailable");
  assert.ok(!JSON.stringify(providerFailure.body).includes("secret"));
  const active = (
    await pool.query(
      "select count(*) from email_auth_challenges where user_id=$1 and consumed_at is null and purpose='verify_email'",
      [legacyId],
    )
  ).rows[0].count;
  assert.equal(Number(active), 0);
  const failedReset = await post("/auth/password/recovery/request", {
    email: limitedEmail,
  });
  assert.equal(failedReset.status, 202);
  assert.equal(failedReset.body.message, unknown.body.message);
  assert.equal(
    Number(
      (
        await pool.query(
          "select count(*) from email_auth_challenges where user_id=$1 and purpose='reset_password' and consumed_at is null",
          [limitedId],
        )
      ).rows[0].count,
    ),
    0,
  );
  fixture.fail = false;
  pass("delivery errors are generic and undelivered codes are invalidated");
  const ip = "198.19.0.1";
  for (let n = 0; n < 10; n++)
    assert.equal(
      (
        await post(
          "/auth/password/recovery/request",
          { email: "unknown@example.invalid" },
          "",
          ip,
        )
      ).status,
      202,
    );
  const limited = await post(
    "/auth/password/recovery/request",
    { email: "unknown@example.invalid" },
    "",
    ip,
  );
  assert.equal(limited.status, 429);
  assert.equal(limited.response.headers.get("Retry-After"), "900");
  const restarted = app.createEmailAuthService();
  await assert.rejects(
    restarted.ipBudget(ip, "send"),
    (e) => e.kind === "rate_limited",
  );
  pass(
    "IP rate limit counts unknown requests and survives service reinitialization",
  );
  const checkIp = "198.19.0.2";
  for (let n = 0; n < 20; n++)
    assert.equal(
      (await post("/auth/password/recovery/confirm", {}, "", checkIp)).status,
      400,
    );
  assert.equal(
    (await post("/auth/password/recovery/confirm", {}, "", checkIp)).status,
    429,
  );
  pass(
    "malformed confirmation requests consume the durable IP guessing budget",
  );
  // QA-only: real PostgreSQL and fake email; no real Meta/SMTP requests.
  process.env.WHATSAPP_APP_SECRET="synthetic-qa-phone-recovery-secret-at-least-32";
  const originalId=randomUUID(),oldPhone="100000091111",newPhone="100000092222";
  const originalEmail="recover-"+randomUUID()+"@example.invalid";
  await pool.query("insert into users(id,email,verified_email,email_verified_at,phone,password_hash,role,status) values($1,$2,$2,now(),$3,$4,'buyer','verified')",
    [originalId,originalEmail,oldPhone,"synthetic-no-password-"+randomUUID()]);
  const beforeCount=Number((await pool.query("select count(*) from users")).rows[0].count);
  const recovery=app.createPhoneRecoveryService({database:app.db});
  const beforeMail=fixture.outbox.length;
  const generic=await recovery.request(newPhone,"unknown-"+randomUUID()+"@example.invalid");
  assert.equal(fixture.outbox.length,beforeMail);
  assert.equal(await recovery.request(newPhone,originalEmail),generic);
  assert.equal(fixture.outbox.length,beforeMail+1);
  const recoveryMail=fixture.outbox.at(-1);
  assert.equal(recoveryMail.purpose,"link_phone");
  assert.match(recoveryMail.code,/^\d{6}$/);
  const c=(await pool.query("select * from public.whatsapp_phone_link_challenges where user_id=$1",[originalId])).rows[0];
  assert.notEqual(c.code_hash,recoveryMail.code);
  assert.match(c.code_hash,/^[a-f0-9]{64}$/);
  assert.match(await recovery.confirm("100000093333",recoveryMail.code),/invalid/);
  const wrongCode=recoveryMail.code==="000000"?"000001":"000000";
  assert.match(await recovery.confirm(newPhone,wrongCode),/invalid/);
  assert.equal((await pool.query("select attempts from whatsapp_phone_link_challenges where id=$1",[c.id])).rows[0].attempts,1);
  assert.match(await recovery.confirm(newPhone,recoveryMail.code),/original UDC account/);
  const after=(await pool.query("select id,email,phone,role,status,verified_email from users where id=$1",[originalId])).rows[0];
  assert.equal(after.id,originalId);assert.equal(after.email,originalEmail);
  assert.equal(after.verified_email,originalEmail);assert.equal(after.phone,newPhone);
  assert.equal(after.role,"buyer");assert.equal(after.status,"verified");
  assert.equal(Number((await pool.query("select count(*) from users")).rows[0].count),beforeCount);
  assert.equal((await pool.query("select id from users where phone=$1",[oldPhone])).rowCount,0);
  assert.match(await recovery.confirm(newPhone,recoveryMail.code),/invalid/);
  for(const role of ["anon","authenticated"]){
    const grant=(await pool.query("select has_table_privilege($1,'public.whatsapp_phone_link_challenges','SELECT') AS allowed",[role])).rows[0];
    assert.equal(grant.allowed,false);
  }
  assert.equal((await pool.query("select relrowsecurity from pg_class where oid='public.whatsapp_phone_link_challenges'::regclass")).rows[0].relrowsecurity,true);
  pass("real PostgreSQL: verified email permits safe second-number recovery without duplicate identity or client SQL access");
  const audit = JSON.stringify(
    (
      await pool.query(
        "select metadata from audit_logs where actor_user_id=any($1::uuid[])",
        [[userId, waId, legacyId]],
      )
    ).rows,
  );
  for (const message of fixture.outbox)
    assert.ok(!audit.includes(message.code));
  assert.equal(
    (
      await pool.query(
        "select relrowsecurity from pg_class where relname='email_auth_challenges'",
      )
    ).rows[0].relrowsecurity,
    true,
  );
  pass("audit excludes codes; private challenge table has RLS enabled");
  console.log(
    `PASSED: ${checks} real PostgreSQL email-auth scenarios; no real email/network/provider calls.`,
  );
} finally {
  globalThis.fetch = beforeFetch;
  if (server) await new Promise((r) => server.close(r));
  if (pool) await pool.end();
  delete globalThis.__emailAuthQA;
  await rm(directory, { recursive: true, force: true });
}
