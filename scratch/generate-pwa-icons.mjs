import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

function createSolidPng(width, height, r, g, b, a = 255) {
  // Signature
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth
  ihdrData.writeUInt8(6, 9); // RGBA
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);

  const ihdrChunk = createChunk("IHDR", ihdrData);

  // Scanlines: filter byte (0) + width * 4 bytes per row
  const rowLength = 1 + width * 4;
  const rawData = Buffer.alloc(rowLength * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowLength;
    rawData.writeUInt8(0, rowOffset); // filter: None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      // Flame gradient: transition from orange #f97316 (249, 115, 22) to red #dc2626 (220, 38, 38)
      const t = (x + y) / (width + height);
      const pr = Math.round(249 * (1 - t) + 220 * t);
      const pg = Math.round(115 * (1 - t) + 38 * t);
      const pb = Math.round(22 * (1 - t) + 38 * t);

      rawData.writeUInt8(pr, pxOffset);
      rawData.writeUInt8(pg, pxOffset + 1);
      rawData.writeUInt8(pb, pxOffset + 2);
      rawData.writeUInt8(a, pxOffset + 3);
    }
  }

  const deflated = zlib.deflateSync(rawData);
  const idatChunk = createChunk("IDAT", deflated);

  // IEND
  const iendChunk = createChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
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

// Simple CRC32 table
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

const iconsDir = path.resolve(process.cwd(), "public/icons");
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

fs.writeFileSync(path.join(iconsDir, "icon-192.png"), createSolidPng(192, 192, 249, 115, 22));
fs.writeFileSync(path.join(iconsDir, "icon-512.png"), createSolidPng(512, 512, 249, 115, 22));
console.log("Created public/icons/icon-192.png and public/icons/icon-512.png successfully.");
