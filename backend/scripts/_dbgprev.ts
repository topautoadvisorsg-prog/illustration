import { eq, asc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages as pagesTbl } from '../src/db/schema/index.js';
import { buildPreviewPackageForPage } from '../src/services/render-proof/build-package.js';
const ID='ba956766-c904-4900-9b3a-aaec2cc2c924';
const pg=(await getDb().select().from(pagesTbl).where(eq(pagesTbl.projectId,ID)).orderBy(asc(pagesTbl.plannedPageNumber)).limit(1))[0]!;
console.log('testing page', pg.pageKey, pg.id);
try { const pkg = await buildPreviewPackageForPage(pg.id); console.log('OK preview-package built. keys:', Object.keys(pkg)); }
catch(e){ console.log('THREW:', (e as Error).message); console.log((e as Error).stack?.split('\n').slice(0,6).join('\n')); }
process.exit(0);
