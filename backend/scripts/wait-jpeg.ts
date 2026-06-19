/* Poll the deployed /print-prep for one page until the JPEG code is live (print
 * PDF size drops well below the ~14 MB PNG baseline), then report the new size. */
import { getProjectStorage } from '../src/services/storage/project-storage.js';
const BASE = process.env.WL_BACKEND ?? 'https://wildlandsbackend-production.up.railway.app';
const PW = (process.env.CONSOLE_PASSWORD ?? '').trim();
if (!PW) { console.error('CONSOLE_PASSWORD not in env'); process.exit(2); }
const RENDER = process.argv[2]!;
const PDFPATH = process.argv[3]!;
const THRESH = Number(process.argv[4] ?? 5); // MB; exit when print PDF drops below this
const H = { Authorization: `Bearer ${PW}`, 'Content-Type': 'application/json' };
const st = getProjectStorage();

for (let i = 0; i < 24; i++) {
  try {
    await fetch(`${BASE}/api/whole-page-render/${RENDER}/print-prep`, { method: 'POST', headers: H, body: '{}' });
    const mb = (await st.readProjectFile(PDFPATH)).length / 1048576;
    console.log(`poll ${i}: print PDF = ${mb.toFixed(2)} MB`);
    if (mb < THRESH) {
      console.log(`JPEG LIVE — per-page ~${mb.toFixed(2)} MB`);
      console.log(`ESTIMATE: 275 pages × ${mb.toFixed(2)} MB = ~${(mb * 275 / 1024).toFixed(2)} GB (${(mb * 275).toFixed(0)} MB) interior`);
      process.exit(0);
    }
  } catch (e) { console.log(`poll ${i}: ${e instanceof Error ? e.message : String(e)}`); }
  await new Promise((s) => setTimeout(s, 20000));
}
console.log('gave up'); process.exit(1);
