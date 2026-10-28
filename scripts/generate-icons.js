import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

async function generate() {
  const svgPath = path.resolve('public', 'icon.svg');
  const svgBuffer = fs.readFileSync(svgPath);

  // 192x192
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.resolve('public', 'pwa-192x192.png'));

  // 512x512
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.resolve('public', 'pwa-512x512.png'));

  // apple-touch-icon 180x180
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.resolve('public', 'apple-touch-icon.png'));

  // Maskable 512x512 with safe zone padding (10% padding on background)
  const innerSize = Math.round(512 * 0.8);
  const innerBuffer = await sharp(svgBuffer)
    .resize(innerSize, innerSize)
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 9, g: 9, b: 11, alpha: 1 }
    }
  })
    .composite([{ input: innerBuffer, top: Math.round((512 - innerSize) / 2), left: Math.round((512 - innerSize) / 2) }])
    .png()
    .toFile(path.resolve('public', 'pwa-maskable-512x512.png'));

  // favicon.ico (using 32x32 png)
  await sharp(svgBuffer)
    .resize(64, 64)
    .png()
    .toFile(path.resolve('public', 'favicon.ico'));

  console.log('PWA icons generated successfully!');
}

generate().catch(err => {
  console.error(err);
  process.exit(1);
});
