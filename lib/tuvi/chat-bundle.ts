/**
 * lib/tuvi/chat-bundle.ts — PARSE CÂU TRẢ LỜI TỪ GEMINI
 * ---------------------------------------------------------------------------
 * Ứng dụng không gọi mô hình. Người dùng cài gói kỹ năng trong Gemini, dán dữ liệu lá
 * số, rồi dán câu trả lời về đây. File này lo phần nhận lại:
 *   - tách 4 khối theo dấu phân cách;
 *   - validate từng khối bằng Zod;
 *   - kiểm đúng bộ cung của từng Tam Hợp;
 *   - ghép thành báo cáo hoàn chỉnh.
 *
 * VÌ SAO CHIA 4 KHỐI CHỨ KHÔNG 1: JSON 12 cung (~15k token) trong một lần trả
 * lời thì mô hình hay làm hỏng cấu trúc. Bốn khối nhỏ, mỗi khối một dấu phân cách
 * rõ ràng, thì parse được và lỗi cô lập (sai khối nào báo khối đó).
 * ---------------------------------------------------------------------------
 */

import type { PalaceKey } from '@/types/tuvi';
import {
  OverviewPartSchema,
  PalaceGroupPartSchema,
  PALACE_GROUPS,
  type TuViFullReport,
} from '@/schemas/report.schema';
import { assembleReport } from './report-assembly';

const GROUP_META: Array<{ n: number; label: string; keys: readonly PalaceKey[] }> = [
  { n: 2, label: 'TAM HỢP SỰ NGHIỆP (Mệnh · Quan Lộc · Tài Bạch · Thiên Di)', keys: PALACE_GROUPS.career },
  { n: 3, label: 'TAM HỢP GIA ĐẠO (Phúc Đức · Phu Thê · Tử Nữ · Điền Trạch)', keys: PALACE_GROUPS.family },
  { n: 4, label: 'QUAN HỆ XÃ HỘI & SỨC KHỎE (Phụ Mẫu · Huynh Đệ · Nô Bộc · Tật Ách)', keys: PALACE_GROUPS.social },
];

/**
 * Mô tả cấu trúc JSON một cung — viết tay cho gọn nhưng phải khớp
 * `schemas/report.schema.ts`.
 *
 * Export để bản hướng dẫn kỹ năng dùng CHUNG nguồn: nếu kỹ năng dạy mô hình một cấu trúc
 * khác với schema thì mọi báo cáo nhập về sẽ hỏng validate. Dùng chung chuỗi là
 * cách duy nhất để hai bên không lệch.
 */
export const SHAPE_PALACE = `{
  "palaceKey": "menh | quan_loc | tai_bach | thien_di | phuc_duc | phu_the | tu_nu | dien_trach | phu_mau | huynh_de | no_boc | tat_ach",
  "palaceName": "Mệnh | Quan Lộc | ... (tên hiển thị)",
  "mainStars": "chính tinh + trạng thái, ví dụ \\"Tham Lang (Miếu)\\" hoặc \\"Vô chính diệu\\"",
  "verdict": "thuan_loi | trung_binh | thu_thach",
  "headline": "MỘT câu, tối đa 25 từ, nêu sao + hệ quả",
  "narrative": "300-650 ký tự, TỐI ĐA 2 đoạn, ngắt bằng \\\\n\\\\n. Đoạn 1 bản chất + hệ quả cụ thể. Đoạn 2 cái giá và điều nên làm khác đi. KHÔNG gạch đầu dòng.",
  "strengths": [{ "title": "...", "detail": "25+ ký tự, kịch bản nhân quả", "evidence": ["Tham Lang (Miếu)"] }],
  "risks":     [{ "title": "...", "detail": "25+ ký tự", "evidence": ["Hóa Kỵ tại Nô Bộc"] }],
  "strategy": ["10+ ký tự", "10+ ký tự"],
  "score": 79,
  "scoreDelta": 0,
  "scoreReason": "vì sao giữ nguyên hoặc lệch"
}`;

/* ------------------------------ PARSE ------------------------------ */

export type ChatImportResult =
  | { ok: true; report: TuViFullReport }
  | { ok: false; error: string; detail?: string };

/** Bỏ code fence và cắt từ { đầu tiên tới } cuối cùng. */
function extractJson(raw: string): string | null {
  let t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  return t.slice(start, end + 1);
}

/**
 * Tách 4 khối theo dấu phân cách.
 *
 * Chấp nhận nhiều biến thể vì mô hình hay đổi: `=== PHẦN 1: ... ===`,
 * `**PHẦN 1**`, `PHẦN 1 —`, có/không dấu hai chấm. Chỉ cần đúng SỐ THỨ TỰ.
 */
function splitParts(text: string): Map<number, string> {
  const out = new Map<number, string>();
  const re = /(?:^|\n)[^\n]{0,40}?PH[ẦA]N\s*([1-4])[^\n]{0,80}?(?:\n|$)/gi;
  const marks: Array<{ n: number; start: number; end: number }> = [];
  for (const m of text.matchAll(re)) {
    marks.push({ n: Number(m[1]), start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  for (let i = 0; i < marks.length; i++) {
    const body = text.slice(marks[i].end, marks[i + 1]?.start ?? text.length);
    // Khối trùng số (mô hình nhắc lại tiêu đề) → giữ khối dài hơn
    const prev = out.get(marks[i].n);
    if (!prev || body.length > prev.length) out.set(marks[i].n, body);
  }
  return out;
}

export function parseChatResponse(text: string): ChatImportResult {
  const parts = splitParts(text);

  if (parts.size === 0) {
    // Thử đường dự phòng: người dùng dán nguyên một object báo cáo đầy đủ
    const whole = extractJson(text);
    if (whole) {
      try {
        const obj = JSON.parse(whole) as { careerGroup?: unknown; familyGroup?: unknown; socialGroup?: unknown };
        if (obj.careerGroup && obj.familyGroup && obj.socialGroup) {
          try {
            const merged = assembleReport({
              overview: obj,
              groups: { career: { palaces: obj.careerGroup }, family: { palaces: obj.familyGroup }, social: { palaces: obj.socialGroup } },
            });
            return { ok: true, report: merged };
          } catch (e) {
            return {
              ok: false,
              error: 'Báo cáo dán vào không khớp bộ cung của Tam Hợp.',
              detail: (e as Error).message.slice(0, 300),
            };
          }
        }
      } catch {
        /* rơi xuống lỗi bên dưới */
      }
    }
    /* Phân biệt hai kiểu sai rất khác nhau:
       - Người dùng dán VĂN XUÔI (kỹ năng trả lời ở chế độ đọc) → không phải lỗi,
         chỉ là chọn nhầm định dạng. Phải nói đúng đường sửa.
       - Dán thiếu/nát → bảo dán lại đầy đủ. */
    const looksLikeProse = text.length > 800 && !text.includes('{');
    return {
      ok: false,
      error: looksLikeProse
        ? 'Nội dung này là văn xuôi, không phải JSON — ứng dụng không nhập được.'
        : 'Không tìm thấy dấu phân cách "=== PHẦN 1: ... ===" trong nội dung dán vào.',
      detail: looksLikeProse
        ? 'Câu trả lời đang ở chế độ văn xuôi. Hãy mở lại hộp thoại, chọn định dạng "JSON", dán dữ liệu lá số lại và lấy câu trả lời mới.'
        : 'Hãy dán nguyên câu trả lời của chat, kể cả các dòng === PHẦN n ===.',
    };
  }

  const missing = [1, 2, 3, 4].filter((n) => !parts.has(n));
  if (missing.length) {
    return {
      ok: false,
      error: `Thiếu phần ${missing.join(', ')}.`,
      detail: `Đã thấy phần: ${[...parts.keys()].sort().join(', ')}. Chat có thể bị cắt giữa chừng — hãy yêu cầu viết tiếp phần còn lại.`,
    };
  }

  const p1Raw = extractJson(parts.get(1)!);
  if (!p1Raw) return { ok: false, error: 'Phần 1 không chứa JSON hợp lệ.' };

  let p1: unknown;
  try {
    p1 = JSON.parse(p1Raw);
  } catch (e) {
    return { ok: false, error: 'Phần 1: JSON bị lỗi cú pháp.', detail: (e as Error).message.slice(0, 200) };
  }

  const ov = OverviewPartSchema.safeParse(p1);
  if (!ov.success) {
    const first = ov.error.issues[0];
    return {
      ok: false,
      error: `Phần 1 sai cấu trúc tại "${first.path.join('.')}": ${first.message}`,
      detail: ov.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join(' | '),
    };
  }

  const groups: Record<string, unknown> = {};
  const keys = ['career', 'family', 'social'] as const;

  for (let i = 0; i < GROUP_META.length; i++) {
    const n = GROUP_META[i].n;
    const raw = extractJson(parts.get(n)!);
    if (!raw) return { ok: false, error: `Phần ${n} không chứa JSON hợp lệ.` };

    let obj: unknown;
    try {
      obj = JSON.parse(raw);
    } catch (e) {
      return { ok: false, error: `Phần ${n}: JSON bị lỗi cú pháp.`, detail: (e as Error).message.slice(0, 200) };
    }

    const parsed = PalaceGroupPartSchema.safeParse(obj);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return {
        ok: false,
        error: `Phần ${n} sai cấu trúc tại "${first.path.join('.')}": ${first.message}`,
        detail: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join(' | '),
      };
    }

    if (parsed.data.palaces.length !== 4) {
      return {
        ok: false,
        error: `Phần ${n} có ${parsed.data.palaces.length} cung, cần đúng 4.`,
        detail: `Các cung đã có: ${parsed.data.palaces.map((p) => p.palaceKey).join(', ')}`,
      };
    }

    /* Đúng 4 phần tử chưa đủ: mô hình có thể lặp một cung và bỏ cung khác. */
    const expected = GROUP_META[i].keys;
    const got = parsed.data.palaces.map((p) => p.palaceKey);
    const missing = expected.filter((k) => !got.includes(k));
    const extra = [...new Set(got.filter((k) => !expected.includes(k)))];
    const duplicated = [...new Set(got.filter((k, idx) => got.indexOf(k) !== idx))];
    if (missing.length || extra.length || duplicated.length) {
      return {
        ok: false,
        error: `Phần ${n} sai bộ cung của ${GROUP_META[i].label.split('(')[0].trim()}.`,
        detail: [
          missing.length ? `thiếu: ${missing.join(', ')}` : '',
          extra.length ? `thừa: ${extra.join(', ')}` : '',
          duplicated.length ? `lặp: ${duplicated.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
      };
    }

    groups[keys[i]] = parsed.data;
  }

  try {
    const report = assembleReport({ overview: p1, groups });
    return { ok: true, report };
  } catch (e) {
    return {
      ok: false,
      error: 'Ghép 4 phần thành báo cáo thất bại.',
      detail: (e as Error).message.slice(0, 300),
    };
  }
}
