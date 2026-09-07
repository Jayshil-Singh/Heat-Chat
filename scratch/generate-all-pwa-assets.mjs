import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

// CRC32 implementation for PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(8 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, "ascii");
  data.copy(buf, 8);
  const crc = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]));
  buf.writeUInt32BE(crc, 8 + len);
  return buf;
}

function createPng(width, height, pixelShader) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth 8
  ihdrData.writeUInt8(6, 9); // RGBA
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);

  const ihdrChunk = createChunk("IHDR", ihdrData);

  const rowLength = 1 + width * 4;
  const rawData = Buffer.alloc(rowLength * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowLength;
    rawData.writeUInt8(0, rowOffset); // filter: None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = pixelShader(x, y, width, height);
      rawData.writeUInt8(r, pxOffset);
      rawData.writeUInt8(g, pxOffset + 1);
      rawData.writeUInt8(b, pxOffset + 2);
      rawData.writeUInt8(a, pxOffset + 3);
    }
  }

  const deflated = zlib.deflateSync(rawData);
  const idatChunk = createChunk("IDAT", deflated);
  const iendChunk = createChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Flame distance function: returns > 0 inside flame, < 0 outside
 * Normalized coordinates x: [-1, 1], y: [-1, 1] with y=-1 at bottom, y=1 at top
 */
function isInsideFlame(nx, ny) {
  // Center is (0, 0), flame base is round at bottom (ny in [-0.7, 0])
  // and tapers to points at top (ny in [0, 0.85])
  if (ny < -0.8 || ny > 0.85) return false;

  // Base teardrop / circle
  const baseRadius = 0.65;
  const bottomDist = Math.sqrt(nx * nx + (ny + 0.15) * (ny + 0.15));
  if (bottomDist < baseRadius && ny <= 0.05) {
    return true;
  }

  // Upper flame body tapering upward
  if (ny > 0) {
    const progress = (ny - 0) / 0.85; // 0 to 1
    const halfWidth = 0.65 * Math.pow(1 - progress, 0.8);
    // Slight wavy flick
    const flickX = 0.12 * Math.sin(progress * Math.PI * 1.5);
    if (Math.abs(nx - flickX) < halfWidth) {
      return true;
    }
  }

  return false;
}

/**
 * Inner flame teardrop
 */
function isInsideInnerFlame(nx, ny) {
  if (ny < -0.6 || ny > 0.45) return false;
  const baseRadius = 0.35;
  const bottomDist = Math.sqrt(nx * nx + (ny + 0.15) * (ny + 0.15));
  if (bottomDist < baseRadius && ny <= -0.05) return true;
  if (ny > -0.05) {
    const progress = (ny + 0.05) / 0.5;
    const halfWidth = 0.35 * (1 - progress);
    const flickX = 0.08 * Math.sin(progress * Math.PI);
    if (Math.abs(nx - flickX) < halfWidth) return true;
  }
  return false;
}

/**
 * Shader for App Icons (Standard & Apple Touch Icon)
 * Dark elegant background `#09090b` with a glowing gradient rounded badge and flame symbol
 */
function standardIconShader(x, y, w, h) {
  // Normalized coordinates from -1 to 1
  const nx = (x / w) * 2 - 1;
  const ny = -((y / h) * 2 - 1); // ny = 1 is top, -1 is bottom

  // Rounded rectangle squircle bounds
  const cornerRadius = 0.28;
  const bound = 0.88;
  const dx = Math.max(0, Math.abs(nx) - (bound - cornerRadius));
  const dy = Math.max(0, Math.abs(ny) - (bound - cornerRadius));
  const outsideDist = Math.sqrt(dx * dx + dy * dy);
  const isInsideCard = outsideDist <= cornerRadius;

  if (!isInsideCard) {
    return [0, 0, 0, 0]; // Transparent outside card
  }

  // Card background: vibrant gradient from heat-600 (#ea580c) via heat-500 (#f97316) to amber-400 (#fbbf24)
  const t = (nx + ny + 2) / 4; // 0 to 1
  let cr = Math.round(234 * (1 - t) + 251 * t);
  let cg = Math.round(88 * (1 - t) + 191 * t);
  let cb = Math.round(12 * (1 - t) + 36 * t);

  // Scaled coordinates for flame inside badge (scale by 1.35)
  const fx = nx * 1.35;
  const fy = ny * 1.35;

  // Inner flame highlight (warm pale yellow / white)
  if (isInsideInnerFlame(fx, fy)) {
    return [255, 250, 230, 255];
  }

  // Outer flame silhouette (pure white / warm tint)
  if (isInsideFlame(fx, fy)) {
    return [255, 255, 255, 255];
  }

  // Card gradient background
  return [cr, cg, cb, 255];
}

/**
 * Shader for Maskable Icon (512x512)
 * Must cover 100% of the canvas with solid background (safe zone within inner 80% circle)
 */
function maskableIconShader(x, y, w, h) {
  const nx = (x / w) * 2 - 1;
  const ny = -((y / h) * 2 - 1);

  // Background is solid dark Heat Chat `#09090b`
  let r = 9;
  let g = 9;
  let b = 11;

  // Inner emblem circle: diameter = 0.72 (fits completely inside 0.8 safe zone)
  const distFromCenter = Math.sqrt(nx * nx + ny * ny);
  if (distFromCenter <= 0.72) {
    // Gradient fill
    const t = (nx + ny + 1.5) / 3;
    let cr = Math.round(234 * (1 - t) + 251 * t);
    let cg = Math.round(88 * (1 - t) + 191 * t);
    let cb = Math.round(12 * (1 - t) + 36 * t);

    // Flame inside circle
    const fx = nx * 1.8;
    const fy = ny * 1.8;

    if (isInsideInnerFlame(fx, fy)) {
      return [255, 250, 230, 255];
    }
    if (isInsideFlame(fx, fy)) {
      return [255, 255, 255, 255];
    }
    return [cr, cg, cb, 255];
  }

  return [r, g, b, 255];
}

/**
 * Shader for Favicon 16x16 and 32x32
 */
function faviconShader(x, y, w, h) {
  const nx = (x / w) * 2 - 1;
  const ny = -((y / h) * 2 - 1);

  // Circular or squircle flame icon
  const dist = Math.sqrt(nx * nx + ny * ny);
  if (dist > 0.95) return [0, 0, 0, 0];

  // Warm orange/amber gradient
  const t = (nx + ny + 2) / 4;
  const cr = Math.round(249 * (1 - t) + 239 * t);
  const cg = Math.round(115 * (1 - t) + 68 * t);
  const cb = Math.round(22 * (1 - t) + 68 * t);

  // White flame center for 32x32
  if (w >= 32) {
    const fx = nx * 1.3;
    const fy = ny * 1.3;
    if (isInsideFlame(fx, fy)) {
      return [255, 255, 255, 255];
    }
  } else {
    // 16x16: simple flame dot in center
    if (dist < 0.45) {
      return [255, 255, 255, 255];
    }
  }

  return [cr, cg, cb, 255];
}

/**
 * Creates a valid multi-resolution .ICO file with 16x16 and 32x32 PNG images
 */
function createIcoFile(images) {
  // Header: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon (.ICO)
  header.writeUInt16LE(images.length, 4); // count

  const directoryEntries = [];
  let currentOffset = 6 + images.length * 16;

  for (const img of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(img.width >= 256 ? 0 : img.width, 0);
    entry.writeUInt8(img.height >= 256 ? 0 : img.height, 1);
    entry.writeUInt8(0, 2); // palette colors count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(img.data.length, 8); // size of image data
    entry.writeUInt32LE(currentOffset, 12); // offset
    directoryEntries.push(entry);
    currentOffset += img.data.length;
  }

  return Buffer.concat([
    header,
    ...directoryEntries,
    ...images.map((img) => img.data),
  ]);
}

// Generate all assets
const publicDir = path.resolve(process.cwd(), "public");
const iconsDir = path.join(publicDir, "icons");

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

console.log("Generating PWA icons and favicon...");

// 1. icon-192.png (192x192)
const png192 = createPng(192, 192, standardIconShader);
fs.writeFileSync(path.join(iconsDir, "icon-192.png"), png192);
console.log("  ✓ Created public/icons/icon-192.png (192x192)");

// 2. icon-512.png (512x512)
const png512 = createPng(512, 512, standardIconShader);
fs.writeFileSync(path.join(iconsDir, "icon-512.png"), png512);
console.log("  ✓ Created public/icons/icon-512.png (512x512)");

// 3. icon-maskable-512.png (512x512)
const pngMaskable = createPng(512, 512, maskableIconShader);
fs.writeFileSync(path.join(iconsDir, "icon-maskable-512.png"), pngMaskable);
console.log("  ✓ Created public/icons/icon-maskable-512.png (512x512 maskable)");

// 4. apple-touch-icon.png (180x180)
const pngApple = createPng(180, 180, standardIconShader);
fs.writeFileSync(path.join(iconsDir, "apple-touch-icon.png"), pngApple);
console.log("  ✓ Created public/icons/apple-touch-icon.png (180x180)");

// 5. public/favicon.ico (16x16 + 32x32)
const pngFavicon16 = createPng(16, 16, faviconShader);
const pngFavicon32 = createPng(32, 32, faviconShader);
const icoBuffer = createIcoFile([
  { width: 16, height: 16, data: pngFavicon16 },
  { width: 32, height: 32, data: pngFavicon32 },
]);
fs.writeFileSync(path.join(publicDir, "favicon.ico"), icoBuffer);
console.log("  ✓ Created public/favicon.ico (16x16, 32x32)");

console.log("All PWA icons and favicon generated successfully!");
