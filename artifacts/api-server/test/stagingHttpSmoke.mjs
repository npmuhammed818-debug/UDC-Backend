// Real HTTP smoke test for the explicitly isolated, fictional-data-only UDC
// staging service. This script NEVER accepts an overridable target URL,
// credentials or customer inputs. It must not be pointed at production.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const BASE = "https://udc-staging-api.onrender.com";
const parsed = new URL(BASE);
assert.equal(parsed.protocol, "https:");
assert.equal(parsed.hostname, "udc-staging-api.onrender.com");

const request = async (label, path, { method = "GET", body, cookie } = {}) => {
  const response = await fetch(BASE + path, {
    method,
    redirect: "error",
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
      "cache-control": "no-store",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(120_000),
  });
  return response;
};

function expectStatus(response, status, label) {
  assert.equal(response.status, status, `${label}: unexpected HTTP status (expected ${status})`);
}

function cookieFrom(response, label) {
  const line = response.headers.getSetCookie().find(x => x.startsWith("udc_session="));
  assert.ok(line, `${label}: session cookie not issued`);
  assert.match(line, /;\s*HttpOnly\b/i, `${label}: cookie must be HttpOnly`);
  assert.match(line, /;\s*Secure\b/i, `${label}: cookie must be Secure`);
  assert.match(line, /;\s*SameSite=Lax\b/i, `${label}: cookie must be SameSite=Lax`);
  assert.match(line, /;\s*Path=\/\b|;\s*Path=\/(?:;|$)/i, `${label}: cookie path must be root`);
  const pair = line.split(";")[0];
  assert.ok(/^udc_session=[^;]+$/.test(pair), `${label}: bad session token encoding`);
  return pair;
}

const check = async (label, path, status, options = {}) => {
  const response = await request(label, path, options);
  expectStatus(response, status, label);
  await response.body?.cancel();
  console.log("PASS " + label);
};

async function main() {
  const health = await request("health", "/api/healthz");
  expectStatus(health, 200, "health");
  assert.equal((await health.text()).trim(), "UDC is running");
  console.log("PASS staging health");

  await check("anonymous session denied", "/api/auth/me", 401);
  await check("anonymous staging readiness denied", "/api/admin/release/staging-readiness", 401);
  await check("anonymous role-review denied", "/api/admin/role-change-requests", 401);

  await check("malformed registration rejected", "/api/auth/register", 400, {
    method: "POST", body: { role: "buyer", accepted_terms: false },
  });

  const unique = randomBytes(9).toString("hex");
  const roles = ["buyer", "seller", "agent"];
  for (const role of roles) {
    // Reserved fake email domain: no real person or deliverable mailbox.
    const email = `qa-${role}-${unique}@example.invalid`;
    const password = `Qa!${randomBytes(22).toString("hex")}Z8`;
    const registration = await request(`${role} registration`, "/api/auth/register", {
      method: "POST",
      body: {
        full_name: `Synthetic QA ${role}`,
        email, password, role,
        accepted_terms: true,
        adult_business_user: true,
      },
    });
    expectStatus(registration, 201, `${role} registration`);
    const session = cookieFrom(registration, `${role} registration`);
    const registered = await registration.json();
    assert.equal(registered.user?.role, role);
    assert.equal(registered.user?.status, "pending");
    assert.equal(registered.user?.emailVerified, false);
    assert.equal(registered.user?.email, email);
    assert.ok(!Object.hasOwn(registered.user, "passwordHash"));
    console.log(`PASS ${role} pending registration with unverified email`);

    const me = await request(`${role} own profile`, "/api/auth/me", { cookie: session });
    expectStatus(me, 200, `${role} own profile`);
    const profile = await me.json();
    assert.equal(profile.user?.role, role);
    assert.equal(profile.user?.status, "pending");
    assert.equal(profile.user?.emailVerified, false);
    console.log(`PASS ${role} session and role retained`);

    await check(`${role} denied admin readiness`, "/api/admin/release/staging-readiness", 403, { cookie: session });
    await check(`${role} denied role reviews`, "/api/admin/role-change-requests", 403, { cookie: session });

    const logout = await request(`${role} logout`, "/api/auth/logout", { method: "POST", cookie: session });
    expectStatus(logout, 200, `${role} logout`);
    assert.equal((await logout.json()).success, true);
    await check(`${role} revoked session rejected`, "/api/auth/me", 401, { cookie: session });

    const login = await request(`${role} email/password login`, "/api/auth/login", {
      method: "POST", body: { email, password },
    });
    expectStatus(login, 200, `${role} login`);
    const renewed = cookieFrom(login, `${role} login`);
    const loggedIn = await login.json();
    assert.equal(loggedIn.user?.role, role);
    console.log(`PASS ${role} correct email/password login`);
    const finish = await request(`${role} final logout`, "/api/auth/logout", { method: "POST", cookie: renewed });
    expectStatus(finish, 200, `${role} final logout`);
    await finish.body?.cancel();
  }
  console.log("PASS all staging smoke checks; only 3 fictional pending accounts were created");
}

main().catch(error => {
  // Do not print email addresses, passwords, cookie tokens or response bodies.
  console.error("FAIL staging HTTP acceptance:", error?.message ?? "unknown failure");
  process.exitCode = 1;
});
