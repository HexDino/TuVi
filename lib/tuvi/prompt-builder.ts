/**
 * lib/tuvi/prompt-builder.ts
 * ---------------------------------------------------------------------------
 * Biến (NormalizedChartJSON + RawClassicalTexts) thành prompt cho LLM.
 *
 * Tại sao không nhét thẳng JSON: JSON tốn token gấp ~1.6 lần và LLM đọc bảng
 * markdown chính xác hơn với dữ liệu dạng bảng. Ở đây render "bảng nén" —
 * mỗi cung 1 dòng bảng + 1 dòng chi tiết + tối đa 3 ghi chú scoring.
 *
 * Ngân sách mục tiêu: ~2.000 token cho lá số, ~12.000 token cho văn bản cổ học.
 * ---------------------------------------------------------------------------
 */

import type {
  CohocMetrics,
  NormalizedChartJSON,
  PalaceKey,
  RawClassicalTexts,
} from '@/types/tuvi';
import { PALACE_DISPLAY, ELEMENT_LABEL_VI } from './constants';
import { PALACE_GROUPS } from '@/schemas/report.schema';

/** Tên sao trong cung → chuỗi gọn "Văn Xương (Đắc), Tả Phù". */
function starLine(stars: Array<{ name: string; brightness: string; mutagen?: string }>): string {
  if (!stars.length) return '—';
  return stars
    .map((s) => {
      const b = s.brightness && s.brightness !== 'Vô' ? ` (${s.brightness})` : '';
      const m = s.mutagen ? ` [Hóa ${s.mutagen}]` : '';
      return `${s.name}${b}${m}`;
    })
    .join(', ');
}

/** Gợi ý sao cho parser cohoc: ưu tiên chính tinh + cát/hung. */
export function buildHints(chart: NormalizedChartJSON): Partial<Record<PalaceKey, string[]>> {
  const hints: Partial<Record<PalaceKey, string[]>> = {};
  for (const p of chart.palaces) {
    hints[p.key] = [...p.majorStars, ...p.auspicious, ...p.malefic].map((s) => s.name.toLowerCase());
  }
  return hints;
}

/* ------------------------- PHẦN 1: LÁ SỐ ------------------------- */

export interface ChartContextOptions {
  /** Chỉ in dòng chi tiết cho các cung này (+ xung chiếu/tam hợp của chúng). */
  detailPalaces?: PalaceKey[];
  /** In bảng đại vận (chỉ phần Tổng quan cần). */
  includeDecadal?: boolean;
  /** In lưu niên (chỉ phần Tổng quan cần). */
  includeAnnual?: boolean;
}

export function buildChartContext(
  chart: NormalizedChartJSON,
  opts: ChartContextOptions = {},
): string {
  const { meta, thienBan } = chart;
  const lines: string[] = [];

  /* KHÔNG ghi "đã đối chiếu với cohoc.net" ở đây: có trường hợp tầng cổ học bị
     bỏ qua (tháng nhuận, mạng lỗi) nên câu đó sẽ thành nói sai với LLM — nó sẽ
     tưởng đã có đối chiếu và bỏ qua việc tự kiểm tra. Trạng thái đối chiếu nằm ở
     phần cảnh báo của pipeline, không phải ở tiêu đề dữ liệu. */
  lines.push('## A. DỮ LIỆU LÁ SỐ (engine nội bộ iztro, an sao theo Nam phái)');
  lines.push('');
  lines.push(
    `- Dương lịch: ${meta.solarDate} | ${meta.lunarDateText}`,
  );
  lines.push(`- Can chi: ${meta.chineseDate}`);
  lines.push(`- Giờ sinh: ${meta.timeName} (${meta.timeRange}) | Con giáp: ${meta.zodiac} | Cung hoàng đạo: ${meta.westernSign}`);
  lines.push(
    `- Giới tính: ${meta.gender === 'nam' ? 'Nam' : 'Nữ'} | ${thienBan.amDuong} | ${thienBan.cuc}`,
  );
  lines.push(
    `- Nạp âm bản mệnh: ${thienBan.napAm} (${thienBan.napAmElement}) → quan hệ với Cục (${thienBan.cucElement}): ${ELEMENT_LABEL_VI[thienBan.cucVsMenh] ?? thienBan.cucVsMenh}`,
  );
  lines.push(`- Chủ mệnh: ${thienBan.menhChu} | Chủ thân: ${thienBan.thanChu}`);
  lines.push(`- Mệnh an tại ${thienBan.menhBranch} | THÂN CƯ ${thienBan.thanCu.toUpperCase()} (${thienBan.thanBranch})`);
  lines.push(`- Năm xem hạn: ${meta.viewingYear}`);
  lines.push('');

  /* Bảng 12 cung */
  lines.push('### Bảng 12 cung');
  lines.push('| Cung | Chi | Can | Chính tinh | Cát tinh | Sát tinh | Tuần/Triệt | Tràng sinh | Điểm | Đại hạn |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const p of chart.palaces) {
    const tt = [p.hasTuan ? 'Tuần' : '', p.hasTriet ? 'Triệt' : ''].filter(Boolean).join('+') || '—';
    const body = p.isBodyPalace ? `${p.name} (Thân)` : p.name;
    lines.push(
      `| ${body} | ${p.branch} | ${p.stem} | ${starLine(p.majorStars) || 'VCD'} | ${starLine(p.auspicious)} | ${starLine(p.malefic)} | ${tt} | ${p.changsheng12} | ${p.score.total} (${p.score.grade}) | ${p.decadal.range[0]}-${p.decadal.range[1]} |`,
    );
  }
  lines.push('');

  /* Tứ Hóa năm sinh */
  const mutagens: string[] = [];
  for (const p of chart.palaces) {
    for (const s of [...p.majorStars, ...p.auspicious, ...p.malefic, ...p.neutral]) {
      if (s.mutagen) mutagens.push(`Hóa ${s.mutagen}: ${s.name} tại ${p.name}`);
    }
  }
  lines.push(`### Tứ Hóa năm sinh (${meta.yearCanChi})`);
  lines.push(mutagens.length ? `- ${mutagens.join('\n- ')}` : '- Không có');
  lines.push('');

  /* Chi tiết từng cung: sao trung tính + ghi chú scoring.
     Chỉ in những cung liên quan — mỗi lần gọi chỉ luận 4 cung, in cả 12 là lãng phí
     ~3.000 ký tự mỗi lần (nhân 4 lần gọi). */
  const wanted = new Set<string>(opts.detailPalaces ?? chart.palaces.map((p) => p.key));
  if (opts.detailPalaces) {
    for (const p of chart.palaces) {
      if (!wanted.has(p.key)) continue;
      wanted.add(chart.palaces.find((x) => x.branch === p.oppositeBranch)?.key ?? '');
      for (const b of p.trineBranches) {
        const t = chart.palaces.find((x) => x.branch === b);
        if (t) wanted.add(t.key);
      }
    }
  }

  lines.push('### Chi tiết phụ tinh & ghi chú chấm điểm');
  for (const p of chart.palaces) {
    if (!wanted.has(p.key)) continue;
    const neutral = p.neutral.length ? starLine(p.neutral) : '—';
    const notes = p.score.notes.slice(0, 4).join('; ');
    lines.push(
      `- ${p.name} (${p.branch})${p.isEmpty ? ' [VCD]' : ''}: phụ tinh khác = ${neutral} | đối chiếu ${p.oppositeBranch} | tam hợp ${p.trineBranches.join('+')}${notes ? ` | vì: ${notes}` : ''}`,
    );
  }
  lines.push('');

  /* Đại vận */
  if (opts.includeDecadal !== false) {
  lines.push('### Đại vận (10 năm)');
  lines.push('| Tuổi | Cung | Can Chi | Điểm cung | Hạng |');
  lines.push('|---|---|---|---|---|');
  for (const d of chart.daiVan) {
    lines.push(`| ${d.range[0]}-${d.range[1]} | ${d.palaceName} | ${d.stem} ${d.branch} | ${d.score} | ${d.grade} |`);
  }
  lines.push('');

  lines.push('');
  }

  /* Lưu niên */
  if (chart.annual && opts.includeAnnual !== false) {
    const a = chart.annual;
    lines.push(`### Lưu niên ${a.year} (${a.chineseYear}, tuổi ${a.age})`);
    if (a.mutagen) {
      lines.push(`- Tứ Hóa lưu niên: Lộc=${a.mutagen[0]}, Quyền=${a.mutagen[1]}, Khoa=${a.mutagen[2]}, Kỵ=${a.mutagen[3]}`);
    }
    if (a.activeDecadal) {
      lines.push(
        `- Đại vận đang chạy: ${a.activeDecadal.range[0]}-${a.activeDecadal.range[1]} tuổi — cung ${a.activeDecadal.palaceName} (${a.activeDecadal.score} điểm, hạng ${a.activeDecadal.grade})`,
      );
    }
    lines.push(`- Tiểu hạn nhập cung: ${a.yearlyPalaceBranch}`);
    if (a.yearlyStarsByPalace.length) {
      const starText = a.yearlyStarsByPalace
        .map((x) => `${PALACE_DISPLAY[x.palaceKey]}: ${x.stars.map((s) => s.name).join(', ')}`)
        .join(' | ');
      lines.push(`- Sao lưu niên: ${starText}`);
    }
    lines.push('');
  }

  if (chart.warnings.length) {
    lines.push('### Cảnh báo dữ liệu');
    for (const w of chart.warnings) lines.push(`- ${w}`);
    lines.push('');
  }

  return lines.join('\n');
}

/* ---------------------- PHẦN 2: VĂN BẢN CỔ HỌC ---------------------- */

export function buildClassicalContext(texts: RawClassicalTexts | null): string {
  if (!texts || (!texts.overview.length && !Object.keys(texts.palaces).length)) {
    return `## B. VĂN BẢN CỔ HỌC
(KHÔNG CÓ DỮ LIỆU — hãy luận hoàn toàn từ lá số ở phần A, đặt confidence = "thap", và ghi chú trong editorialNotes.)`;
  }

  const lines: string[] = [];
  lines.push(`## B. VĂN BẢN CỔ HỌC THÔ (nguồn: ${texts.sourceUrl})`);
  lines.push(`Chế độ xem: ${texts.viewMode}. Đây là văn bản ghép từ nhiều trường phái — có thể mâu thuẫn, phải phân xử theo trọng số.`);
  lines.push('');

  if (texts.overview.length) {
    lines.push('### B0. Tổng quan');
    for (const p of texts.overview) {
      lines.push(`[${p.heading}]${p.source ? ` (${p.source})` : ''}`);
      lines.push(p.text);
      lines.push('');
    }
  }

  if (texts.bodyPalace.length) {
    lines.push('### B0b. Cung Thân');
    for (const p of texts.bodyPalace) {
      lines.push(`[${p.heading}]`);
      lines.push(p.text);
      lines.push('');
    }
  }

  const order: PalaceKey[] = [
    'menh',
    'quan_loc',
    'tai_bach',
    'thien_di',
    'phuc_duc',
    'phu_the',
    'tu_nu',
    'dien_trach',
    'phu_mau',
    'huynh_de',
    'no_boc',
    'tat_ach',
  ];

  for (const key of order) {
    const passages = texts.palaces[key];
    if (!passages?.length) continue;
    lines.push(`### B. ${PALACE_DISPLAY[key]}`);
    for (const p of passages) {
      lines.push(`[${p.heading}]`);
      lines.push(p.text);
      lines.push('');
    }
  }

  const decadalKeys = Object.keys(texts.decadal).slice(0, 4);
  if (decadalKeys.length) {
    lines.push('### B. Đại vận (trích)');
    for (const k of decadalKeys) {
      lines.push(`[Đại vận ${k} tuổi]`);
      for (const p of texts.decadal[k]) lines.push(p.text);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/* --------------------------- PROMPT HOÀN CHỈNH --------------------------- */

export interface BuildPromptOptions {
  chart: NormalizedChartJSON;
  classical: RawClassicalTexts | null;
  /** Tên đương số (nếu có) để cá nhân hoá. */
  name?: string;
}

export function buildUserPrompt({ chart, classical, name }: BuildPromptOptions): string {
  const parts: string[] = [];

  parts.push(
    `Đương số${name ? `: ${name}` : ''} — ${chart.meta.gender === 'nam' ? 'Nam' : 'Nữ'}, sinh ${chart.meta.solarDate} (${chart.meta.lunarDateText}), giờ ${chart.meta.timeName}. Xem hạn năm ${chart.meta.viewingYear}.`,
  );
  parts.push('');
  parts.push(buildChartContext(chart));
  parts.push('');
  parts.push(buildClassicalContext(classical));
  parts.push('');
  parts.push(`## C. NHIỆM VỤ
CHỈ TRẢ VỀ MỘT OBJECT JSON. Không viết lời dẫn, không giải thích, không markdown,
không bọc trong \`\`\`json. Ký tự đầu tiên của câu trả lời phải là "{" và ký tự cuối là "}".
Viết báo cáo luận giải đầy đủ theo JSON schema đã cho, gồm:
- overview: PHẦN I — Bức tranh tổng quan & cốt cách (tương quan Thiên–Địa–Nhân, cách cục chủ đạo, Thân cư, chân dung tính cách).
- careerGroup: PHẦN II — Mệnh, Quan Lộc, Tài Bạch, Thiên Di.
- familyGroup: PHẦN III — Phúc Đức, Phu Thê, Tử Nữ, Điền Trạch.
- socialGroup: PHẦN IV — Phụ Mẫu, Huynh Đệ, Nô Bộc, Tật Ách (riêng Tật Ách: cơ quan theo ngũ hành sao + khuyến nghị tầm soát, KHÔNG chẩn đoán bệnh).
- actionPlan: PHẦN V — 3-6 đại vận trọng điểm + đúng 3 kim chỉ nam.

Nhắc lại ràng buộc cứng:
- Điểm mỗi cung lấy từ "ĐIỂM ENGINE" ở bảng trên, chỉ lệch tối đa ±8, phải ghi scoreDelta và scoreReason.
- Mỗi luận điểm phải có evidence là tên sao/trạng thái cụ thể.
- Văn bản cổ học có mâu thuẫn thì phân xử theo trọng số và ghi vào editorialNotes.
- Không markdown, không bullet, không in đậm trong các field text.`);

  return parts.join('\n');
}

/**
 * Chuỗi định danh dữ liệu đầu vào — dùng làm khoá cho báo cáo NHẬP TỪ CHAT.
 *
 * Vì sao cần hàm riêng: báo cáo nhập tay không do model sinh, nên khoá của nó
 * không được phụ thuộc model. Nếu dùng chung khoá với đường API thì đổi
 * LLM_MODEL là mất bản đã viết — trong khi bản đó chẳng liên quan gì tới model.
 *
 * Đặt ở đây (không đặt trong chat-bundle) để cả `chat-bundle` và
 * `astrology-agent.service` dùng được mà không tạo import vòng.
 */
export function chatInputSignature(
  chart: NormalizedChartJSON,
  classical: RawClassicalTexts | null,
  name?: string,
): string[] {
  const allKeys = Object.values(PALACE_GROUPS).flat() as PalaceKey[];
  return [
    buildChartContext(chart),
    buildClassicalSubset(classical, allKeys, true),
    name ?? '',
  ];
}

/* ---------------------- CHUNKED PROMPTS ---------------------- */

/** Chỉ lấy văn bản cổ học của những cung được yêu cầu. */
/**
 * Bảng Đẩu Minh của cohoc — engine nội bộ KHÔNG có.
 *
 * LỖI ĐÃ SỬA: bản trước đọc `(chart as any).metrics`, nhưng metrics nằm ở
 * `classical.metrics` (chart chỉ có sao, không có số liệu cohoc). Kết quả là
 * khối này KHÔNG BAO GIỜ được render — toàn bộ Đẩu Minh, cung khí, ngũ hành
 * hỉ-kị bóc ra rồi bỏ đi. Nay đọc đúng nguồn và chỉ in cung liên quan.
 */
function renderDauMinh(
  texts: RawClassicalTexts,
  keys: PalaceKey[] | null,
): string | null {
  const met = texts.metrics;
  if (!met?.dauMinh?.length) return null;

  const rows = keys
    ? met.dauMinh.filter((d) => keys.includes(d.palaceKey))
    : met.dauMinh;
  if (!rows.length) return null;

  const out: string[] = [
    '### Chấm theo Đẩu Minh (nguồn cổ học, thang −3..+3)',
    'Hệ quy chiếu KHÁC điểm engine: chấm theo ngũ hành can-chi của cung, không theo sao.',
  ];

  for (const d of rows) {
    const khi = met.cungKhi.find((k) => k.palaceKey === d.palaceKey);
    const tiLe = met.tiLeSaoTot.find((x) => x.palaceKey === d.palaceKey);
    out.push(
      `- ${d.palaceName}: Đẩu Minh ${d.thienBan ?? '?'}${d.note ? ` (${d.note})` : ''}` +
        `${khi ? ` · cung khí ${khi.khi}` : ''}` +
        `${khi?.saoHiKi ? ` · ${khi.saoHiKi}` : ''}` +
        `${tiLe ? ` · sao tốt ${tiLe.toaCung}` : ''}`,
    );
  }

  if (!keys && met.nguHanh) {
    out.push(
      `- Ngũ hành toàn lá: hỉ ${met.nguHanh.hiThan.join(', ') || '?'} · kị ${met.nguHanh.kiThan.join(', ') || '?'} · nhàn ${met.nguHanh.nhanThan.join(', ') || '?'} · DỤNG THẦN ${met.nguHanh.dungThan || '?'}`,
    );
  }

  out.push('Hai bên lệch nhau thì nêu trong editorialNotes, KHÔNG tự đổi điểm engine.');
  return out.join('\n');
}

/** Heading đã được render dạng cấu trúc — không in lại văn xuôi. */
const STRUCTURED_HEADINGS: RegExp[] = [
  /thất tinh/i,
  /mệnh ẩn/i,
  /vượng suy theo tinh đẩu/i,
  /vượng suy theo ngũ hành cung/i,
  /ngũ hành hỉ kị/i,
];

function isStructuredHeading(heading: string): boolean {
  return STRUCTURED_HEADINGS.some((re) => re.test(heading));
}

/**
 * Render các khối Cửu Thiên Phi Tinh / vượng suy thành bảng gọn.
 *
 * Vì sao không để nguyên văn xuôi: khối "Thất tinh định điểm" 536 ký tự chỉ nói
 * đúng 3 điều (3 cung ứng 3 vị trí). Viết lại dạng "Thiên → Sự nghiệp" tốn 1/3
 * chữ mà LLM đọc chắc hơn, vì không còn câu dẫn giải thích khái niệm.
 */
function renderOverviewExtras(texts: RawClassicalTexts): string | null {
  const ex = texts.extras;
  if (!ex) return null;

  const out: string[] = ['### Cửu Thiên Phi Tinh & vượng suy (nguồn cổ học)'];

  if (ex.thatTinh) {
    const slot = (label: string, r?: { palaceName: string; palaceKey: string | null }) =>
      r ? `${label} → cung ${r.palaceName} (${r.palaceKey ?? '?'})` : null;
    const parts = [
      slot('Thiên · tháng sinh', ex.thatTinh.thien),
      slot('Địa · ngày sinh (trung gian)', ex.thatTinh.dia),
      slot('Nhân · giờ sinh (quan trọng nhất)', ex.thatTinh.nhan),
    ].filter(Boolean);
    if (parts.length) {
      out.push(`- Thất tinh định điểm: ${parts.join(' · ')}`);
      if (ex.thatTinh.linkage) out.push(`  Liên kết: ${ex.thatTinh.linkage}`);
    }
  }

  if (ex.menhAn && (ex.menhAn.branch || ex.menhAn.tuHoa.length)) {
    const hoa = ex.menhAn.tuHoa
      .map((h) => `${h.hoa}→${h.palaceName} (${h.branch})`)
      .join(' · ');
    out.push(`- Mệnh Ẩn tại ${ex.menhAn.branch || '?'}${hoa ? `; Tứ Hóa ẩn: ${hoa}` : ''}`);
  }

  if (ex.tinhDau.length) {
    out.push(
      `- Ngũ hành chính tinh: ${ex.tinhDau
        .map((t) => `${t.star} ${t.element} (độ số ${t.doSo})`)
        .join(' · ')}`,
    );
  }

  if (ex.vuongSuyCung) {
    out.push(`- Vượng suy cung: ${ex.vuongSuyCung.replace(/\n+/g, ' ')}`);
  }

  /*
   * Cảnh báo BẮT BUỘC: hệ này dùng toạ độ riêng (Ẩn bàn), nên chi của nó không
   * trùng chi Thiên bàn. Không nói rõ thì LLM coi đó là mâu thuẫn dữ liệu và bỏ
   * toàn bộ khối — đã xảy ra thật ở lần chạy trước:
   *   "Cổ học dùng hệ Cửu Thiên Phi Tinh với tên cung khác ... Phân xử: bỏ qua."
   */
  if (out.length > 1) {
    out.push(
      '  Ghi chú: đây là hệ toạ độ riêng (Ẩn bàn) của Khâm Thiên Vô Cực Môn — chi của nó KHÔNG so sánh được với Thiên bàn ở bảng trên. Chỉ dùng TÊN CUNG; đừng coi việc lệch chi là mâu thuẫn cần phân xử.',
    );
  }

  return out.length > 1 ? out.join('\n') : null;
}

export function buildClassicalSubset(
  texts: RawClassicalTexts | null,
  keys: PalaceKey[],
  includeOverview = false,
): string {
  if (!texts) return '## B. VĂN BẢN CỔ HỌC\n(KHÔNG CÓ — luận từ lá số, confidence = "thap")';

  const lines: string[] = [`## B. VĂN BẢN CỔ HỌC THÔ (nguồn: ${texts.sourceUrl})`];
  lines.push('Văn bản ghép từ nhiều trường phái, có thể mâu thuẫn — phân xử theo trọng số.');
  lines.push('');

  if (includeOverview) {
    /*
     * Nhóm "Cửu Thiên Phi Tinh" + "vượng suy" in dạng VĂN XUÔI dài, nhưng bản chất
     * là dữ liệu. Render lại dạng cấu trúc: gọn hơn ~2 lần, và không có gì để cắt
     * giữa câu. Các heading này bị loại khỏi phần văn xuôi bên dưới để không lặp.
     */
    const structured = renderOverviewExtras(texts);
    if (structured) {
      lines.push(structured);
      lines.push('');
    }

    const dauMinh = renderDauMinh(texts, null);
    if (dauMinh) {
      lines.push(dauMinh);
      lines.push('');
    }

    for (const p of texts.overview) {
      if (isStructuredHeading(p.heading)) continue;
      lines.push(`[${p.heading}]`);
      lines.push(p.text);
      lines.push('');
    }
    for (const p of texts.bodyPalace) {
      lines.push(`[Cung Thân · ${p.heading}]`);
      lines.push(p.text);
      lines.push('');
    }
  }

  /* Mỗi lần gọi nhóm chỉ luận 4 cung → chỉ cần Đẩu Minh của 4 cung đó. */
  const groupDauMinh = renderDauMinh(texts, keys);
  if (groupDauMinh) {
    lines.push(groupDauMinh);
    lines.push('');
  }

  for (const key of keys) {
    const passages = texts.palaces[key];
    if (!passages?.length) continue;
    lines.push(`### ${PALACE_DISPLAY[key]}`);
    for (const p of passages) {
      lines.push(`[${p.heading}]`);
      lines.push(p.text);
      lines.push('');
    }
  }

  return lines.join('\n');
}

const JSON_ONLY_RULE = `CHỈ TRẢ VỀ MỘT OBJECT JSON. Không lời dẫn, không giải thích, không markdown,
không bọc trong \`\`\`json. Ký tự đầu tiên phải là "{" và ký tự cuối là "}".`;

/** Prompt lần gọi 1: tổng quan + lộ trình. */
export function buildOverviewPrompt({ chart, classical, name }: BuildPromptOptions): string {
  return [
    `Đương số${name ? `: ${name}` : ''} — ${chart.meta.gender === 'nam' ? 'Nam' : 'Nữ'}, sinh ${chart.meta.solarDate} (${chart.meta.lunarDateText}), ${chart.meta.timeName}. Xem hạn năm ${chart.meta.viewingYear}.`,
    '',
    buildChartContext(chart),
    '',
    buildClassicalSubset(classical, [], true),
    '',
    `## C. NHIỆM VỤ
${JSON_ONLY_RULE}

Viết PHẦN I (overview) và PHẦN V (actionPlan) của báo cáo:
- overview.opening: 2-3 câu tóm tắt khách quan (trục chính + điểm nghẽn), KHÔNG chào hỏi,
  KHÔNG ngôi thứ nhất, KHÔNG ngôi thứ ba. Xưng "bạn".
- overview.thienDiaNhan: tương quan Năm sinh (Âm/Dương) – Bản mệnh nạp âm – Cục.
- overview.cachCuc: cách cục chủ đạo, giải thích bằng ngôn ngữ hiện đại.
- overview.thanCu: Thân cư đâu, nửa sau cuộc đời nghiêng về gì.
- overview.personality: 3-4 nét tính cách + năng lực cốt lõi + điểm mù.
- actionPlan.decadalAnalysis: 3-6 đại vận trọng điểm (không cần đủ 12).
- actionPlan.goldenRules: đúng 3 nguyên tắc. Nếu có DỤNG THẦN trong khối Đẩu Minh,
  thì ít nhất 1 nguyên tắc phải dùng nó (màu sắc, hướng, môi trường, kiểu nghề) —
  đây là phần cải vận duy nhất có căn cứ dữ liệu, đừng bỏ trống.
- overview.thanCu hoặc overview.cachCuc: nếu khối Cửu Thiên Phi Tinh có dữ liệu,
  nêu cung ở vị trí Nhân (giờ sinh) là cung quan hệ trọng yếu nhất của đời, và
  cặp Thiên + Nhân lấy Địa làm trung gian. Nói bằng lời thường, không dùng thuật ngữ.
- editorialNotes: các mâu thuẫn trong văn bản cổ học đã phân xử thế nào.

meta lấy đúng từ dữ liệu ở trên.`,
  ].join('\n');
}

/** Prompt lần gọi 2–4: một nhóm 4 cung. */
export function buildGroupPrompt({
  chart,
  classical,
  keys,
  groupLabel,
}: BuildPromptOptions & { keys: PalaceKey[]; groupLabel: string }): string {
  const list = keys.map((k) => `- ${k} (${PALACE_DISPLAY[k]})`).join('\n');
  return [
    `Đương số — ${chart.meta.gender === 'nam' ? 'Nam' : 'Nữ'}, sinh ${chart.meta.solarDate} (${chart.meta.lunarDateText}), ${chart.meta.timeName}. Xem hạn năm ${chart.meta.viewingYear}.`,
    '',
    buildChartContext(chart, { detailPalaces: keys, includeDecadal: false, includeAnnual: false }),
    '',
    buildClassicalSubset(classical, keys),
    '',
    `## C. NHIỆM VỤ
${JSON_ONLY_RULE}

Viết ${groupLabel}, đúng ${keys.length} cung theo thứ tự:
${list}

Mỗi cung cần:
- narrative: TỐI ĐA 2 đoạn văn xuôi, tổng 300-650 ký tự, ngăn bằng \\n\\n.
  Đoạn 1: bản chất + hệ quả cụ thể. Đoạn 2: cái giá phải trả và điều nên làm khác đi.
  KHÔNG gạch đầu dòng. KHÔNG nhắc lại danh sách sao (đã có ở headline).
  KHÔNG câu đệm, KHÔNG giải thích khái niệm tử vi, KHÔNG quá 3 ý cho một cung.
  Chủ ngữ là SAO hoặc ĐỜI SỐNG, không phải "tôi/có thể thấy". Xưng "bạn" chỉ khi
  khuyên trực tiếp. KHÔNG "anh/chị/đương số/người này", KHÔNG "tôi/chúng ta".
  Câu đầu mỗi đoạn là KẾT LUẬN. Nêu cặp "gặp X thì Y / không gặp thì Z".
  KHÔNG mở rộng sang cung khác ngoài xung chiếu/tam hợp trực tiếp.
- headline: MỘT câu, tối đa 25 từ, nêu sao + hệ quả. Đây là thứ người đọc đọc trước.
- strengths (1-2), risks (1-2), strategy (2-3, mỗi ý dưới 20 từ), evidence là tên sao cụ thể.
- score: lấy điểm ENGINE trong bảng, lệch tối đa ±8, ghi scoreDelta và scoreReason.

Trả về object { "palaces": [ ... ] } đúng ${keys.length} phần tử.`,
  ].join('\n');
}

/**
 * Few-shot: MỘT cung viết đúng + một bản SAI đối chiếu.
 *
 * VÌ SAO CẦN: cả hai gói dán tay (kỹ năng và chat thường) đều không có MỘT ví
 * dụ đầu ra hoàn chỉnh nào — chỉ có mô tả trừu tượng ("mỗi câu một thông tin
 * mới"). Model bắt chước mẫu tốt hơn hẳn so với đọc luật, và đây là lever chất
 * lượng mạnh nhất còn bỏ trống.
 *
 * VÌ SAO NẰM Ở ĐÂY chứ không phải trong skill-package: hai gói đều cần nó, mà
 * skill-package lại import `SHAPE_PALACE` từ chat-bundle. Nhét vào một trong hai
 * là tạo vòng import chat-bundle ↔ skill-package. prompt-builder nằm giữa nên cả
 * hai import một chiều.
 *
 * MẪU DỮ LIỆU ĐÃ KIỂM CHỨNG: mọi sao trong ví dụ đều có thật trong lá số
 * 1990-10-21 (Thiên Đồng Bình + Hóa Kỵ, Kình Dương Hãm, Linh Tinh Đắc tại Nô Bộc
 * Dậu; không có Thái Âm/Thiên Lương trong cung lẫn xung chiếu). Không dùng ví dụ
 * bịa — dạy model viết sai chính là dạy nó bịa trong báo cáo thật.
 *
 * Bản SAI chứa đúng những lỗi đã gặp thật: câu đệm, không căn cứ sao, không hệ
 * quả đời sống, đọc xong không biết làm gì.
 */
export function buildFewShot(): string {
  return `# MẪU THAM KHẢO — MỘT CUNG VIẾT ĐÚNG

Dữ liệu của cung này: ĐIỂM ENGINE 50 · Thiên Đồng (Bình) kèm Hóa Kỵ · Kình Dương (Hãm) · Linh Tinh (Đắc) · không có Thái Âm, Thiên Lương trong cung lẫn xung chiếu.

ĐÚNG — viết thế này:

"Thiên Đồng Bình ở Dậu gặp Hóa Kỵ, nên bạn bè và cấp dưới hay hiểu lầm nhau trước khi hiểu nhau. Kình Dương hãm đồng cung làm chuyện bạn bè dễ thành tranh chấp về tiền hoặc lời hứa. Linh Tinh đắc địa khiến xung đột bùng nhanh, nhưng không kéo dài nếu việc đã rõ ràng. Không gặp Thái Âm hay Thiên Lương thì trợ lực từ người xung quanh ít.

Cái giá là phải trả thêm chi phí và thời gian để sửa quan hệ, nhiều lúc mất người chứ không mất việc. Nên lập điều khoản rõ khi hợp tác, và chọn người cùng chí hướng thay vì người quen nhiều."

SAI — cùng nội dung, KHÔNG được viết thế này:

"Nô Bộc của bạn có Thiên Đồng ở Dậu. Điều này cho thấy bạn dễ gặp hiểu lầm trong quan hệ. Nhìn chung, quan hệ bạn bè có một số điểm cần lưu ý. Tóm lại, nên cẩn thận khi hợp tác với người khác. Đây là một điểm đáng lưu ý trong lá số của bạn."

Vì sao bản dưới sai: 5 câu mà không có một hệ quả đời sống cụ thể nào; toàn câu đệm; không một căn cứ sao được dùng để suy ra kết quả; đọc xong không biết phải làm gì khác đi.

## CHIỀU SÂU THEO ĐIỂM ENGINE

Cung mạnh và cung yếu KHÔNG viết cùng một khuôn:

- ĐIỂM ENGINE ≥ 75: 2 đoạn — đoạn 1 thế mạnh và cách phát huy, đoạn 2 cái giá của chính thế mạnh đó.
- 51–74: 1–2 đoạn, cân bằng thuận và trắc trở.
- ≤ 50: 1 đoạn, đi thẳng vào rủi ro và cách phòng. KHÔNG lấy 2 đoạn để lặp lại một ý.
`;
}
