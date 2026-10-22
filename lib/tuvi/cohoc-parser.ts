/**
 * lib/tuvi/cohoc-parser.ts
 * ---------------------------------------------------------------------------
 * Parser thuần cho HTML của tuvi.cohoc.net (không I/O, không fetch).
 *
 * Cấu trúc trang kết quả (đã kiểm chứng bằng request thật):
 *
 *   <div class='noi-dung'>
 *     <h3 class='giaidoan-cung'><a name='menh'>CUNG MỆNH</a></h3>
 *     <div class='giaidoan chinhxac-9'>
 *        <h4 class='nguyennhan'>Thông tin cung Mệnh ...</h4>
 *        <p class='ketqua'>... prose, có <br/> và <b> ...</p>
 *        <em class='thamkhao'>Phù Cừ - Tử Vi Cổ Học</em>
 *     </div>
 *     ... nhiều div.giaidoan nữa ...
 *     <h3 class='giaidoan-cung'><a name='tai-bach'>CUNG TÀI BẠCH</a></h3>
 *     ...
 *
 * Bên cạnh đó là bảng 12 cung: <td class='cung'> chứa .cung-tencung,
 * .chinh-tinh, ul.sao-tot, ul.sao-xau → dùng để CROSS-CHECK với Module 1.
 *
 * Văn bản thô rất dài (500–700KB HTML, ~60k chữ). Vì vậy parser phải:
 *   1. Bỏ các block "data dump" (liệt kê sao theo Tọa thủ/Xung chiếu/Tam hợp)
 *      vì thông tin đó đã có trong NormalizedChartJSON — giữ lại chỉ tốn token.
 *   2. Dedupe: cohoc lặp cùng một đoạn cho nhiều biến thể địa bàn → trùng rất nhiều.
 *   3. Cắt theo ngân sách ký tự mỗi cung, ưu tiên đoạn prose dài (nhiều thông tin).
 * ---------------------------------------------------------------------------
 */

import * as cheerio from 'cheerio';
import type {
  CohocAnnualSection,
  CohocMetrics,
  CohocOverviewExtras,
  CohocPalaceRef,
  RawClassicalTexts,
  RawPassage,
  PalaceKey,
} from '@/types/tuvi';
import { PALACE_KEY_MAP } from './constants';

/** Map anchor name trên cohoc → PalaceKey nội bộ. */
const SECTION_TO_PALACE: Record<string, PalaceKey> = {
  menh: 'menh',
  'tai-bach': 'tai_bach',
  'su-nghiep': 'quan_loc',
  'quan-loc': 'quan_loc',
  'thien-di': 'thien_di',
  'phuc-duc': 'phuc_duc',
  'dien-trach': 'dien_trach',
  'phu-the': 'phu_the',
  'tat-ach': 'tat_ach',
  'phu-mau': 'phu_mau',
  'tu-nu': 'tu_nu',
  'tu-tuc': 'tu_nu',
  'huynh-de': 'huynh_de',
  'giao-huu': 'no_boc',
  'no-boc': 'no_boc',
};

/**
 * Phiên bản logic bóc tách + nén.
 * PHẢI nằm trong cache key: đổi cách nén mà không đổi version thì cache cũ
 * (đã bóc theo cách cũ) sẽ che mất thay đổi — đúng lỗi đã gặp khi thêm nén câu.
 */
export const PARSER_VERSION = '5';

/** Câu đủ dài để mang thông tin, đủ ngắn để không phải cả đoạn văn. */
function splitSentences(text: string): string[] {
  // Gộp xuống dòng thành khoảng trắng TRƯỚC khi tách: cohoc dùng <br> cả giữa câu,
  // tách theo \n sẽ sinh mảnh cụt ("Cho", "Nếu Tham Lang...").
  return text
    .replace(/\s*\n\s*/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 30 && /^[\p{Lu}"“]/u.test(x));
}

/** Chuẩn hoá câu để so trùng: bỏ dấu câu, lowercase, gộp khoảng trắng. */
function normalizeSentence(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Jaccard trên tập 4-gram từ — bắt được câu gần trùng, không chỉ trùng tuyệt đối. */
function shingles(s: string, n = 4): Set<string> {
  const w = normalizeSentence(s).split(' ');
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * NÉN VĂN BẢN CỔ HỌC — bài toán lớn nhất của tầng này.
 *
 * Corpus gốc 205.657 ký tự cho 12 cung, trong đó:
 *  - 32% mô tả ĐỊA BÀN (một lá khác, Mệnh có Thiên Cơ/Thiên Lương thay vì Tham Lang)
 *    → vừa tốn token vừa là nguồn mâu thuẫn trực tiếp;
 *  - 73 nhóm tiêu đề lặp (có tiêu đề xuất hiện 9 lần) với nội dung chồng lấn.
 *
 * Cách nén: bỏ đoạn khác bàn → tách câu → khử trùng gần đúng (Jaccard 4-gram)
 * → chấm điểm theo sao thực có của cung → giữ theo ngân sách, GIỮ NGUYÊN THỨ TỰ
 * để mạch đọc không bị đảo.
 */
export function compressClassicalPassages(
  passages: RawPassage[],
  hints: string[],
  budget: number,
): RawPassage[] {
  const hinted = hints.map((h) => h.toLowerCase());

  // 1. Bỏ đoạn mô tả bàn khác (Địa bàn / Nhân bàn) — lá của ta là Thiên bàn
  const sameChart = passages.filter((p) => !/địa bàn|nhân bàn/i.test(p.heading));

  // 2. Tách câu, khử trùng
  type Cand = { text: string; score: number; order: number; heading: string };
  const cands: Cand[] = [];
  const seen: Array<Set<string>> = [];
  let order = 0;

  for (const p of sameChart) {
    for (const sent of splitSentences(p.text)) {
      const sh = shingles(sent);
      if (seen.some((x) => jaccard(x, sh) > 0.7)) continue;
      seen.push(sh);

      let score = 0;
      const low = sent.toLowerCase();

      /* CỔNG LIÊN QUAN (lọc cứng, không chỉ trừ điểm): câu phải nhắc tới một sao
         thực có của cung, hoặc là câu khẳng định nghiệp vụ. Câu kể lịch sử cách
         cục, dẫn lời người đời Nguyên/Minh… bị loại hẳn — chúng chiếm chỗ mà
         không dùng để luận được. */
      const mentionsStar = hinted.some((star) => low.includes(star));
      const isClaim = /chủ về|chủ sự|nên |kỵ |ưa |dễ /.test(low);
      if (!mentionsStar && !isClaim) continue;

      for (const star of hinted) if (low.includes(star)) score += 3;

      // Câu khẳng định về đời sống được ưu tiên: đây là thứ dùng được để luận.
      if (/chủ về|chủ sự|nên |kỵ |ưa |dễ |thì /.test(low)) score += 2;
      if (/nếu gặp|nếu có|dù không|gặp .* là chủ về/.test(low)) score += 2;

      // Câu giảng giải khái niệm / lịch sử cách cục: tốn token mà không luận được.
      if (
        /cách cục|cổ quyết|cổ ca|tức là|chẳng hạn|người đời|theo cách cục|điệu thủ|bản khắc|chép tay|đời nguyên|đời minh|ca quyết/.test(
          low,
        )
      ) {
        score -= 6;
      }

      if (sent.length >= 45 && sent.length <= 220) score += 1;
      if (/địa bàn|nhân bàn/i.test(sent)) score -= 4;

      cands.push({ text: sent, score, order: order++, heading: p.heading });
    }
  }

  // 3. Chọn theo điểm tới khi đủ ngân sách, rồi trả về đúng thứ tự gốc
  const ranked = [...cands].sort((a, b) => b.score - a.score);
  const picked: Cand[] = [];
  let used = 0;
  for (const c of ranked) {
    if (used + c.text.length > budget) continue;
    picked.push(c);
    used += c.text.length;
    if (used >= budget * 0.95) break;
  }
  picked.sort((a, b) => a.order - b.order);

  if (!picked.length) return [];

  // Gom lại thành 1 passage, mỗi câu một dòng để LLM dễ đọc
  return [
    {
      heading: `Trích lọc theo lá số (${picked.length} câu, ${used} ký tự)`,
      // Mỗi câu một dòng: LLM đọc được từng khẳng định rời, dễ đối chiếu hơn một khối
      text: picked.map((c) => c.text).join('\n'),
      source: picked[0].heading,
    },
  ];
}

export interface ParseOptions {
  /** Ngân sách ký tự cho mỗi cung (mặc định 2600). */
  maxCharsPerPalace?: number;
  /** Ngân sách ký tự cho phần tổng quan (mặc định 4200). */
  maxCharsOverview?: number;
  /** Ngân sách ký tự cho mỗi đại vận (mặc định 900). */
  maxCharsPerDecadal?: number;
  /** Giữ tối đa bao nhiêu đại vận (mặc định 8). */
  maxDecadals?: number;
  /** Bỏ block data-dump (mặc định true). */
  dropDataDump?: boolean;
  /**
   * Nén theo câu: bỏ đoạn khác bàn, khử trùng, chấm điểm theo sao của cung.
   * Bật khi cần tiết kiệm token (mặc định true).
   */
  compress?: boolean;
  /**
   * Gợi ý độ liên quan: với mỗi cung, danh sách tên sao (lowercase) đang tọa thủ.
   * Đoạn văn nào nhắc tới các sao này sẽ được ưu tiên giữ lại khi cắt ngân sách.
   * Không truyền → giữ nguyên thứ tự tài liệu.
   */
  hints?: Partial<Record<PalaceKey, string[]>>;
}

const DEFAULTS: Required<Omit<ParseOptions, 'hints'>> = {
  maxCharsPerPalace: 2600,
  maxCharsOverview: 4200,
  maxCharsPerDecadal: 900,
  maxDecadals: 8,
  dropDataDump: true,
  compress: true,
};

/* ------------------------------ CLEANING ------------------------------ */

/** Chuẩn hoá khoảng trắng, bỏ ký tự rác. */
function cleanText(s: string): string {
  return s
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * Block "data dump": tiêu đề dạng "Thông tin cung X thiên bàn ở vị trí ..."
 * hoặc nội dung chỉ là danh sách sao ("- Tọa thủ: ...", "- Xung chiếu: ...").
 */
function isDataDump(heading: string, text: string): boolean {
  if (/^thông tin cung .*(thiên bàn|địa bàn|nhân bàn)/i.test(heading)) return true;
  const starListMarkers = (text.match(/\((M|V|Đ|H|B|L)\)/g) ?? []).length;
  const starListLines = (text.match(/^-\s*(Tọa thủ|Xung chiếu|Tam hợp|Giáp cung)/gim) ?? []).length;
  if (starListLines >= 2) return true;
  // Tỷ lệ marker sao quá cao so với độ dài → thuần liệt kê
  if (starListMarkers > 12 && text.length < 1800) return true;
  return false;
}

/** Chọn các đoạn quan trọng nhất trong ngân sách ký tự. */
function budgetPassages(
  passages: RawPassage[],
  budget: number,
  dropped?: string[],
): RawPassage[] {
  const out: RawPassage[] = [];
  let used = 0;

  for (const p of passages) {
    if (used >= budget) {
      dropped?.push(p.heading);
      continue;
    }

    const remain = budget - used;
    if (p.text.length <= remain) {
      out.push(p);
      used += p.text.length;
      continue;
    }

    /*
     * KHÔNG BAO GIỜ cắt giữa câu.
     *
     * Bản cũ cắt `slice(0, remain) + '…'`, sinh đoạn nửa câu. LLM gặp đoạn cụt thì
     * bỏ luôn cả đoạn — đã thấy thật trong editorialNotes: "đoạn Thất tinh định
     * điểm bị cắt dở nên không dùng được". Tức là vừa mất token vừa mất dữ liệu,
     * tệ hơn là không gửi gì.
     *
     * Nay: lùi về ranh giới câu cuối cùng còn nằm trong ngân sách. Không tìm được
     * ranh giới nào đủ dài → bỏ hẳn đoạn, ghi vào `dropped` để caller biết đang
     * thiếu gì thay vì im lặng.
     */
    const slice = p.text.slice(0, remain);
    const boundaries = [...slice.matchAll(/[.!?](?=\s|$)/g)];
    const last = boundaries.length ? boundaries[boundaries.length - 1].index! : -1;

    if (last >= 180) {
      out.push({ ...p, text: slice.slice(0, last + 1).trimEnd(), truncated: true });
      used = budget;
    } else {
      dropped?.push(p.heading);
    }
  }
  return out;
}

/**
 * Xếp hạng đoạn văn theo độ liên quan tới lá số thực tế, TRƯỚC khi cắt ngân sách.
 *
 * Vì sao cần: cohoc trả 400+ đoạn/cung, trong đó phần lớn là "cách cục" chung
 * (Văn Xương Tả Phù, Cơ Lương gia hội...) chỉ đúng khi lá số có đúng bộ sao đó.
 * Nếu giữ theo thứ tự tài liệu, ngân sách 2600 ký tự bị 2 bài luận cách cục ăn hết
 * và đoạn luận trực tiếp về sao thủ mệnh bị đẩy ra ngoài.
 */
function rankPassages(passages: RawPassage[], hints: string[] | undefined): RawPassage[] {
  if (!hints?.length) return passages;
  const hinted = hints.map((h) => h.toLowerCase());

  const scored = passages.map((p, i) => {
    const body = (p.heading + ' ' + p.text).toLowerCase();
    let score = 0;
    for (const star of hinted) {
      if (p.heading.toLowerCase().includes(star)) score += 4;
      else if (body.includes(star)) score += 2;
    }
    // Đoạn có nội dung thực (không phải thơ phú ngắn) được ưu tiên nhẹ
    if (p.text.length > 500) score += 1;
    if (/cách|cổ ca|cổ quyết/i.test(p.heading)) score -= 1; // ưu tiên luận giải hơn là ca quyết
    return { p, i, score };
  });

  return scored
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.p);
}

/* --------------------------- SỐ LIỆU ĐỊNH LƯỢNG --------------------------- */
/*
 * cohoc tự tính 3 bảng số cho mỗi lá số. Trước đây parser xoá sạch <table> khi
 * làm sạch HTML nên mất trắng. Đây là dữ liệu engine nội bộ KHÔNG có.
 */

/** "-0.23" → -0.23 · "0.26 (VCD)" → 0.26 + note VCD */
function parseScore(raw: string): { value: number | null; note?: string } {
  const t = raw.replace(/\s+/g, ' ').trim();
  const n = Number.parseFloat(t);
  const note = /\(VCD\)/i.test(t) ? 'VCD' : undefined;
  return { value: Number.isFinite(n) ? n : null, note };
}

function palaceKeyOfName(name: string): PalaceKey | null {
  return PALACE_KEY_MAP[name.trim().toLowerCase()] ?? null;
}

export function parseCohocMetrics($: cheerio.CheerioAPI): CohocMetrics | null {
  const dauMinh: CohocMetrics['dauMinh'] = [];
  const cungKhi: CohocMetrics['cungKhi'] = [];
  const tiLeSaoTot: CohocMetrics['tiLeSaoTot'] = [];
  const totals: CohocMetrics['totals'] = { thienBan: null, diaBan: null, nhanBan: null };

  $('table').each((_, table) => {
    const cap = $(table).find('caption').first().text().trim();

    if (/Tinh \(bản thể\)/i.test(cap)) {
      $(table)
        .find('tr')
        .each((__, tr) => {
          const cells = $(tr)
            .find('td,th')
            .map((___, c) => $(c).text().trim())
            .get();
          if (!cells.length) return;
          const label = cells[0];

          if (/^tổng điểm$/i.test(label)) {
            totals.thienBan = parseScore(cells[1] ?? '').value;
            totals.diaBan = parseScore(cells[2] ?? '').value;
            totals.nhanBan = parseScore(cells[3] ?? '').value;
            return;
          }

          const key = palaceKeyOfName(label);
          if (!key) return;
          const a = parseScore(cells[1] ?? '');
          const b = parseScore(cells[2] ?? '');
          const c = parseScore(cells[3] ?? '');
          dauMinh.push({
            palaceKey: key,
            palaceName: label,
            thienBan: a.value,
            diaBan: b.value,
            nhanBan: c.value,
            note: b.note ?? a.note,
          });
        });
      return;
    }

    if (/cung khí Thiên bàn/i.test(cap)) {
      $(table)
        .find('tr')
        .each((__, tr) => {
          const cells = $(tr)
            .find('td')
            .map((___, c) => $(c).text().trim())
            .get();
          if (cells.length < 3) return;
          const key = palaceKeyOfName(cells[0]);
          if (!key) return;
          cungKhi.push({
            palaceKey: key,
            palaceName: cells[0],
            khi: cells[1],
            saoHiKi: cells[2].replace(/\s+/g, ' '),
          });
        });
      return;
    }

    if (/tỉ lệ sao tốt/i.test(cap)) {
      $(table)
        .find('tr')
        .each((__, tr) => {
          const cells = $(tr)
            .find('td')
            .map((___, c) => $(c).text().trim())
            .get();
          if (cells.length < 3) return;
          const key = palaceKeyOfName(cells[0]);
          if (!key) return;
          tiLeSaoTot.push({
            palaceKey: key,
            palaceName: cells[0],
            toaCung: cells[1],
            tamPhuong: cells[2],
          });
        });
    }
  });

  /* Ngũ hành hỉ kị: nằm trong prose, không phải bảng.
     Tách theo nhãn thay vì một regex dài — dễ đọc và không phụ thuộc dấu câu. */
  const bodyText = $('div.noi-dung').text().replace(/\s+/g, ' ');

  /* Cắt theo NHÃN KẾ TIẾP, không theo dấu câu: bản gốc không có dấu phân cách
     giữa "MỘC" và "Kị thần:" (chỉ có <b> bị bỏ khi lấy text). */
  const LABELS = ['Kị thần:', 'Nhàn thần:', 'Lai nhân cung:', 'Đế tinh tọa:', 'Dụng thần là'];

  const takeList = (label: string): string[] => {
    const i = bodyText.indexOf(label);
    if (i < 0) return [];
    let end = bodyText.length;
    for (const next of LABELS) {
      const j = bodyText.indexOf(next, i + label.length);
      if (j > 0 && j < end) end = j;
    }
    const dot = bodyText.indexOf('.', i + label.length);
    if (dot > 0 && dot < end) end = dot;

    return bodyText
      .slice(i + label.length, end)
      .split(/[,;]/)
      .map((x) => x.trim())
      .filter((x) => x.length > 1 && x.length < 20);
  };

  const dungIdx = bodyText.search(/Dụng thần là/i);
  const dungThan =
    dungIdx >= 0
      ? (bodyText
          .slice(dungIdx + 'Dụng thần là'.length, dungIdx + 40)
          .match(/[A-Za-zÀ-Ỹ]{2,}/)?.[0] ?? '')
      : '';

  const hiThan = takeList('Hỉ thần:');
  const kiThan = takeList('Kị thần:');
  const nhanThan = takeList('Nhàn thần:');

  const nguHanh =
    hiThan.length || kiThan.length || dungThan
      ? { hiThan, kiThan, nhanThan, dungThan }
      : null;

  if (!dauMinh.length && !cungKhi.length && !nguHanh) return null;
  return { dauMinh, totals, cungKhi, tiLeSaoTot, nguHanh };
}

/* ------------------- CỬU THIÊN PHI TINH / VƯỠNG SUY ------------------- */
/*
 * Ba khối dưới đây cohoc in dưới dạng VĂN XUÔI nhưng bản chất là dữ liệu:
 *   - "Phân tích Thất tinh định điểm": 3 câu, mỗi câu nói 1 cung + 1 vị trí.
 *   - "Phân tích cung Mệnh ẩn": 1 câu nói chi của Mệnh ẩn, 4 mệnh đề nói Tứ Hóa ẩn.
 *   - "Khảo sát vượng suy theo tinh đẩu": mỗi dòng 1 sao + ngũ hành + độ số.
 *
 * Vì sao phải bóc: khối Thất tinh dài 536 ký tự, nằm thứ 5 trong 8 khối tổng
 * quan (3.878 ký tự) nên bị ngân sách 3.000 cắt giữa câu — LLM từng ghi
 * "đoạn Thất tinh định điểm bị cắt dở nên không dùng được" vào editorialNotes.
 * Bóc thành field thì không còn gì để cắt, và prompt render gọn hơn 2 lần.
 */

function refOfPalaceName(name: string): CohocPalaceRef {
  const clean = name.trim();
  return { palaceName: clean, palaceKey: palaceKeyOfName(clean) };
}

export function parseCohocOverviewExtras(
  overview: RawPassage[],
): CohocOverviewExtras | null {
  const find = (re: RegExp) => overview.find((p) => re.test(p.heading));
  const out: CohocOverviewExtras = {
    thatTinh: null,
    menhAn: null,
    tinhDau: [],
    vuongSuyCung: null,
  };

  /* --- Thất tinh định điểm --- */
  const tt = find(/thất tinh/i);
  if (tt) {
    const thatTinh: NonNullable<CohocOverviewExtras['thatTinh']> = {};
    // "…ở trường hợp này tại cung Sự nghiệp (vị trí Thiên)."
    const re = /tại cung\s+([^().\n]{2,40}?)\s*\(vị trí\s*(Thiên|Địa|Nhân)\)/giu;
    for (const m of tt.text.matchAll(re)) {
      const slot = m[2].toLowerCase() as 'thiên' | 'địa' | 'nhân';
      const key = slot === 'thiên' ? 'thien' : slot === 'địa' ? 'dia' : 'nhan';
      thatTinh[key] = refOfPalaceName(m[1]);
    }
    // Câu liên kết: "Thiên Nhân hợp nhất: Sự nghiệp + Phụ mẫu = lấy cung Tật ách làm trung gian."
    const link = tt.text.match(/Thiên Nhân hợp nhất:\s*([^.]+)\./iu);
    if (link) thatTinh.linkage = link[1].trim();
    if (thatTinh.thien || thatTinh.dia || thatTinh.nhan) out.thatTinh = thatTinh;
  }

  /* --- Cung Mệnh Ẩn + Tứ Hóa ẩn --- */
  const ma = find(/mệnh ẩn/i);
  if (ma) {
    const branch = ma.text.match(/Mệnh\s*Ẩn\s*tại\s*([A-ZÀ-Ỹ]{2,6})/iu)?.[1] ?? '';
    const tuHoa: NonNullable<CohocOverviewExtras['menhAn']>['tuHoa'] = [];
    const re =
      /Hóa\s*(Lộc|Quyền|Khoa|Kỵ)\s*\[[^\]]*\]\s*ở cung\s*([^,.\n]{2,30}?)\s*ẩn tại\s*([A-ZÀ-Ỹ]{2,6})/giu;
    for (const m of ma.text.matchAll(re)) {
      tuHoa.push({
        hoa: m[1] as 'Lộc' | 'Quyền' | 'Khoa' | 'Kỵ',
        ...refOfPalaceName(m[2]),
        branch: m[3],
      });
    }
    if (branch || tuHoa.length) out.menhAn = { branch, tuHoa };
  }

  /* --- Vượng suy theo tinh đẩu --- */
  const td = find(/vượng suy theo tinh đẩu/i);
  if (td) {
    const re = /Sao\s+([^,\n]{2,30}?)\s*hành\s*([A-ZÀ-Ỹ]{2,8})\s*,?\s*độ số:\s*([\d.]+)/giu;
    for (const m of td.text.matchAll(re)) {
      out.tinhDau.push({
        star: m[1].trim(),
        element: m[2].trim(),
        doSo: Number.parseFloat(m[3]),
      });
    }
  }

  /* --- Vượng suy theo ngũ hành cung --- */
  const vc = find(/vượng suy theo ngũ hành cung/i);
  if (vc) out.vuongSuyCung = vc.text;

  const empty =
    !out.thatTinh && !out.menhAn && !out.tinhDau.length && !out.vuongSuyCung;
  return empty ? null : out;
}

/* ------------------------------- PARSER ------------------------------- */

export function parseCohocPage(
  html: string,
  sourceUrl: string,
  viewMode = 'Tổng hợp',
  options: ParseOptions = {},
): RawClassicalTexts {
  const opt = { ...DEFAULTS, ...options };
  const $ = cheerio.load(html);
  const warnings: string[] = [];

  const title = cleanText($('title').first().text());

  /* ---------- identity ---------- */
  const identity: RawClassicalTexts['identity'] = {};
  const h2 = cleanText($('h2').filter((_, el) => /lá số tử vi/i.test($(el).text())).first().text());
  if (h2) {
    const g = h2.match(/giới tính\s+(Nam|Nữ)/iu);
    const y = h2.match(/năm\s+(\p{Lu}\p{Ll}+\s+\p{Lu}\p{Ll}+)/u);
    const d = h2.match(/ngày\s+(\d+)/iu);
    const m = h2.match(/tháng\s+(\d+)/iu);
    const t = h2.match(/giờ\s+(\p{Lu}\p{Ll}+)/u);
    if (g) identity.genderText = g[1];
    if (y) identity.yearCanChi = y[1];
    if (d) identity.lunarDay = Number(d[1]);
    if (m) identity.lunarMonth = Number(m[1]);
    if (t) identity.timeName = t[1];
  }

  /* ---------- sections ---------- */
  const root = $('div.noi-dung');
  if (!root.length) {
    warnings.push('Không tìm thấy div.noi-dung — trang có thể đã đổi cấu trúc hoặc bị chặn.');
  }

  const overview: RawPassage[] = [];
  const bodyPalace: RawPassage[] = [];
  const palaces: Partial<Record<PalaceKey, RawPassage[]>> = {};
  const decadal: Record<string, RawPassage[]> = {};
  const annual: CohocAnnualSection[] = [];

  const seen = new Set<string>();
  let rawChars = 0;
  let cleanedChars = 0;
  let passageCount = 0;
  let dedupedCount = 0;
  let truncatedCount = 0;

  root.find('h3.giaidoan-cung').each((_, h3) => {
    const anchor = $(h3).find('a[name]').attr('name') ?? '';
    const sectionTitle = cleanText($(h3).text());

    const collected: RawPassage[] = [];

    // Duyệt các sibling cho tới h3 kế tiếp
    let node = $(h3).next();
    while (node.length && !node.is('h3.giaidoan-cung')) {
      if (node.is('div.giaidoan')) {
        const heading = cleanText(node.find('h4.nguyennhan').first().text());
        const p = node.find('p.ketqua').first();

        // Bỏ bảng số liệu, giữ prose
        p.find('table').remove();
        p.find('br').replaceWith('\n');

        const text = cleanText(p.text());
        const source = cleanText(node.find('em.thamkhao').first().text()) || undefined;

        rawChars += text.length;
        passageCount++;

        if (text.length >= 60 && !(opt.dropDataDump && isDataDump(heading, text))) {
          const sig = text.slice(0, 160);
          if (seen.has(sig)) {
            dedupedCount++;
          } else {
            seen.add(sig);
            cleanedChars += text.length;
            collected.push({ heading, text, source });
          }
        }
      }
      node = node.next();
    }

    if (!collected.length) return;

    /* --- phân loại section --- */
    if (anchor === 'tong-quan') {
      overview.push(...collected);
      return;
    }
    if (anchor === 'than') {
      bodyPalace.push(...collected);
      return;
    }
    if (anchor.startsWith('dai-van')) {
      const range = anchor.replace('dai-van-', '').replace(/-tuoi$/, '');
      if (Object.keys(decadal).length < opt.maxDecadals) {
        decadal[range] = collected;
      }
      return;
    }
    if (anchor.startsWith('van-nam')) {
      /* Lưu niên: trước đây bỏ vì "ta tự tính", nhưng cohoc có bình giải riêng
         cho từng vận năm — bỏ là mất dữ liệu. Giữ lại, cắt ngân sách như đại vận. */
      const age = anchor.match(/van-nam-(\d+)/)?.[1] ?? '';
      if (age && annual.length < 6) {
        annual.push({ age, label: sectionTitle, passages: collected });
      }
      return;
    }

    const key = SECTION_TO_PALACE[anchor];
    if (key) {
      palaces[key] = [...(palaces[key] ?? []), ...collected];
    } else if (sectionTitle) {
      warnings.push(`Bỏ qua section không map được: "${sectionTitle}" (#${anchor})`);
    }
  });

  /* ---------- áp ngân sách ---------- */
  const droppedHeadings: string[] = [];
  const overviewOut = budgetPassages(overview, opt.maxCharsOverview, droppedHeadings);
  const bodyOut = budgetPassages(bodyPalace, opt.maxCharsPerPalace, droppedHeadings);

  const palacesOut: Partial<Record<PalaceKey, RawPassage[]>> = {};
  for (const [k, v] of Object.entries(palaces) as Array<[PalaceKey, RawPassage[]]>) {
    if (opt.compress) {
      palacesOut[k] = compressClassicalPassages(v, opt.hints?.[k] ?? [], opt.maxCharsPerPalace);
    } else {
      palacesOut[k] = budgetPassages(rankPassages(v, opt.hints?.[k]), opt.maxCharsPerPalace);
    }
  }

  const decadalOut: Record<string, RawPassage[]> = {};
  for (const [k, v] of Object.entries(decadal)) {
    decadalOut[k] = budgetPassages(v, opt.maxCharsPerDecadal);
  }

  const annualOut = annual.map((a) => ({
    ...a,
    passages: budgetPassages(a.passages, opt.maxCharsPerDecadal),
  }));

  truncatedCount = [
    ...overviewOut,
    ...bodyOut,
    ...Object.values(palacesOut).flat(),
    ...Object.values(decadalOut).flat(),
    ...annualOut.flatMap((a) => a.passages),
  ].filter((p) => p.truncated).length;

  if (droppedHeadings.length) {
    // Ghi lại thứ bị bỏ vì ngân sách — trước đây im lặng nên không ai biết prompt thiếu gì.
    warnings.push(
      `Bỏ ${droppedHeadings.length} khối vượt ngân sách: ${[...new Set(droppedHeadings)].slice(0, 6).join(' · ')}`,
    );
  }

  const missing = (Object.keys(SECTION_TO_PALACE) as string[]).filter(
    (a) => SECTION_TO_PALACE[a] && !palacesOut[SECTION_TO_PALACE[a]],
  );
  if (missing.length) {
    warnings.push(`Thiếu bình giải cho: ${[...new Set(missing.map((a) => SECTION_TO_PALACE[a]))].join(', ')}`);
  }

  return {
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    viewMode,
    title,
    identity,
    overview: overviewOut,
    bodyPalace: bodyOut,
    palaces: palacesOut,
    decadal: decadalOut,
    annual: annualOut,
    metrics: parseCohocMetrics($),
    extras: parseCohocOverviewExtras(overviewOut),
    stats: {
      rawChars,
      cleanedChars,
      passageCount,
      dedupedCount,
      truncatedCount,
    },
    warnings,
  };
}

/* ------------------------ CROSS-CHECK VỚI MODULE 1 ------------------------ */

export interface CohocChartSnapshot {
  /** Cung → { chi, chính tinh (tên gốc) }. */
  palaces: Array<{ name: string; branch: string; majorStars: string[] }>;
}

/**
 * Bóc bảng 12 cung của cohoc để đối chiếu với lá số iztro dựng ra.
 * Mục đích: phát hiện lệch phái (an sao khác nhau) trước khi đưa vào LLM.
 */
export function parseCohocChartTable(html: string): CohocChartSnapshot {
  const $ = cheerio.load(html);
  const palaces: CohocChartSnapshot['palaces'] = [];
  const seen = new Set<string>();

  $('td.cung').each((_, td) => {
    const cell = $(td);
    const name = cleanText(cell.find('.cung-tencung').first().text());
    const branchRaw = cleanText(cell.find('.cung-diachi').first().text());
    // cohoc in "Đ. Hợi" / "T. Tị" / "Q. Mùi" / "Ấ. Dậu" — chữ đầu là viết tắt
    // THIÊN CAN. Không được giới hạn trong [A-ZĐ]: chữ "Ấ" (can Ất) không thuộc
    // đó nên cung Dậu của những lá số Canh/Ất bị giữ nguyên "Ấ. Dậu", mất neo
    // địa chi và bị cross-check bỏ qua.
    const branch = branchRaw.replace(/^\p{L}\.\s*/u, '').trim();
    // Mỗi chính tinh nằm trong 1 <p> riêng → đọc theo node, không split chuỗi
    // (chuỗi bị join mất dấu phân cách: "LIÊM TRINH THIÊN TƯỚNG").
    const starNodes = cell.find('.chinh-tinh p');
    const majorStars = (
      starNodes.length
        ? starNodes.map((_, el) => cleanText($(el).text())).get()
        : cleanText(cell.find('.chinh-tinh').first().text()).split(/\n|,/)
    )
      .map((s) => s.replace(/\((?:M|V|Đ|H|B|L)\)/g, '').trim())
      .filter((s) => s.length > 0);

    // Trang có 2 bảng (thiên bàn + địa bàn) → chỉ giữ bảng đầu tiên
    const sig = `${name.toLowerCase()}|${branch}`;
    if (name && branch && !seen.has(sig)) {
      seen.add(sig);
      palaces.push({ name, branch, majorStars });
    }
  });

  return { palaces };
}

/** Chuẩn hoá biến thể chính tả địa chi (iztro "Tỵ" vs cohoc "Tị"). */
function canonicalBranch(b: string): string {
  // iztro dùng "Tỵ"/"Tý", cohoc dùng "Tị"/"Tí" — quy i→y để so khớp.
  // Vừa bỏ nốt chữ can viết tắt ("Q. Mùi", "Ấ. Dậu") cho chắc: parser đã tách
  // sẵn, nhưng nếu ai gửi vào kèm chữ can mà chưa tách thì so theo chi sẽ lệch
  // âm thầm thay vì báo rõ tên cung lệch.
  return b
    .trim()
    .replace(/^\p{L}\.\s*/u, '')
    .toLowerCase()
    .replace(/ị/g, 'ỵ')
    .replace(/í/g, 'ý');
}

/**
 * So khớp 2 lá số; trả về danh sách cảnh báo (rỗng = khớp).
 *
 * SO THEO ĐỊA CHI, KHÔNG THEO TÊN: hai bên gọi cung khác nhau — cohoc viết
 * "SỰ NGHIỆP", "GIAO HỮU", "MỆNH Thân" trong khi engine dùng "Quan Lộc",
 * "Nô Bộc", "Mệnh". So theo tên thì 3/12 cung bị bỏ qua IM LẶNG: cross-check
 * vẫn báo "khớp" mà không hề kiểm tra những cung đó (đã xảy ra thật).
 */
export function crossCheckChart(
  ours: Array<{ name: string; branch: string; majorStars: Array<{ name: string }> }>,
  theirs: CohocChartSnapshot,
): string[] {
  const issues: string[] = [];
  if (!theirs.palaces.length) return ['Không đọc được bảng lá số của cohoc để đối chiếu.'];

  for (const mine of ours) {
    // Ưu tiên neo địa chi (mỗi cung một chi, không đổi tên được); tên chỉ là
    // neo phụ cho trường hợp hai bên trùng cách gọi.
    const byBranch = theirs.palaces.find(
      (t) => canonicalBranch(t.branch) === canonicalBranch(mine.branch),
    );
    const t = byBranch ?? theirs.palaces.find((x) => x.name.toLowerCase() === mine.name.toLowerCase());
    if (!t) {
      issues.push(`Không thấy cung ${mine.name} (${mine.branch}) trong bảng cohoc — cung này KHÔNG được đối chiếu.`);
      continue;
    }
    if (canonicalBranch(t.branch) !== canonicalBranch(mine.branch)) {
      issues.push(`Lệch vị trí cung ${t.name}: iztro=${mine.branch}, cohoc=${t.branch}`);
      continue;
    }
    const myStars = mine.majorStars.map((s) => s.name).sort().join(',');
    const myStarsLower = mine.majorStars
      .map((s) => s.name.toLowerCase())
      .sort()
      .join(',');
    const theirStars = t.majorStars
      .map((s) => s.toLowerCase())
      .sort()
      .join(',');
    // So cả khi một bên rỗng (cung vô chính diệu): điều kiện "theirStars có dữ
    // liệu" trước đây khiến mọi cung VCD bị bỏ sót.
    if (theirStars !== myStarsLower) {
      issues.push(`Lệch chính tinh cung ${t.name}: iztro=[${myStars}], cohoc=[${t.majorStars.join(', ')}]`);
    }
  }
  return issues;
}
