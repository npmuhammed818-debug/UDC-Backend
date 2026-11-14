import {test} from 'node:test';import assert from 'node:assert/strict';
import {statusPicturePng} from '../src/deals/statusPicturePng.ts';
import {sendSyntheticStatusImage} from '../src/whatsapp/client.ts';
import {clearSunkReplies,readSunkReplies} from '../src/whatsapp/replySink.ts';
test('actual status PNG renderer and private sink never call a provider',async()=>{
 const png=statusPicturePng({dealNumber:'SYNTHETIC-001',status:'shipment',asOf:'2026-11-05T14:00:00Z'});assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(png.readUInt32BE(16),1140);assert.equal(png.readUInt32BE(20),580);
 const oldFetch=globalThis.fetch,oldStage=process.env.UDC_APP_ENV,oldSink=process.env.AKIF_WHATSAPP_REPLY_SINK;globalThis.fetch=async()=>{throw Error('no network');};
 try{clearSunkReplies();process.env.UDC_APP_ENV='staging';delete process.env.AKIF_WHATSAPP_REPLY_SINK;assert.equal((await sendSyntheticStatusImage('synthetic',png,'Recorded stage only.')).delivered,false);process.env.AKIF_WHATSAPP_REPLY_SINK='store';assert.equal((await sendSyntheticStatusImage('synthetic',new Uint8Array([1]),'invalid')).delivered,false);assert.equal((await sendSyntheticStatusImage('synthetic',png,'Recorded stage only.')).delivered,true);assert.deepEqual(readSunkReplies('synthetic').map(r=>({kind:r.kind,text:r.text})),[{kind:'image',text:'Recorded stage only.'}]);process.env.UDC_APP_ENV='production';assert.equal((await sendSyntheticStatusImage('synthetic',png,'no')).delivered,false);}finally{globalThis.fetch=oldFetch;oldStage===undefined?delete process.env.UDC_APP_ENV:process.env.UDC_APP_ENV=oldStage;oldSink===undefined?delete process.env.AKIF_WHATSAPP_REPLY_SINK:process.env.AKIF_WHATSAPP_REPLY_SINK=oldSink;clearSunkReplies();}
});
