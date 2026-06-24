import { createCanvas } from 'canvas';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '../artifacts/algdevs-ai/public');

// Define icon sizes and their purposes
const iconSizes = [
  { size: 192, name: 'icon-192x192.png', maskable: false },
  { size: 192, name: 'icon-192x192-maskable.png', maskable: true },
  { size: 512, name: 'icon-512x512.png', maskable: false },
  { size: 512, name: 'icon-512x512-maskable.png', maskable: true },
  { size: 96, name: 'icon-96x96.png', maskable: false },
];

function generateIcon(size, isMaskable) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = isMaskable ? '#000000' : '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // Draw a simple AI-themed icon: a circle with a neural network pattern
  const padding = size * 0.1;
  const innerSize = size - padding * 2;

  // Outer circle
  ctx.strokeStyle = isMaskable ? '#ffffff' : '#000000';
  ctx.lineWidth = size * 0.05;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, innerSize / 2, 0, Math.PI * 2);
  ctx.stroke();

  // Inner neural network nodes
  const nodeRadius = size * 0.04;
  const nodeColor = isMaskable ? '#ffffff' : '#000000';
  const positions = [
    { x: 0.3, y: 0.3 },
    { x: 0.7, y: 0.3 },
    { x: 0.5, y: 0.7 },
    { x: 0.3, y: 0.7 },
    { x: 0.7, y: 0.7 },
    { x: 0.5, y: 0.5 },
  ];

  // Draw connections
  ctx.strokeStyle = nodeColor;
  ctx.lineWidth = size * 0.02;
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const p1 = positions[i];
      const p2 = positions[j];
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (dist < 0.5) {
        ctx.beginPath();
        ctx.moveTo(padding + p1.x * innerSize, padding + p1.y * innerSize);
        ctx.lineTo(padding + p2.x * innerSize, padding + p2.y * innerSize);
        ctx.stroke();
      }
    }
  }

  // Draw nodes
  ctx.fillStyle = nodeColor;
  for (const pos of positions) {
    ctx.beginPath();
    ctx.arc(padding + pos.x * innerSize, padding + pos.y * innerSize, nodeRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas.toBuffer('image/png');
}

console.log('Generating PWA icons...');
for (const icon of iconSizes) {
  try {
    const buffer = generateIcon(icon.size, icon.maskable);
    const filePath = resolve(publicDir, icon.name);
    writeFileSync(filePath, buffer);
    console.log(`✓ Generated ${icon.name}`);
  } catch (err) {
    console.error(`✗ Failed to generate ${icon.name}:`, err.message);
  }
}

console.log('PWA icons generated successfully!');
