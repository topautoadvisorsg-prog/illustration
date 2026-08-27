/**
 * Back-cover copy for 7 NATIONAL PARKS, written into the project config.
 *
 * The cover engine bakes this into the artwork through the blueprint, the same
 * way DIRT RICH's back panel was painted — blurb, an "INSIDE THIS VOLUME" list,
 * and a short author note. Author name and spine type are NOT here: those are
 * composited by code afterwards, deliberately, because an image model places a
 * byline by learned convention and puts it hard against the trim.
 *
 * Every line is drawn from the book's own argument. No fee, distance, visitor
 * number or date appears — those age, and the book dates them in an appendix for
 * exactly that reason. A cover that goes stale is a reprint.
 *
 *   npx tsx scripts/national-parks-cover-copy.ts <projectId>
 */
const API = process.env.WL_API_BASE ?? 'http://127.0.0.1:8001';
const KEY = process.env.WILDLANDS_KEY ?? process.env.CONSOLE_PASSWORD ?? '';
const projectId = process.argv[2];
if (!projectId) throw new Error('usage: national-parks-cover-copy.ts <projectId>');

const bookDescription = {
  blurb:
    'You saved a year for this trip. Do not spend the first morning of it in the wrong line. ' +
    'Every park in this book is quiet, cool and yours for about two hours after first light — ' +
    'and then several thousand people arrive. This is a first-timer’s guide to the seven parks ' +
    'most Americans actually visit, not a seven-hundred-page survey of all sixty-three.',
  features: [
    'A verdict up front for every park, before any supporting detail',
    'Skip It / Do This Instead: the famous thing that is not worth it, and the better one half a mile away',
    'Three honest ways to spend a day, including one with no hiking at all',
    'A plan for the days you arrive at noon with half the day already gone',
    'Permits, timed entry and release dates, collected and dated at the back',
  ],
  authorBio:
    'Wes Denman drove to Zion at twenty-seven with no plan, got turned back at the canyon mouth, ' +
    'and learned at the junction that the permit he needed had been drawn months earlier. The ' +
    'afternoon he salvaged is still one of the best of his life. He has never stopped being annoyed ' +
    'about the day he wasted getting to it.',
};

const res = await fetch(`${API}/api/projects/${projectId}/config`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json', ...(KEY ? { authorization: `Bearer ${KEY}` } : {}) },
  body: JSON.stringify({ config: { publishing: { bookDescription } } }),
});
if (!res.ok) {
  console.error(`patch failed: ${res.status}\n${await res.text()}`);
  process.exit(1);
}
console.log(`stored back-cover copy on ${projectId}`);
console.log(`  blurb    : ${bookDescription.blurb.length} chars`);
console.log(`  features : ${bookDescription.features.length}`);
console.log(`  authorBio: ${bookDescription.authorBio.length} chars`);
