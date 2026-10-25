import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { servidorPiloto } from '../../herramientas/ver-piloto.mjs';

test('el piloto sirve MP4 con MIME, rangos y HEAD para reproducir y adelantar', async (t) => {
  const carpeta = await mkdtemp(join(tmpdir(), 'piloto-http-'));
  await writeFile(join(carpeta, 'video.mp4'), '0123456789');
  await writeFile(join(carpeta, 'REVISAR.html'), '<video controls></video>');
  const s = await servidorPiloto(carpeta);
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise((r) => s.close(r)); await rm(carpeta, { recursive: true }); });
  const base = `http://127.0.0.1:${s.address().port}`;
  const parte = await fetch(base + '/video.mp4', { headers: { Range: 'bytes=2-5' } });
  assert.equal(parte.status, 206); assert.equal(parte.headers.get('content-type'), 'video/mp4');
  assert.equal(parte.headers.get('content-range'), 'bytes 2-5/10'); assert.equal(await parte.text(), '2345');
  const cola = await fetch(base + '/video.mp4', { headers: { Range: 'bytes=-3' } }); assert.equal(await cola.text(), '789');
  const head = await fetch(base + '/video.mp4', { method: 'HEAD' }); assert.equal(head.headers.get('content-length'), '10'); assert.equal(await head.text(), '');
  const no = await fetch(base + '/video.mp4', { headers: { Range: 'bytes=100-' } }); assert.equal(no.status, 416);
  const escape = await fetch(base + '/%2e%2e%2fsecret.mp4'); assert.equal(escape.status, 403);
  assert.equal((await fetch(base + '/.env')).status, 404);
});
