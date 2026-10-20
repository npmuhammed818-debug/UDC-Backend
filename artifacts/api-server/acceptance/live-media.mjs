// Fixed synthetic fixtures only. No Meta, trader identities or trade persistence.
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
const fixture=JSON.parse(await readFile(new URL('./media-fixtures.json',import.meta.url),'utf8'));
const results=[];let calls=0;
async function check(name,url,init,validate){
  if(!url){results.push({name,status:'blocked',reason:'configuration_missing'});return;}
  calls++;
  try {
    const response=await fetch(url,{...init,signal:AbortSignal.timeout(70_000)});
    if(!response.ok){await response.body?.cancel();results.push({name,status:'blocked',httpStatus:response.status});return;}
    const data=await response.json(), failures=validate(data);
    results.push({name,status:failures.length?'failed':'passed',failures});
  } catch {results.push({name,status:'blocked',reason:'request_or_response_failure'});}
}
const worker=process.env.AKIF_WORKER_URL?.replace(/\/$/,'');
const headers={'x-akif-worker-token':process.env.AKIF_WORKER_TOKEN??''};
await check('synthetic_image_transcription',worker?worker+'/media/image/transcribe':null,{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({mime_type:'image/png',base64:fixture.imageBase64})},data=>[
  ...(/copper/i.test(data.text??'')?[]:['product']),...(/100/.test(data.text??'')?[]:['quantity']),...(/5,?900/.test(data.text??'')?[]:['price']),...(/Jebel Ali/i.test(data.text??'')?[]:['destination']),...(data.human_review_required===true?[]:['review_required']),
]);
if(worker)await new Promise(resolve=>setTimeout(resolve,65_000));
const audio=new FormData();audio.set('file',new Blob([new Uint8Array(gunzipSync(Buffer.from(fixture.audioGzipBase64,'base64')))],{type:'audio/wav'}),'synthetic-voice.wav');
await check('synthetic_voice_transcription',worker?worker+'/media/audio/transcribe':null,{method:'POST',headers,body:audio},data=>[
  ...(/copper/i.test(data.text??'')?[]:['product']),...(/100|hundred/i.test(data.text??'')?[]:['quantity']),...(data.requires_confirmation===true?[]:['text_confirmation_required']),
]);
const extractor=process.env.UDC_DOCUMENT_EXTRACTOR_URL?.replace(/\/$/,'');
const pdf=new FormData();pdf.set('file',new Blob([new Uint8Array(Buffer.from(fixture.pdfBase64,'base64'))],{type:'application/pdf'}),'synthetic-trade.pdf');
await check('synthetic_pdf_extraction',extractor?extractor+'/extract':null,{method:'POST',headers:{authorization:'Bearer '+(process.env.UDC_DOCUMENT_EXTRACTOR_TOKEN??'')},body:pdf},data=>[
  ...(/copper/i.test(data.text??'')?[]:['product']),...(/100/.test(data.text??'')?[]:['quantity']),...(/5900/.test(data.text??'')?[]:['price']),...(/Jebel Ali/i.test(data.text??'')?[]:['destination']),
]);
console.log('UDC_ACCEPTANCE_RESULT '+JSON.stringify({mode:'synthetic_live_media',calls,budget:3,results}));
process.exitCode=results.some(r=>r.status!=='passed')?1:0;
