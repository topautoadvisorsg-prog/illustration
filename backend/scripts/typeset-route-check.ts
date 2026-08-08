/** Verify the HTTP route end to end. Reads the console password from env; never prints it. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
loadDotenv({ path: path.join(ROOT, '.env') });
loadDotenv({ path: path.join(ROOT, '.env.development.local'), override: true });

const id = process.argv[2]!;
const base = 'http://127.0.0.1:8001';
const h: Record<string, string> = {};
if (process.env.CONSOLE_PASSWORD) h.Authorization = `Bearer ${process.env.CONSOLE_PASSWORD}`;

// node:http, not fetch — undici imposes a 30s headers timeout and a long render
// legitimately exceeds it. A browser has no such limit, so fetch would have
// reported a hang that the console never actually experiences.
import http from 'node:http';

function get(pathname: string): Promise<{ status: number; headers: Record<string, unknown>; body: Buffer; secs: string }> {
  const t = Date.now();
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: 8001, path: pathname, headers: h, timeout: 0 }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c as Buffer));
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers as Record<string, unknown>,
          body: Buffer.concat(chunks),
          secs: ((Date.now() - t) / 1000).toFixed(1),
        }),
      );
    });
    req.on('error', reject);
  });
}

const j = await get(`/api/projects/${id}/typeset-preview?format=json&recto=true`);
console.log('json  status:', j.status, `(${j.secs}s)`);
if (j.status !== 200) { console.log(j.body.toString().slice(0, 300)); process.exit(1); }
const report = (JSON.parse(j.body.toString()) as { report: { totalPages: number; verticalOverflowPages: number[] } }).report;
console.log('  pages:', report.totalPages, '| overflow:', report.verticalOverflowPages.length);

const p = await get(`/api/projects/${id}/typeset-preview?recto=true`);
console.log('pdf   status:', p.status, `(${p.secs}s)`);
console.log('  content-type :', p.headers['content-type']);
console.log('  x-total-pages:', p.headers['x-total-pages']);
console.log('  bytes        :', p.body.length, '| %PDF header:', p.body.subarray(0, 4).toString() === '%PDF');
process.exit(p.status === 200 && p.body.subarray(0, 4).toString() === '%PDF' ? 0 : 1);
