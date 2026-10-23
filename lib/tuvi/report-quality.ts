/**
 * lib/tuvi/report-quality.ts — KIỂM TRA CHẤT LƯỢNG BÁO CÁO SAU KHI SINH
 * ---------------------------------------------------------------------------
 * VÌ SAO CẦN: đến nay mọi thứ phụ thuộc mô hình "tự làm đúng". Không có vòng kiểm
 * nên các lỗi sau chỉ phát hiện được khi người dùng đọc:
 *   - narrative dồn thành một khối (đã gặp thật, 22/10)
 *   - evidence nêu sao không có trong lá số (editorialNotes từng ghi chuyện này)
 *   - 12 cung nhận cùng một khuôn chiều sâu dù điểm chênh 29 → 75
 *
 * NÊN DÙNG Ở ĐÂU:
 *   - `/api/report/import` khi người dùng dán báo cáo từ Gemini về;
 *   - `scripts/test-pipeline.ts` — chấm MOCK_REPORT và các biến thể cố tình làm
 *     hỏng, để tiêu chí sửa mà không ai canh thì gãy ngay ở đây.
 *
 * GIỚI HẠN PHẢI THỪA NHẬN: các tiêu chí văn phong (mật độ thông tin, nhịp câu)
 * khó kiểm bằng máy hơn nhiều so với độ dài và trùng lặp. Ở đây chỉ kiểm được
 * những thứ đo được — và đó vẫn là phần lớn lỗi đã gặp thật.
 * ---------------------------------------------------------------------------
 */

import type { NormalizedChartJSON, RawClassicalTexts } from '@/types/tuvi';
import type { TuViFullReport } from '@/schemas/report.schema';

export interface QualityIssue {
  /** Mã tiêu chí — dùng để tra cứu, không dịch ra lời. */
  id: string;
  pass: boolean;
  detail: string;
}

export interface QualityResult {
  passed: number;
  total: number;
  issues: QualityIssue[];
}

/**
 * Hình dạng gửi lên client: chỉ kèm các tiêu chí RỚT.
 *
 * Vì sao phải có hàm này: UI chỉ render các tiêu chí RỚT, còn API vẫn giữ đủ
 * 12 tiêu chí để test và gỡ lỗi. Tách một chỗ lọc duy nhất để hai bên không lệch
 * nhau — loại lệch này rất khó thấy vì nó nằm ở tầng JSON.
 */
export type QualitySummary = Pick<QualityResult, 'passed' | 'total'> & { issues: QualityIssue[] };

export function qualityForClient(result: QualityResult): QualitySummary {
  return {
    passed: result.passed,
    total: result.total,
    issues: result.issues.filter((i) => !i.pass),
  };
}

/**
 * Nhãn tiếng Việt cho từng tiêu chí — dành cho UI.
 *
 * `id` giữ nguyên tiếng Anh ở đây và trong JSON để làm khoá tra cứu (không
 * dịch: đổi nhãn không được làm đổi khoá). Thiếu nhãn thì UI rơi về `id`.
 */
export const QUALITY_LABEL: Record<string, string> = {
  'count-12': 'đủ 12 cung',
  'len-narrative': 'độ dài phần luận 300–650 ký tự',
  'len-spread': 'cung mạnh viết dài hơn cung yếu',
  'evidence-real': 'dẫn chứng truy được về lá số',
  'quote-real': 'câu phú dẫn đúng văn bản cổ học',
  'score-delta': 'điểm lệch engine ≤ 8',
  'star-scope': 'sao nhắc thuộc cung / tam hợp / xung chiếu',
  'dup-sentence': 'không trùng câu giữa các cung',
  'ban-phrase': 'không câu đệm',
  'ban-person': 'không ngôi cấm',
  'star-in-narrative': 'narrative có căn cứ sao',
  'para-structure': 'narrative 1–2 đoạn',
};

/** Gộp 4 nhóm sao của một cung thành tập tên sao (đã chuẩn hoá thường). */
function starsOf(palace: NormalizedChartJSON['palaces'][number]): string[] {
  return [...palace.majorStars, ...palace.auspicious, ...palace.malefic, ...palace.neutral]
    .map((s) => s.name.trim().toLowerCase())
    .filter(Boolean);
}

/* Tam hợp và xung chiếu — dùng để phán đoán sao nhắc ở cung khác có hợp lệ không. */
const TRINES: string[][] = [
  ['Thân', 'Tý', 'Thìn'],
  ['Dần', 'Ngọ', 'Tuất'],
  ['Tỵ', 'Dậu', 'Sửu'],
  ['Hợi', 'Mão', 'Mùi'],
];
const OPPOSITE: Record<string, string> = {
  'Tý': 'Ngọ', 'Ngọ': 'Tý', 'Sửu': 'Mùi', 'Mùi': 'Sửu',
  'Dần': 'Thân', 'Thân': 'Dần', 'Mão': 'Dậu', 'Dậu': 'Mão',
  'Thìn': 'Tuất', 'Tuất': 'Thìn', 'Tỵ': 'Hợi', 'Hợi': 'Tỵ',
};

/** Chuẩn hoá một đoạn văn để so khớp: thường, bỏ dấu cách thừa. */
function norm(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** So câu phú với nguồn: bỏ hết khoảng trắng, dấu câu và ký hiệu. */
function normQuote(text: string): string {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

/** Tách câu, chuẩn hoá, chỉ giữ câu có ≥ 8 từ. */
function sentences(text: string): string[] {
  return norm(text)
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.split(' ').length >= 8);
}

const BAN_PHRASES = [
  'nhìn chung',
  'tóm lại',
  'có thể nói rằng',
  'điều này cho thấy',
  'đây là một điểm đáng lưu ý',
  'như đã nói',
];

/**
 * Kiểm ngôi cấm. Tiếng Việt không dùng được \b với ký tự có dấu, nên tách token
 * bằng dấu cách. "anh em" / "chị em" là quan hệ, không phải ngôi thứ ba — loại ra.
 */
function bannedPerson(text: string): string[] {
  const found: string[] = [];
  const tokens = text
    .toLowerCase()
    .replace(/[.,;:!?()"]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const next = tokens[i + 1] ?? '';
    if (t === 'tôi') found.push('tôi');
    else if (t === 'đương' && next === 'số') found.push('đương số');
    else if (t === 'người' && next === 'này') found.push('người này');
    else if ((t === 'anh' || t === 'chị') && next !== 'em') found.push(t);
  }
  return [...new Set(found)];
}

export function checkReportQuality(
  report: TuViFullReport,
  chart: NormalizedChartJSON,
  classical?: RawClassicalTexts | null,
): QualityResult {
  const issues: QualityIssue[] = [];
  const push = (id: string, pass: boolean, detail: string) => issues.push({ id, pass, detail });

  const palaces = [...report.careerGroup, ...report.familyGroup, ...report.socialGroup];

  /* ---- 1. đủ 12 cung ---- */
  push('count-12', palaces.length === 12, `${palaces.length} cung`);

  /* ---- 2. độ dài narrative ---- */
  const lens = palaces.map((p) => ({ name: p.palaceName, len: p.narrative.length }));
  const outOfBand = lens.filter((x) => x.len < 300 || x.len > 650);
  push(
    'len-narrative',
    outOfBand.length === 0,
    outOfBand.length
      ? `ngoài 300–650: ${outOfBand.map((x) => `${x.name} ${x.len}`).join(', ')}`
      : `tất cả trong 300–650 (biên độ ${Math.min(...lens.map((x) => x.len))}–${Math.max(...lens.map((x) => x.len))})`,
  );

  /* ---- 3. biên độ độ dài — cung mạnh phải dài hơn cung yếu ---- */
  const spread = Math.max(...lens.map((x) => x.len)) - Math.min(...lens.map((x) => x.len));
  push(
    'len-spread',
    spread >= 150,
    `max − min = ${spread} (muốn ≥ 150 để cung mạnh được viết kỹ hơn cung yếu)`,
  );

  /* ---- 4. evidence có thật trong lá số ---- */
  const allStars = new Set<string>();
  for (const p of chart.palaces) for (const s of starsOf(p)) allStars.add(s);

  /* Ngoài sao, evidence được phép nêu: Tứ Hóa, Tuần/Triệt, Vô chính diệu, và các
     khái niệm cấu trúc (Thân cư, Mệnh cư, Mệnh chủ…) — chúng không phải sao nhưng
     vẫn truy được về dữ liệu lá số. Chú ý chính tả: "Triệt" có ệ, không phải "trệt". */
  const extraTokens = [
    'hóa lộc',
    'hóa quyền',
    'hóa khoa',
    'hóa kỵ',
    'tuần',
    'triệt',
    'tràng sinh',
    'vô chính diệu',
    'thân cư',
    'mệnh cư',
    'thân chủ',
    'mệnh chủ',
    'đại vận',
    'cục',
    'nạp âm',
  ];
  const fake: string[] = [];
  for (const p of palaces) {
    const ev = [
      ...p.strengths.flatMap((s) => s.evidence),
      ...p.risks.flatMap((s) => s.evidence),
    ];
    for (const e of ev) {
      const n = norm(e);
      const starHit = [...allStars].some((s) => n.includes(s));
      const tokenHit = extraTokens.some((t) => n.includes(t));
      if (!starHit && !tokenHit) fake.push(`${p.palaceName}: "${e}"`);
    }
  }
  push(
    'evidence-real',
    fake.length === 0,
    fake.length ? `${fake.length} mục không truy được: ${fake.slice(0, 3).join(' · ')}` : 'mọi evidence truy được về sao/trạng thái trong lá số',
  );

  /* ---- 4b. câu phú dẫn phải có thật trong văn bản cổ học ----
     Lỗi thật: mô hình hay gán một câu phú chữ Hán "nghe hợp" cho cách cục, nhưng
     câu đó không hề có trong nguồn. Người đọc không kiểm được vì phần lớn không
     biết chữ Hán — nên phải đối chiếu tự động. Chỉ so khi báo cáo CÓ dẫn quote;
     báo cáo không dẫn câu phú vẫn đạt (không có gì để bịa). */
  const quote = report.overview.cachCuc.classicalQuote?.trim();
  const quoteMeaning = report.overview.cachCuc.quoteMeaning?.trim();
  if (!quote) {
    push('quote-real', true, 'không dẫn câu phú');
  } else if (!quoteMeaning) {
    push('quote-real', false, `dẫn "${quote.slice(0, 40)}" nhưng thiếu quoteMeaning`);
  } else if (!classical) {
    push('quote-real', false, `dẫn "${quote.slice(0, 40)}" nhưng không có văn bản cổ học để đối chiếu`);
  } else {
    const passages = [
      ...classical.overview,
      ...classical.bodyPalace,
      ...Object.values(classical.palaces).flatMap((ps) => ps ?? []),
    ];
    const sourceNorm = normQuote(passages.map((p) => `${p.heading} ${p.text}`).join('\n'));
    const quoteNorm = normQuote(quote);
    const pass = quoteNorm.length >= 4 && sourceNorm.includes(quoteNorm);
    push(
      'quote-real',
      pass,
      pass
        ? `câu phú có trong nguồn cổ học: "${quote.slice(0, 40)}"`
        : quoteNorm.length < 4
          ? `câu phú quá ngắn để đối chiếu: "${quote}"`
          : `không tìm thấy câu phú trong văn bản cổ học: "${quote.slice(0, 40)}"`,
    );
  }

  /* ---- 5. điểm lệch engine ≤ 8 ---- */
  const overDelta: string[] = [];
  for (const p of palaces) {
    const engine = chart.palaces.find((c) => c.key === p.palaceKey)?.score.total;
    if (typeof engine === 'number' && Math.abs(p.score - engine) > 8) {
      overDelta.push(`${p.palaceName} ${p.score} vs ${engine}`);
    }
  }
  push(
    'score-delta',
    overDelta.length === 0,
    overDelta.length ? `lệch > 8: ${overDelta.join(', ')}` : 'mọi cung lệch ≤ 8 điểm',
  );

  /* ---- 5b. sao nhắc phải thuộc cung / tam hợp / xung chiếu ----
     Lỗi thật: 6/12 cung của báo cáo mẫu nhắc sao thuộc cung khác (ví dụ Phu Thê
     nêu Tham Lang vốn ở Mệnh). Một số là chủ ý ("không gặp X"), nên tiêu chí này
     chỉ cảnh báo chi tiết, không chặn import. */
  const starsByBranch = new Map<string, Set<string>>();
  for (const p of chart.palaces) {
    const set = new Set<string>();
    for (const st of [...p.majorStars, ...p.auspicious, ...p.malefic, ...p.neutral]) {
      set.add(st.name.trim().toLowerCase());
    }
    starsByBranch.set(p.branch, set);
  }
  const outOfScope: string[] = [];
  for (const p of palaces) {
    const own = chart.palaces.find((c) => c.key === p.palaceKey);
    if (!own) continue;
    const allowed = new Set<string>(extraTokens);
    for (const b of [
      own.branch,
      OPPOSITE[own.branch],
      ...(TRINES.find((t) => t.includes(own.branch)) ?? []),
    ]) {
      for (const s of starsByBranch.get(b) ?? []) allowed.add(s);
    }

    const text = norm(`${p.headline} ${p.narrative}`);
    const bad: string[] = [];
    for (const [branch, set] of starsByBranch as Map<string, Set<string>>) {
      for (const star of set) {
        if (star.length < 5 || !text.includes(star)) continue;
        if (bad.some((x) => x.includes(star) || star.includes(x.split('(')[0]))) continue;
        if (!allowed.has(star)) bad.push(`${star} (cung ${branch})`);
      }
    }
    if (bad.length) outOfScope.push(`${p.palaceName}: ${bad.join(', ')}`);
  }
  push(
    'star-scope',
    outOfScope.length === 0,
    outOfScope.length
      ? `${outOfScope.length} cung nhắc sao ngoài tam hợp/xung chiếu — cần xem lại: ${outOfScope.slice(0, 2).join(' · ')}`
      : 'mọi sao nhắc thuộc cung/tam hợp/xung chiếu',
  );

  /* ---- 6. không trùng câu giữa các cung ---- */
  const seen = new Map<string, string>();
  const dups: string[] = [];
  for (const p of palaces) {
    for (const sent of sentences(p.narrative)) {
      const prev = seen.get(sent);
      if (prev && prev !== p.palaceName) {
        dups.push(`"${sent.slice(0, 60)}…" xuất hiện ở cả ${prev} và ${p.palaceName}`);
      } else {
        seen.set(sent, p.palaceName);
      }
    }
  }
  push(
    'dup-sentence',
    dups.length === 0,
    dups.length ? dups.slice(0, 2).join(' · ') : 'không câu nào lặp giữa các cung',
  );

  /* ---- 7. không câu đệm ---- */
  const fillers: string[] = [];
  for (const p of palaces) {
    const n = norm(p.narrative);
    for (const ph of BAN_PHRASES) {
      if (n.includes(ph)) fillers.push(`${p.palaceName}: "${ph}"`);
    }
  }
  push(
    'ban-phrase',
    fillers.length === 0,
    fillers.length ? `${fillers.length} câu đệm: ${fillers.slice(0, 3).join(' · ')}` : 'không câu đệm',
  );

  /* ---- 8. không ngôi cấm ---- */
  const persons: string[] = [];
  for (const p of palaces) {
    const hits = bannedPerson(p.narrative);
    if (hits.length) persons.push(`${p.palaceName}: ${hits.join(', ')}`);
  }
  push(
    'ban-person',
    persons.length === 0,
    persons.length ? `ngôi cấm: ${persons.slice(0, 3).join(' · ')}` : 'không ngôi thứ nhất / ngôi thứ ba',
  );

  /* ---- 9. narrative có căn cứ sao ---- */
  const noStar: string[] = [];
  for (const p of palaces) {
    const n = norm(p.narrative);
    const chartPalace = chart.palaces.find((c) => c.key === p.palaceKey);
    const own = chartPalace ? starsOf(chartPalace) : [];
    const hit = own.some((s) => n.includes(s));
    if (!hit) noStar.push(p.palaceName);
  }
  push(
    'star-in-narrative',
    noStar.length === 0,
    noStar.length ? `không nhắc chính tinh của cung: ${noStar.join(', ')}` : 'mọi narrative nhắc chính tinh của cung',
  );

  /* ---- 10. cấu trúc đoạn: 1–2 đoạn ---- */
  const badPara: string[] = [];
  for (const p of palaces) {
    const paras = p.narrative.split(/\n{2,}/).filter((x) => x.trim());
    if (paras.length > 2 || paras.length === 0) badPara.push(`${p.palaceName} ${paras.length} đoạn`);
  }
  push(
    'para-structure',
    badPara.length === 0,
    badPara.length ? `quá 2 đoạn: ${badPara.join(', ')}` : 'mọi narrative 1–2 đoạn',
  );

  const passed = issues.filter((x) => x.pass).length;
  return { passed, total: issues.length, issues };
}
