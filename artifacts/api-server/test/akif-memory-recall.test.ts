import {test} from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {writeFile,unlink} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";

test("akif memory recall: ranked, capped, ownership-checked, withdrawn excluded, honest when empty",async()=>{
  const tableNames=["akifCustomerMemoriesTable"];
  const tables=Object.fromEntries(tableNames.map(name=>[name,new Proxy({_table:name},{
    get:(target,key)=>key==="_table"?name:{column:key,table:name},
  })]));
  const rows=Object.fromEntries(tableNames.map(name=>[name,[]]));
  const val=(expr,row)=>expr?.column?row[expr.table]?.[expr.column]:expr;
  const likeVal=(expr,row)=>String(val(expr.a,row)??'').toLowerCase().includes(String(expr.pattern).toLowerCase().replace(/\\/g,'').replace(/^%|%$/g,''));
  const match=(expr,row)=>!expr?true
    :expr.kind==="and"?expr.args.every(e=>match(e,row))
    :expr.kind==="or"?expr.args.some(e=>match(e,row))
    :expr.kind==="eq"?val(expr.a,row)===val(expr.b,row)
    :expr.kind==="ilike"?likeVal(expr,row)
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
  const db={select};
  globalThis.__recallFixture={db};

  const output=fileURLToPath(new URL(`./akif-recall-${randomUUID()}.mjs`,import.meta.url));
  const bundle=await build({stdin:{contents:"export * from '../src/akif/customerMemory';",resolveDir:fileURLToPath(new URL('.',import.meta.url))},platform:'node',format:'esm',bundle:true,packages:'external',write:false,plugins:[{name:'fixture',setup(b){
    const fixtures={
      db:'export const db=globalThis.__recallFixture.db;'+tableNames.map(n=>`export const ${n}=globalThis.__recallFixture.db.__tables.${n};`).join('')+'export const usersTable={id:{column:"id",table:"usersTable"},akifLearningOptIn:{column:"akifLearningOptIn",table:"usersTable"}};',
      orm:"export const and=(...args)=>({kind:'and',args});export const or=(...args)=>({kind:'or',args});export const eq=(a,b)=>({kind:'eq',a,b});export const ilike=(a,pattern)=>({kind:'ilike',a,pattern});export const desc=x=>({kind:'desc',x});",
    };
    db.__tables=tables;
    for(const [filter,path] of [[/^@workspace\/db$/,'db'],[/^drizzle-orm$/,'orm']])b.onResolve({filter},()=>({path,namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:fixtures[args.path]}));
  }}]});
  await writeFile(output,bundle.outputFiles[0].text);
  try{
    const m=await import(output);
    const t=n=>new Date(Date.UTC(2026,9,29,n));
    rows.akifCustomerMemoriesTable=[
      {id:'m1',userId:'u-a',dealId:null,kind:'preference',content:'Prefers CIF over FOB for copper',source:'s1',status:'active',createdAt:t(1)},
      {id:'m2',userId:'u-a',dealId:null,kind:'fact',content:'Asked about marine insurance twice',source:'s2',status:'active',createdAt:t(2)},
      {id:'m3',userId:'u-a',dealId:'d-1',kind:'correction',content:'Quantity was 500 MT, not 50',source:'s3',status:'active',createdAt:t(3)},
      {id:'m4',userId:'u-a',dealId:null,kind:'fact',content:'Withdrawn note about CIF',source:'s4',status:'withdrawn',createdAt:t(4)},
      {id:'m5',userId:'u-b',dealId:null,kind:'fact',content:'Customer B CIF secret',source:'s5',status:'active',createdAt:t(5)},
    ];

    // 1. Matching query ranks the relevant memory first and caps at the limit.
    const ranked=await m.recallCustomerMemories({userId:'u-a',viewerUserId:'u-a',query:'Which incoterm did I prefer, CIF?',database:db});
    assert.ok(ranked.length>0&&ranked.length<=5);
    assert.equal(ranked[0].id,'m1','the CIF preference ranks first');
    assert.ok(ranked.every(r=>r.userId!=='u-b'||r.userId===undefined),'no other customer in results');
    const capped=await m.recallCustomerMemories({userId:'u-a',viewerUserId:'u-a',query:'',limit:2,database:db});
    assert.equal(capped.length,2,'hard cap honoured');

    // 2. Withdrawn memories never return, even when they match the query.
    assert.ok(!ranked.some(r=>r.id==='m4'),'withdrawn memory excluded');

    // 3. Customer B's memories never return for customer A, even on identical text.
    assert.ok(!ranked.some(r=>r.id==='m5'),"customer B's CIF memory never leaks to A");
    await assert.rejects(()=>m.recallCustomerMemories({userId:'u-a',viewerUserId:'u-b',query:'CIF',database:db}),/forbidden/);

    // 4. No match returns an empty list, and the prompt block is omitted entirely.
    const none=await m.recallCustomerMemories({userId:'u-a',viewerUserId:'u-a',query:'zzq qzz',database:db});
    assert.equal(none.length,0);
    assert.equal(m.formatMemoriesForPrompt(none),'');

    // 5. A deal-linked memory of the active deal ranks above older general memories.
    const dealRecall=await m.recallCustomerMemories({userId:'u-a',viewerUserId:'u-a',query:'What quantity did we agree?',dealId:'d-1',database:db});
    assert.equal(dealRecall[0].id,'m3','deal-linked memory boosted');

    // 6. Short queries still match via keyword tokens and respect ownership.
    const short=await m.recallCustomerMemories({userId:'u-a',viewerUserId:'u-a',query:'50',database:db});
    assert.equal(short.length,1);
    assert.equal(short[0].id,'m3');

    // Stopword-only queries fall back to recency, never to another customer.
    const recent=await m.recallCustomerMemories({userId:'u-a',viewerUserId:'u-a',query:'what is the',limit:1,database:db});
    assert.equal(recent.length,1);
    assert.equal(recent[0].userId,'u-a');

    // Tokenizer: stopwords and one-character words dropped, cap at 8.
    assert.deepEqual(m.memoryQueryTokens('What is the CIF for a 500 MT deal?'),['cif','500','mt','deal']);
  }finally{await unlink(output).catch(()=>{});}
});
