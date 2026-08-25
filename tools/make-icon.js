'use strict';

/**
 * Generates build/icon.png (a DIMM stick on a gradient tile) with a tiny
 * hand-rolled PNG encoder, so the build needs no image dependencies.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 256;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function roundedRectAlpha(x, y, w, h, r, px, py) {
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  const d = Math.hypot(px - cx, py - cy);
  if (px < x || px > x + w || py < y || py > y + h) return 0;
  return d <= r ? 1 : Math.max(0, 1 - (d - r));
}

function render() {
  const buf = Buffer.alloc(SIZE * SIZE * 4);

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const t = (x + y) / (SIZE * 2);

      // Tile background: blue -> violet diagonal gradient.
      let r = lerp(0x2f, 0x8b, t);
      let g = lerp(0x7d, 0x5c, t);
      let b = lerp(0xff, 0xf6, t);
      let a = roundedRectAlpha(10, 10, SIZE - 20, SIZE - 20, 52, x, y);

      // Memory module body.
      const mx = 44;
      const my = 92;
      const mw = SIZE - 88;
      const mh = 74;
      const modA = roundedRectAlpha(mx, my, mw, mh, 8, x, y);
      if (modA > 0) {
        r = lerp(r, 0x0b, modA * 0.92);
        g = lerp(g, 0x0e, modA * 0.92);
        b = lerp(b, 0x14, modA * 0.92);
      }

      // Eight DRAM chips across the module face.
      for (let c = 0; c < 8; c++) {
        const cw = 16;
        const cx0 = mx + 12 + c * (cw + 5);
        const chipA = roundedRectAlpha(cx0, my + 14, cw, 30, 2, x, y);
        if (chipA > 0) {
          r = lerp(r, 0xe6, chipA);
          g = lerp(g, 0xed, chipA);
          b = lerp(b, 0xf7, chipA);
        }
      }

      // Gold contact pins along the bottom edge.
      for (let c = 0; c < 26; c++) {
        const pw = 4;
        const px0 = mx + 8 + c * (pw + 2.6);
        const pinA = roundedRectAlpha(px0, my + mh - 12, pw, 9, 1, x, y);
        if (pinA > 0) {
          r = lerp(r, 0xff, pinA);
          g = lerp(g, 0xd4, pinA);
          b = lerp(b, 0x79, pinA);
        }
      }

      // Rising price line above the module.
      const pts = [
        [46, 74],
        [92, 60],
        [130, 68],
        [172, 40],
        [212, 30]
      ];
      for (let s = 0; s < pts.length - 1; s++) {
        const [x1, y1] = pts[s];
        const [x2, y2] = pts[s + 1];
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len2 = dx * dx + dy * dy;
        let u = ((x - x1) * dx + (y - y1) * dy) / len2;
        u = Math.max(0, Math.min(1, u));
        const dist = Math.hypot(x - (x1 + u * dx), y - (y1 + u * dy));
        const lineA = Math.max(0, Math.min(1, 3.4 - dist));
        if (lineA > 0) {
          r = lerp(r, 0x35, lineA);
          g = lerp(g, 0xd0, lineA);
          b = lerp(b, 0x7f, lineA);
        }
      }

      buf[i] = Math.round(r);
      buf[i + 1] = Math.round(g);
      buf[i + 2] = Math.round(b);
      buf[i + 3] = Math.round(a * 255);
    }
  }
  return buf;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

function encodePng(rgba) {
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) {
    raw[y * (SIZE * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/** ICO container wrapping the PNG (Vista+ accepts PNG-compressed entries). */
function encodeIco(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  const dir = Buffer.alloc(16);
  dir[0] = 0; // 0 means 256
  dir[1] = 0;
  dir[2] = 0; // palette
  dir[3] = 0;
  dir.writeUInt16LE(1, 4); // colour planes
  dir.writeUInt16LE(32, 6); // bits per pixel
  dir.writeUInt32LE(png.length, 8);
  dir.writeUInt32LE(22, 12);
  return Buffer.concat([header, dir, png]);
}

const out = path.join(__dirname, '..', 'build');
fs.mkdirSync(out, { recursive: true });
const png = encodePng(render());
fs.writeFileSync(path.join(out, 'icon.png'), png);
fs.writeFileSync(path.join(out, 'icon.ico'), encodeIco(png));
console.log('wrote build/icon.png and build/icon.ico', png.length, 'bytes');
