import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

// Run actual Express routes and auth middleware against isolated relational fixtures.
// Predicate evaluation means removing a membership/status/grant filter leaks a
// fixture and fails the assertions. No production users, sessions or DB are used.
test("private deal routes enforce membership, sharing, suspension and agent revocation", async (t) => {
  const tableNames = ["auditLogsTable", "buyerRequestsTable", "companiesTable", "dealFinancialsTable",
    "dealParticipantsTable", "dealsTable", "documentAccessTable", "documentsTable", "inspectionsTable",
    "messagesTable", "productsTable", "sellerListingsTable", "shipmentsTable", "shipmentTrackingEventsTable", "shipmentCargoUnitsTable", "dealMeetingsTable",
    "dealCasesTable", "customsClearanceTable", "dealFeedbackTable"];
  const tables: any = Object.fromEntries(tableNames.map(name => [name, new Proxy({ _tableName: name }, {
    get(target, key) { return key === "_tableName" ? target._tableName : { kind: "column", table: name, key }; },
  })]));
  const records: Record<string, any[]> = Object.fromEntries(tableNames.map(name => [name, []]));
  const dealId = "11111111-1111-4111-8111-111111111111";
  records.dealsTable = [{ id: dealId, buyerUserId: "buyer", sellerUserId: "seller", status: "active" },
    { id: "other-deal", buyerUserId: "outsider", sellerUserId: "other-seller" }];
  records.dealParticipantsTable = [{ dealId, userId: "agent", participantRole: "agent", status: "active" }];
  records.documentsTable = [
    { id: "shared", dealId, uploadedBy: "seller", status: "approved", fileUrl: "storage://udc-documents/shared.pdf" },
    { id: "private-pending", dealId, uploadedBy: "seller", status: "pending", fileUrl: "storage://udc-documents/private.pdf" },
    { id: "other-file", dealId: "other-deal", uploadedBy: "outsider", status: "approved", fileUrl: "storage://udc-documents/other.pdf" },
  ];
  records.documentAccessTable = [
    ...["buyer", "seller", "agent"].map(userId => ({ documentId: "shared", userId })),
    { documentId: "private-pending", userId: "seller" },
    // A stale explicit grant must not bypass current deal membership.
    { documentId: "other-file", userId: "buyer" },
  ];
  records.messagesTable = [
    { id: "buyer-message", dealId, senderUserId: "buyer", receiverUserId: "admin", body: "buyer terms" },
    { id: "seller-private", dealId, senderUserId: "seller", receiverUserId: "admin", body: "seller terms" },
    { id: "agent-message", dealId, senderUserId: "agent", receiverUserId: "admin", body: "introduction" },
  ];
  let signed: string[] = [];
  let reads: string[] = [];
  let uploads = 0;
  const evaluate = (node: any, row: any): any => {
    if (node?.kind === "column") return row[node.table]?.[node.key];
    if (node?.kind === "eq") return evaluate(node.a, row) === evaluate(node.b, row);
    if (node?.kind === "and") return node.args.every((part: any) => evaluate(part, row));
    if (node?.kind === "or") return node.args.some((part: any) => evaluate(part, row));
    if (node?.kind === "in") return node.query.run().some((item: any) => Object.values(item)[0] === evaluate(node.a, row));
    return node;
  };
  function select(fields?: any) {
    let base: string;
    let condition: any = true;
    let maximum = Infinity;
    const joins: any[] = [];
    const query: any = {
      from(table: any) { base = table._tableName; return query; },
      where(value: any) { condition = value; return query; },
      innerJoin(table: any, on: any) { joins.push({ name: table._tableName, on }); return query; },
      orderBy() { return query; }, limit(count: number) { maximum = count; return query; },
      run() {
        reads.push(base);
        let rows = records[base].map(value => ({ [base]: value }));
        for (const join of joins) rows = rows.flatMap(row => records[join.name]
          .map(value => ({ ...row, [join.name]: value })).filter(row => evaluate(join.on, row)));
        return rows.filter(row => evaluate(condition, row)).slice(0, maximum).map(row => fields
          ? Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, evaluate(value, row)]))
          : { ...row[base] });
      },
      then(resolve: any, reject: any) { return Promise.resolve().then(() => query.run()).then(resolve, reject); },
    };
    return query;
  }
  const state: any = { tables, db: { select }, user: undefined,
    sign: async (path: string) => { signed.push(path); return `https://signed.example/${path}`; },
    upload: async () => { uploads++; throw new Error("unexpected_upload"); } };
  (globalThis as any).__privateDealRoutes = state;
  const output = fileURLToPath(new URL(`./private-routes-${randomUUID()}.mjs`, import.meta.url));
  const bundle = await build({
    stdin: { contents: 'import express from "express"; import deals from "../src/routes/deals.ts"; import documents from "../src/routes/documents.ts"; const app=express();app.use(express.json());app.use((req,res,next)=>{req.authUser=globalThis.__privateDealRoutes.user;next();});app.use(deals);app.use(documents);export default app;',
      resolveDir: fileURLToPath(new URL(".", import.meta.url)), loader: "ts" },
    bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "isolated-fixtures", setup(b) {
      b.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "fixture" }));
      b.onResolve({ filter: /^drizzle-orm$/ }, () => ({ path: "orm", namespace: "fixture" }));
      b.onResolve({ filter: /supabase\/storage$/ }, () => ({ path: "storage", namespace: "fixture" }));
      b.onResolve({ filter: /^\.\/sessions$/ }, args => args.importer.includes("/auth/") ? { path: "sessions", namespace: "fixture" } : undefined);
      b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "js", contents: args.path === "db"
        ? 'const s=globalThis.__privateDealRoutes;export const db=s.db;' + tableNames.map(name => `export const ${name}=s.tables.${name};`).join("")
        : args.path === "orm" ? 'export const eq=(a,b)=>({kind:"eq",a,b});export const and=(...args)=>({kind:"and",args});export const or=(...args)=>({kind:"or",args});export const inArray=(a,query)=>({kind:"in",a,query});export const desc=x=>x;export const sql=(strings)=>{if(strings.join("").trim()!=="true")throw Error("unsupported test SQL");return true;};'
        : args.path === "sessions" ? 'export const getAuthenticatedUser=async()=>null;'
        : 'const s=globalThis.__privateDealRoutes;export const createSignedDownloadUrl=s.sign;export const uploadDocumentBytes=s.upload;export const parseStoragePath=x=>x.startsWith("storage://udc-documents/")?x.slice("storage://udc-documents/".length):undefined;' }));
    } }],
  });
  await writeFile(output, bundle.outputFiles[0].text);
  let server: any;
  try {
    const { default: app } = await import(output);
    server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(userId: string | undefined, path: string, init?: RequestInit, status = "verified") {
      state.user = userId ? { id: userId, role: userId === "agent" ? "agent" : userId === "seller" ? "seller" : "buyer", status } : undefined;
      signed = []; reads = [];
      const response = await fetch(base + path, init);
      return { status: response.status, data: await response.json() };
    }
    await t.test("anonymous and suspended requests stop before DB or storage access", async () => {
      for (const path of ["/deals", "/documents", `/deals/${dealId}/messages`, `/deals/${dealId}/documents`]) {
        assert.equal((await request(undefined, path)).status, 401); assert.deepEqual(reads, []);
        assert.equal((await request("buyer", path, undefined, "suspended")).status, 403); assert.deepEqual(reads, []);
      }
      assert.deepEqual(signed, []);
    });
    await t.test("outsiders cannot read or upload into another deal", async () => {
      for (const suffix of ["", "/messages", "/documents", "/execution"]) {
        assert.equal((await request("outsider", `/deals/${dealId}${suffix}`)).status, 404);
      }
      const response = await request("outsider", `/deals/${dealId}/documents/upload?documentType=LOI`,
        { method: "POST", headers: { "content-type": "application/pdf" }, body: "%PDF-1.7 test" });
      assert.equal(response.status, 404); assert.equal(uploads, 0); assert.deepEqual(signed, []);
    });
    await t.test("buyer sees only their side of the mediated conversation", async () => {
      const response = await request("buyer", `/deals/${dealId}/messages`);
      assert.equal(response.status, 200);
      assert.deepEqual(response.data.messages.map((item: any) => item.id), ["buyer-message"]);
    });
    await t.test("sharing grants and review status control signed document access", async () => {
      const buyer = await request("buyer", `/deals/${dealId}/documents`);
      assert.deepEqual(buyer.data.documents.map((item: any) => item.id), ["shared"]);
      assert.deepEqual(signed, ["shared.pdf"]);
      const seller = await request("seller", `/deals/${dealId}/documents`);
      assert.deepEqual(seller.data.documents.map((item: any) => item.id), ["shared", "private-pending"]);
      assert.deepEqual(signed, ["shared.pdf", "private.pdf"]);
    });
    await t.test("a stale global document grant cannot cross deal boundaries", async () => {
      const response = await request("buyer", "/documents");
      assert.equal(response.status, 200);
      assert.deepEqual(response.data.documents.map((item: any) => item.id), ["shared"]);
      assert.deepEqual(signed, ["shared.pdf"]);
    });
    await t.test("agent tracking is redacted and revoked memberships lose milestone access",async()=>{
      records.shipmentsTable=[{id:"shipment-a",dealId,status:"in_transit",carrier:"PRIVATE CARRIER",trackingNumber:"SECRET TRACK",origin:"PRIVATE ORIGIN",destination:"PRIVATE DESTINATION",estimatedArrival:new Date("2026-11-04")}];
      records.shipmentTrackingEventsTable=[
        {id:"event-a",shipmentId:"shipment-a",dealId,kind:"departed",location:"PRIVATE PORT",note:"PRIVATE EVIDENCE",source:"carrier_reported",sourceReference:"PRIVATE REF",occurredAt:new Date("2026-11-02")},
        {id:"event-other",shipmentId:"outside",dealId:"other-deal",kind:"exception",location:"OTHER LOCATION",note:"OTHER EVIDENCE",source:"udc_manual",occurredAt:new Date("2026-11-03")},
      ];
      records.shipmentCargoUnitsTable=[
        {id:"cargo-secret",shipmentId:"shipment-a",dealId,transportMode:"sea",unitReference:"PRIVATE CONTAINER",status:"in_transit",vesselName:"SECRET VESSEL",voyageNumber:"SECRET VOYAGE",billOfLading:"SECRET BILL",currentLocation:"PRIVATE HARBOR",estimatedArrival:new Date("2026-11-04T00:00:00Z"),lastReportedAt:new Date("2026-11-02T00:00:00Z")},
        {id:"other-cargo",shipmentId:"outside",dealId:"other-deal",transportMode:"air",unitReference:"UNRELATED AIR WAYBILL",status:"in_transit"}
      ];
      const buyer=await request("buyer",`/deals/${dealId}/tracking`);
      assert.equal(buyer.status,200);assert.equal(buyer.data.shipments[0].trackingNumber,"SECRET TRACK");
      assert.equal(buyer.data.events.length,1);assert.equal(buyer.data.events[0].location,"PRIVATE PORT");
      assert.equal(buyer.data.cargoUnits.length,1);assert.equal(buyer.data.cargoUnits[0].vesselName,"SECRET VESSEL");
      const agent=await request("agent",`/deals/${dealId}/tracking`);
      assert.equal(agent.status,200);assert.equal(agent.data.events.length,1);
      assert.equal(agent.data.events[0].kind,"departed");assert.equal(agent.data.events[0].location,undefined);
      assert.equal(agent.data.cargoUnits.length,1);assert.equal(agent.data.cargoUnits[0].transportMode,"sea");assert.equal(agent.data.cargoUnits[0].unitReference,undefined);
      const raw=JSON.stringify(agent.data);
      for(const secret of ["SECRET TRACK","PRIVATE CARRIER","PRIVATE PORT","PRIVATE EVIDENCE","PRIVATE REF","OTHER LOCATION","PRIVATE CONTAINER","SECRET VESSEL","SECRET VOYAGE","SECRET BILL","PRIVATE HARBOR","UNRELATED AIR WAYBILL"])assert.ok(!raw.includes(secret));
    });
    await t.test("agent removal revokes both deal and global document access", async () => {
      assert.equal((await request("agent", `/deals/${dealId}`)).status, 200);
      assert.equal((await request("agent", "/documents")).data.documents.length, 1);
      records.dealParticipantsTable[0].status = "inactive";
      assert.equal((await request("agent", `/deals/${dealId}`)).status, 404);
      assert.equal((await request("agent", `/deals/${dealId}/documents`)).status, 404);
      assert.equal((await request('agent',`/deals/${dealId}/tracking`)).status,404);
      assert.deepEqual((await request("agent", "/documents")).data.documents, []);
      assert.deepEqual(signed, []);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await unlink(output);
    delete (globalThis as any).__privateDealRoutes;
  }
});
