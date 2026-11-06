/**
 * Extract Winamp's built-in base skin from the bundled winamp.exe.
 *
 * Winamp stores the classic base-skin bitmaps as RT_BITMAP PE resources. We
 * decode the DIBs (including run-length encoded ones) and write plain 24-bit
 * BMPs so the browser can use the original skin sprites without any runtime
 * image-decoding dependency. Everything is derived from the already-mirrored
 * winamp.exe asset.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const exePath = path.join(root, 'public/wine/binaries/winamp.exe');
const outDir = path.join(root, 'public/wine/skin');

const RESOURCES = {
  126: 'main.png',
  127: 'cbuttons.png',
  128: 'monoster.png',
  129: 'playpaus.png',
  130: 'shufrep.png',
  132: 'numbers.png',
  133: 'volume.png',
  134: 'text.png',
  135: 'posbar.png',
  150: 'titlebar.png',
  194: 'eqmain.png',
  197: 'balance.png',
  199: 'pledit.png',
};

function resourceEntries(buffer, base, offset) {
  const named = buffer.readUInt16LE(offset + 12);
  const ids = buffer.readUInt16LE(offset + 14);
  const entries = [];
  for (let i = 0; i < named + ids; i++) {
    const entry = offset + 16 + i * 8;
    entries.push({
      id: buffer.readUInt32LE(entry),
      data: buffer.readUInt32LE(entry + 4),
    });
  }
  return entries;
}

function resourceName(buffer, base, value) {
  if (!(value & 0x80000000)) return value;
  const offset = base + (value & 0x7fffffff);
  const length = buffer.readUInt16LE(offset);
  return buffer.toString('utf16le', offset + 2, offset + 2 + length * 2);
}

function collectResources(buffer, base, offset, pathParts = []) {
  const out = [];
  for (const entry of resourceEntries(buffer, base, offset)) {
    const name = resourceName(buffer, base, entry.id);
    if (entry.data & 0x80000000) {
      out.push(...collectResources(buffer, base, base + (entry.data & 0x7fffffff), [...pathParts, name]));
    } else {
      out.push({ path: [...pathParts, name], dataEntry: base + entry.data });
    }
  }
  return out;
}

function parseResources(buffer) {
  const pe = buffer.readUInt32LE(0x3c);
  if (buffer.toString('ascii', pe, pe + 4) !== 'PE\0\0') throw new Error('winamp.exe is not a PE file');
  const sectionCount = buffer.readUInt16LE(pe + 6);
  const optionalSize = buffer.readUInt16LE(pe + 20);
  const optional = pe + 24;
  const magic = buffer.readUInt16LE(optional);
  const dataDirectories = optional + (magic === 0x10b ? 96 : 112);
  const resourceRva = buffer.readUInt32LE(dataDirectories + 16);
  const sectionTable = optional + optionalSize;
  const sections = [];
  for (let i = 0; i < sectionCount; i++) {
    const offset = sectionTable + i * 40;
    const virtualSize = buffer.readUInt32LE(offset + 8);
    const virtualAddress = buffer.readUInt32LE(offset + 12);
    const rawSize = buffer.readUInt32LE(offset + 16);
    const rawOffset = buffer.readUInt32LE(offset + 20);
    sections.push({ virtualAddress, virtualSize, rawOffset, rawSize });
  }
  function rvaToOffset(rva) {
    for (const section of sections) {
      const size = Math.max(section.virtualSize, section.rawSize);
      if (rva >= section.virtualAddress && rva < section.virtualAddress + size) {
        return section.rawOffset + (rva - section.virtualAddress);
      }
    }
    return null;
  }
  const base = rvaToOffset(resourceRva);
  if (base == null) throw new Error('winamp.exe has no resource section');
  return collectResources(buffer, base, base).map((item) => {
    const dataRva = buffer.readUInt32LE(item.dataEntry);
    const size = buffer.readUInt32LE(item.dataEntry + 4);
    return { ...item, offset: rvaToOffset(dataRva), size };
  });
}

function decodeBitmap(buffer, offset, size) {
  const headerSize = buffer.readUInt32LE(offset);
  if (headerSize < 40) throw new Error(`Unsupported DIB header ${headerSize}`);
  const width = buffer.readInt32LE(offset + 4);
  const rawHeight = buffer.readInt32LE(offset + 8);
  const planes = buffer.readUInt16LE(offset + 12);
  const bits = buffer.readUInt16LE(offset + 14);
  const compression = buffer.readUInt32LE(offset + 16);
  const imageSize = buffer.readUInt32LE(offset + 20);
  const colorsUsed = buffer.readUInt32LE(offset + 32);
  const paletteCount = colorsUsed || (bits <= 8 ? 1 << bits : 0);
  const palette = [];
  for (let i = 0; i < paletteCount; i++) {
    const entry = offset + headerSize + i * 4;
    palette.push([buffer[entry + 2], buffer[entry + 1], buffer[entry]]);
  }
  const dataOffset = offset + headerSize + paletteCount * 4;
  const height = Math.abs(rawHeight);
  const pixels = Array.from({ length: height }, () => Array.from({ length: width }, () => [0, 0, 0]));

  if (compression === 0) {
    const stride = Math.ceil((width * bits) / 32) * 4;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let index;
        if (bits === 8) index = buffer[dataOffset + y * stride + x];
        else if (bits === 4) {
          const byte = buffer[dataOffset + y * stride + (x >> 1)];
          index = x % 2 === 0 ? byte >> 4 : byte & 0xf;
        } else if (bits === 24) {
          const p = dataOffset + y * stride + x * 3;
          index = [buffer[p + 2], buffer[p + 1], buffer[p]];
        } else {
          throw new Error(`Unsupported ${bits}-bit bitmap`);
        }
        pixels[y][x] = Array.isArray(index) ? index : palette[index] || [0, 0, 0];
      }
    }
  } else if (compression === 1 || compression === 2) {
    const src = buffer.subarray(dataOffset, dataOffset + (imageSize || size - (dataOffset - offset)));
    let x = 0;
    let y = 0;
    let i = 0;
    const set = (px, py, color) => {
      if (px >= 0 && px < width && py >= 0 && py < height) pixels[py][px] = color;
    };
    while (i + 1 < src.length) {
      const count = src[i++];
      const value = src[i++];
      if (count > 0) {
        for (let n = 0; n < count; n++) {
          if (compression === 1) set(x++, y, palette[value] || [0, 0, 0]);
          else {
            set(x++, y, palette[value >> 4] || [0, 0, 0]);
            if (n + 1 < count) set(x++, y, palette[value & 0xf] || [0, 0, 0]);
          }
        }
      } else if (value === 0) {
        x = 0;
        y++;
      } else if (value === 1) {
        break;
      } else if (value === 2) {
        x += src[i++] || 0;
        y += src[i++] || 0;
      } else {
        if (compression === 1) {
          for (let n = 0; n < value; n++) set(x++, y, palette[src[i + n]] || [0, 0, 0]);
          i += value + (value & 1);
        } else {
          for (let n = 0; n < value; n++) {
            const byte = src[i + (n >> 1)];
            set(x++, y, palette[n % 2 === 0 ? byte >> 4 : byte & 0xf] || [0, 0, 0]);
          }
          i += value + (value & 1);
        }
      }
    }
  } else {
    throw new Error(`Unsupported bitmap compression ${compression}`);
  }

  // DIB rows are bottom-up for a positive height; our pixels array is
  // currently in bottom-up order, so flip it for the PNG writer.
  return { width, height, pixels: rawHeight > 0 ? pixels.reverse() : pixels };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, crc]);
}

function encodePng({ width, height, pixels }) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let offset = 0;
  for (const row of pixels) {
    raw[offset++] = 0;
    for (const [r, g, b] of row) {
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export function extractWinampSkin() {
  if (!fs.existsSync(exePath)) {
    console.warn('Winamp skin: winamp.exe is not present yet, skipping extraction.');
    return false;
  }
  const buffer = fs.readFileSync(exePath);
  const resources = parseResources(buffer);
  fs.mkdirSync(outDir, { recursive: true });
  let extracted = 0;
  for (const [idText, fileName] of Object.entries(RESOURCES)) {
    const id = Number(idText);
    const resource = resources.find(
      (item) => item.path[0] === 2 && Number(item.path[1]) === id,
    );
    if (!resource || resource.offset == null) {
      console.warn(`Winamp skin: resource ${id} was not found.`);
      continue;
    }
    const bitmap = decodeBitmap(buffer, resource.offset, resource.size);
    fs.writeFileSync(path.join(outDir, fileName), encodePng(bitmap));
    extracted++;
  }
  console.log(`Winamp base skin ready at ${outDir} (${extracted} sprites)`);
  return extracted > 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    extractWinampSkin();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
