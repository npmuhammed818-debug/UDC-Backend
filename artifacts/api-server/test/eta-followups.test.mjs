import {test} from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {writeFile,unlink} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";

test("ETA follow-ups stay truthful, bounded and transactionally de-duplicated",async()=>{
  const tableNames=["shipmentCargoUnitsTable","dealsTable","shipmentEtaFollowupsTable",
    "notificationsTable","auditLogsTable","usersTable"];
  const tables=Object.fromEntries(tableNames.map(name=>[name,new Proxy({_table:name},{
    get:(target,key)=>key==="_table"?name:{column:key,table:name},
  })]));
  const rows=Object.fromEntries(tableNames.map(name=>[name,[]]));
  const val=(expr,row)=>expr?.column?row[expr.table]?.[expr.column]:expr;
  const match=(expr,row)=>!expr||expr.kind==="and"?(!expr||expr.args.every(e=>match(e,row)))
    :expr.kind==="in"?expr.values.includes(val(expr.x,row))
    :expr.kind==="eq"?val(expr.a,row)===val(expr.b,row)
    :expr.kind==="gt"?val(expr.a,row)>val(expr.b,row):true;
  let failAudit=false;
  const select=(fields)=>{
    let from,joins=[],condition,limit=Infinity,order;
    const q={
      from:t=>(from=t._table,q),
      innerJoin:(t,on)=>(joins.push({table:t._table,on}),q),
      where:c=>(condition=c,q),
      orderBy:c=>(order=c,q),
      limit:n=>(limit=n,q),
      then:(resolve,reject)=>Promise.resolve().then(()=>{
        let result=rows[from].map(row=>({[from]:row}));
        for(const join of joins)result=result.flatMap(item=>rows[join.table]
          .map(child=>({...item,[join.table]:child})).filter(next=>match(join.on,next)));
        result=result.filter(item=>match(condition,item));
        if(order)result.sort((a,b)=>String(val(order,a)).localeCompare(String(val(order,b))));
        return result.slice(0,limit).map(item=>Object.fromEntries(Object.entries(fields)
          .map(([key,value])=>[key,val(value,item)])));
      }).then(resolve,reject),
    };
    return q;
  };
  const insert=table=>{
    let input,ignoreConflict=false,done;
    const run=()=>{
      if(done)return done;
      if(table._table==="auditLogsTable"&&failAudit){
        failAudit=false;throw Error("synthetic_audit_failure");
      }
      const batch=Array.isArray(input)?input:[input];
      done=[];
      for(const item of batch){
        if(ignoreConflict&&table._table==="shipmentEtaFollowupsTable"&&
          rows[table._table].some(row=>row.cargoUnitId===item.cargoUnitId&&
            row.reason===item.reason&&row.dayKey===item.dayKey))continue;
        const result={id:randomUUID(),...item};
        rows[table._table].push(result);done.push(result);
      }
      return done;
    };
    const q={
      values:value=>(input=value,q),
      onConflictDoNothing:()=>{ignoreConflict=true;return q;},
      returning:fields=>Promise.resolve().then(run).then(items=>fields?
        items.map(item=>Object.fromEntries(Object.entries(fields).map(([key,v])=>[key,item[v.column]]))):items),
      then:(resolve,reject)=>Promise.resolve().then(run).then(resolve,reject),
    };
    return q;
  };
  const db={select,insert,transaction:async callback=>{
    const before=structuredClone(rows);
    try{return await callback(db);}catch(error){
      for(const name of tableNames)rows[name]=before[name];
      throw error;
    }
  }};
  const state={db,tables};
  globalThis.__etaFollowupsFixture=state;
  const path=fileURLToPath(new URL("./eta-followup-"+randomUUID()+".mjs",import.meta.url));
  const bundle=await build({
    stdin:{contents:"export {runEtaFollowups} from '../src/tracking/etaFollowups.ts';",
      resolveDir:fileURLToPath(new URL(".",import.meta.url))},
    platform:"node",format:"esm",bundle:true,packages:"external",write:false,
    plugins:[{name:"eta-fixtures",setup(b){
      b.onResolve({filter:/^@workspace\/db$/},()=>({path:"db",namespace:"fixture"}));
      b.onResolve({filter:/^drizzle-orm$/},()=>({path:"orm",namespace:"fixture"}));
      b.onLoad({filter:/.*/,namespace:"fixture"},args=>({
        loader:"js",
        contents:args.path==="db"
          ?"const s=globalThis.__etaFollowupsFixture;export const db=s.db;"+
            tableNames.map(name=>`export const ${name}=s.tables.${name};`).join("")
          :'export const eq=(a,b)=>({kind:"eq",a,b});'+
            'export const inArray=(x,values)=>({kind:"in",x,values});'+
            'export const and=(...args)=>({kind:"and",args});'+
            'export const gt=(a,b)=>({kind:"gt",a,b});'+
            'export const asc=x=>x;',
      }));
    }}],
  });
  await writeFile(path,bundle.outputFiles[0].text);
  try{
    const {runEtaFollowups}=await import(path);
    rows.usersTable.push({id:"buyer",status:"verified"},{id:"seller",status:"verified"},
      {id:"suspended",status:"suspended"});
    rows.dealsTable.push(
      {id:"deal",status:"shipment",buyerUserId:"buyer",sellerUserId:"seller"},
      {id:"closed",status:"completed",buyerUserId:"buyer",sellerUserId:"seller"},
    );
    for(let i=1;i<=201;i++)rows.shipmentCargoUnitsTable.push({
      id:`00000000-0000-4000-8000-${String(i).padStart(12,"0")}`,
      dealId:"deal",status:"in_transit",estimatedArrival:new Date("2026-10-20T00:00:00Z"),
      lastReportedAt:new Date("2026-10-20T00:00:00Z"),
    });
    rows.shipmentCargoUnitsTable.push(
      {id:"00000000-0000-4000-8000-000000000202",dealId:"deal",status:"in_transit",
        estimatedArrival:new Date("2026-10-30T00:00:00Z"),lastReportedAt:new Date("2026-10-20T00:00:00Z")},
      {id:"00000000-0000-4000-8000-000000000203",dealId:"deal",status:"delivered",
        estimatedArrival:new Date("2026-10-20T00:00:00Z")},
      {id:"00000000-0000-4000-8000-000000000204",dealId:"closed",status:"in_transit",
        estimatedArrival:new Date("2026-10-20T00:00:00Z")},
    );
    const time=new Date("2026-10-24T12:00:00Z");
    const first=await runEtaFollowups({database:db,now:time,actorUserId:"admin"});
    assert.deepEqual(first,{scanned:203,created:202,deduplicated:0,
      dayKey:"2026-10-24",channel:"in_app_only"});
    assert.equal(rows.shipmentEtaFollowupsTable.length,202);
    assert.equal(rows.notificationsTable.length,404);
    assert.equal(rows.auditLogsTable.length,202);
    assert.ok(rows.notificationsTable.every(x=>!JSON.stringify(x).includes("container")));
    assert.ok(rows.auditLogsTable.every(x=>x.action==="shipment_eta_followup_created"));
    const second=await runEtaFollowups({database:db,now:time});
    assert.equal(second.created,0);assert.equal(second.deduplicated,202);
    assert.equal(rows.notificationsTable.length,404);
    assert.ok(rows.shipmentEtaFollowupsTable.some(x=>x.reason==="last_report_stale"));
    rows.shipmentCargoUnitsTable[0].status="arrived";
    failAudit=true;
    await assert.rejects(runEtaFollowups({database:db,now:new Date("2026-10-25T12:00:00Z")}),/synthetic_audit_failure/);
    assert.equal(rows.shipmentEtaFollowupsTable.length,202,"failed audit rolls back durable follow-up");
    assert.equal(rows.notificationsTable.length,404,"failed audit rolls back recipient alerts");
  }finally{
    await unlink(path);delete globalThis.__etaFollowupsFixture;
  }
});
