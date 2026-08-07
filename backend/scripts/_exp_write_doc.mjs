import fs from 'node:fs';

const target = process.argv[2];
const content = fs.readFileSync(process.argv[3], 'utf8');
fs.writeFileSync(target, content);
console.log('wrote', target, content.length, 'chars');
