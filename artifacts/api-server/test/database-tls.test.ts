import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import tls from 'node:tls';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import { databaseConnectionOptions } from '../../../lib/db/src/connection.ts';

test('PostgreSQL verifies server certificates even with weaker URL flags', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'udc-qa-tls-'));
  const certificate = join(directory, 'qa-cert.pem');
  const key = join(directory, 'qa-key.pem');
  const output = fileURLToPath(new URL(`../tmp/qa-db-tls-${randomUUID()}.mjs`, import.meta.url));
  const before = process.env.SUPABASE_DATABASE_URL;
  const sockets = new Set<net.Socket>();
  let server: net.Server | undefined;
  try {
    // Ephemeral test-only keys never leave this local fixture or enter Git.
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', key, '-out', certificate, '-days', '1', '-subj', '/CN=localhost',
      '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'pipe' });
    let context = tls.createSecureContext({ key: await readFile(key), cert: await readFile(certificate) });
    server = net.createServer(socket => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.on('error', () => {});
      socket.once('data', request => {
        // Minimal PostgreSQL SSL negotiation and startup, with no trade data,
        // queries, password authentication or external service calls.
        if (request.length !== 8 || request.readInt32BE(4) !== 80877103) { socket.destroy(); return; }
        socket.write('S');
        const secure = new tls.TLSSocket(socket, { isServer: true, secureContext: context });
        secure.on('error', () => secure.destroy());
        secure.once('data', () => secure.write(Buffer.from('5200000008000000005a0000000549', 'hex')));
      });
    });
    server.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server!.once('listening', resolve));
    const address = server.address() as net.AddressInfo;
    const base = `postgresql://qa@127.0.0.1:${address.port}/udc_qa_tls`;
    await mkdir(fileURLToPath(new URL('../tmp/', import.meta.url)), { recursive: true });
    await build({ stdin: { contents: "export {pool} from '../../lib/db/src/index';",
      resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
      outfile: output, bundle: true, platform: 'node', format: 'esm', external: ['pg-native'],
      banner: { js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);" }, logLevel: 'silent' });
    const untrusted = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error
      && ['DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(String(error.code));
    for (const query of ['', '?sslmode=no-verify', '?sslmode=require&uselibpqcompat=true']) {
      await t.test(`rejects an untrusted certificate with ${query || 'default options'}`, async () => {
        process.env.SUPABASE_DATABASE_URL = base + query;
        const { pool } = await import(pathToFileURL(output).href + '?case=' + randomUUID());
        try {
          await assert.rejects(async () => { const client = await pool.connect(); client.release(); }, untrusted);
        } finally { await pool.end(); }
      });
    }
    await t.test('an explicitly trusted server certificate permits a connection', async () => {
      const url = new URL(base);
      url.searchParams.set('sslmode', 'require');
      url.searchParams.set('uselibpqcompat', 'true');
      url.searchParams.set('sslrootcert', certificate);
      process.env.SUPABASE_DATABASE_URL = url.href;
      const { pool } = await import(pathToFileURL(output).href + '?trusted=' + randomUUID());
      try { const client = await pool.connect(); client.release(); }
      finally { await pool.end(); }
    });
    await t.test('a trusted certificate for another hostname is still rejected', async () => {
      const wrongCertificate = join(directory, 'wrong-host.pem'), wrongKey = join(directory, 'wrong-host-key.pem');
      execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
        '-keyout', wrongKey, '-out', wrongCertificate, '-days', '1', '-subj', '/CN=wrong.example.invalid',
        '-addext', 'subjectAltName=DNS:wrong.example.invalid'], { stdio: 'pipe' });
      context = tls.createSecureContext({ key: await readFile(wrongKey), cert: await readFile(wrongCertificate) });
      const url = new URL(base);
      url.searchParams.set('sslmode', 'require');
      url.searchParams.set('uselibpqcompat', 'true');
      url.searchParams.set('sslrootcert', wrongCertificate);
      process.env.SUPABASE_DATABASE_URL = url.href;
      const { pool } = await import(pathToFileURL(output).href + '?wrong-host=' + randomUUID());
      try {
        await assert.rejects(async () => { const client = await pool.connect(); client.release(); }, { code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
      } finally { await pool.end(); }
    });
    await t.test('plaintext is limited to explicitly configured loopback development databases', () => {
      assert.equal(databaseConnectionOptions('postgresql://qa@127.0.0.1/udc_qa_local?sslmode=disable').ssl, false);
      for (const value of ['postgresql://qa@db.example.invalid/test?sslmode=disable&ssl=0',
        'postgresql://qa@localhost/test?sslmode=disable&host=db.example.invalid']) {
        const options = databaseConnectionOptions(value);
        assert.notEqual(options.ssl, false);
        assert.equal(new URL(options.connectionString).searchParams.get('sslmode'), 'verify-full');
      }
      assert.throws(() => databaseConnectionOptions('postgresql://qa:synthetic-private@'),
        { message: 'SUPABASE_DATABASE_URL must be a PostgreSQL URL.' });
    });
  } finally {
    if (before === undefined) delete process.env.SUPABASE_DATABASE_URL; else process.env.SUPABASE_DATABASE_URL = before;
    for (const socket of sockets) socket.destroy();
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    await rm(output, { force: true });
    await rm(directory, { recursive: true, force: true });
  }
});
