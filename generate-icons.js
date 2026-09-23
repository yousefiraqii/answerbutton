const sharp = require('sharp');
const fs = require('fs-extra');
const path = require('path');

const sizes = [16, 32, 80];
const outputDir = path.join(__dirname, 'public', 'assets');
const color = '#4A90E2';
const text = 'A';

async function generateIcon(size) {
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="${color}"/>
      <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" 
            fill="white" font-family="Arial, sans-serif" font-weight="bold" font-size="${size * 0.6}">${text}</text>
    </svg>
  `;
  await sharp(Buffer.from(svg))
    .png()
    .toFile(path.join(outputDir, `icon-${size}.png`));
  console.log(`✅ تم إنشاء icon-${size}.png`);
}

async function main() {
  await fs.ensureDir(outputDir);
  for (const size of sizes) {
    await generateIcon(size);
  }
  console.log('✅ تم إنشاء جميع الأيقونات في public/assets/');
}

main().catch(console.error);