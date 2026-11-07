// Run against a dedicated local database after applying lib/db's schema:
// UDC_QA_DATABASE_URL=postgresql://udc_dev@127.0.0.1:5432/udc_qa_registration?sslmode=disable \
//   node artifacts/api-server/test/integration/whatsapp-buyer-postgres.mjs
// Actual signed webhook, consent, sessions, transactions and persistence;
// outbound Meta/AI requests are intercepted, never sent to real services.
// Combined #119-122 integration: all roles, retries, offers and permissions.
import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const url = new URL(process.env.UDC_QA_DATABASE_URL ?? 'http://missing.invalid');
assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'only a local QA database is allowed');
assert.ok(!url.searchParams.has('host') || ['127.0.0.1','localhost'].includes(url.searchParams.get('host')), 'a host override must also stay local');
assert.match(url.pathname, /^\/udc_qa_[a-z0-9_]+$/, 'use a dedicated QA database');
const secret = randomBytes(32).toString('hex');
const phone = `1000${Date.now()}`;
const testPhones = new Set([phone]);
let forcedDecision = null;
const label = `UDC QA ${randomUUID().slice(0, 8)}`;
const email = `qa-${randomUUID()}@example.invalid`;
const mail = { outbox: [] };
globalThis.__udcCombinedMail = mail;
// Ignore any real integration configuration inherited by the developer shell.
for (const key of Object.keys(process.env)) {
  if (/^(?:WHATSAPP_|AKIF_|NVIDIA_|OPENAI_|HERMES_)/.test(key)) delete process.env[key];
}
Object.assign(process.env, {
  NODE_ENV: 'production',
  SESSION_SECRET: secret,
  SUPABASE_DATABASE_URL: url.href,
  WHATSAPP_APP_SECRET: secret,
  WHATSAPP_INBOUND_PER_MINUTE: '100000',
  WHATSAPP_ACCESS_TOKEN: 'synthetic-no-network-token',
  WHATSAPP_PHONE_NUMBER_ID: 'synthetic-phone-id',
  AKIF_WORKER_CONVERSATION_ENABLED: 'true',
  AKIF_WORKER_URL: 'https://worker.example.invalid',
  AKIF_WORKER_TOKEN: 'synthetic-no-network-token',
  NVIDIA_API_KEY: 'synthetic-no-network-token',
  NVIDIA_BASE_URL: 'https://fallback.example.invalid/v1',
});
await mkdir(new URL('../../tmp/', import.meta.url), { recursive: true });
const directory = await mkdtemp(fileURLToPath(new URL('../../tmp/qa-', import.meta.url)));
const output = `${directory}/webhook.mjs`;
let server, pool;
const fetchBefore = globalThis.fetch;
const sent = [], providerCalls = [];
let localOrigin;
globalThis.fetch = async (input, init) => {
  const destination = new URL(String(input));
  if (destination.origin === localOrigin) return fetchBefore(input, init);
  if (destination.hostname === 'graph.facebook.com' && destination.pathname.endsWith('/messages')) {
    const body = JSON.parse(init.body);
    assert.ok(testPhones.has(body.to), 'never address a real recipient');
    sent.push(body);
    return Response.json({ messages: [{ id: `qa-out-${sent.length}` }] });
  }
  if (destination.hostname === 'worker.example.invalid') {
    if (forcedDecision) return Response.json({choices:[{message:{content:JSON.stringify(forcedDecision)}}]});
    providerCalls.push('worker_timeout');
    throw new DOMException('Synthetic worker timeout', 'AbortError');
  }
  if (destination.hostname === 'fallback.example.invalid') {
    providerCalls.push('fallback_429');
    return new Response('', { status: 429 });
  }
  throw new Error(`Unexpected network destination: ${destination.hostname}`);
};

try {
  await build({
    stdin: {
      contents: `import express from 'express';
        import router from './src/routes/whatsappWebhook';
        import adminRouter from './src/routes/admin';import assistRouter from './src/routes/tradeAssist';import {loadAuth} from './src/auth/middleware';export {createSession} from './src/auth/sessions';
        export {requestTermsReview} from './src/marketplace/termAgreement';export {photoQuoteReview} from './src/deals/photoQuoteReview';export {getAkifDealContext} from './src/akif/intelligence/dealContext';export {pool} from '@workspace/db';export {readSunkReplies,clearSunkReplies} from './src/whatsapp/replySink';
        const app=express();
        app.use(express.json({verify(req,res,body){req.rawBody=body;}}));
        app.use((req,res,next)=>{req.log={info(){},error(){}};next();});
        app.use('/api',router);app.use(loadAuth);app.use(adminRouter);app.use(assistRouter);export default app;`,
      resolveDir: fileURLToPath(new URL('../../', import.meta.url)),
    },
    outfile: output, bundle: true, platform: 'node', format: 'esm',
    external: ['pg-native', '@resvg/resvg-js'],
    banner: { js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);" },
    logLevel: 'silent',
    plugins: [{ name: 'fictional-email-provider', setup(b) {
      b.onResolve({ filter: /\/emailDelivery$/ }, () => ({ path: 'mail', namespace: 'combined-qa' }));
      b.onLoad({ filter: /.*/, namespace: 'combined-qa' }, () => ({ contents: 'export const sendAuthEmail=async(message,signal)=>{if(!signal)throw new Error("missing delivery deadline");globalThis.__udcCombinedMail.outbox.push(message);};' }));
    } }],
  });
  const module = await import(output);
  pool = module.pool;
  await pool.query(await readFile(new URL('../../../../lib/db/migrations/20261023_email_authentication.sql', import.meta.url), 'utf8'));
  server = module.default.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  localOrigin = `http://127.0.0.1:${server.address().port}`;
  async function post(text, id = randomUUID(), from = phone) {
    const raw = JSON.stringify({ entry: [{ changes: [{ value: {
      contacts: [{ profile: { name: label } }],
      messages: [{ id, from, ...(typeof text==='string'?{text:{body:text}}:{interactive:text}) }],
    } }] }] });
    const response = await fetch(`${localOrigin}/api/webhooks/whatsapp`, {
      method: 'POST', headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`,
      }, body: raw,
    });
    assert.equal(response.status, 200, await response.text());
  }
  const count = async (sql, parameters) => Number((await pool.query(sql, parameters)).rows[0].count);
  await post('Hello');
  assert.match(sent.at(-1).text.body, /Reply "I agree"/);
  assert.equal(await count('select count(*) from users where phone=$1', [phone]), 0);
  await post('AGREE');
  assert.equal(sent.at(-1).interactive.action.buttons.length, 3);
  await post('Buyer');
  assert.match(sent.at(-1).text.body, /full name/i);
  // Trigger the actual fallback chain before supplying simple answers.
  await post('Could you explain which details I should send?');
  assert.deepEqual(providerCalls, ['worker_timeout', 'fallback_429']);
  assert.equal(await count('select count(*) from users where phone=$1', [phone]), 0);
  const calls = providerCalls.length;
  for (const answer of [label, email, `company_name: ${label} Test Imports Ltd`, 'India']) await post(answer);
  assert.equal(providerCalls.length, calls, 'plain answers bypass failed providers');
  assert.equal(await count('select count(*) from users where phone=$1', [phone]), 0);
  await post('Submit');
  const { rows: [buyer] } = await pool.query('select id,role,status,email from users where phone=$1', [phone]);
  assert.ok(buyer);assert.equal(buyer.role, 'buyer');assert.equal(buyer.status, 'pending');assert.equal(buyer.email, email);
  const { rows: [company] } = await pool.query('select verification_status from companies where owner_user_id=$1', [buyer.id]);
  assert.equal(company.verification_status, 'pending');
  assert.match(sent.at(-1).text.body, /6-digit code/, 'registration automatically sends the first code');
  await post('Verify email');
  assert.match(sent.at(-1).text.body, /wait before trying again/, 'resend obeys one-minute cooldown');
  assert.equal(mail.outbox.length, 1);assert.equal(mail.outbox[0].to, email);
  const code = mail.outbox[0].code;
  await post('Email code ' + code);
  assert.match(sent.at(-1).text.body, /ownership is verified/);
  await post('Email code ' + code);
  assert.match(sent.at(-1).text.body, /invalid or expired/);
  await post('Verify email');
  assert.equal(mail.outbox.length, 1, 'already verified account must not send another code');
  const { rows: [proof] } = await pool.query('select verified_email,email_verified_at,password_recovery_enabled,role,status from users where id=$1', [buyer.id]);
  assert.equal(proof.verified_email, email);assert.ok(proof.email_verified_at);
  assert.equal(proof.password_recovery_enabled, false);assert.equal(proof.role, 'buyer');assert.equal(proof.status, 'pending');
  assert.equal(providerCalls.length, calls, 'email code must bypass AI and trade memory');
  assert.equal(await count('select count(*) from whatsapp_intake_drafts where phone=$1', [phone]), 0);
  console.log('PASSED combined signed WhatsApp + PostgreSQL: outage registration, mocked email code, ownership proof, replay rejection and unchanged role/company/passwordless permissions before trade intake.');
  await post({type:'list_reply',list_reply:{id:'udc:requirement'}});
  assert.match(sent.at(-1).text.body, /product/i);
  for (const answer of ['Copper cathode', '100', 'Jebel Ali', 'CIF', 'Skip']) await post(answer);
  assert.equal(await count('select count(*) from buyer_requests where buyer_user_id=$1', [buyer.id]), 0);
  const submitId = randomUUID();
  await post({type:'button_reply',button_reply:{id:'udc:submit'}}, submitId);
  await post({type:'button_reply',button_reply:{id:'udc:submit'}}, submitId);
  const { rows: requests } = await pool.query('select quantity,destination,preferred_incoterm,status from buyer_requests where buyer_user_id=$1', [buyer.id]);
  assert.equal(requests.length, 1);
  assert.equal(Number(requests[0].quantity), 100);assert.equal(requests[0].destination, 'Jebel Ali');
  assert.equal(requests[0].preferred_incoterm, 'CIF');assert.equal(requests[0].status, 'pending_admin_review');
  assert.equal(providerCalls.length, calls);
  const { rows: [unchanged] } = await pool.query('select status from users where id=$1', [buyer.id]);
  assert.equal(unchanged.status, 'pending');

  const sellerPhone=phone+'1',agentPhone=phone+'2',conflictPhone=phone+'3';
  for(const sender of [sellerPhone,agentPhone,conflictPhone])testPhones.add(sender);
  const sendAs=(sender,text)=>post(text,randomUUID(),sender);
  for(const [role,sender,answers] of [
    ['seller',sellerPhone,[label+' Seller',`seller-00000000-0000-4000-8000-234567890124@example.invalid`,label+' Test Exports Ltd','Oman']],
    ['agent',agentPhone,[label+' Agent',`qa-${randomUUID()}@gmail.com`]],
  ]){
    for(const text of ['Hello','AGREE',role,...answers])await sendAs(sender,text);
    assert.equal(await count('select count(*) from users where phone=$1',[sender]),0);
    await sendAs(sender,'Submit');
    const {rows:[account]}=await pool.query('select id,role,status from users where phone=$1',[sender]);
    assert.ok(account,`${role} registration must persist after its validated answers`);assert.equal(account.role,role);assert.equal(account.status,'pending');
    if(role==='agent')assert.equal(await count('select count(*) from companies where owner_user_id=$1',[account.id]),0);
    else assert.equal(await count('select count(*) from companies where owner_user_id=$1 and verification_status=$2',[account.id,'pending']),1);
  }
  for(const product of ['Copper cathode','Sugar']){
    await sendAs(sellerPhone,{type:'list_reply',list_reply:{id:'udc:offer'}});
    for(const answer of [product,'125','kg','7','AED','Oman','FOB'])await sendAs(sellerPhone,answer);
    await sendAs(sellerPhone,'Submit');
  }
  const {rows:offers}=await pool.query('select sl.unit,sl.currency,sl.quantity,sl.price,sl.status from seller_listings sl join users u on u.id=sl.seller_user_id where u.phone=$1',[sellerPhone]);
  assert.equal(offers.length,2);
  for(const offer of offers){assert.equal(offer.unit,'kg');assert.equal(offer.currency,'AED');assert.equal(Number(offer.quantity),125);assert.equal(Number(offer.price),7);assert.equal(offer.status,'pending_admin_review');}
  assert.equal(providerCalls.length,calls,'seller and agent scalar flows should remain usable offline');

  const conflictBefore=sent.length;
  for(const text of ['Hello','AGREE','Buyer',`${label} Retry`,email])await sendAs(conflictPhone,text);
  assert.ok(sent.slice(conflictBefore).some(m=>/already belongs/.test(m.text?.body??'')),'duplicate email refusal must be shown before the next question');
  assert.equal(await count('select count(*) from users where phone=$1',[conflictPhone]),0);
  const {rows:drafts}=await pool.query("select data from whatsapp_chat_sessions where data->>'full_name'=$1 and purpose='profile_buyer'",[label+' Retry']);
  assert.equal(drafts.length,1,JSON.stringify({label,sessions:(await pool.query("select purpose,step,data from whatsapp_chat_sessions where purpose='profile_buyer'")).rows,replies:sent.slice(conflictBefore).map(m=>m.text?.body)}));assert.equal(drafts[0].data.email,undefined,'duplicate email is never added to the draft');
  for(const text of [`retry-${randomUUID()}@example.invalid`,'QA Retry Imports Ltd','India','Submit'])await sendAs(conflictPhone,text);
  assert.equal(await count('select count(*) from users where phone=$1 and status=$2',[conflictPhone,'pending']),1,JSON.stringify({label,sessions:(await pool.query("select purpose,step,data from whatsapp_chat_sessions where purpose='profile_buyer'")).rows,replies:sent.slice(conflictBefore).map(m=>m.text?.body)}));
  const {rows:[originalBuyer]}=await pool.query('select email,role,status from users where id=$1',[buyer.id]);
  assert.equal(originalBuyer.email,email);assert.equal(originalBuyer.role,'buyer');assert.equal(originalBuyer.status,'pending');

  for(const [sender,role,attempt] of [[agentPhone,'agent','buyer'],[agentPhone,'agent','seller'],[phone,'buyer','seller'],[sellerPhone,'seller','buyer']]){
    const {rows:[beforeAccount]}=await pool.query('select id,full_name,email,role,status,verified_email,email_verified_at,password_recovery_enabled from users where phone=$1',[sender]);
    const beforeRequests=await count('select count(*) from buyer_requests where buyer_user_id=$1',[beforeAccount.id]);
    const beforeOffers=await count('select count(*) from seller_listings where seller_user_id=$1',[beforeAccount.id]);
    forcedDecision={role:attempt,newIntake:true,fields:{product:'Sugar',quantity:100,targetPrice:500,price:490,destination:'Mombasa'},reply:'I will send this for review.'};
    const text=attempt==='buyer'?'New separate test requirement: I need 100 MT Sugar to Mombasa at USD 500 per MT.':'New separate test offer: I can supply 100 MT Sugar at USD 490 per MT.';
    await sendAs(sender,text);
    forcedDecision=null;
    assert.match(sent.at(-1).text.body,new RegExp('registered as '+role));
    assert.equal(await count('select count(*) from buyer_requests where buyer_user_id=$1',[beforeAccount.id]),beforeRequests);
    assert.equal(await count('select count(*) from seller_listings where seller_user_id=$1',[beforeAccount.id]),beforeOffers);
    assert.equal(await count('select count(*) from whatsapp_intake_drafts where phone=$1',[sender]),0);
    const {rows:[afterAccount]}=await pool.query('select id,full_name,email,role,status,verified_email,email_verified_at,password_recovery_enabled from users where phone=$1',[sender]);
    assert.deepEqual(afterAccount,beforeAccount,'cross-role attempts must not mutate the existing account');
  }
  // New commands must traverse the actual signed webhook, not just direct handlers.
  const {rows:[sellerAccount]}=await pool.query('select id from users where phone=$1',[sellerPhone]);
  await pool.query("update users set status='verified' where id=any($1::uuid[])",[[buyer.id,sellerAccount.id]]);
  const {rows:[source]}=await pool.query('select id,product_id from buyer_requests where buyer_user_id=$1 limit 1',[buyer.id]);
  const fixtureDeal=randomUUID();
  await pool.query("insert into deals(id,buyer_user_id,seller_user_id,buyer_request_id,product_id,quantity,unit,agreed_price,currency,incoterm,destination,status) values($1,$2,$3,$4,$5,10,'MT',100,'USD','FOB','Jebel Ali','negotiation')",[fixtureDeal,buyer.id,sellerAccount.id,source.id,source.product_id]);
  await pool.query('insert into whatsapp_user_contexts(user_id,active_deal_id) values($1,$2) on conflict(user_id) do update set active_deal_id=excluded.active_deal_id',[buyer.id,fixtureDeal]);
  process.env.UDC_APP_ENV='staging';process.env.AKIF_WHATSAPP_REPLY_SINK='store';
  const metaBefore=sent.length,modelsBefore=providerCalls.length;module.clearSunkReplies();
  await post('deal status picture');assert.equal(module.readSunkReplies(phone).at(-1).kind,'image');assert.match(module.readSunkReplies(phone).at(-1).text,/not payment or delivery confirmation/);
  await post("explain my deal's incoterm");assert.match(module.readSunkReplies(phone).at(-1).text,/recorded Incoterm is FOB/);
  const photoQuoteDoc=randomUUID().slice(0,24)+'234123412346';await pool.query("insert into documents(id,deal_id,uploaded_by,document_type,file_url,status) values($1,$2,$3,'price_list','storage://PRIVATE_SYNTHETIC_PHOTO','approved')",[photoQuoteDoc,fixtureDeal,buyer.id]);await pool.query("insert into document_access(document_id,user_id,access_role) values($1,$2,'viewer')",[photoQuoteDoc,buyer.id]);await pool.query("insert into document_extractions(document_id,deal_id,status,structured_data,updated_at) values($1,$2,'needs_review',$3,clock_timestamp())",[photoQuoteDoc,fixtureDeal,JSON.stringify({items:[{product:'Chocolate '+ 'x'.repeat(95)+' END',unitPrice:'123.000001',currency:'USD',unit:'carton'}]})]);await post('review photo quote '+photoQuoteDoc);const photoReplies=module.readSunkReplies(phone);assert.match(photoReplies.at(-2).text,/123.000001 USD per carton/);assert.ok(photoReplies.at(-2).text.includes('x'.repeat(95)+' END'),'full product shown before review button, never silently clipped');assert.match(photoReplies.at(-2).text,/No seller was matched/);assert.ok(!photoReplies.at(-2).text.includes('storage://'));assert.equal(photoReplies.at(-1).kind,'interactive:button');assert.match(photoReplies.at(-1).text,/checked every displayed/);const reviewButton=`udc:photo_review:${fixtureDeal}:${photoQuoteDoc}:${(await module.photoQuoteReview(buyer.id,fixtureDeal,photoQuoteDoc)).reviewToken}`;await post({type:'button_reply',button_reply:{id:reviewButton}});assert.match(module.readSunkReplies(phone).at(-1).text,/exact extracted snapshot was recorded/);assert.equal(await count("select count(*) from audit_logs where action='photo_quote_snapshot_reviewed' and actor_user_id=$1 and entity_id=$2",[buyer.id,fixtureDeal]),1);await post({type:'button_reply',button_reply:{id:reviewButton}});assert.equal(await count("select count(*) from audit_logs where action='photo_quote_snapshot_reviewed' and actor_user_id=$1 and entity_id=$2",[buyer.id,fixtureDeal]),1);await pool.query('delete from whatsapp_user_contexts where user_id=$1',[buyer.id]);await post({type:'button_reply',button_reply:{id:reviewButton}});assert.match(module.readSunkReplies(phone).at(-1).text,/exact extracted snapshot was recorded/);await pool.query('insert into whatsapp_user_contexts(user_id,active_deal_id) values($1,$2)',[buyer.id,fixtureDeal]);await pool.query('update document_extractions set updated_at=clock_timestamp() where document_id=$1',[photoQuoteDoc]);await post({type:'button_reply',button_reply:{id:reviewButton}});assert.match(module.readSunkReplies(phone).at(-1).text,/unavailable or changed/);await pool.query('update document_extractions set structured_data=$1,updated_at=clock_timestamp() where document_id=$2',[JSON.stringify({items:Array.from({length:9},(_,i)=>({product:'Chocolate '+i,unitPrice:'123.000001',currency:'USD',unit:'carton'}))}),photoQuoteDoc]);const beforeOmitted=module.readSunkReplies(phone).length;await post('review photo quote '+photoQuoteDoc);const omittedReplies=module.readSunkReplies(phone).slice(beforeOmitted);assert.equal(omittedReplies.length,1,'no review button when not all rows are displayed');assert.match(omittedReplies[0].text,/Additional rows omitted/);const unofferedButton=`udc:photo_review:${fixtureDeal}:${photoQuoteDoc}:${(await module.photoQuoteReview(buyer.id,fixtureDeal,photoQuoteDoc)).reviewToken}`;await post({type:'button_reply',button_reply:{id:unofferedButton}});assert.match(module.readSunkReplies(phone).at(-1).text,/No review was recorded/);assert.equal(await count("select count(*) from audit_logs where action='photo_quote_snapshot_reviewed' and actor_user_id=$1 and entity_id=$2",[buyer.id,fixtureDeal]),1,'forged unoffered hidden-row snapshot cannot confirm');
  assert.ok((await module.getAkifDealContext(fixtureDeal,buyer.id)).documentExtractions.some(e=>e.documentId===photoQuoteDoc),'actual shared context retains fresh extraction');await pool.query("update documents set updated_at='2026-11-05T12:00:00.000900Z' where id=$1",[photoQuoteDoc]);await pool.query("update document_extractions set updated_at='2026-11-05T12:00:00.000100Z' where document_id=$1",[photoQuoteDoc]);assert.ok(!(await module.getAkifDealContext(fixtureDeal,buyer.id)).documentExtractions.some(e=>e.documentId===photoQuoteDoc),'actual shared context excludes sub-millisecond stale extraction');assert.equal(await module.getAkifDealContext(fixtureDeal,randomUUID()),null,'unknown viewer receives no shared context');await pool.query("update users set role='seller' where id=$1",[buyer.id]);assert.equal(await module.getAkifDealContext(fixtureDeal,buyer.id),null,'changed current role cannot read former buyer context');await pool.query("update users set role='buyer',status='suspended' where id=$1",[buyer.id]);assert.equal(await module.getAkifDealContext(fixtureDeal,buyer.id),null,'suspended viewer receives no context');await pool.query("update users set status='verified' where id=$1",[buyer.id]);
  await post('review photo quote '+randomUUID());assert.match(module.readSunkReplies(phone).at(-1).text,/unavailable/);
  await post('our deal history');assert.match(module.readSunkReplies(phone).at(-1).text,/0 prior recorded deals/);assert.match(module.readSunkReplies(phone).at(-1).text,/does not prove timely delivery/);
  await post('check document '+photoQuoteDoc);assert.match(module.readSunkReplies(phone).at(-1).text,/unavailable/,'stale extraction cannot be compared');await pool.query('update document_extractions set structured_data=$1,updated_at=clock_timestamp() where document_id=$2',[JSON.stringify({quantity:{value:'11',unit:'MT'},pricing:{unitPrice:'100',currency:'USD',basis:'MT'},logistics:{incoterm:'FOB',destination:'Jebel Ali'}}),photoQuoteDoc]);await post('check document '+photoQuoteDoc);const checkedText=module.readSunkReplies(phone).at(-1).text;assert.match(checkedText,/quantity: mismatch/);assert.match(checkedText,/unit price: match/);assert.match(checkedText,/A mismatch is a flag, not a finding of fraud/);assert.doesNotMatch(checkedText,/storage:\/\/|PRIVATE_SYNTHETIC/);await pool.query('delete from document_access where document_id=$1 and user_id=$2',[photoQuoteDoc,buyer.id]);await post('check document '+photoQuoteDoc);assert.match(module.readSunkReplies(phone).at(-1).text,/unavailable/);await pool.query("insert into document_access(document_id,user_id,access_role) values($1,$2,'viewer')",[photoQuoteDoc,buyer.id]);await post('check document '+randomUUID().slice(0,24)+'234123412346');assert.match(module.readSunkReplies(phone).at(-1).text,/unavailable/);
  await post('my deal terms');assert.match(module.readSunkReplies(phone).at(-1).text,/Recorded unit price: \$100 per MT/);assert.match(module.readSunkReplies(phone).at(-1).text,/not a fresh seller offer/);
  await post('seller review');assert.match(module.readSunkReplies(phone).at(-1).text,/recorded seller review/);assert.match(module.readSunkReplies(phone).at(-1).text,/not a guarantee/);
  await post('quality proof pack');assert.match(module.readSunkReplies(phone).at(-1).text,/0 accessible approved/);
  await post('freight estimate');assert.match(module.readSunkReplies(phone).at(-1).text,/current forwarder quote/);
  const helpMessage=randomUUID(),helpBody={type:'button_reply',button_reply:{id:'udc:human_help:'+fixtureDeal}};await post(helpBody,helpMessage);await post(helpBody,helpMessage);
  assert.equal(await count("select count(*) from audit_logs where action='trade_assist_human_help' and entity_id=$1 and actor_user_id=$2",[fixtureDeal,buyer.id]),1);
  assert.match(module.readSunkReplies(phone).at(-1).text,/does not mean a person is online/);
  await pool.query("update users set role='seller' where id=$1",[buyer.id]);await post('deal status picture');assert.match(module.readSunkReplies(phone).at(-1).text,/No picture was shared/);await pool.query("update users set role='buyer' where id=$1",[buyer.id]);
  await pool.query("update companies set verification_status='verified' where owner_user_id=any($1::uuid[])",[[buyer.id,sellerAccount.id]]);await pool.query("insert into company_verification_documents(company_id,uploaded_by,document_type,file_url,status) select id,owner_user_id,'company_registration','storage://SYNTHETIC_REVIEWED_COMPANY','approved' from companies where owner_user_id=any($1::uuid[])",[[buyer.id,sellerAccount.id]]);await pool.query("update buyer_requests set status='approved',quantity=10,unit='MT',currency='USD',destination='Jebel Ali',target_price=101 where id=$1",[source.id]);const termsListing=randomUUID(),termsMatch=randomUUID();await pool.query("insert into seller_listings(id,seller_user_id,product_id,company_id,quantity,unit,price,currency,incoterm,destination,status) select $1,$2,$3,id,20,'MT',100,'USD','CIF','Jebel Ali','approved' from companies where owner_user_id=$2 limit 1",[termsListing,sellerAccount.id,source.product_id]);await pool.query("insert into matches(id,buyer_request_id,seller_listing_id,status) values($1,$2,$3,'approved')",[termsMatch,source.id,termsListing]);const termsProposal=await module.requestTermsReview(termsMatch,buyer.id);const acceptBody={type:'button_reply',button_reply:{id:'udc:terms:accept:'+termsProposal.proposalId}};const presentedAudit=(await pool.query("delete from audit_logs where action='match_terms_presented' and entity_id=$1 returning *",[termsProposal.proposalId])).rows[0];assert.ok(presentedAudit);await post({type:'button_reply',button_reply:{id:'udc:terms:accept:'+termsProposal.proposalId}});assert.match(module.readSunkReplies(phone).at(-1).text,/not been fully presented/);assert.equal(await count("select count(*) from audit_logs where action='match_terms_accepted' and entity_id=$1",[termsProposal.proposalId]),0,'unpresented proposal cannot be accepted');await pool.query('insert into audit_logs(id,actor_user_id,action,entity_type,entity_id,metadata) values($1,$2,$3,$4,$5,$6)',[presentedAudit.id,presentedAudit.actor_user_id,presentedAudit.action,presentedAudit.entity_type,presentedAudit.entity_id,presentedAudit.metadata]);await sendAs(sellerPhone,acceptBody);assert.equal(await count("select count(*) from audit_logs where action='match_terms_accepted' and entity_id=$1",[termsProposal.proposalId]),0,'signed seller cannot accept buyer terms');await post(acceptBody);await post(acceptBody);assert.equal(await count("select count(*) from audit_logs where action='match_terms_accepted' and entity_id=$1 and actor_user_id=$2",[termsProposal.proposalId,buyer.id]),1,'signed buyer acceptance and duplicate create one decision');assert.equal(await count('select count(*) from deals where buyer_request_id=$1 and seller_listing_id=$2',[source.id,termsListing]),0,'acceptance does not silently create a deal');
  // Continue this same signed buyer conversation into reduced-quantity drafting.
  const trialDealsBefore=await count('select count(*) from deals');
  const originalTrialDeal=(await pool.query('select * from deals where id=$1',[fixtureDeal])).rows[0];
  const trialRequestsBefore=await count('select count(*) from buyer_requests');
  await post('trial order 2 MT');
  assert.match(module.readSunkReplies(phone).at(-1).text,/smaller pending buyer requirement is prepared/);
  const trialAudit=(await pool.query("select metadata from audit_logs where action='trial_requirement_prepared' and actor_user_id=$1 and entity_id=$2",[buyer.id,fixtureDeal])).rows;
  assert.equal(trialAudit.length,1);
  const trialDraft=(await pool.query('select * from buyer_requests where id=$1',[trialAudit[0].metadata.requirementId])).rows[0];
  assert.equal(trialDraft.buyer_user_id,buyer.id);assert.equal(trialDraft.status,'pending_admin_review');assert.equal(trialDraft.quantity,'2.000000');assert.equal(trialDraft.unit,'MT');assert.equal(trialDraft.target_price,null);
  assert.equal(await count('select count(*) from buyer_requests'),trialRequestsBefore+1);
  await post('trial order 02.000000 MT');
  assert.match(module.readSunkReplies(phone).at(-1).text,/earlier trial draft is already saved/);
  await post('trial order 20 MT');assert.match(module.readSunkReplies(phone).at(-1).text,/No order or change was made/);
  assert.equal(await count('select count(*) from buyer_requests'),trialRequestsBefore+1,'signed duplicate and invalid quantity create no extra draft');
  assert.equal(await count("select count(*) from audit_logs where action='trial_requirement_prepared' and actor_user_id=$1 and entity_id=$2",[buyer.id,fixtureDeal]),1);
  assert.equal(await count('select count(*) from deals'),trialDealsBefore,'signed trial request creates no deal');
  assert.deepEqual((await pool.query('select * from deals where id=$1',[fixtureDeal])).rows[0],originalTrialDeal,'original deal terms and state stay unchanged');
  // Explicit restart requests remain private preparation, never an order/switch.
  const restartRequestsBefore=await count('select count(*) from buyer_requests');
  const restartDealsBefore=await count('select count(*) from deals');
  await post('repeat order');assert.match(module.readSunkReplies(phone).at(-1).text,/cannot be saved/);
  assert.equal(await count("select count(*) from audit_logs where action='trade_assist_repeat_order' and actor_user_id=$1 and entity_id=$2",[buyer.id,fixtureDeal]),0,'negotiation is not a completed repeat-order source');
  for(const request of [{text:'repeat order',status:'completed',action:'trade_assist_repeat_order'},{text:'switch seller',status:'on_hold',action:'trade_assist_switch_seller'},{text:'backup seller',status:'negotiation',action:'trade_assist_backup_seller'}]){
    await pool.query('update deals set status=$1 where id=$2',[request.status,fixtureDeal]);
    const currentOriginal=(await pool.query('select * from deals where id=$1',[fixtureDeal])).rows[0];
    await post(request.text);assert.match(module.readSunkReplies(phone).at(-1).text,/Saved for UDC human review/);
    await post(request.text);assert.match(module.readSunkReplies(phone).at(-1).text,/already recorded/);
    const rows=(await pool.query('select metadata from audit_logs where action=$1 and actor_user_id=$2 and entity_id=$3',[request.action,buyer.id,fixtureDeal])).rows;
    assert.equal(rows.length,1);assert.equal(rows[0].metadata.noCounterpartyTransfer,true);assert.equal(rows[0].metadata.noCommitment,true);assert.equal(rows[0].metadata.state,'awaiting_human_review');
    assert.equal(await count('select count(*) from buyer_requests'),restartRequestsBefore,'signed request alone creates no requirement');
    assert.equal(await count('select count(*) from deals'),restartDealsBefore,'signed request alone creates no new deal');
    assert.deepEqual((await pool.query('select * from deals where id=$1',[fixtureDeal])).rows[0],currentOriginal,'request does not change original seller or terms');
  }
  // Existing admin preparation consumes the exact request made in this conversation.
  const signedBackup=(await pool.query("select id from audit_logs where action='trade_assist_backup_seller' and actor_user_id=$1 and entity_id=$2",[buyer.id,fixtureDeal])).rows[0];
  const adminForPreparation=randomUUID();await pool.query("insert into users(id,full_name,email,password_hash,role,status) values($1,'Synthetic review admin',$2,'synthetic-not-a-login','admin','verified')",[adminForPreparation,'review-'+adminForPreparation+'@example.invalid']);
  const requestsBeforePreparation=await count('select count(*) from buyer_requests');
  const sourceRequestBeforePreparation=(await pool.query('select * from buyer_requests where id=$1',[source.id])).rows[0];
  const originalBeforePreparation=(await pool.query('select * from deals where id=$1',[fixtureDeal])).rows[0];
  const adminSession=await module.createSession(adminForPreparation),buyerSession=await module.createSession(buyer.id);
  const prepareSignedRestart=async(token)=>{const r=await fetch(localOrigin+'/admin/trade-assist/requests/'+signedBackup.id+'/prepare-requirement',{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:'{}'});return {status:r.status,body:await r.json().catch(()=>({}))};};
  assert.equal((await prepareSignedRestart()).status,401);assert.equal((await prepareSignedRestart(buyerSession.token)).status,403);
  assert.equal(await count('select count(*) from buyer_requests'),requestsBeforePreparation,'unauthorized preparation creates no draft');
  const preparationResponses=await Promise.all([prepareSignedRestart(adminSession.token),prepareSignedRestart(adminSession.token)]);
  assert.deepEqual(preparationResponses.map(r=>r.status).sort(),[200,201]);const prepared=preparationResponses.map(r=>r.body);
  assert.ok(prepared.every(r=>!('error'in r)));assert.equal(prepared[0].requirementId,prepared[1].requirementId);assert.equal(prepared.filter(r=>r.repeated).length,1);
  const preparedRequest=(await pool.query('select * from buyer_requests where id=$1',[prepared[0].requirementId])).rows[0];
  assert.equal(preparedRequest.status,'pending_admin_review');assert.equal(preparedRequest.buyer_user_id,buyer.id);
  for(const key of ['quantity','unit','currency','target_price','destination','preferred_incoterm','specification','contract_duration','payment_terms','inspection_requirements','additional_conditions'])assert.equal(preparedRequest[key],sourceRequestBeforePreparation[key],'only current buyer requirement copied: '+key);
  assert.equal(await count('select count(*) from buyer_requests'),requestsBeforePreparation+1);
  assert.equal(await count("select count(*) from audit_logs where action='trade_restart_requirement_prepared' and metadata->>'requestId'=$1",[signedBackup.id]),1);
  assert.equal(await count('select count(*) from deals'),restartDealsBefore,'admin preparation creates no replacement deal');
  assert.deepEqual((await pool.query('select * from deals where id=$1',[fixtureDeal])).rows[0],originalBeforePreparation);
  // Preparation is insufficient: review the new requirement and present fresh terms.
  const createRestartMatch=async(token)=>{const r=await fetch(localOrigin+'/admin/matches',{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify({buyerRequestId:preparedRequest.id,sellerListingId:termsListing})});return {status:r.status,body:await r.json()};};
  assert.equal((await createRestartMatch()).status,401);assert.equal((await createRestartMatch(buyerSession.token)).status,403);
  const pendingMatch=await createRestartMatch(adminSession.token);assert.equal(pendingMatch.status,409);assert.equal(pendingMatch.body.error,'match_records_require_admin_approval');
  assert.equal(await count('select count(*) from matches where buyer_request_id=$1',[preparedRequest.id]),0,'pending requirement cannot gain a match');
  const reviewRequirement=async(token)=>fetch(localOrigin+'/admin/buyer-requests/'+preparedRequest.id+'/status',{method:'PATCH',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify({status:'approved'})});
  assert.equal((await reviewRequirement()).status,401);assert.equal((await reviewRequirement(buyerSession.token)).status,403);
  assert.equal((await pool.query('select status from buyer_requests where id=$1',[preparedRequest.id])).rows[0].status,'pending_admin_review');
  const reviewedRequirement=await reviewRequirement(adminSession.token);assert.equal(reviewedRequirement.status,200,await reviewedRequirement.text());
  const reviewedAudit=(await pool.query("select metadata from audit_logs where action='buyer_requirement_reviewed' and actor_user_id=$1 and entity_id=$2",[adminForPreparation,preparedRequest.id])).rows;
  assert.equal(reviewedAudit.length,1);assert.equal(reviewedAudit[0].metadata.previousStatus,'pending_admin_review');assert.equal(reviewedAudit[0].metadata.newStatus,'approved');
  const matchedRestart=await createRestartMatch(adminSession.token);assert.equal(matchedRestart.status,201,JSON.stringify(matchedRestart.body));
  const freshMatch=matchedRestart.body.match.id;assert.equal(matchedRestart.body.match.status,'approved');
  assert.equal((await createRestartMatch(adminSession.token)).status,409,'duplicate match refused');
  assert.equal(await count('select count(*) from matches where buyer_request_id=$1',[preparedRequest.id]),1);
  assert.equal(await count("select count(*) from audit_logs where action='match_created' and entity_id=$1 and actor_user_id=$2",[freshMatch,adminForPreparation]),1);
  const freshProposal=await module.requestTermsReview(freshMatch,adminForPreparation);
  assert.notEqual(freshProposal.proposalId,termsProposal.proposalId,'restart has its own fresh proposal, not old acceptance');
  const freshAccept={type:'button_reply',button_reply:{id:'udc:terms:accept:'+freshProposal.proposalId}};
  await sendAs(sellerPhone,freshAccept);
  assert.equal(await count("select count(*) from audit_logs where action='match_terms_accepted' and entity_id=$1",[freshProposal.proposalId]),0);
  await post(freshAccept);await post(freshAccept);
  assert.equal(await count("select count(*) from audit_logs where action='match_terms_accepted' and entity_id=$1 and actor_user_id=$2",[freshProposal.proposalId,buyer.id]),1);
  assert.equal(await count('select count(*) from deals'),restartDealsBefore,'fresh signed buyer decision alone creates no deal');
  assert.deepEqual((await pool.query('select * from deals where id=$1',[fixtureDeal])).rows[0],originalBeforePreparation,'fresh proposal leaves original deal untouched');
  // Real session-authenticated admin HTTP creates the separate deal only now.
  const createFreshDeal=async(body,token)=>{const r=await fetch(localOrigin+'/admin/deals',{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
  const freshDealInput={matchId:freshMatch,quantity:Number(preparedRequest.quantity),agreedPrice:100,currency:'USD',incoterm:'CIF',destination:'Jebel Ali'};
  assert.equal((await createFreshDeal(freshDealInput)).status,401);
  assert.equal((await createFreshDeal(freshDealInput,buyerSession.token)).status,403);
  const mismatchedDeal=await createFreshDeal({...freshDealInput,agreedPrice:101},adminSession.token);assert.equal(mismatchedDeal.status,409);assert.equal(mismatchedDeal.body.error,'deal_differs_from_buyer_accepted_terms');
  assert.equal(await count('select count(*) from deals'),restartDealsBefore);
  const createdFreshDeal=await createFreshDeal(freshDealInput,adminSession.token);assert.equal(createdFreshDeal.status,201,JSON.stringify(createdFreshDeal.body));
  assert.equal(createdFreshDeal.body.deal.buyerRequestId,preparedRequest.id);assert.equal(createdFreshDeal.body.deal.buyerUserId,buyer.id);assert.equal(createdFreshDeal.body.deal.sellerUserId,sellerAccount.id);assert.equal(createdFreshDeal.body.deal.status,'initiated');assert.notEqual(createdFreshDeal.body.deal.id,fixtureDeal);
  assert.equal((await createFreshDeal(freshDealInput,adminSession.token)).status,409,'duplicate admin submit cannot create another deal');
  assert.equal(await count('select count(*) from deals'),restartDealsBefore+1);
  assert.equal(await count('select count(*) from deal_participants where deal_id=$1',[createdFreshDeal.body.deal.id]),2);
  assert.equal(await count("select count(*) from audit_logs where action='deal_created' and entity_id=$1 and actor_user_id=$2",[createdFreshDeal.body.deal.id,adminForPreparation]),1);
  assert.deepEqual((await pool.query('select * from deals where id=$1',[fixtureDeal])).rows[0],originalBeforePreparation,'separate admin-created deal preserves old deal');
  await pool.query('delete from users where id=$1',[adminForPreparation]);
  assert.equal(providerCalls.length,modelsBefore,'explicit commands bypass all model calls');assert.equal(sent.length,metaBefore,'all new command outputs stay in local sink');assert.ok(module.readSunkReplies().every(r=>r.to===phone||r.to===sellerPhone),'new commands disclose only to the requesting fixture parties');
  delete process.env.UDC_APP_ENV;delete process.env.AKIF_WHATSAPP_REPLY_SINK;
  console.log('PASSED signed-webhook new commands: actual PNG sink, exact contextual term, grant-filtered quality index, freight preparation, bound human-help replay dedup, changed-role denial, no model/Meta sends.');
  console.log('PASSED additionally with real local PostgreSQL: seller and agent registration, two kg/AED offers, retained rejected registration + successful edit/retry, existing account unchanged, and signed cross-role intake blocked.');

  console.log('PASSED: signed webhook, privacy consent, worker timeout + fallback error, plain buyer registration, pending company review, private requirement persistence and duplicate submit protection (real local PostgreSQL; no live messages).');
} finally {
  globalThis.fetch = fetchBefore;
  delete globalThis.__udcCombinedMail;
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  if (pool) await pool.end();
  await rm(directory, { recursive: true, force: true });
}
