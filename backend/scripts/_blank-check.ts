import { renderTypesetBook } from '../src/pipeline/typeset/render-typeset.js';
import { RENDER_INPUT, readManuscript } from './before-you-need-it-config.js';
const { md } = readManuscript();
const r = await renderTypesetBook({ ...RENDER_INPUT, markdown: md });
console.log(`pages ${r.report.totalPages}   blanks ${r.report.blankPages.length}: [${r.report.blankPages.join(', ')}]`);
console.log(`vOverflow ${r.report.verticalOverflowPages.length}  hOverflow ${r.report.horizontalOverflow.length}  sections ${r.report.sectionStarts.length}`);
process.exit(0);
