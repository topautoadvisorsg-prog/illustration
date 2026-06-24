import { eq } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { projects } from '../src/db/schema/index.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
const ID = process.argv[2]!, a = +process.argv[3]!, b = +process.argv[4]!;
const row = (await getDb().select().from(projects).where(eq(projects.id, ID)))[0]!;
const txt = (await getProjectStorage().readProjectFile((row as any).manuscriptPath)).toString('utf8');
console.log(txt.split('\n').slice(a,b).join('\n'));
process.exit(0);
