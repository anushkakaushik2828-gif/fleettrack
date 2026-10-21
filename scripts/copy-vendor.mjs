import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendorDir = path.join(root, 'public', 'vendor');
const imageDir = path.join(vendorDir, 'images');
fs.mkdirSync(vendorDir, { recursive: true });
fs.mkdirSync(imageDir, { recursive: true });

const copies = [
  ['node_modules/leaflet/dist/leaflet.js', 'public/vendor/leaflet.js'],
  ['node_modules/leaflet/dist/leaflet.css', 'public/vendor/leaflet.css'],
  ['node_modules/lucide/dist/umd/lucide.min.js', 'public/vendor/lucide.min.js'],
  ['node_modules/leaflet/dist/images/layers.png', 'public/vendor/images/layers.png'],
  ['node_modules/leaflet/dist/images/layers-2x.png', 'public/vendor/images/layers-2x.png'],
  ['node_modules/leaflet/dist/images/marker-icon.png', 'public/vendor/images/marker-icon.png'],
  ['node_modules/leaflet/dist/images/marker-icon-2x.png', 'public/vendor/images/marker-icon-2x.png'],
  ['node_modules/leaflet/dist/images/marker-shadow.png', 'public/vendor/images/marker-shadow.png'],
];

for (const [from, to] of copies) {
  const target = path.join(root, to);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, from), target);
  console.log(`copied ${to}`);
}
