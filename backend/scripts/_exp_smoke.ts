import { generateImage } from '../src/services/openai/openai.js';

async function main() {
  console.log('smoke test: generating tiny test image...');
  const t0 = Date.now();
  const r = await generateImage({
    prompt: 'A simple test: a red circle on a white background, plain flat vector style.',
    size: '1024x1024',
    quality: 'low',
  });
  console.log('OK', Date.now() - t0, 'ms', r.widthPx, r.heightPx, r.pngBuffer.length, 'bytes');
}

main().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
