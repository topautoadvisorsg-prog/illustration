import sharp from 'sharp';
await sharp(process.argv[2]!).resize({ width: 560 }).png().toFile(process.argv[3]!);
console.log('thumb →', process.argv[3]);
process.exit(0);
