/**
 * schemas/report.schema.ts
 * ---------------------------------------------------------------------------
 * Hợp đồng đầu ra cho báo cáo luận giải (Zod).
 *
 * Gemini không ép được JSON Schema, nên hợp đồng này là chốt chặn ở phía ứng dụng:
 *  1. UI cần dữ liệu có cấu trúc để render Bento Grid / Tabs / thanh điểm.
 *  2. Câu trả lời dán tay được tách 4 phần, ghép lại và validate trước khi vào UI.
 *  3. Zod chặn lỗi cấu trúc (thiếu cung, sai enum, điểm ngoài thang) — thứ mà
 *     kiểm tra văn xuôi không bắt được.
 *
 * Quy ước: mọi text trả về là tiếng Việt, không markdown heading bên trong
 * (UI tự render heading). Chỉ cho phép xuống dòng bằng "\n".
 * ---------------------------------------------------------------------------
 */

import { z } from 'zod';

/** 12 cung — trùng khoá với types/tuvi.ts. */
export const PalaceKeyEnum = z.enum([
  'menh',
  'huynh_de',
  'phu_the',
  'tu_nu',
  'tai_bach',
  'tat_ach',
  'thien_di',
  'no_boc',
  'quan_loc',
  'dien_trach',
  'phuc_duc',
  'phu_mau',
]);

/** Sắc thái tổng thể của một cung. */
export const VerdictEnum = z.enum(['thuan_loi', 'trung_binh', 'thu_thach']);

/** Mức độ nghiêm trọng của rủi ro. */
export const SeverityEnum = z.enum(['thap', 'trung_binh', 'cao']);

/**
 * Một luận điểm (dùng chung cho điểm sáng và điểm nghẽn).
 * Bắt buộc có `evidence` để chống văn phong "nói chung chung".
 */
export const InsightSchema = z.object({
  title: z.string().min(3).describe('Tiêu đề ngắn, cụ thể. Ví dụ: "Tham Lang Miếu + Văn Xương: khả năng học nhanh và thuyết phục"'),
  detail: z
    .string()
    .min(25)
    
    .describe(
      'Luận giải 2-4 câu theo kịch bản nhân quả: Nhờ [sao] nên [A], nhưng do [sao/hạn chế] nên [B], kết cục [C]. Không liệt kê rời rạc.',
    ),
  evidence: z
    .array(z.string())
    .min(1)
    
    .describe('Tên sao / trạng thái / Tứ Hóa / Tuần Triệt làm căn cứ, ví dụ "Tham Lang (Miếu)", "Hóa Kỵ tại Nô Bộc"'),
});

/** Một cung trong báo cáo. */
export const PalaceReportSchema = z.object({
  palaceKey: PalaceKeyEnum.describe('Khoá cung, phải khớp chính xác với dữ liệu đầu vào'),
  palaceName: z.string().describe('Tên hiển thị: "Mệnh", "Quan Lộc", ...'),
  mainStars: z.string().describe('Chính tinh tọa thủ kèm trạng thái, ví dụ "Tham Lang (Miếu)" hoặc "Vô chính diệu"'),
  verdict: VerdictEnum.describe('Sắc thái tổng thể của cung'),
  headline: z
    .string()
    .min(15)
    
    .describe('1-2 câu đánh giá trọng tâm — phần "🎯 Đánh giá trọng tâm" của báo cáo'),
  /**
   * ĐÂY LÀ FIELD QUAN TRỌNG NHẤT CHO CẢM GIÁC "NGƯỜI VIẾT".
   * Bullet list đọc như máy tổng hợp; một đoạn văn liền mạch đọc như người thầy
   * đang nói. UI dùng field này ở chế độ Đọc, còn strengths/risks chỉ hiện khi
   * người dùng mở "chi tiết".
   */
  narrative: z
    .string()
    .min(200)
    
    .describe(
      'Bài luận liền mạch 1–2 đoạn cho cung này, dài 300–650 ký tự, ngắt bằng \n\n. Đoạn 1: bản chất (chính tinh + trạng thái quyết định gì) và biểu hiện thực tế trong công việc/tiền bạc/quan hệ. Đoạn 2: cái giá phải trả và điều nên làm khác đi. Viết như đang nói với một người cụ thể, không phải viết báo cáo.',
    ),
  strengths: z.array(InsightSchema).min(1).describe('Điểm sáng / ưu thế thực chất'),
  risks: z.array(InsightSchema).min(1).describe('Điểm nghẽn / rủi ro, diễn đạt theo hướng quản trị rủi ro'),
  strategy: z
    .array(z.string().min(10))
    .min(2)
    
    .describe('Chiến lược hành động cụ thể, khả thi. Không dùng lời khuyên chung chung như "cố gắng hơn".'),
  score: z
    .number()
    .min(0)
    .max(100)
    .describe(
      'Điểm 0-100. BẮT BUỘC lấy điểm engine làm gốc (xem "ĐIỂM ENGINE" trong input) và chỉ được điều chỉnh tối đa ±8 điểm, phải giải thích lý do trong headline nếu điều chỉnh.',
    ),
  scoreDelta: z
    .number()
    .min(-8)
    
    .describe('Chênh lệch so với điểm engine. 0 nếu đồng ý hoàn toàn.'),
  scoreReason: z
    .string()
    
    .describe('Vì sao giữ nguyên hoặc điều chỉnh điểm. Nếu lệch, nêu rõ sao nào khiến lệch.'),
});

/** Phần I — Bức tranh tổng quan. */
export const OverviewSchema = z.object({
  opening: z
    .string()
    .min(40)
    
    .describe(
      '2-3 câu tóm tắt KHÁCH QUAN về thế lá số: đâu là trục chính, đâu là điểm nghẽn lớn nhất. Không chào hỏi, không ngôi thứ nhất, không ngôi thứ ba, không sáo rỗng kiểu "lá số của bạn rất đặc biệt".',
    ),
  thienDiaNhan: z.object({
    verdict: z.enum(['rat_thuan', 'thuan', 'trung_tinh', 'veo', 'nhieu_vat_va']),
    analysis: z
      .string()
      .min(80)
      
      .describe(
        'Phân tích tương quan Năm sinh (Âm/Dương), Bản mệnh nạp âm và Cục: cái nào sinh cái nào, hệ quả là khởi đầu hanh thông hay vất vả, và vì sao.',
      ),
  }),
  cachCuc: z.object({
    name: z.string().describe('Tên cách cục chủ đạo, ví dụ "Tham Lang độc tọa Thìn Tuất", "Sát Phá Tham", "Cự Nhật"'),
    explanation: z
      .string()
      .min(40)
      
      .describe('Giải thích cách cục bằng ngôn ngữ hiện đại: nó định hình tính cách và con đường sự nghiệp thế nào.'),
    classicalQuote: z
      .string()
      
      .optional()
      .describe('Câu phú chữ Hán liên quan (nếu có), ví dụ "Nhật Nguyệt tịnh minh"'),
    quoteMeaning: z
      .string()
      
      .optional()
      .describe('BẮT BUỘC nếu có classicalQuote: giải nghĩa ngắn gọn, dễ hiểu'),
  }),
  thanCu: z.object({
    palace: z.string().describe('Thân cư cung gì'),
    meaning: z
      .string()
      .min(40)
      
      .describe('Nửa sau cuộc đời (sau 30-35 tuổi) nghiêng về cung này thế nào, hệ quả thực tế ra sao.'),
  }),
  personality: z.object({
    traits: z
      .array(
        z.object({
          title: z.string(),
          detail: z.string().min(40),
        }),
      )
      .min(3)
      
      .describe('3-4 nét tính cách nổi bật nhất, mỗi nét kèm biểu hiện cụ thể trong đời sống/công việc'),
    coreCompetencies: z
      .array(z.string())
      .min(2)
      
      .describe('Năng lực cốt lõi — việc đương số làm tốt hơn người khác'),
    blindSpots: z
      .array(z.string())
      .min(1)
      
      .describe('Điểm mù tâm lý — điều đương số thường không tự nhận ra'),
  }),
  overallScore: z.number().min(0).max(100).describe('Điểm tổng thể lá số, lấy trung bình có trọng số của Mệnh-Tài-Quan-Di'),
  oneLineVerdict: z
    .string()
    .min(20)
    
    .describe('Một câu chốt chân dung: "Bạn là kiểu người ... , con đường phù hợp nhất là ..."'),
});

/** Phần V — Đại vận & kim chỉ nam. */
export const DecadalSchema = z.object({
  range: z.string().describe('Khoảng tuổi, ví dụ "34-43"'),
  theme: z.string().min(12).describe('Chủ đề chính của 10 năm này'),
  opportunity: z.string().min(10).describe('Cơ hội nên nắm'),
  risk: z.string().min(10).describe('Rủi ro cần phòng'),
  action: z.enum(['tich_luy', 'but_pha', 'phong_thu', 'chuyen_huong']).describe('Chiến lược chủ đạo của đại vận'),
});

export const ActionPlanSchema = z.object({
  decadalAnalysis: z
    .array(DecadalSchema)
    .min(3)
    
    .describe('3-6 đại vận trọng điểm, KHÔNG cần liệt kê đủ 12 — chỉ các giai đoạn bước ngoặt'),
  goldenRules: z
    .array(
      z.object({
        rule: z.string().min(10).describe('Nguyên tắc sống/làm việc, mệnh lệnh thức'),
        rationale: z.string().min(12).describe('Vì sao — gắn với sao/cung cụ thể'),
      }),
    )
    .length(3)
    .describe('ĐÚNG 3 nguyên tắc quan trọng nhất, đúc từ toàn bộ lá số'),
});

/* ------------------------------------------------------------------------- */
/* ROOT SCHEMA                                                               */
/* ------------------------------------------------------------------------- */

export const TuViFullReportSchema = z.object({
  /** Nhận dạng — để UI biết báo cáo này ứng với lá số nào. */
  meta: z.object({
    solarDate: z.string().describe('YYYY-MM-DD'),
    lunarDate: z.string(),
    chineseDate: z.string().describe('Can chi năm-tháng-ngày-giờ'),
    gender: z.enum(['nam', 'nu']),
    viewingYear: z.number(),
    confidence: z
      .enum(['cao', 'trung_binh', 'thap'])
      .describe('cao = có đủ văn bản cổ học; thap = chỉ luận từ JSON lá số'),
  }),

  overview: OverviewSchema.describe('PHẦN I — Bức tranh tổng quan & cốt cách'),

  /** PHẦN II — Tam hợp sự nghiệp: Mệnh, Quan Lộc, Tài Bạch, Thiên Di. */
  careerGroup: z.array(PalaceReportSchema).length(4),
  /** PHẦN III — Tam hợp gia đạo: Phúc Đức, Phu Thê, Tử Nữ, Điền Trạch. */
  familyGroup: z.array(PalaceReportSchema).length(4),
  /** PHẦN IV — Quan hệ xã hội & sức khỏe: Phụ Mẫu, Huynh Đệ, Nô Bộc, Tật Ách. */
  socialGroup: z.array(PalaceReportSchema).length(4),

  /** PHẦN V — Lộ trình & kim chỉ nam. */
  actionPlan: ActionPlanSchema,

  /** Ghi chú minh bạch: chỗ nào dữ liệu mâu thuẫn và đã xử lý thế nào. */
  editorialNotes: z
    .array(z.string())
    
    .describe('Các mâu thuẫn trong văn bản cổ học đã gặp và cách phân xử theo trọng số (chính tinh > cát/sát > Tuần Triệt)'),
});

export type TuViFullReport = z.infer<typeof TuViFullReportSchema>;
export type PalaceReport = z.infer<typeof PalaceReportSchema>;
export type OverviewReport = z.infer<typeof OverviewSchema>;
export type ActionPlan = z.infer<typeof ActionPlanSchema>;
export type Verdict = z.infer<typeof VerdictEnum>;

/** Nhóm cung theo Tam Hợp — dùng chung cho prompt, validator và UI. */
export const PALACE_GROUPS = {
  career: ['menh', 'quan_loc', 'tai_bach', 'thien_di'],
  family: ['phuc_duc', 'phu_the', 'tu_nu', 'dien_trach'],
  social: ['phu_mau', 'huynh_de', 'no_boc', 'tat_ach'],
} as const satisfies Record<string, readonly PalaceKey[]>;

type PalaceKey = z.infer<typeof PalaceKeyEnum>;

/* ------------------------------------------------------------------------- */
/* CHUNKED GENERATION                                                        */
/* ------------------------------------------------------------------------- */
/*
 * Vì sao chia nhỏ thay vì một object khổng lồ:
 *  - Một báo cáo đầy đủ ~12–15k token JSON. Mô hình dễ bị cắt giữa chừng
 *    (finishReason=length), mất toàn bộ công đã viết.
 *  - Prompt một cục 33k token; chia nhỏ thì mỗi lần chỉ cần nạp văn bản cổ học
 *    của đúng 4 cung liên quan → rẻ hơn, nhanh hơn, ít nhiễu hơn.
 *  - Lỗi được cô lập: một nhóm hỏng thì retry nhóm đó, không mất phần đã xong.
 *  - UI nhận được Tổng quan trước, rồi từng nhóm — thay vì chờ 3 phút.
 */

/** Lần gọi 1: nhận dạng + tổng quan + lộ trình. */
export const OverviewPartSchema = z.object({
  meta: z.object({
    solarDate: z.string(),
    lunarDate: z.string(),
    chineseDate: z.string(),
    gender: z.enum(['nam', 'nu']),
    viewingYear: z.number(),
    confidence: z.enum(['cao', 'trung_binh', 'thap']),
  }),
  overview: OverviewSchema,
  actionPlan: ActionPlanSchema,
  editorialNotes: z.array(z.string()),
});

/** Lần gọi 2–4: một nhóm 4 cung. */
export const PalaceGroupPartSchema = z.object({
  palaces: z.array(PalaceReportSchema).min(1),
});

export type OverviewPart = z.infer<typeof OverviewPartSchema>;
export type PalaceGroupPart = z.infer<typeof PalaceGroupPartSchema>;
