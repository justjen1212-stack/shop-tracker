import sharp from 'sharp';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const SIZE = 180;
const PAD = 36; // padding around logo

// Load the original logo and make it white
const logoWhite = await sharp(join(root, 'public', 'logo.png'))
  .negate({ alpha: false })   // invert black → white
  .resize({ width: SIZE - PAD * 2, height: SIZE - PAD * 2, fit: 'inside' })
  .toBuffer();

// Get actual dimensions after resize
const meta = await sharp(logoWhite).metadata();
const left = Math.round((SIZE - meta.width) / 2);
const top = Math.round((SIZE - meta.height) / 2);

// Composite onto dark wood background
await sharp({
  create: {
    width: SIZE,
    height: SIZE,
    channels: 4,
    background: { r: 61, g: 43, b: 31, alpha: 1 }, // #3d2b1f
  },
})
  .composite([{ input: logoWhite, left, top }])
  .png()
  .toFile(join(root, 'public', 'apple-touch-icon.png'));

console.log('apple-touch-icon.png created');
