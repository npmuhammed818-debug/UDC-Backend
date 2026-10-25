import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Request, Response } from "express";
import { requireNonAgentDealAccess } from "../src/auth/agentDealPrivacy.ts";

function simulate(role?: string, status = "verified") {
  let code: number | null = null;
  let body: unknown = null;
  let nextCalls = 0;
  const req = { authUser: role ? { role, status } : undefined } as unknown as Request;
  const res = {
    status(value: number) { code = value; return this; },
    json(value: unknown) { body = value; return this; },
  } as unknown as Response;
  requireNonAgentDealAccess(req, res, () => { nextCalls++; });
  return { code, body, nextCalls };
}

test("agent role may never access full deal payloads or documents", () => {
  for (const status of ["verified", "pending", "under_review", "active"]) {
    const result = simulate("agent", status);
    assert.equal(result.code, 403, status);
    assert.deepEqual(result.body, { error: "agent_milestones_only" });
    assert.equal(result.nextCalls, 0, status);
  }
});

test("buyer, seller and admin access continues to route-specific authorization", () => {
  for (const role of ["buyer", "seller", "admin"]) {
    const result = simulate(role);
    assert.equal(result.code, null, role);
    assert.equal(result.nextCalls, 1, role);
  }
});

test("absent authentication does not pass a private deal route", () => {
  const result = simulate();
  assert.equal(result.code, 401);
  assert.deepEqual(result.body, { error: "authentication_required" });
  assert.equal(result.nextCalls, 0);
});

test("all generic deal routes contain agent privacy middleware, but tracking remains redacted", () => {
  const src = readFileSync(new URL("../src/routes/deals.ts", import.meta.url), "utf8");
  const paths = [
    ["/deals/:dealId/documents", "get"],
    ["/deals/:dealId/documents/upload", "post"],
    ["/deals/:dealId/messages", "get"],
    ["/deals/:dealId/execution", "get"],
    ["/deals/:dealId/feedback", "post"],
    ["/deals", "get"],
    ["/deals/:dealId", "get"],
    ["/deals/:dealId/ncnda-draft", "post"],
    ["/deals/:dealId/spa-draft", "post"],
    ["/deals/:dealId/loi-draft", "post"],
    ["/deals/:dealId/icpo-draft", "post"],
    ["/deals/:dealId/fco-draft", "post"],
    ["/deals/:dealId/payment-status", "get"],
    ["/deals/:dealId/timeline", "get"],
  ] as const;
  for (const [path, method] of paths) {
    assert.ok(
      src.includes(`router.${method}("${path}", requireAuth, requireNonAgentDealAccess,`),
      `Agent privacy gate missing: ${method.toUpperCase()} ${path}`,
    );
  }
  assert.ok(src.includes('router.get("/deals/:dealId/tracking", requireAuth, async'));
  assert.ok(src.includes('const assignedAgent=req.authUser!.role==="agent"'));
});

test("global document signing is agent-restricted too", () => {
  const src = readFileSync(new URL("../src/routes/documents.ts", import.meta.url), "utf8");
  assert.ok(src.includes('router.get("/documents", requireAuth, requireNonAgentDealAccess,'));
});

test("new deal/document API routes cannot silently bypass agent privacy rules", () => {
  const sources = [
    {
      name: "deals.ts",
      prefix: "/deals",
      contents: readFileSync(new URL("../src/routes/deals.ts", import.meta.url), "utf8"),
    },
    {
      name: "documents.ts",
      prefix: "/documents",
      contents: readFileSync(new URL("../src/routes/documents.ts", import.meta.url), "utf8"),
    },
  ];

  for (const { name, prefix, contents } of sources) {
    const declarations = [...contents.matchAll(
      /\brouter\.(get|post|put|patch|delete)\(\s*["'](\/[^"']+)["']/g,
    )].filter((match) => match[2] === prefix || match[2]?.startsWith(prefix + "/"));

    const parsed = [...contents.matchAll(
      /\brouter\.(get|post|put|patch|delete)\(\s*["'](\/[^"']+)["']\s*,\s*([\s\S]*?)\basync\s*\(\s*req\s*,\s*res\s*\)\s*=>/g,
    )].filter((match) => match[2] === prefix || match[2]?.startsWith(prefix + "/"));

    // A new callback style must be audited, not silently excluded.
    assert.equal(parsed.length, declarations.length,
      name + ": newly added or unrecognized route - review role authorization");

    for (const [, method, routePath, middleware] of parsed) {
      assert.match(middleware, /\brequireAuth\b/,
        name + ": unauthenticated route " + method?.toUpperCase() + " " + routePath);

      // Assigned agents may view the existing redacted milestones endpoint only.
      const redactedTracking = method === "get" && routePath === "/deals/:dealId/tracking";
      if (!redactedTracking) {
        assert.match(middleware, /\brequireNonAgentDealAccess\b/,
          name + ": missing agent privacy gate on " + method?.toUpperCase() + " " + routePath);
      }
    }
  }
});
