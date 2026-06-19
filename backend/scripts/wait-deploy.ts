/* Poll the deployed /print-prep endpoint for the title page until the new code
 * is live (title page → no folio, no badges). Auth from env CONSOLE_PASSWORD. */
const BASE = process.env.WL_BACKEND ?? 'https://wildlandsbackend-production.up.railway.app';
const PW = (process.env.CONSOLE_PASSWORD ?? '').trim();
if (!PW) { console.error('CONSOLE_PASSWORD not in env'); process.exit(2); }
const RENDER = process.argv[2]!; // title-page render id
const H = { Authorization: `Bearer ${PW}`, 'Content-Type': 'application/json' };

for (let i = 0; i < 24; i++) {
  try {
    const r: any = await (await fetch(`${BASE}/api/whole-page-render/${RENDER}/print-prep`, { method: 'POST', headers: H, body: '{}' })).json();
    console.log(`poll ${i}: stampedFolio=${r.stampedFolio} stampedBadges=${r.stampedBadges}`);
    if (r.stampedFolio === false && r.stampedBadges === 0) { console.log('DEPLOY LIVE — new print-prep code active'); process.exit(0); }
  } catch (e) { console.log(`poll ${i}: error ${e instanceof Error ? e.message : String(e)}`); }
  await new Promise((s) => setTimeout(s, 20000));
}
console.log('gave up waiting for deploy'); process.exit(1);
