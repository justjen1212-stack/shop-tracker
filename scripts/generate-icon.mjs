import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const SIZE = 180;
const PAD = 30;

// Resize wood background to square
const woodBg = await sharp(join(root, 'public', 'wood-bg.png'))
  .resize(SIZE, SIZE, { fit: 'cover' })
  .toBuffer();

// Make logo white and resize
const logoWhite = await sharp(join(root, 'public', 'logo.png'))
  .negate({ alpha: false })
  .resize({ width: SIZE - PAD * 2, height: SIZE - PAD * 2, fit: 'inside' })
  .toBuffer();

const meta = await sharp(logoWhite).metadata();
const left = Math.round((SIZE - meta.width) / 2);
const top = Math.round((SIZE - meta.height) / 2);

// Composite logo over wood background
await sharp(woodBg)
  .composite([{ input: logoWhite, left, top }])
  .png()
  .toFile(join(root, 'public', 'apple-touch-icon.png'));

console.log('apple-touch-icon.png created with wood texture');
