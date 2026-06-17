/* Terminology standardization scan — report only. Walks the dumped manuscript by
 * page, flags regional/British/archaic/secondary terms, and records the dominant
 * North American outdoor term + locations. */
import { readFileSync } from 'node:fs';
const txt = readFileSync(process.argv[2]!, 'utf8');
const sections = txt.split(/\n===== \[([A-Z0-9_]+)\][^\n]*\n/).slice(1);
const pageText: Array<{ key: string; body: string }> = [];
for (let i = 0; i < sections.length; i += 2) pageText.push({ key: sections[i]!, body: sections[i + 1] ?? '' });

type Cand = { rx: RegExp; current: string; rec: string; reason: string; conf: 'HIGH' | 'MEDIUM' | 'LOW' };
const CANDS: Cand[] = [
  // gear / bushcraft
  { rx: /\brucksacks?\b/i, current: 'rucksack', rec: 'backpack', reason: 'British term; backpack is the dominant US consumer/outdoor term', conf: 'HIGH' },
  { rx: /\btorch(es)?\b/i, current: 'torch', rec: 'flashlight', reason: 'British for electric light; in the US "torch" means a flame', conf: 'HIGH' },
  { rx: /\b(tent fly|flysheet|fly sheet)\b/i, current: 'tent fly / flysheet', rec: 'rainfly', reason: 'Rainfly is the standard US tent term', conf: 'HIGH' },
  { rx: /\bbilly ?cans?\b/i, current: 'billycan', rec: 'camp pot / cook pot', reason: 'British/Australian camp term; uncommon in US', conf: 'HIGH' },
  { rx: /\bcagoules?\b/i, current: 'cagoule', rec: 'rain jacket', reason: 'British term, unfamiliar to US readers', conf: 'HIGH' },
  { rx: /\banoraks?\b/i, current: 'anorak', rec: 'rain jacket / parka', reason: 'Chiefly British; parka/rain jacket dominate in US', conf: 'MEDIUM' },
  { rx: /\b(wellingtons?|wellies)\b/i, current: 'wellingtons', rec: 'rubber boots', reason: 'British term', conf: 'HIGH' },
  { rx: /\bsecateurs\b/i, current: 'secateurs', rec: 'pruning shears', reason: 'British term', conf: 'HIGH' },
  { rx: /\bspanners?\b/i, current: 'spanner', rec: 'wrench', reason: 'British term', conf: 'HIGH' },
  { rx: /\bpetrol\b/i, current: 'petrol', rec: 'gas / gasoline', reason: 'British term', conf: 'HIGH' },
  { rx: /\btinned\b/i, current: 'tinned', rec: 'canned', reason: 'British term', conf: 'HIGH' },
  { rx: /\bcooker\b/i, current: 'cooker', rec: 'stove', reason: 'British for a camp stove', conf: 'MEDIUM' },
  { rx: /\bbivvy\b/i, current: 'bivvy', rec: 'bivy', reason: 'US spelling is "bivy"', conf: 'MEDIUM' },
  // general British usage
  { rx: /\bwhilst\b/i, current: 'whilst', rec: 'while', reason: 'British/formal; "while" is standard US', conf: 'HIGH' },
  { rx: /\bamongst\b/i, current: 'amongst', rec: 'among', reason: 'British/formal variant', conf: 'HIGH' },
  { rx: /\bfortnights?\b/i, current: 'fortnight', rec: 'two weeks', reason: 'Rare in US English', conf: 'HIGH' },
  { rx: /\btrousers\b/i, current: 'trousers', rec: 'pants', reason: 'British; "pants" dominant in US', conf: 'MEDIUM' },
  { rx: /\bplasters?\b/i, current: 'plaster', rec: 'bandage / Band-Aid', reason: 'British for adhesive bandage', conf: 'HIGH' },
  { rx: /\bcar park\b/i, current: 'car park', rec: 'parking lot', reason: 'British term', conf: 'HIGH' },
  // nature / plants / landscape
  { rx: /\breedmace\b/i, current: 'reedmace', rec: 'cattail', reason: 'British name; cattail is the US name', conf: 'HIGH' },
  { rx: /\bbulrush(es)?\b/i, current: 'bulrush', rec: 'cattail', reason: 'Ambiguous/British for cattail in popular use', conf: 'MEDIUM' },
  { rx: /\b(bilberr|whortleberr)\w*\b/i, current: 'bilberry / whortleberry', rec: 'blueberry', reason: 'British names; New England has blueberries', conf: 'HIGH' },
  { rx: /\bramsons\b/i, current: 'ramsons', rec: 'wild garlic / ramps', reason: 'British name for wild garlic', conf: 'HIGH' },
  { rx: /\btoadstools?\b/i, current: 'toadstool', rec: 'mushroom', reason: 'Informal/archaic; "mushroom" is the field-guide term', conf: 'MEDIUM' },
  { rx: /\bladybirds?\b/i, current: 'ladybird', rec: 'ladybug', reason: 'British term', conf: 'HIGH' },
  { rx: /\bmoorlands?\b|\bmoors?\b/i, current: 'moor / moorland', rec: 'heath / open upland', reason: 'British landscape term; New England has no moors', conf: 'MEDIUM' },
  { rx: /\bcopses?\b/i, current: 'copse', rec: 'grove / thicket', reason: 'Chiefly British', conf: 'MEDIUM' },
  { rx: /\btarns?\b/i, current: 'tarn', rec: 'mountain pond / alpine pool', reason: 'Used in US alpine writing but less familiar to general readers', conf: 'LOW' },
  { rx: /\bfells?\b/i, current: 'fell', rec: 'mountain / ridge', reason: 'British for upland/hill (watch false matches: "fell" the verb)', conf: 'LOW' },
  // British spellings
  { rx: /\b\w*(colour|favour|honour|behaviour|neighbour|odour|vapour|harbour|labour|rumour|flavour)\w*\b/i, current: '-our spelling (colour, odour, behaviour…)', rec: '-or (color, odor, behavior…)', reason: 'British spelling', conf: 'HIGH' },
  { rx: /\b(metre|litre|fibre|centre|theatre|calibre|sombre|metres|litres|fibres|centres)\b/i, current: '-re spelling (metre, fibre, centre…)', rec: '-er (meter, fiber, center…)', reason: 'British spelling', conf: 'HIGH' },
  { rx: /\bgrey\b/i, current: 'grey', rec: 'gray', reason: 'British spelling', conf: 'HIGH' },
  { rx: /\bmould(s|y|ing)?\b/i, current: 'mould', rec: 'mold', reason: 'British spelling', conf: 'HIGH' },
  { rx: /\bsulphur\w*\b/i, current: 'sulphur', rec: 'sulfur', reason: 'British spelling', conf: 'HIGH' },
  { rx: /\baluminium\b/i, current: 'aluminium', rec: 'aluminum', reason: 'British spelling/term', conf: 'HIGH' },
  { rx: /\bdefence\b/i, current: 'defence', rec: 'defense', reason: 'British spelling', conf: 'HIGH' },
  { rx: /\b(travelled|traveller|labelled|fuelled|marvellous|signalling|modelling)\b/i, current: 'double-l (travelled, labelled…)', rec: 'single-l (traveled, labeled…)', reason: 'British spelling', conf: 'HIGH' },
  { rx: /\b(plough|draught|manoeuvre|sceptic\w*|aeroplane)\b/i, current: 'plough / draught / manoeuvre / sceptical', rec: 'plow / draft / maneuver / skeptical', reason: 'British spelling', conf: 'HIGH' },
];

type Hit = { c: Cand; locs: Map<string, string> };
const hits = new Map<string, Hit>();
for (const { key, body } of pageText) {
  for (const c of CANDS) {
    const m = body.match(c.rx);
    if (m) {
      if (!hits.has(c.current)) hits.set(c.current, { c, locs: new Map() });
      // capture one short sample sentence per page
      const idx = body.toLowerCase().indexOf(m[0].toLowerCase());
      const sample = body.slice(Math.max(0, idx - 40), idx + 60).replace(/\s+/g, ' ').trim();
      hits.get(c.current)!.locs.set(key, `…${sample}…`);
    }
  }
}

function dump(conf: string) {
  const group = [...hits.values()].filter((h) => h.c.conf === conf);
  if (!group.length) { console.log(`  (none)`); return; }
  for (const h of group.sort((a, b) => b.locs.size - a.locs.size)) {
    const pages = [...h.locs.keys()];
    console.log(`\n  • ${h.c.current}  →  ${h.c.rec}`);
    console.log(`      reason: ${h.c.reason}`);
    console.log(`      pages (${pages.length}): ${pages.slice(0, 15).join(', ')}${pages.length > 15 ? ` …(+${pages.length - 15})` : ''}`);
    console.log(`      e.g. ${[...h.locs.values()][0]}`);
  }
}
console.log('================ TERMINOLOGY AUDIT ================');
console.log('\n===== HIGH CONFIDENCE ====='); dump('HIGH');
console.log('\n===== MEDIUM CONFIDENCE ====='); dump('MEDIUM');
console.log('\n===== LOW CONFIDENCE (review in context) ====='); dump('LOW');
console.log(`\nTotal distinct flagged terms: ${hits.size}`);
process.exit(0);
