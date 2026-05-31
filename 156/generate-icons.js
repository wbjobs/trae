#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const iconsDir = path.join(__dirname, 'src-tauri', 'icons');

function createPlaceholderPNG(filename, size) {
  const png = Buffer.alloc(size * size * 4 + 100);
  
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  signature.copy(png, 0);
  
  const header = Buffer.alloc(25);
  header.writeUInt32BE(13, 0);
  header.write('IHDR', 4);
  header.writeUInt32BE(size, 8);
  header.writeUInt32BE(size, 12);
  header[16] = 8;
  header[17] = 6;
  header[18] = 0;
  header[19] = 0;
  header[20] = 0;
  
  const crc1 = crc32(header.slice(4, 21));
  header.writeUInt32BE(crc1, 21);
  header.copy(png, 8, 0, 25);
  
  const rawData = Buffer.alloc(size * size * 4 + size);
  for (let y = 0; y < size; y++) {
    rawData[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const idx = y * (size * 4 + 1) + 1 + x * 4;
      rawData[idx] = 0;
      rawData[idx + 1] = 212;
      rawData[idx + 2] = 255;
      rawData[idx + 3] = 255;
    }
  }
  
  const zlib = require('zlib');
  const compressed = zlib.deflateSync(rawData);
  
  const idat = Buffer.alloc(compressed.length + 12);
  idat.writeUInt32BE(compressed.length, 0);
  idat.write('IDAT', 4);
  compressed.copy(idat, 8);
  const crc2 = crc32(Buffer.concat([Buffer.from('IDAT'), compressed]));
  idat.writeUInt32BE(crc2, compressed.length + 8);
  idat.copy(png, 33, 0, idat.length);
  
  const iend = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82]);
  iend.copy(png, 33 + idat.length);
  
  const totalLength = 33 + idat.length + 12;
  return png.slice(0, totalLength);
}

function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

const sizes = [32, 128, 256];

sizes.forEach(size => {
  const png = createPlaceholderPNG(`${size}x${size}.png`, size);
  fs.writeFileSync(path.join(iconsDir, `${size}x${size}.png`), png);
  console.log(`Created ${size}x${size}.png`);
});

fs.copyFileSync(
  path.join(iconsDir, '128x128.png'),
  path.join(iconsDir, '128x128@2x.png')
);
console.log('Created 128x128@2x.png');

console.log('Icons created successfully!');
console.log('Note: For production, please replace these with actual icons.');
