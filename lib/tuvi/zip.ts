/**
 * lib/tuvi/zip.ts — ZIP writer tối giản (store, không nén).
 * ---------------------------------------------------------------------------
 * VÌ SAO TỰ VIẾT: gói kỹ năng chỉ có vài file text vài chục KB. Cài thêm
 * `jszip`/`archiver` chỉ để đóng 2 file là không đáng — thêm dependency, thêm
 * bề mặt lỗi, thêm thời gian cài. Định dạng ZIP ở mức "store" (method 0) đủ
 * đơn giản để viết đúng trong 100 dòng và đọc được bằng mọi trình giải nén.
 *
 * ĐÁNH ĐỔI: không nén nên file lớn hơn ~1:3 so với deflate. Với 12 KB text thì
 * thành ~12 KB thay vì ~4 KB — không đáng để đổi lấy rủi ro của một dependency
 * nữa trong pipeline này.
 *
 * ĐÃ KIỂM CHỨNG: file sinh ra mở được bằng Python `zipfile` và `unzip -t`.
 * ---------------------------------------------------------------------------
 */

/** Bảng CRC32 (đa thức 0xEDB88320) — ZIP bắt buộc phải có. */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Ngày giờ cố định (2026-10-22 00:00) để kết quả tất định — test so byte được. */
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (10 << 5) | 22;

export interface ZipEntry {
  /** Đường dẫn trong file nén, dùng "/" — ví dụ "SKILL.md". */
  path: string;
  content: string;
}

export function buildZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.path, 'utf8');
    const data = Buffer.from(entry.content, 'utf8');
    const crc = crc32(data);

    /* ---- local file header (30 byte + tên) ---- */
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // flag: UTF-8 filename
    local.writeUInt16LE(0, 8); // method: store
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); // compressed size
    local.writeUInt32LE(data.length, 22); // uncompressed size
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra length

    locals.push(local, name, data);

    /* ---- central directory header (46 byte + tên) ---- */
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10); // method
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk start
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42); // local header offset

    centrals.push(central, name);

    offset += local.length + name.length + data.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4); // disk
  end.writeUInt16LE(0, 6); // disk with central dir
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...locals, centralBuf, end]);
}
