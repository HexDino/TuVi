/**
 * lib/tuvi/chat-bundle.ts — CẦU NỐI CHAT WEB (chi phí 0 đồng)
 * ---------------------------------------------------------------------------
 * VẤN ĐỀ: chat web của Claude/Gemini không có API, và điều khoản cấm tự động
 * hoá. Nhưng **con người dùng chat web là hoàn toàn hợp lệ** — đó chính là cách
 * sản phẩm được thiết kế để dùng.
 *
 * GIẢI PHÁP: đổi vai trò. App không gọi model; app soạn sẵn một "gói" (prompt
 * đầy đủ + mô tả định dạng đầu ra), người dùng dán vào chat, rồi dán kết quả
 * về. App validate, ghép, và **lưu cache** — từ đó lá số đó phục vụ vô hạn với
 * 0 token API.
 *
 * VÌ SAO ĐÁNG LÀM: một lá số chỉ cần viết một lần. Đổi lại 3-5 phút copy-paste,
 * người dùng không trả đồng nào cho lượt xem thứ 2, thứ 100, hay lượt xem của
 * người khác mở link chia sẻ.
 *
 * VÌ SAO CHIA 4 KHỐI CHỨ KHÔNG 1: đã đo — JSON 12 cung (~15k token) trong một
 * lần trả lời thì model hay làm hỏng cấu trúc. Bốn khối nhỏ, mỗi khối một dấu
 * phân cách rõ ràng, thì parse được và lỗi cô lập (sai khối nào báo khối đó).
 * ---------------------------------------------------------------------------
 */

import type { NormalizedChartJSON, PalaceKey, RawClassicalTexts } from '@/types/tuvi';
import {
  OverviewPartSchema,
  PalaceGroupPartSchema,
  PALACE_GROUPS,
  type TuViFullReport,
} from '@/schemas/report.schema';
import { TUVIAST_SYSTEM_PROMPT, PROMPT_VERSION } from './prompts';
import {
  buildChartContext,
  buildClassicalSubset,
  buildFewShot,
  chatInputSignature,
} from './prompt-builder';
import { assembleReport } from './astrology-agent.service';
import { makeReportKey } from './report-cache';

export interface ChatBundle {
  /** Khoá cache mà báo cáo nhập về sẽ được lưu dưới đó. */
  cacheKey: string;
  /** Toàn bộ nội dung cần dán vào chat. */
  prompt: string;
  chars: number;
  /** Ước lượng token, hệ số 1,2 ký tự/token cho tiếng Việt (đã đo). */
  tokenEstimate: number;
}

const GROUP_META: Array<{ n: number; label: string; keys: readonly PalaceKey[] }> = [
  { n: 2, label: 'TAM HỢP SỰ NGHIỆP (Mệnh · Quan Lộc · Tài Bạch · Thiên Di)', keys: PALACE_GROUPS.career },
  { n: 3, label: 'TAM HỢP GIA ĐẠO (Phúc Đức · Phu Thê · Tử Nữ · Điền Trạch)', keys: PALACE_GROUPS.family },
  { n: 4, label: 'QUAN HỆ XÃ HỘI & SỨC KHOẺ (Phụ Mẫu · Huynh Đệ · Nô Bộc · Tật Ách)', keys: PALACE_GROUPS.social },
];

/**
 * Mô tả cấu trúc JSON một cung — viết tay cho gọn nhưng phải khớp
 * `schemas/report.schema.ts`.
 *
 * Export để bản hướng dẫn Gem dùng CHUNG nguồn: nếu Gem dạy model một cấu trúc
 * khác với schema thì mọi báo cáo nhập về sẽ hỏng validate. Dùng chung chuỗi là
 * cách duy nhất để hai bên không lệch.
 */
export const SHAPE_PALACE = `{
  "palaceKey": "menh | quan_loc | tai_bach | thien_di | phuc_duc | phu_the | tu_nu | dien_trach | phu_mau | huynh_de | no_boc | tat_ach",
  "palaceName": "Mệnh | Quan Lộc | ... (tên hiển thị)",
  "mainStars": "chính tinh + trạng thái, ví dụ \\"Tham Lang (Miếu)\\" hoặc \\"Vô chính diệu\\"",
  "verdict": "thuan_loi | trung_binh | thu_thach",
  "headline": "MỘT câu, tối đa 25 từ, nêu sao + hệ quả",
  "narrative": "300-650 ký tự, TỐI ĐA 2 đoạn, ngăn bằng \\\\n\\\\n. Đoạn 1 bản chất + hệ quả cụ thể. Đoạn 2 cái giá và điều nên làm khác đi. KHÔNG gạch đầu dòng.",
  "strengths": [{ "title": "...", "detail": "25+ ký tự, kịch bản nhân quả", "evidence": ["Tham Lang (Miếu)"] }],
  "risks":     [{ "title": "...", "detail": "25+ ký tự", "evidence": ["Hóa Kỵ tại Nô Bộc"] }],
  "strategy": ["10+ ký tự", "10+ ký tự"],
  "score": 79,
  "scoreDelta": 0,
  "scoreReason": "vì sao giữ nguyên hoặc lệch"
}`;

function buildPrompt(
  chart: NormalizedChartJSON,
  classical: RawClassicalTexts | null,
  name?: string,
): string {
  const allKeys = Object.values(PALACE_GROUPS).flat() as PalaceKey[];

  const lines: string[] = [];

  lines.push('# NHIỆM VỤ');
  lines.push(
    `Viết bản luận giải Tử Vi Đẩu Số cho ${name ? `đương số ${name}` : 'đương số'} (${chart.meta.gender === 'nam' ? 'Nam' : 'Nữ'}, sinh ${chart.meta.solarDate} âm lịch ${chart.meta.lunarDateText}, ${chart.meta.timeName}, xem hạn năm ${chart.meta.viewingYear}).`,
  );
  lines.push('');
  lines.push(
    'Trả lời bằng **đúng 4 khối JSON**, mỗi khối mở đầu bằng dòng phân cách như dưới đây. Không viết lời dẫn, không giải thích ngoài 4 khối, không bọc trong ```json.',
  );
  lines.push('');
  lines.push('```');
  lines.push('=== PHẦN 1: TỔNG QUAN ===');
  lines.push('{ ... }');
  lines.push('=== PHẦN 2: TAM HỢP SỰ NGHIỆP ===');
  lines.push('{ "palaces": [ ...4 cung... ] }');
  lines.push('=== PHẦN 3: TAM HỢP GIA ĐẠO ===');
  lines.push('{ "palaces": [ ...4 cung... ] }');
  lines.push('=== PHẦN 4: QUAN HỆ XÃ HỘI & SỨC KHOẺ ===');
  lines.push('{ "palaces": [ ...4 cung... ] }');
  lines.push('```');
  lines.push('');

  lines.push('# LUẬT NGHỀ');
  lines.push(TUVIAST_SYSTEM_PROMPT);
  lines.push('');

  lines.push('# DỮ LIỆU LÁ SỐ');
  lines.push(buildChartContext(chart));
  lines.push('');

  lines.push('# VĂN BẢN CỔ HỌC');
  lines.push(buildClassicalSubset(classical, allKeys, true));
  lines.push('');

  lines.push('# ĐỊNH DẠNG ĐẦU RA');
  lines.push('');
  lines.push('**PHẦN 1** — object:');
  lines.push('```json');
  lines.push(`{
  "meta": {
    "solarDate": "${chart.meta.solarDate}",
    "lunarDate": "${chart.meta.lunarDateText}",
    "chineseDate": "${chart.meta.chineseDate}",
    "gender": "${chart.meta.gender}",
    "viewingYear": ${chart.meta.viewingYear},
    "confidence": "cao | trung_binh | thap"
  },
  "overview": {
    "opening": "40+ ký tự, tóm tắt khách quan: trục chính + điểm nghẽn",
    "thienDiaNhan": {
      "verdict": "rat_thuan | thuan | trung_tinh | veo | nhieu_vat_va",
      "analysis": "80+ ký tự: tương quan Năm sinh - Bản mệnh nạp âm - Cục"
    },
    "cachCuc": {
      "name": "tên cách cục chủ đạo",
      "explanation": "40+ ký tự, giải thích bằng ngôn ngữ hiện đại",
      "classicalQuote": "câu phú chữ Hán (tuỳ chọn)",
      "quoteMeaning": "bắt buộc nếu có classicalQuote"
    },
    "thanCu": { "palace": "Thân cư cung gì", "meaning": "40+ ký tự" },
    "personality": {
      "traits": [{ "title": "...", "detail": "40+ ký tự" }],
      "coreCompetencies": ["...", "..."],
      "blindSpots": ["..."]
    },
    "overallScore": 76,
    "oneLineVerdict": "20+ ký tự, một câu chốt chân dung"
  },
  "actionPlan": {
    "decadalAnalysis": [
      { "range": "34-43", "theme": "12+ ký tự", "opportunity": "10+ ký tự", "risk": "10+ ký tự", "action": "tich_luy | but_pha | phong_thu | chuyen_huong" }
    ],
    "goldenRules": [{ "rule": "10+ ký tự", "rationale": "12+ ký tự" }]
  },
  "editorialNotes": ["mâu thuẫn trong văn bản cổ học đã phân xử thế nào"]
}`);
  lines.push('```');
  lines.push('');
  lines.push('Ràng buộc PHẦN 1: `traits` 3-4 mục · `coreCompetencies` 2-4 · `blindSpots` 1-3 · `decadalAnalysis` 3-6 · `goldenRules` **đúng 3**.');
  lines.push('');

  for (const g of GROUP_META) {
    lines.push(`**PHẦN ${g.n}** — ${g.label}. Object \`{ "palaces": [ ... ] }\`, **đúng 4 phần tử**, theo thứ tự: ${g.keys.join(', ')}.`);
    lines.push('Mỗi phần tử có dạng:');
    lines.push('```json');
    lines.push(SHAPE_PALACE);
    lines.push('```');
    lines.push(
      'Ràng buộc mỗi cung: `strengths` 1-3 · `risks` 1-3 · `strategy` 2-4 · `narrative` 300-650 ký tự · `score` lấy điểm ENGINE trong bảng, lệch tối đa ±8 và phải ghi `scoreDelta` + `scoreReason`.',
    );
    lines.push('');
  }

  /*
   * VÍ DỤ ĐẦU RA + BẢNG CHIỀU SÂU THEO ĐIỂM.
   * Gói kỹ năng đã có (đặt trong payload), còn đường chat thường thì thiếu —
   * cùng một người dùng, hai đường cho chất lượng khác nhau mà không ai báo.
   * Đặt trước "# NHẮC LẠI": ví dụ phải nằm sau luật và sau dữ liệu điểm, để
   * model thấy mẫu đúng ngay trước khi viết.
   */
  lines.push(buildFewShot());
  lines.push('');

  lines.push('# NHẮC LẠI');
  lines.push(
    'Chỉ 4 khối JSON, đúng 4 dấu phân cách. Không markdown ngoài 4 khối. Không giải thích. Nếu một cung không đủ dữ liệu, vẫn phải viết đủ trường với nội dung thận trọng.',
  );

  return lines.join('\n');
}

/** Khoá cache cho báo cáo nhập từ chat — độc lập với model, để đổi model không mất bản đã viết. */
export function chatCacheKey(
  chart: NormalizedChartJSON,
  classical: RawClassicalTexts | null,
  name?: string,
): string {
  return makeReportKey({
    prompts: chatInputSignature(chart, classical, name),
    modelChain: 'chat-manual',
    temperature: 0,
    promptVersion: PROMPT_VERSION,
    mode: 'chat',
  });
}

export function buildChatBundle(input: {
  chart: NormalizedChartJSON;
  classical: RawClassicalTexts | null;
  name?: string;
}): ChatBundle {
  const prompt = buildPrompt(input.chart, input.classical, input.name);
  return {
    cacheKey: chatCacheKey(input.chart, input.classical, input.name),
    prompt,
    chars: prompt.length,
    tokenEstimate: Math.round(prompt.length / 1.2),
  };
}

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
 * Chấp nhận nhiều biến thể vì model hay đổi: `=== PHẦN 1: ... ===`,
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
    // Khối trùng số (model nhắc lại tiêu đề) → giữ khối dài hơn
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
          const merged = assembleReport({
            overview: obj,
            groups: { career: { palaces: obj.careerGroup }, family: { palaces: obj.familyGroup }, social: { palaces: obj.socialGroup } },
          });
          return { ok: true, report: merged };
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
        ? 'Nội dung này là văn xuôi, không phải JSON — không lưu vào app được.'
        : 'Không tìm thấy dấu phân cách "=== PHẦN 1: ... ===" trong nội dung dán vào.',
      detail: looksLikeProse
        ? 'Muốn lưu bản luận vào app: mở lại hộp thoại, chọn định dạng "JSON", dán dữ liệu lá số lại và lấy câu trả lời mới.'
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
