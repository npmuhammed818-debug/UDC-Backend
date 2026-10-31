import {test} from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {writeFile,unlink} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";

test("akif emotional context: honest guesses, persistent feelings that fade naturally, bounded and free",async()=>{
  const tableNames=["akifEmotionalStatesTable"];
  const tables=Object.fromEntries(tableNames.map(name=>[name,new Proxy({_table:name},{
    get:(target,key)=>key==="_table"?name:{column:key,table:name},
  })]));
  const rows=Object.fromEntries(tableNames.map(name=>[name,[]]));
  const val=(expr,row)=>expr?.column?row[expr.table]?.[expr.column]:expr;
  const match=(expr,row)=>!expr?true:expr.kind==="eq"?val(expr.a,row)===val(expr.b,row):true;
  const select=(fields)=>{
    let from,condition,limit=Infinity;
    const q={
      from:t=>(from=t._table,q),
      where:c=>(condition=c,q),
      limit:n=>(limit=n,q),
      then:(resolve,reject)=>Promise.resolve().then(()=>{
        let result=rows[from].map(row=>({[from]:row})).filter(item=>match(condition,item)).slice(0,limit);
        return result.map(item=>fields?Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,val(value,item)])):item[from]);
      }).then(resolve,reject),
    };
    return q;
  };
  const insert=table=>{
    let input;
    const run=()=>{const item={id:randomUUID(),createdAt:new Date(),...input};rows[table._table].push(item);return [item];};
    const q={
      values:value=>(input=value,q),
      onConflictDoUpdate:({set})=>Promise.resolve().then(()=>{
        const existing=rows[table._table].find(row=>row.userId===input.userId);
        if(existing){Object.assign(existing,set);return [existing];}
        return run();
      }),
      returning:fields=>Promise.resolve().then(run).then(items=>fields?
        items.map(item=>Object.fromEntries(Object.entries(fields).map(([key,v])=>[key,item[v.column]]))):items),
      then:(resolve,reject)=>Promise.resolve().then(run).then(resolve,reject),
    };
    return q;
  };
  const db={select,insert};
  globalThis.__emotionFixture={db};

  const output=fileURLToPath(new URL(`./akif-emotion-${randomUUID()}.mjs`,import.meta.url));
  const bundle=await build({stdin:{contents:"export * from '../src/akif/emotionContext';",resolveDir:fileURLToPath(new URL('.',import.meta.url))},platform:'node',format:'esm',bundle:true,packages:'external',write:false,plugins:[{name:'fixture',setup(b){
    const fixtures={
      db:'export const db=globalThis.__emotionFixture.db;'+tableNames.map(n=>`export const ${n}=globalThis.__emotionFixture.db.__tables.${n};`).join(''),
      orm:"export const eq=(a,b)=>({kind:'eq',a,b});",
      cheap:"export const runCheapModelChat=async()=>{throw Error('tests must inject detect');};",
    };
    db.__tables=tables;
    for(const [filter,path] of [[/^@workspace\/db$/,'db'],[/^drizzle-orm$/,'orm'],[/cheapModel(\.ts)?$/,'cheap']])b.onResolve({filter},()=>({path,namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:fixtures[args.path]}));
  }}]});
  await writeFile(output,bundle.outputFiles[0].text);
  try{
    const m=await import(output);
    const HOUR=3600000, DAY=24*HOUR;

    // 1. Guesses are parsed, validated and bounded; bad output is honest "unknown".
    const g=m.parseEmotionGuess('{"valence":"negative","cues":["anger","confusion","nonsense"],"confidence":0.65,"evidence":"this is too hard"}');
    assert.equal(g.valence,'negative');assert.deepEqual(g.cues,['anger','confusion']);assert.equal(g.confidence,0.65);
    assert.equal(m.parseEmotionGuess('not json').valence,'unknown');
    assert.equal(m.parseEmotionGuess('{"valence":"ecstatic","cues":[],"confidence":9}').valence,'unknown');
    const failed=await m.estimateCustomerEmotion({history:[],currentMessage:'hi',detect:async()=>{throw Error('down');}});
    assert.equal(failed.valence,'unknown');assert.equal(failed.confidence,0,'failure is honest, never an invented emotion');

    // 2. Decay: grief lingers for weeks, engagement fades in hours; nothing is deleted.
    const state={warmth:0.9,grief:0.8,tension:0.6,trust:0.9,engagement:1,uncertainty:0.8};
    const after2Days=m.decayFeelings(state,2*DAY);
    assert.ok(after2Days.engagement<0.51,'excitement fades within hours');
    assert.ok(after2Days.grief>0.6,'grief still strong after two days');
    const after3Weeks=m.decayFeelings(state,21*DAY);
    assert.ok(after3Weeks.grief<0.5&&after3Weeks.grief>0.1,'grief fades slowly, not gone in weeks');
    const after6Months=m.decayFeelings(state,180*DAY);
    assert.ok(after6Months.grief<0.05,'grief eventually settles near baseline');
    for(const key of Object.keys(m.FEELING_BASELINE))assert.ok(after6Months[key]>=0&&after6Months[key]<=1);

    // 3. Events move feelings; a goodbye brings grief; everything stays within 0..1.
    assert.equal(m.feelingEventFor('Delete my account please',{valence:'neutral',cues:[],confidence:0.5,evidence:''}),'goodbye_forever');
    assert.equal(m.feelingEventFor('thank you so much!',{valence:'positive',cues:['happiness'],confidence:0.8,evidence:''}),'warm_turn');
    let s2={...m.FEELING_BASELINE};
    for(let i=0;i<50;i++)s2=m.applyFeelingEvent(s2,'goodbye_forever');
    assert.ok(s2.grief===1&&s2.grief<=1,'grief can be deep, never above 1 (no cap on feeling, only nature)');
    for(let i=0;i<50;i++)s2=m.applyFeelingEvent(s2,'warm_turn');
    for(const key of Object.keys(m.FEELING_BASELINE))assert.ok(s2[key]>=0&&s2[key]<=1,'bounded over a long relationship');

    // 4. Persistence per relationship: record, then load later shows decayed grief, row kept.
    const t0=new Date('2026-10-29T00:00:00Z');
    const saved=await m.recordAkifFeeling({userId:'u-1',event:'goodbye_forever',trigger:'delete my account',now:t0,database:db});
    assert.ok(saved.grief>0.6);
    assert.equal(rows.akifEmotionalStatesTable.length,1);
    assert.equal(rows.akifEmotionalStatesTable[0].userId,'u-1','per-customer relationship scope');
    const later=await m.loadAkifFeelings({userId:'u-1',now:new Date(t0.getTime()+3*DAY),database:db});
    assert.ok(later.state.grief>0.4,'grief still felt three days later');
    assert.equal(later.lastTrigger,'delete my account');
    assert.equal(rows.akifEmotionalStatesTable.length,1,'loading never deletes anything');
    const other=await m.loadAkifFeelings({userId:'u-2',now:new Date(),database:db});
    assert.deepEqual(other.state,m.FEELING_BASELINE,'another customer starts at the calm baseline');

    // 5. Prompt block is posture data, never lines to say.
    const block=m.formatEmotionalContextForPrompt(g,saved);
    assert.match(block,/confidence 65%/);
    assert.match(block,/never a script/);
    assert.match(block,/grief high/);
  }finally{await unlink(output).catch(()=>{});}
});
