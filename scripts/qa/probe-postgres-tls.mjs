#!/usr/bin/env node
// PostgreSQL SSLRequest + TLS handshake ONLY. No StartupMessage, credentials, or SQL.
import net from 'node:net';
import tls from 'node:tls';
import { readFileSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';

const host = process.env.UDC_TLS_PROBE_HOST;
const port = Number(process.env.UDC_TLS_PROBE_PORT ?? 6543);
const caFile = process.env.UDC_TLS_CA_FILE;
if (!host || !/^[a-z0-9.-]+$/i.test(host) || !Number.isInteger(port) || port < 1 || port > 65535 || !caFile) {
  console.error('Provide UDC_TLS_PROBE_HOST, UDC_TLS_PROBE_PORT and UDC_TLS_CA_FILE (no credentials).');
  process.exit(2);
}
let ca;
try {
  ca = readFileSync(caFile);
  new X509Certificate(ca); // Fail before opening a socket for invalid CA material.
} catch {
  console.error('Cannot read a valid PEM CA certificate.');
  process.exit(2);
}

const request = Buffer.alloc(8);
request.writeInt32BE(8, 0);
request.writeInt32BE(80877103, 4);

try {
  const report = await new Promise((resolve, reject) => {
    const plain = net.createConnection({ host, port });
    let secure;
    let finished = false;
    const timeout = setTimeout(() => fail(new Error('TLS probe timed out')), 12000);
    function finish(error, result) {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      secure?.destroy();
      plain.destroy();
      if (error) reject(error); else resolve(result);
    }
    function fail(error) { finish(error); }
    plain.once('error', fail);
    plain.once('connect', () => plain.write(request));
    plain.once('data', response => {
      if (response.length !== 1 || response[0] !== 0x53) {
        return fail(new Error('Server did not accept PostgreSQL SSL negotiation'));
      }
      plain.removeListener('error', fail);
      secure = tls.connect({ socket: plain, servername: host, ca, rejectUnauthorized: true, minVersion: 'TLSv1.2' });
      secure.once('error', fail);
      secure.once('secureConnect', () => {
        if (!secure.authorized) return fail(new Error('TLS server certificate not authorized'));
        const peer = secure.getPeerCertificate();
        finish(null, { tls: secure.getProtocol(), authorized: secure.authorized,
          hostname: host, peerFingerprint256: peer.fingerprint256, peerValidTo: peer.valid_to });
      });
    });
  });
  console.log('PASS: read-only PostgreSQL TLS certificate and hostname verification');
  console.log(JSON.stringify(report));
} catch (error) {
  console.error('FAIL: PostgreSQL TLS verification:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
}
