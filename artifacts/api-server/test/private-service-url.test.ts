import {test} from 'node:test';import assert from 'node:assert/strict';
import {privateServiceUrlAllowed,requirePrivateServiceUrl} from '../src/privacy/serviceUrl.ts';
test('private service URLs require HTTPS remotely and reject embedded credentials',()=>{
 for(const url of ['https://extract.example.invalid','http://127.0.0.1:1234','http://localhost:1234','http://[::1]:1234'])assert.ok(privateServiceUrlAllowed(url),url);
 for(const url of ['http://extract.example.invalid','http://127.0.0.1.evil.invalid','https://user:pass@example.invalid','file:///tmp/private','invalid'])assert.throws(()=>requirePrivateServiceUrl(url),undefined,url);
});
