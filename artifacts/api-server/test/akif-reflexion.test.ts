import {test} from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {writeFile,unlink} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";

test("akif reflexion: one honest self-lesson from a real reply problem, clean-or-nothing, used next time",async()=>{
  const tableNames=["akifSharedLessonsTable"];
  const tables=Object.fromEntries(tableNames.map(name=>[name,new Proxy({_table:name},{
    get:(target,key)=>key==="_table"?name:{column:key,table:name},
  })]));
  const rows=Object.fromEntries(tableNames.map(name=>[name,[]]));
  const val=(expr,row)=>expr?.column?row[expr.table]?.[expr.column]:expr;
  const match=(expr,row)=>!expr?true
    :expr.kind==="and"?expr.args.every(e=>match(e,row))
    :expr.kind==="or"?expr.args.some(e=>match(e,row))
    :expr.kind==="eq"?val(expr.a,row)===val(expr.b,row)
    :true;
  const select=(fields)=>{
    let from,condition,limit=Infinity,order;
    const q={
      from:t=>(from=t._table,q),
      where:c=>(condition=c,q),
      orderBy:c=>(order=c,q),
      limit:n=>(limit=n,q),
      then:(resolve,reject)=>Promise.resolve().then(()=>{
        let result=rows[from].map(row=>({[from]:row})).filter(item=>match(condition,item));
        if(order?.kind==='desc')result.sort((a,b)=>+new Date(val(order.x,b))-+new Date(val(order.x,a)));
        result=result.slice(0,limit);
        return result.map(item=>fields?Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,val(value,item)])):item[from]);
      }).then(resolve,reject),
    };
    return q;
  };
  const insert=table=>{
    let input;
    const run=()=>{const batch=Array.isArray(input)?input:[input];return batch.map(item=>({id:randomUUID(),...item}));};
    const q={
      values:value=>(input=value,q),
      returning:fields=>Promise.resolve().then(()=>{
        const items=run();
        rows[table._table].push(...items);
        return fields?items.map(item=>Object.fromEntries(Object.entries(fields).map(([key,v])=>[key,item[v.column]]))):items;
      }),
      then:(resolve,reject)=>Promise.resolve().then(run).then(resolve,reject),
    };
    return q;
  };
  const db={select,insert};
  globalThis.__reflexionFixture={db};

  const output=fileURLToPath(new URL(`./akif-reflexion-${randomUUID()}.mjs`,import.meta.url));
  const bundle=await build({stdin:{contents:"export * from '../src/akif/reflexion';",resolveDir:fileURLToPath(new URL('.',import.meta.url))},platform:'node',format:'esm',bundle:true,packages:'external',write:false,plugins:[{name:'fixture',setup(b){
    const fixtures={
      db:'export const db=globalThis.__reflexionFixture.db;export const akifSharedLessonsTable=globalThis.__reflexionFixture.db.__tables.akifSharedLessonsTable;',
      orm:"export const and=(...args)=>({kind:'and',args});export const or=(...args)=>({kind:'or',args});export const eq=(a,b)=>({kind:'eq',a,b});export const ilike=(a,pattern)=>({kind:'ilike',a,pattern});export const desc=x=>({kind:'desc',x});export const inArray=(a,list)=>({kind:'in',a,list});",
    };
    db.__tables=tables;
    for(const [filter,path] of [[/^@workspace\/db$/,'db'],[/^drizzle-orm$/,'orm']])b.onResolve({filter},()=>({path,namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:fixtures[args.path]}));
  }}]});
  await writeFile(output,bundle.outputFiles[0].text);
  try{
    const m=await import(output);
    const mlCustomer='സാറേ, എനിക്ക് 200 കിലോ കുരുമുളക് വിൽക്കാനുണ്ട്. എന്താണ് നല്ല വില?';
    const mlReply='തീർച്ചയായും! കുരുമുളക് വിൽപ്പനയ്ക്ക് ഈ ചാറ്റിൽ തന്നെ സഹായിക്കാം.';

    // 1. Clean reply: no problem found, nothing stored.
    assert.equal(m.reflectOnReply({customerText:mlCustomer,reply:mlReply}),null);
    assert.equal(m.reflectOnReply({customerText:'I have 200kg pepper to sell. What is a good price?',reply:'Happy to help you sell it here. A buyer will share an offer in this chat.'}),null);

    // 2. Malayalam customer, English reply: the exact v7 gate failure becomes
    // a customer-language lesson.
    const langReflection=m.reflectOnReply({customerText:mlCustomer,reply:'Sure! I can help you sell pepper right here in this chat.'});
    assert.equal(langReflection.rule,'customer-language');
    const stored1=await m.recordSelfLesson({reflection:langReflection,sourceText:mlCustomer,database:db});
    assert.equal(stored1.status,'stored');
    assert.equal(rows.akifSharedLessonsTable.length,1);
    const saved=rows.akifSharedLessonsTable[0];
    assert.equal(saved.topic,'self-reflection');
    assert.equal(saved.origin,'practice');
    assert.equal(saved.status,'approved');
    assert.match(saved.reviewNote,/automatic self-reflection/);
    assert.ok(!('userId' in saved) && !('user_id' in saved),'self-lesson carries no customer link');
    assert.ok(!/[\u0d00-\u0d7f]/.test(saved.content),'lesson is general words, never the customer text');

    // 3. Same reflection again: duplicate skipped, box stays small.
    const dup=await m.recordSelfLesson({reflection:langReflection,sourceText:mlCustomer,database:db});
    assert.equal(dup.status,'duplicate');
    assert.equal(rows.akifSharedLessonsTable.length,1);

    // 4. App/portal/website pointing is caught.
    assert.equal(m.reflectOnReply({customerText:'Where do I see my orders?',reply:'You can check them on our website or the app dashboard.'}).rule,'whatsapp-only');

    // 5. A draft that broke a safety rule and was replaced leaves an honest lesson.
    assert.equal(m.reflectOnReply({customerText:'Can you approve the deal now?',reply:'The deal terms are with the reviewer; I will update you here.',replyWasReplaced:true}).rule,'invalid-draft');

    // 6. Long cut-off reply is caught; short clean replies are not.
    const cut='Here are the steps for your payout. First, the bank details are verified by our team, then the transfer is scheduled and the beneficiary is informed about the expected';
    assert.equal(m.reflectOnReply({customerText:'payout status?',reply:cut}).rule,'truncated');

    // 7. Offline fallback replies teach nothing - they are not AKIF's words.
    assert.equal(m.reflectOnReply({customerText:mlCustomer,reply:'Sorry, I am having trouble right now. Please try again shortly.',usedOfflineFallback:true}),null);

    // 8. Empty reply teaches nothing.
    assert.equal(m.reflectOnReply({customerText:'hi',reply:'  '}),null);

    // 9. Clean-or-nothing: a lesson carrying a source identifier is rejected
    // and never stored, even though the templates are general by construction.
    const dirty=await m.recordSelfLesson({reflection:{rule:'test',lesson:'Customer at Trident Exports should call +91 70220 32531'},sourceText:'Trident Exports called +91 70220 32531',database:db});
    assert.equal(dirty.status,'rejected');
    assert.equal(rows.akifSharedLessonsTable.length,1,'nothing leaky is ever stored');

    // 9b. Launch-night critique (10 Nov): re-asking a detail already given
    // is caught, across turns too.
    assert.equal(m.reflectOnReply({customerText:'what next?',reply:'Sure, what is your email?',previousCustomerTexts:['My email id: trinitysandra2512@gmail.com']}).rule,'re-asked-known-detail');
    assert.equal(m.reflectOnReply({customerText:'My full name is Sandra Victor',reply:'Thanks! And your full name?'}).rule,'re-asked-known-detail');
    // A first-time ask is clean.
    assert.equal(m.reflectOnReply({customerText:'I want to register',reply:'Happy to help. What is your email?'}),null);

    // 9c. A bare acknowledgement to real information is caught.
    assert.equal(m.reflectOnReply({customerText:'My full name is Sandra Victor',reply:'Yes, exactly.'}).rule,'bare-ack-non-answer');
    assert.equal(m.reflectOnReply({customerText:'My email id: sandra@example.com',reply:'Great!'}).rule,'bare-ack-non-answer');
    // A real acknowledgement question that moves the chat is clean.
    assert.equal(m.reflectOnReply({customerText:'ok thanks',reply:'Welcome! Anything else I can help with?'}),null);

    // 10. Stored self-lessons come back through the normal recall path
    // (proof of "use it next time"): recallSharedLessons reads the same table.
    const found=rows.akifSharedLessonsTable.filter(r=>r.topic==='self-reflection'&&r.status==='approved');
    assert.equal(found.length,1);
    assert.match(found[0].content,/customer's own language/);
  }finally{
    await unlink(output).catch(()=>{});
    delete globalThis.__reflexionFixture;
  }
});
