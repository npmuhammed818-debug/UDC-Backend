import {test} from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {writeFile,unlink} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";

test("shipment watch poll: sparing, deduplicated, honest and transactionally safe",async()=>{
  const tableNames=["shipmentWatchesTable","notificationsTable","auditLogsTable","whatsappShipmentOutboxTable"];
  const tables=Object.fromEntries(tableNames.map(name=>[name,new Proxy({_table:name},{
    get:(target,key)=>key==="_table"?name:{column:key,table:name},
  })]));
  const rows=Object.fromEntries(tableNames.map(name=>[name,[]]));
  const val=(expr,row)=>expr?.column?row[expr.table]?.[expr.column]:expr;
  const match=(expr,row)=>!expr?true
    :expr.kind==="and"?expr.args.every(e=>match(e,row))
    :expr.kind==="or"?expr.args.some(e=>match(e,row))
    :expr.kind==="eq"?val(expr.a,row)===val(expr.b,row)
    :expr.kind==="gt"?val(expr.a,row)>val(expr.b,row)
    :expr.kind==="lt"?val(expr.a,row)<val(expr.b,row)
    :expr.kind==="isnull"?val(expr.a,row)==null:true;
  const select=(fields)=>{
    let from,condition,limit=Infinity,order;
    const q={
      from:t=>(from=t._table,q),
      where:c=>(condition=c,q),
      orderBy:c=>(order=c,q),
      limit:n=>(limit=n,q),
      then:(resolve,reject)=>Promise.resolve().then(()=>{
        let result=rows[from].map(row=>({[from]:row})).filter(item=>match(condition,item));
        if(order)result.sort((a,b)=>String(val(order,a)).localeCompare(String(val(order,b))));
        result=result.slice(0,limit);
        return result.map(item=>fields?Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,val(value,item)])):item[from]);
      }).then(resolve,reject),
    };
    return q;
  };
  const insert=table=>{
    let input,done;
    const run=()=>{if(done)return done;
      const batch=Array.isArray(input)?input:[input];
      done=batch.map(item=>{const result={id:randomUUID(),...item};rows[table._table].push(result);return result;});
      return done;};
    const q={
      values:value=>(input=value,q),
      onConflictDoUpdate:()=>q,
      returning:fields=>Promise.resolve().then(run).then(items=>fields?
        items.map(item=>Object.fromEntries(Object.entries(fields).map(([key,v])=>[key,item[v.column]]))):items),
      then:(resolve,reject)=>Promise.resolve().then(run).then(resolve,reject),
    };
    return q;
  };
  const update=table=>{
    let patch,condition;
    const q={
      set:value=>(patch=value,q),
      where:c=>(condition=c,q),
      returning:fields=>Promise.resolve().then(()=>{
        const matched=rows[table._table].filter(row=>match(condition,{[table._table]:row}));
        matched.forEach(row=>Object.assign(row,patch));
        return fields?matched.map(row=>Object.fromEntries(Object.entries(fields).map(([key,v])=>[key,row[v.column]]))):matched;
      }),
      then:(resolve,reject)=>Promise.resolve().then(()=>{
        const matched=rows[table._table].filter(row=>match(condition,{[table._table]:row}));
        matched.forEach(row=>Object.assign(row,patch));
        return matched;
      }).then(resolve,reject),
    };
    return q;
  };
  const db={select,insert,update,execute:async query=>{
    if(!query.parts.join(" ").includes("INSERT INTO public.whatsapp_shipment_outbox"))throw Error("Unexpected SQL");
    const [notificationId,dealId,recipientUserId]=query.values;
    if(rows.whatsappShipmentOutboxTable.some(r=>r.notificationId===notificationId))return {rows:[]};
    const item={id:randomUUID(),notificationId,dealId,recipientUserId,status:"pending"};
    rows.whatsappShipmentOutboxTable.push(item);return {rows:[{id:item.id}]};
  },transaction:async callback=>{
    const before=structuredClone(rows);
    try{return await callback(db);}catch(error){
      for(const name of tableNames)rows[name]=before[name];
      throw error;
    }
  }};
  const trackerCalls=[];
  const trackerEvents={value:[]};
  const tracker={name:"fake",async fetchEvents(number){trackerCalls.push(number);return trackerEvents.value;}};
  globalThis.__watchFixture={db,tracker};

  const output=fileURLToPath(new URL(`./shipment-watch-${randomUUID()}.mjs`,import.meta.url));
  const bundle=await build({stdin:{contents:"export * from '../src/tracking/shipmentWatch';",resolveDir:fileURLToPath(new URL('.',import.meta.url))},platform:'node',format:'esm',bundle:true,packages:'external',write:false,plugins:[{name:'fixture',setup(b){
    const fixtures={
      db:'export const db=globalThis.__watchFixture.db;'+tableNames.map(n=>`export const ${n}=globalThis.__watchFixture.db.__tables.${n};`).join(''),
      orm:"export const and=(...args)=>({kind:'and',args});export const or=(...args)=>({kind:'or',args});export const eq=(a,b)=>({kind:'eq',a,b});export const gt=(a,b)=>({kind:'gt',a,b});export const lt=(a,b)=>({kind:'lt',a,b});export const isNull=(a)=>({kind:'isnull',a});export const asc=x=>x;export const desc=x=>x;export const sql=(parts,...values)=>({kind:'sql',parts,values});export const inArray=(a,values)=>({kind:'in',a,values});",
      tracker:'export const activeTracker=()=>globalThis.__watchFixture.tracker;',
    };
    db.__tables=tables;
    for(const [filter,path] of [[/^@workspace\/db$/,'db'],[/^drizzle-orm$/,'orm'],[/\.\/seventeenTrack$/,'tracker']])b.onResolve({filter},()=>({path,namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:fixtures[args.path]}));
  }}]});
  await writeFile(output,bundle.outputFiles[0].text);
  try{
    const m=await import(output);
    const now=new Date('2026-10-28T12:00:00Z');
    rows.shipmentWatchesTable=[
      {id:'w-due',userId:'u1',dealId:'d1',trackingNumber:'SYN123',active:true,lastFingerprint:null,lastClass:null,lastPolled:null},
      {id:'w-fresh',userId:'u2',dealId:null,trackingNumber:'SYN999',active:true,lastFingerprint:'shipped|2026-10-28T07:00:00Z|Departed origin port',lastClass:'shipped',lastPolledAt:new Date('2026-10-28T11:00:00Z')},
      {id:'w-off',userId:'u3',dealId:null,trackingNumber:'SYN555',active:false,lastFingerprint:null,lastClass:null,lastPolled:null},
    ];
    trackerEvents.value=[{time:'2026-10-28T07:00:00Z',description:'Departed origin port',location:'Mundra'}];
    const first=await m.runShipmentWatchPoll({database:db,tracker,now});
    assert.deepEqual(trackerCalls,['SYN123'],'only the due watch is polled (12h spacing)');
    assert.equal(first.notified,1);
    assert.equal(rows.notificationsTable.length,1);
    assert.match(rows.notificationsTable[0].body,/Shipment update for SYN123: Shipped/);
    assert.match(rows.notificationsTable[0].body,/UDC has not verified/);
    assert.equal(rows.whatsappShipmentOutboxTable.length,1,'deal-linked watch queues the dormant WhatsApp intent');
    assert.equal(rows.whatsappShipmentOutboxTable[0].dealId,'d1');
    assert.equal(rows.auditLogsTable.length,1);
    assert.ok(rows.shipmentWatchesTable[0].lastFingerprint,'fingerprint saved');

    const second=await m.runShipmentWatchPoll({database:db,tracker,now:new Date('2026-10-28T12:30:00Z')});
    assert.equal(second.polled,0,'a watch polled 30 minutes ago is not due again');

    const later=new Date('2026-10-29T01:00:00Z');
    const third=await m.runShipmentWatchPoll({database:db,tracker,now:later});
        assert.equal(third.notified,0,'same carrier event never messages twice');
    assert.equal(third.unchanged,2,'both due watches see an unchanged fingerprint');
    assert.equal(rows.notificationsTable.length,1);

    trackerEvents.value=[{time:'2026-10-29T00:30:00Z',description:'Delivered to consignee',location:'Jebel Ali'}];
    const fourth=await m.runShipmentWatchPoll({database:db,tracker,now:new Date('2026-10-29T14:00:00Z')});
    assert.equal(fourth.notified,2,'a real class change messages each watch again');
    assert.match(rows.notificationsTable[1].body,/Delivered/);
    assert.equal(rows.whatsappShipmentOutboxTable.length,2,'only the deal-linked watch queues WhatsApp');
    assert.ok(rows.notificationsTable.every(n=>n.userId),'deal-less watch still gets the in-app notification');

    trackerEvents.value=[];
    const fifth=await m.runShipmentWatchPoll({database:db,tracker,now:new Date('2026-10-30T13:00:00Z')});
    assert.equal(fifth.notified,0,'no events, no invented status');
    assert.equal(rows.notificationsTable.length,3);

    // Pure-function contract (classifier, text, fingerprint, quota spacing)
    const at=description=>({time:'2026-10-28T08:00:00Z',description});
    assert.equal(m.classifyLatestEvent([at('Package delivered to consignee')])?.cls,'delivered');
    assert.equal(m.classifyLatestEvent([at('Customs hold at destination port')])?.cls,'delayed');
    assert.equal(m.classifyLatestEvent([at('Departed from origin facility')])?.cls,'shipped');
    assert.equal(m.classifyLatestEvent([at('Label created')]),null,'unrelated statuses never message the customer');
    assert.equal(m.classifyLatestEvent([]),null);
    const txt=m.watchUpdateText('SYN1','delayed',{time:'2026-10-28T09:30:00Z',description:'Held at customs',location:'Jebel Ali'});
    assert.match(txt.title,/delayed/);
    assert.match(txt.body,/Shipment update for SYN1: Delayed/);
    assert.match(txt.body,/Held at customs in Jebel Ali · 2026-10-28 09:30 UTC/);
    assert.match(txt.body,/UDC has not verified/);
    const ev={time:'2026-10-28T08:00:00Z',description:'Departed origin port'};
    const f=m.classifyLatestEvent([ev]);
    assert.equal(m.eventFingerprint(f.cls,f.event),m.eventFingerprint(f.cls,{...ev}),'same event, same fingerprint');
    assert.notEqual(m.eventFingerprint(f.cls,f.event),m.eventFingerprint(f.cls,{...ev,time:'2026-10-29T08:00:00Z'}),'new event, new fingerprint');
    assert.notEqual(m.eventFingerprint(f.cls,f.event),m.eventFingerprint('delivered',ev),'new class, new fingerprint');
    assert.equal(m.WATCH_POLL_INTERVAL_MS,12*60*60*1000,'at most two provider calls per watch per day');
  }finally{await unlink(output).catch(()=>{});}
});
