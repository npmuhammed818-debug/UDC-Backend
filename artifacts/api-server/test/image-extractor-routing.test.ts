import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDocumentBytes } from "../src/akif/documentExtractorClient.ts";
test("enabled image processing bypasses a PDF-only extractor and preserves review requirement", async () => {
 const previous=process.env.AKIF_WORKER_MEDIA_ENABLED;
 process.env.AKIF_WORKER_MEDIA_ENABLED="true";
 try {
  const result=await extractDocumentBytes({bytes:new Uint8Array([1,2,3]),fileName:"photo.png",mimeType:"image/png"});
  assert.equal(result.text,"");
  assert.equal(result.vision_pages?.length,1);
  assert.match(result.warnings[0],/manual_review/);
  await assert.rejects(extractDocumentBytes({bytes:new Uint8Array(5*1024*1024+1),fileName:"large.png",mimeType:"image/png"}));
 } finally {if(previous===undefined)delete process.env.AKIF_WORKER_MEDIA_ENABLED;else process.env.AKIF_WORKER_MEDIA_ENABLED=previous;}
});
