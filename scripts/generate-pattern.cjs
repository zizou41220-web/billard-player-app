const fs = require('fs');
const path = require('path');

const width = 800;
const height = 600;
const pitchX = 26;
const pitchY = 13;
const rects = [];

for (let r = 0; r <= Math.ceil(height / pitchY); r++) {
  const y = r * pitchY;
  const xOffset = (r % 2 === 1) ? 13 : 0;
  for (let x = -13 + xOffset; x <= width + 13; x += pitchX) {
    // Dispersion gradient: denser at top-left, fading out smoothly towards bottom-right
    const dist = (x * 0.72 + y * 0.58) / (width * 0.82);
    if (dist > 1.05) continue;

    // Size scales from 14.5px down to 2px
    const factor = Math.max(0, 1 - dist);
    const size = 14.5 * Math.pow(factor, 1.35);
    if (size < 1.4) continue;

    // Subtle opacity (user requested 'légerement') between 0.05 and 0.16
    const opacity = (0.05 + 0.11 * factor).toFixed(3);

    const rx = (x - size / 2).toFixed(1);
    const ry = (y - size / 2).toFixed(1);
    const s = size.toFixed(1);

    rects.push(`<rect x="${rx}" y="${ry}" width="${s}" height="${s}" rx="2" fill="#000000" fill-opacity="${opacity}"/>`);
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" width="100%" height="100%">
  <g>
    ${rects.join('\n    ')}
  </g>
</svg>`;

const outDir = path.resolve(__dirname, '../src/assets');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'jersey-pattern.svg'), svg, 'utf-8');
console.log('Successfully generated jersey-pattern.svg with ' + rects.length + ' squares.');
