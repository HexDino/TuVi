/**
 * lib/tuvi/skill-package.ts — ĐÓNG GÓI KỸ NĂNG CHO GEMINI (Skills)
 * ---------------------------------------------------------------------------
 * Gemini đã bỏ "Gems" (trợ lý có ô Instructions dán văn bản) và chuyển sang
 * "Kỹ năng" (Skills) — gói ZIP có `SKILL.md` ở thư mục chính, tên kỹ năng viết
 * dạng kebab-case trong frontmatter. Vì vậy không thể chỉ đưa một khối văn bản
 * để dán nữa; phải xuất file .zip.
 *
 * VẤN ĐỀ MÀ KỸ NĂNG NÀY GIẢI QUYẾT: khi người dùng dán dữ liệu lá số vào một
 * cuộc chat Gemini bình thường, câu trả lời bị ảnh hưởng bởi:
 *   - "Saved info" / ghi nhớ tài khoản (nghề nghiệp, sở thích, quê quán…);
 *   - thói quen trả lời mà model đã hình thành trong các chat khác;
 *   - nội dung các cuộc trò chuyện trước.
 * Với một lá số, đó là NHIỄU: bản luận lệch khỏi dữ liệu mà người đọc không biết
 * vì sao. Kỹ năng có bộ luật cố định, và mỗi lần gọi là một lượt riêng.
 *
 * GIỚI HẠN PHẢI NÓI RÕ: kỹ năng không tắt được "Saved info" ở cấp tài khoản.
 * Bộ luật có điều khoản yêu cầu bỏ qua, nhưng muốn chắc thì người dùng phải tự
 * tắt trong Cài đặt → Personalization. App không can thiệp được.
 *
 * NỘI DUNG PHẢI KHỚP SCHEMA: phần định dạng đầu ra dùng chung `SHAPE_PALACE` với
 * `chat-bundle.ts`. Lệch một field là mọi báo cáo nhập về hỏng validate — đã có
 * test trong `scripts/test-pipeline.ts` canh đúng chỗ này.
 * ---------------------------------------------------------------------------
 */

import type { NormalizedChartJSON, PalaceKey, RawClassicalTexts } from '@/types/tuvi';
import { PALACE_GROUPS } from '@/schemas/report.schema';
import { SHAPE_PALACE } from './chat-bundle';
import { buildChartContext, buildClassicalSubset, buildFewShot } from './prompt-builder';
import { PROMPT_VERSION } from './prompts';
import { buildZip, type ZipEntry } from './zip';

/** Tên kỹ năng — BẮT BUỘC kebab-case, Gemini từ chối tên có dấu cách/gạch dưới. */
export const SKILL_NAME = 'tuvi-dau-so';

/** Mô tả một dòng: Gemini dùng câu này để quyết định khi nào gọi kỹ năng. */
export const SKILL_DESCRIPTION =
  'Luận giải Tử Vi Đẩu Số từ dữ liệu lá số đã an sẵn. Dùng khi người dùng dán khối "DỮ LIỆU LÁ SỐ" và cần báo cáo 4 phần có cấu trúc.';

/**
 * Bản gọn của cấu trúc PHẦN 1 — meta để dạng mô tả vì kỹ năng không biết lá số trước.
 */
const SKILL_SHAPE_OVERVIEW = `{
  "meta": {
    "solarDate": "YYYY-MM-DD, lấy đúng từ dữ liệu được dán",
    "lunarDate": "ngày/tháng/năm âm lịch",
    "chineseDate": "can chi năm/tháng/ngày/giờ",
    "gender": "nam | nu",
    "viewingYear": 2026,
    "confidence": "cao | trung_binh | thap"
  },
  "overview": {
    "opening": "40+ ký tự: trục chính + điểm nghẽn",
    "thienDiaNhan": {
      "verdict": "rat_thuan | thuan | trung_tinh | veo | nhieu_vat_va",
      "analysis": "80+ ký tự: tương quan Năm sinh - Bản mệnh nạp âm - Cục"
    },
    "cachCuc": {
      "name": "tên cách cục chủ đạo",
      "explanation": "40+ ký tự, diễn giải hiện đại",
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
}`;

/**
 * Nội dung SKILL.md — frontmatter + bộ luật.
 *
 * Vì sao ngắn hơn system prompt của API: kỹ năng được nạp vào mỗi lượt, dài quá
 * thì tốn context của người dùng và dễ bị cắt. Giữ đủ 3 thứ quyết định chất
 * lượng: trọng số khử mâu thuẫn, luật văn phong, hợp đồng đầu ra.
 */
export function buildSkillMd(): string {
  return `---
name: ${SKILL_NAME}
description: ${SKILL_DESCRIPTION}
version: ${PROMPT_VERSION}
---

Bạn là Đại sư Tử Vi Đẩu Số (Nam Phái, Bắc Phái Tứ Hóa, Trung Châu Phái), kiêm biên tập viên huyền học. Nhận DỮ LIỆU LÁ SỐ được dán vào, trả về báo cáo luận giải có cấu trúc.

KÍCH HOẠT: tin nhắn có khối bắt đầu bằng "# DỮ LIỆU LÁ SỐ" (hoặc bảng 12 cung kèm điểm engine) → chạy ngay, không hỏi lại, không xin xác nhận.

# 1. CÁCH LY NGỮ CẢNH — QUY TẮC ĐẦU TIÊN

- CHỈ dùng dữ liệu có trong tin nhắn của cuộc trò chuyện này.
- BỎ QUA thông tin cá nhân đến từ tài khoản (nghề nghiệp, sở thích, quê quán, tuổi, ghi nhớ đã lưu). Nếu mâu thuẫn với dữ liệu lá số, dữ liệu lá số thắng.
- KHÔNG nhắc cuộc trò chuyện trước, không chào hỏi xã giao, không "dựa trên những gì tôi biết về bạn".
- KHÔNG suy đoán danh tính. Xưng "bạn", gọi lá số là "lá số này".
- Không có dữ liệu lá số → trả lời đúng một câu: "Chưa có dữ liệu lá số, hãy dán phần DỮ LIỆU LÁ SỐ vào." Không tự bịa.

# 2. TRUNG THỰC VỚI DỮ LIỆU

- Không bịa sao, vị trí cung, trạng thái Miếu/Vượng/Đắc/Hãm, đại vận, câu phú.
- Mọi nhận định phải truy được về một sao hoặc một thế cung có trong dữ liệu.

# 3. KHỬ MÂU THUẪN — TRỌNG SỐ

Văn bản cổ học ghép ý nghĩa từng sao nên hay tự mâu thuẫn (câu trên nói đại phú, câu dưới nói bần hàn). Phân xử theo trọng số:

- **60% — Gốc rễ:** chính tinh + trạng thái, và cách cục lớn. Nếu Vô Chính Diệu thì xét cung xung chiếu và Tuần/Triệt.
- **30% — Biến số:** Lục Cát, Tứ Hóa, Lục Sát quyết định mức thuận lợi hay trắc trở.
- **10% — Bộ lọc:** Tuần/Triệt làm giảm 50–70% tính chất của cung (hung bớt hung, cát chậm phát; riêng Mệnh VCD gặp Tuần/Triệt lại vững hơn).

Không liệt kê rời rạc, gộp thành kịch bản nhân quả: "Nhờ [chính tinh/cát tinh] nên bản chất là A, nhưng do hội [sát tinh] nên quá trình gặp B, kết cục C".

# 4. ĐIỂM SỐ

Bảng "ĐIỂM ENGINE" là mốc: được lệch tối đa ±8 điểm, nếu lệch phải ghi trong \`scoreReason\` sao nào khiến lệch. Không tự đặt điểm khác xa.

# 5. VĂN PHONG — HỌC THEO LỐI SÁCH CỔ

Nhịp câu: nêu sao + vị trí → điều kiện → hệ quả đo được. Mẫu đầy đủ và phân tích: \`references/vi-du-van-phong.md\`.

Rút ra:
- Chủ ngữ là SAO hoặc ĐỜI SỐNG, không phải "tôi nghĩ". Xưng "bạn" chỉ khi khuyên trực tiếp.
- Nêu cặp điều kiện → hệ quả: "gặp X thì Y", "không gặp X thì Z", "nếu bị Kỵ thì W".
- Hệ quả cụ thể, đo được: nghề gì, tiền sớm hay muộn, kiểu quan hệ nào, bệnh ở đâu. Không dừng ở tính từ ("năng động", "nhạy bén").
- Dùng từ nghề đúng chỗ: "chủ về", "nên", "kỵ", "ưa", "dễ", "thì".
- Câu ngắn, một câu một khẳng định.

CẤM:
- Giảng giải khái niệm tử vi, kể lịch sử cách cục, dẫn "người đời Nguyên", "bản khắc đời Minh".
- Mở đoạn bằng tên cung ("Cung Mệnh của bạn…").
- Câu đệm: "Điều này cho thấy", "Nhìn chung", "Tóm lại", "Có thể nói rằng", "Đây là một điểm đáng lưu ý".
- Nhắc lại danh sách sao đã có trong headline — headline nêu sao, narrative nêu HỆ QUẢ.
- Gạch đầu dòng trong \`narrative\`.
- Hù doạ cực đoan ("chết yểu", "tàn phế", "vứt đi"). Chuyển thành quản trị rủi ro.
- Quyết định luận ("chắc chắn sẽ", "không thể tránh"). Dùng "xu hướng", "dễ", "có khả năng".
- Ngôi thứ nhất ("tôi", "chúng ta") và ngôi thứ ba ("anh", "chị", "đương số", "người này", "mệnh tạo").

# 6. ĐỘ DÀI

- \`narrative\` mỗi cung: 300–650 ký tự, TỐI ĐA 2 đoạn, ngăn bằng \\n\\n. Đoạn 1 bản chất + hệ quả. Đoạn 2 cái giá và điều nên làm khác đi.
- Chiều sâu theo ĐIỂM ENGINE, cung mạnh và cung yếu KHÔNG viết cùng một khuôn: ≥ 75 → 2 đoạn (thế mạnh + cái giá của chính nó) · 51–74 → 1–2 đoạn cân bằng · ≤ 50 → 1 đoạn đi thẳng vào rủi ro và cách phòng, không lặp ý.
- Ví dụ một cung viết ĐÚNG/SAI: \`references/vi-du-dau-ra.md\`.
- \`headline\`: MỘT câu, tối đa 25 từ.
- \`strengths\` 1–3 · \`risks\` 1–3 · \`strategy\` 2–4 ý, mỗi ý dưới 20 từ.
- Không mở rộng sang cung khác ngoài xung chiếu/tam hợp trực tiếp của cung đang luận.

# 7. ĐỊNH DẠNG ĐẦU RA — BẮT BUỘC

Trả lời bằng **đúng 4 khối JSON**, mỗi khối mở đầu bằng dòng phân cách. Không lời dẫn, không giải thích ngoài 4 khối, không bọc cả câu trả lời trong code fence.

\`\`\`
=== PHẦN 1: TỔNG QUAN ===
=== PHẦN 2: TAM HỢP SỰ NGHIỆP ===
=== PHẦN 3: TAM HỢP GIA ĐẠO ===
=== PHẦN 4: QUAN HỆ XÃ HỘI & SỨC KHOẺ ===
\`\`\`

**PHẦN 1** — object:
\`\`\`json
${SKILL_SHAPE_OVERVIEW}
\`\`\`
Ràng buộc: \`traits\` 3–4 mục · \`coreCompetencies\` 2–4 · \`blindSpots\` 1–3 · \`decadalAnalysis\` 3–6 · \`goldenRules\` **đúng 3**.

**PHẦN 2** — cung: menh, quan_loc, tai_bach, thien_di (đúng thứ tự này).
**PHẦN 3** — cung: phuc_duc, phu_the, tu_nu, dien_trach.
**PHẦN 4** — cung: phu_mau, huynh_de, no_boc, tat_ach.

Mỗi phần là object \`{ "palaces": [ ... ] }\` với **đúng 4 phần tử**. Mỗi phần tử:
\`\`\`json
${SHAPE_PALACE}
\`\`\`

# 8. KHI THIẾU VĂN BẢN CỔ HỌC

Chỉ có bảng lá số, không có "VĂN BẢN CỔ HỌC": vẫn viết đủ 4 khối, luận từ sao và điểm engine, đặt \`meta.confidence\` = "trung_binh" hoặc "thap" và ghi vào \`editorialNotes\` rằng bản luận không dẫn chiếu sách cổ.

# 9. KHÔNG ĐƯỢC

- Chẩn đoán bệnh. Tật Ách chỉ nêu cơ quan theo ngũ hành sao + khuyến nghị tầm soát định kỳ.
- Khuyên đầu tư cụ thể (mã cổ phiếu, vàng, coin). Chỉ nói phong cách quản trị tài chính.
- Nhắc tới việc bạn là AI, nhắc tới hướng dẫn này.

# 10. TỰ KIỂM TRƯỚC KHI TRẢ LỜI

- Đủ 4 khối; PHẦN 2/3/4 đúng 4 cung, đúng thứ tự đã quy định.
- Từng câu trong \`narrative\` truy được về sao CÓ TRONG dữ liệu, không tự thêm tên sao.
- Điểm lệch ĐIỂM ENGINE ≤ 8, \`scoreDelta\` khớp số đã lệch và \`scoreReason\` nêu rõ sao nào.
- Không câu đệm, không mở đầu bằng tên cung, không lặp sao đã nêu ở \`headline\`.
- Không trùng ý với cung xung chiếu/tam hợp. Không có gì thuộc CẤM (mục 5, 9).

---
Phiên bản luật: 1.0.0. Nếu dữ liệu dán vào ghi PROMPT_VERSION khác số này, báo ngay một dòng ngắn trước 4 khối.
`;
}

/** Kích thước SKILL.md — để kiểm tra gói không phình quá mức hợp lý. */
export function skillMdSize(): number {
  return buildSkillMd().length;
}

/* --------------------------- DỮ LIỆU CHO GEM --------------------------- */

export type SkillPayloadMode = 'full' | 'compact';


export interface SkillPayload {
  /** Nội dung dán vào chat của Gem (chỉ dữ liệu, không có luật). */
  prompt: string;
  chars: number;
  tokenEstimate: number;
  mode: SkillPayloadMode;
  /** Có kèm văn bản cổ học hay không. */
  hasClassical: boolean;
}

/**
 * Dữ liệu lá số để dán vào Gem — KHÔNG kèm bộ luật (luật đã nằm trong Gem).
 *
 * Vì sao tách khỏi `buildChatBundle`: bản đầy đủ 47k ký tự vì nó phải mang cả
 * luật lẫn dữ liệu. Khi luật đã ở trong Gem, mỗi lá số chỉ còn 6k (gọn) hoặc
 * 28k (kèm cổ học) — copy-paste nhẹ hơn nhiều lần.
 */
export function buildSkillPayload(
  chart: NormalizedChartJSON,
  classical: RawClassicalTexts | null,
  mode: SkillPayloadMode = 'full',
): SkillPayload {
  const allKeys = Object.values(PALACE_GROUPS).flat() as PalaceKey[];
  const lines: string[] = [];

  lines.push('# DỮ LIỆU LÁ SỐ');
  lines.push(`PROMPT_VERSION: ${PROMPT_VERSION}`);
  lines.push('');
  lines.push(buildChartContext(chart));

  if (mode === 'full') {
    const klass = buildClassicalSubset(classical, allKeys, true);
    lines.push('');
    lines.push('# VĂN BẢN CỔ HỌC');
    lines.push(klass);
  } else {
    lines.push('');
    lines.push('# VĂN BẢN CỔ HỌC');
    lines.push('(không kèm — luận từ lá số, đặt meta.confidence = "trung_binh")');
  }

  lines.push('');
  lines.push(buildFewShot());
  lines.push('');
  lines.push('Viết báo cáo theo đúng 4 khối đã quy định. CHIỀU SÂU từng cung theo bảng điểm ở trên.');

  const prompt = lines.join('\n');
  return {
    prompt,
    chars: prompt.length,
    tokenEstimate: Math.round(prompt.length / 1.2),
    mode,
    hasClassical: mode === 'full' && Boolean(classical),
  };
}

/* ------------------------- ĐÓNG GÓI KỸ NĂNG ------------------------- */

/**
 * Ví dụ văn phong lấy từ chính văn bản cổ học.
 *
 * Vì sao để ở file riêng thay vì nhét vào SKILL.md: đây là tài liệu THAM KHẢO,
 * chỉ cần khi model muốn hiệu chỉnh giọng văn. Nhét vào SKILL.md thì mọi lượt
 * đều phải trả tiền context cho nó. Đây là ý tưởng "progressive disclosure" của
 * định dạng skill: file chính ngắn, tài liệu phụ nạp khi cần.
 */
function buildStyleExamples(): string {
  return `# Ví dụ văn phong — trích từ văn bản cổ học

Đọc file này khi cần hiệu chỉnh nhịp câu. KHÔNG chép nguyên văn vào báo cáo:
đây là mẫu về NHỊP và KIỂU LẬP LUẬN, không phải câu để dùng lại.

## Mẫu 1 — điều kiện → hệ quả, kèm cái giá

> "Tham Lang ở cung Thìn hoặc Tuất, dù không thấy cát diệu làm cho Hỏa Tinh, Linh Tinh
> tốt lên, vẫn có thể có sự nghiệp vững vàng, nhưng nên có một nghề sở trường."

Phân tích: nêu vị trí → nêu điều kiện thiếu → vẫn khẳng định kết quả → chốt bằng
điều kiện cần. Bốn mệnh đề, không mệnh đề nào thừa.

## Mẫu 2 — danh sách sao → hai kết cục khác nhau

> "Nữ mệnh Tham Lang độc tọa nhập miếu, gặp Tả Phụ, Hữu Bật là chủ về quý; gặp Lộc Tồn,
> Hóa Lộc là chủ về phú."

Phân tích: cùng một chính tinh, hai bộ phụ tinh cho hai kết cục. Đây là cách nói
"tùy trường hợp" mà không hề mơ hồ.

## Mẫu 3 — nói thẳng cái giá

> "Liêm Trinh thủ cung Phúc Đức, thông thường chủ bận rộn, vất vả… đầu óc cũng không
> được bình tĩnh… không chú ý cách bài trí nơi mình sinh sống, có cảm giác hỗn loạn."

Phân tích: không có "tuy nhiên", "nhìn chung", "về cơ bản". Nêu hệ quả cụ thể
(bận rộn → đầu óc không tĩnh → nơi ở lộn xộn). Người đọc tự thấy mình trong đó.

## Sai và đúng

Sai:
> "Nhờ sự kết hợp hài hòa giữa Tham Lang và Văn Xương, bạn là người có nhiều tiềm năng.
> Tóm lại, đây là một lá số rất đáng chú ý."

Đúng:
> "Tham Lang miếu gặp Văn Xương đắc nên kiếm tiền bằng lời nói và chữ nghĩa. Nhưng Quả Tú
> đồng cung khiến bạn đổi hướng giữa chừng — nghề sở trường phải chọn trong 5 năm đầu,
> không thì tiền vào nhiều nhánh mà không nhánh nào đủ dày."
`;
}



/**
 * Ví dụ đầu ra (một cung ĐÚNG / SAI + chiều sâu theo điểm) — tái dùng chính
 * `buildFewShot()` mà hai gói prompt đang mang.
 *
 * VÌ SAO CÓ CẢ Ở ĐÂY VẪN CẢ TRONG PAYLOAD: payload chỉ có khi người dùng dán
 * dữ liệu (mỗi lượt), còn file này là bản dự phòng cho lượt model đọc file
 * tham khảo (Gemini không bắt buộc đọc reference). Hai đường nạp độc lập —
 * đánh đổi vài KB cho việc không phụ thuộc vào việc model có mở file hay không.
 * Nội dung giống hệt nhau nên không thể lệch luật giữa hai đường.
 */
function buildOutputExamplesDoc(): string {
  return `# Ví dụ đầu ra — một cung viết đúng và một cung viết sai

Đọc file này TRƯỚC KHI viết cung đầu tiên. Nó cho thấy độ sâu phải có theo từng
mức ĐIỂM ENGINE. KHÔNG chép nguyên văn đoạn mẫu vào báo cáo — lá số khác thì sao
khác, chỉ học cách lập luận và cách căn số đoạn.

${buildFewShot()}`;
}

/** Toàn bộ file trong gói kỹ năng. `SKILL.md` PHẢI nằm ở gốc — Gemini yêu cầu vậy. */
export function buildSkillFiles(): ZipEntry[] {
  return [
    { path: 'SKILL.md', content: buildSkillMd() },
    { path: 'references/vi-du-van-phong.md', content: buildStyleExamples() },
    { path: 'references/vi-du-dau-ra.md', content: buildOutputExamplesDoc() },
    { path: 'references/du-lieu-mau.md', content: buildSamplePayloadDoc() },
  ];
}

/** Một khối dữ liệu mẫu (rút gọn) để model thấy đúng định dạng đầu vào. */
function buildSamplePayloadDoc(): string {
  return `# Dữ liệu đầu vào trông thế nào

Người dùng sẽ dán một khối như dưới đây (do app sinh ra). Đây là ví dụ RÚT GỌN —
dữ liệu thật có đủ 12 cung và bảng Đại vận.

\`\`\`
# DỮ LIỆU LÁ SỐ
PROMPT_VERSION: ${PROMPT_VERSION}

## A. DỮ LIỆU LÁ SỐ (engine nội bộ, đã đối chiếu với cohoc.net)

- Dương lịch: 1990-10-21 · Âm lịch: ngày 4 tháng 9 năm 1990 · Giờ ngọ
- Năm xem hạn: 2026 · Giới tính: Nam
- Nạp âm: Lộ Thượng Thổ · Cục: Kim Tứ Cục · Mệnh cư Thìn · Thân cư Mệnh

| Cung | Địa chi | Chính tinh | Cát tinh | Sát tinh | Điểm |
|---|---|---|---|---|---|
| Mệnh | Thìn | Tham Lang (Miếu) | Văn Xương (Đắc) | — | 79 |
| ... | ... | ... | ... | ... | ... |

## B. VĂN BẢN CỔ HỌC THÔ (nguồn: tuvi.cohoc.net)
### Cửu Thiên Phi Tinh & vượng suy (nguồn cổ học)
- Thất tinh định điểm: Thiên · tháng sinh → cung Sự nghiệp (quan_loc) · ...
### Chấm theo Đẩu Minh (nguồn cổ học, thang −3..+3)
- Mệnh: Đẩu Minh -0.96 · cung khí đại hung · ...
### Mệnh
[...các đoạn bình giải...]
\`\`\`

Ghi chú quan trọng:
- Bảng "ĐIỂM ENGINE" là mốc để chấm điểm. Không được bỏ qua.
- Nếu KHÔNG có phần B, vẫn viết đủ 4 khối và hạ \`meta.confidence\`.
- Chi của "Cửu Thiên Phi Tinh" là hệ toạ độ riêng, KHÔNG so sánh với địa chi Thiên bàn.
`;
}

/** Đóng gói .zip. Đây là thứ người dùng tải lên Gemini. */
export function buildSkillZip(): Buffer {
  return buildZip(buildSkillFiles());
}

/** Kích thước gói — dùng cho log và test. */
export function skillPackageStats(): {
  name: string;
  files: Array<{ path: string; chars: number }>;
  skillMdChars: number;
  zipBytes: number;
} {
  const files = buildSkillFiles();
  return {
    name: SKILL_NAME,
    files: files.map((f) => ({ path: f.path, chars: f.content.length })),
    skillMdChars: buildSkillMd().length,
    zipBytes: buildSkillZip().length,
  };
}
