import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { writeFileSync } from 'node:fs';
const buf = await getProjectStorage().readProjectFile(process.argv[2]!);
writeFileSync(process.argv[3]!, buf);
console.log('saved', buf.length, 'bytes');
process.exit(0);
