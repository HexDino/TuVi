/**
 * scripts/test-pipeline.ts
 * ---------------------------------------------------------------------------
 * Kiểm thử pipeline không cần API mô hình:
 *   - dựng context thật (lá số + văn bản cổ học)
 *   - fixture khớp schema
 *   - gói kỹ năng khớp schema, đủ tài liệu tham khảo, tải được từng tệp
 *   - parser nhận đúng câu trả lời 4 khối và chặn bộ cung sai
 *   - validator chất lượng bắt đúng các lỗi cố tình tạo
 *
 * Chạy: npm run pipeline:test
 * ---------------------------------------------------------------------------
 */
import './load-env';
import { analyzeChart } from '../lib/tuvi/pipeline';
import { buildHints } from '../lib/tuvi/prompt-builder';
import { TuViFullReportSchema } from '../schemas/report.schema';
import { MOCK_REPORT as SAMPLE } from './fixtures/mock-report';
import {
  buildSkillMd,
  buildSkillPayload,
  buildSkillPartPayloads,
  buildSkillFiles,
  buildSkillZip,
  SKILL_NAME,
} from '../lib/tuvi/skill-package';
import { parseChatResponse } from '../lib/tuvi/chat-bundle';
import { GET as getSkillFile } from '../app/api/skill/route';
import {
  checkReportQuality,
  qualityForClient,
  QUALITY_LABEL,
  type QualityResult,
} from '../lib/tuvi/report-quality';
import { PALACE_GROUPS } from '../schemas/report.schema';

async function main() {
  console.log('▶ Module 1 + 2: dựng context…');
  const { chart, classical, warnings } = await analyzeChart({
    name: 'Nguyễn Văn A',
    gender: 'nam',
    calendarType: 'solar',
    date: '1990-10-21',
    hour: 12,
    viewingYear: 2026,
  });

  console.log(`  ✓ lá số ${chart.meta.solarDate}, ${chart.palaces.length} cung`);
  console.log(`  ✓ cổ học: ${classical?.overview.length ?? 0} đoạn tổng quan, ${Object.keys(classical?.palaces ?? {}).length} cung`);
  console.log(`  ✓ warnings: ${warnings.length}`);
  console.log(`  ✓ hints mẫu: ${JSON.stringify(buildHints(chart).menh?.slice(0, 4))}`);

  console.log('\n▶ Fixture khớp schema?');
  const ok = TuViFullReportSchema.safeParse(SAMPLE);
  console.log(`  ${ok.success ? '✓' : '✗'} MOCK_REPORT khớp TuViFullReportSchema`);
  if (!ok.success) {
    console.error(ok.error.issues.slice(0, 3));
    process.exitCode = 1;
  }

  /*
   * CHỐNG LỆCH GIỮA GÓI KỸ NĂNG VÀ SCHEMA.
   * Gói kỹ năng dạy mô hình tên field bằng văn bản; schema kiểm tra bằng Zod.
   * Hai bên lệch nhau thì mọi báo cáo người dùng dán về đều hỏng validate, mà
   * triệu chứng lại hiện ở tận tay người dùng. Kiểm tra ở đây để gãy ngay.
   */
  console.log('\n▶ Gói kỹ năng khớp schema?');
  const gem = buildSkillMd();
  const gemChecks: Array<[string, boolean]> = [
    ['có "rationale" (tên field đúng)', gem.includes('"rationale"')],
    ['không có "ruleRationale"', !gem.includes('ruleRationale')],
    ['có "palaceKey"', gem.includes('"palaceKey"')],
    ['có "scoreDelta"', gem.includes('"scoreDelta"')],
    ['đủ 4 dấu phân cách', [1, 2, 3, 4].every((n) => gem.includes(`PHẦN ${n}`))],
    ['có điều khoản cách ly ngữ cảnh', gem.includes('CÁCH LY NGỮ CẢNH')],
    ['frontmatter có name kebab-case', gem.includes(`name: ${SKILL_NAME}`) && /^name: [a-z0-9-]+$/m.test(gem)],
    ['có mô tả cho bộ định tuyến skill', gem.includes('description: ')],
    /* GIỚI HẠN LÀ BYTE, KHÔNG PHẢI KÝ TỰ.
       Bản 8.072 ký tự = 9.957 byte ĐÃ upload được, nên trần thật ≥ 9.957 và
       gần như chắc chắn là 10.000 byte. Chỉ còn 43 byte dư — thêm bất cứ thứ gì
       vào SKILL.md phải kèm việc cắt bớt tương đương.
       Tiếng Việt UTF-8 tốn ~1,23 byte/ký tự. Bản 8.072 ký tự = 9.957 byte (vừa
       sát trần 10.000); thêm 900 ký tự thành 11.126 byte → Gemini từ chối upload.
       Kiểm theo ký tự sẽ báo "ổn" trong khi thực tế đã vượt. */
    [
      `kích thước SKILL.md < 10.000 byte (thực tế ${Buffer.byteLength(gem, 'utf8')})`,
      Buffer.byteLength(gem, 'utf8') < 10000,
    ],
    ['hợp đồng JSON bắt buộc', gem.includes('Trả lời bằng **đúng 4 khối JSON**')],
  ];
  for (const [label, pass] of gemChecks) {
    console.log(`  ${pass ? '✓' : '✗'} ${label}`);
    if (!pass) process.exitCode = 1;
  }

  /* Dựng một câu trả lời ĐÚNG định dạng của gói kỹ năng rồi cho parser xử lý —
     kiểm tra end-to-end thật sự: gói kỹ năng → mô hình trả lời → parser ghép báo cáo. */
  const fakeAnswer = [
    '=== PHẦN 1: TỔNG QUAN ===',
    JSON.stringify({
      meta: SAMPLE.meta,
      overview: SAMPLE.overview,
      actionPlan: SAMPLE.actionPlan,
      editorialNotes: SAMPLE.editorialNotes,
    }),
    '=== PHẦN 2: TAM HỢP SỰ NGHIỆP ===',
    JSON.stringify({ palaces: SAMPLE.careerGroup }),
    '=== PHẦN 3: TAM HỢP GIA ĐẠO ===',
    JSON.stringify({ palaces: SAMPLE.familyGroup }),
    '=== PHẦN 4: QUAN HỆ XÃ HỘI & SỨC KHỎE ===',
    JSON.stringify({ palaces: SAMPLE.socialGroup }),
  ].join('\n');

  const parsedAnswer = parseChatResponse(fakeAnswer);
  if (parsedAnswer.ok) {
    const total =
      parsedAnswer.report.careerGroup.length +
      parsedAnswer.report.familyGroup.length +
      parsedAnswer.report.socialGroup.length;
    console.log(`  ✓ câu trả lời định dạng kỹ năng → ${total} cung, ${parsedAnswer.report.actionPlan.goldenRules.length} goldenRules`);
    if (total !== 12) process.exitCode = 1;
  } else {
    console.log(`  ✗ parse câu trả lời kỹ năng thất bại: ${parsedAnswer.error}`);
    process.exitCode = 1;
  }

  /* Đúng 4 phần tử nhưng sai bộ cung (lặp Mệnh, mất Thiên Di) vẫn qua được
     ràng buộc length của Zod — validator bộ khoá phải chặn. */
  const wrongKeyAnswer = fakeAnswer.replace('"palaceKey":"thien_di"', '"palaceKey":"menh"');
  const wrongKeyParsed = parseChatResponse(wrongKeyAnswer);
  const wrongKeyCaught = !wrongKeyParsed.ok && /sai bộ cung/i.test(wrongKeyParsed.error);
  console.log(`  ${wrongKeyCaught ? '✓' : '✗'} bộ cung sai (lặp Mệnh, thiếu Thiên Di) bị chặn`);
  if (!wrongKeyCaught) process.exitCode = 1;

  /* Kiểm tra cấu trúc ZIP: chữ ký "PK\x03\x04" và tên file nằm trong central
     directory. Gemini từ chối gói không có SKILL.md ở gốc, mà lỗi đó chỉ hiện
     lúc upload — kiểm ở đây rẻ hơn nhiều. */
  const zip = buildSkillZip();
  const zipText = zip.toString('latin1');
  /* Đọc end-of-central-directory bằng BYTE, không bằng chuỗi: 0x05/0x06 là ký
     tự điều khiển, so bằng string dễ sai vì escape. */
  const hasEocd =
    zip.length >= 22 && zip.readUInt32LE(zip.length - 22) === 0x06054b50;
  const zipChecks: Array<[string, boolean]> = [
    ['chữ ký ZIP hợp lệ', zip.readUInt32LE(0) === 0x04034b50],
    ['có entry "SKILL.md"', zipText.includes('SKILL.md')],
    ['có entry references/', zipText.includes('references/')],
    /* Gemini yêu cầu SKILL.md ở THƯ MỤC CHÍNH — phần tử đầu phải là nó, không
       phải nằm trong thư mục con. */
    ['SKILL.md là tệp đầu tiên (ở gốc gói)', buildSkillFiles()[0]?.path === 'SKILL.md'],
    ['có end-of-central-directory', hasEocd],
  ];
  for (const [label, pass] of zipChecks) {
    console.log(`  ${pass ? '✓' : '✗'} ${label}`);
    if (!pass) process.exitCode = 1;
  }
  console.log(`  ✓ gói .zip: ${(zip.length / 1024).toFixed(1)} KB, ${buildSkillFiles().length} tệp`);

  /*
   * GÓI PHẢI MANG ĐỦ TÀI LIỆU THAM KHẢO CHO GEMINI.
   * SKILL.md bị đóng trần 10.000 byte nên phần mẫu (ví dụ cung ĐÚNG/SAI, bảng
   * chiều sâu) phải nằm ở references/ — nhưng chỉ đưa vào file phụ mà SKILL.md
   * không trỏ tới thì mô hình không bao giờ đọc, thành công cốc âm. Canh cả hai
   * vế: file có tồn tại VÀ SKILL.md dẫn tới nó.
   */
  console.log('\n▶ Gói kỹ năng có đủ tài liệu tham khảo?');
  const skillMd = buildSkillMd();
  const files = buildSkillFiles();
  const outputExample = files.find((f) => f.path === 'references/vi-du-dau-ra.md');
  const refChecks: Array<[string, boolean]> = [
    ['gói có đúng 4 tệp (SKILL.md + 3 references)', files.length === 4],
    ['có references/vi-du-dau-ra.md', Boolean(outputExample)],
    [
      'SKILL.md trỏ tới ví dụ đầu ra',
      skillMd.includes('references/vi-du-dau-ra.md'),
    ],
    [
      'SKILL.md trỏ tới ví dụ văn phong',
      skillMd.includes('references/vi-du-van-phong.md'),
    ],
    [
      'SKILL.md có bảng chiều sâu theo điểm',
      skillMd.includes('Chiều sâu theo ĐIỂM ENGINE'),
    ],
    [
      'SKILL.md có checklist tự kiểm (khớp validator)',
      skillMd.includes('TỰ KIỂM TRƯỚC KHI TRẢ LỜI'),
    ],
    [
      'references/vi-du-dau-ra.md chứa ví dụ cung ĐÚNG/SAI',
      Boolean(outputExample && outputExample.content.includes('MẪU THAM KHẢO')),
    ],
    [
      'references/vi-du-dau-ra.md chứa bảng chiều sâu',
      Boolean(outputExample && outputExample.content.includes('CHIỀU SÂU THEO ĐIỂM ENGINE')),
    ],
  ];
  for (const [label, pass] of refChecks) {
    console.log(`  ${pass ? '✓' : '✗'} ${label}`);
    if (!pass) process.exitCode = 1;
  }

  /*
   * TỪNG TỆP TRONG GÓI PHẢI TẢI ĐƯỢC QUA /api/skill?file=…
   * SKILL.md trỏ mô hình tới "references/vi-du-dau-ra.md". Route không có key
   * tương ứng thì người dùng tải không ra file: mô hình thấy đường dẫn trong luật
   * mà mở ra 404. Kiểm bằng chính hàm GET của route, không đoán bằng chuỗi.
   */
  console.log('\n▶ Mỗi tệp tham khảo tải được từ /api/skill?file=');
  for (const f of files) {
    if (!f.path.startsWith('references/')) continue;
    const key = f.path.replace('references/', '').replace(/\.md$/, '');
    const res = await getSkillFile(new Request(`http://localhost/api/skill?file=${key}`));
    const pass = res.status === 200 && (await res.text()) === f.content;
    console.log(`  ${pass ? '✓' : '✗'} ?file=${key} → ${res.status}`);
    if (!pass) process.exitCode = 1;
  }

  for (const m of ['compact', 'full'] as const) {
    const pl = buildSkillPayload(chart, classical, m);
    console.log(
      `  ✓ payload ${m}: ${pl.chars.toLocaleString('vi-VN')} ký tự ≈ ${pl.tokenEstimate.toLocaleString('vi-VN')} token`,
    );
  }

  console.log('\n▶ Kỹ năng chia 4 lượt?');
  const parts = buildSkillPartPayloads(chart, classical, 'full');
  const compactParts = buildSkillPartPayloads(chart, classical, 'compact');
  const partKeys = [PALACE_GROUPS.career, PALACE_GROUPS.family, PALACE_GROUPS.social];
  for (const p of parts) {
    console.log(`  • phần ${p.part} ${p.title}: ${p.chars.toLocaleString('vi-VN')} ký tự`);
  }
  const partChecks: Array<[string, boolean]> = [
    ['đúng 4 phần', parts.length === 4],
    [
      'mỗi phần yêu cầu đúng dòng phân cách',
      parts.every((p) => p.prompt.includes(`=== PHẦN ${p.part}: ${p.title} ===`)),
    ],
    [
      'phần 2–4 mang đúng 4 khoá cung',
      [2, 3, 4].every((n) => partKeys[n - 2].every((k) => parts[n - 1].prompt.includes(k))),
    ],
    [
      'phần 1 có Đại vận + Lưu niên',
      parts[0].prompt.includes('### Đại vận') && parts[0].prompt.includes('### Lưu niên'),
    ],
    ['phần 2–4 không kèm Đại vận', parts.slice(1).every((p) => !p.prompt.includes('### Đại vận'))],
    ['phần 2–4 có ví dụ văn phong', parts.slice(1).every((p) => p.prompt.includes('MẪU THAM KHẢO'))],
    ['mỗi phần là prompt độc lập (< 30k ký tự)', parts.every((p) => p.chars > 0 && p.chars < 30_000)],
    [
      'bản gọn: chỉ phần 1 hạ confidence = "thap"',
      compactParts[0].prompt.includes('meta.confidence = "thap"') &&
        compactParts.slice(1).every((p) => !p.prompt.includes('meta.confidence')),
    ],
  ];
  for (const [label, pass] of partChecks) {
    console.log(`  ${pass ? '✓' : '✗'} ${label}`);
    if (!pass) process.exitCode = 1;
  }

  /*
   * CHẾ ĐỘ KHÔNG CẦN CÀI (ĐIỆN THOẠI).
   * Gemini mobile không cho tải tệp kỹ năng, nên mỗi phần phải tự mang bộ luật.
   * Hai thứ phải giữ được cùng lúc: đủ luật để chất lượng không giảm, và không
   * vượt 30k ký tự để còn dán nổi vào một chat.
   */
  console.log('\n▶ Chế độ không cần cài (luật nhúng trong từng phần)?');
  const inlineParts = buildSkillPartPayloads(chart, classical, 'full', 'inline');
  const inlineCompact = buildSkillPartPayloads(chart, classical, 'compact', 'inline');
  for (const p of inlineParts) {
    console.log(`  • phần ${p.part} ${p.title}: ${p.chars.toLocaleString('vi-VN')} ký tự`);
  }
  const inlineChecks: Array<[string, boolean]> = [
    ['đúng 4 phần', inlineParts.length === 4],
    ['mỗi phần mở đầu bằng bộ luật', inlineParts.every((p) => p.prompt.startsWith('# BỘ LUẬT LUẬN GIẢI'))],
    [
      'mỗi phần mang đủ điều khoản gốc như SKILL.md',
      inlineParts.every((p) =>
        [
          'CÁCH LY NGỮ CẢNH',
          'KHỬ MÂU THUẪN — TRỌNG SỐ',
          '**60% — Gốc rễ:**',
          '**30% — Biến số:**',
          '**10% — Bộ lọc:**',
          'lệch tối đa ±8 điểm',
          '300–650 ký tự',
          'Chiều sâu theo ĐIỂM ENGINE',
          'KHÔNG ĐƯỢC',
          'TỰ KIỂM TRƯỚC KHI TRẢ LỜI',
        ].every((rule) => p.prompt.includes(rule)),
      ),
    ],
    [
      'không bắt người dùng mở tệp không có',
      inlineParts.every((p) => !p.prompt.includes('SKILL.md') && !p.prompt.includes('references/')),
    ],
    [
      'luật nhúng bỏ phần kích hoạt và hợp đồng 4 khối',
      inlineParts.every(
        (p) => !p.prompt.includes('KÍCH HOẠT') && !p.prompt.includes('đúng 4 khối JSON'),
      ),
    ],
    ['bản kèm cổ học vẫn < 30k ký tự', inlineParts.every((p) => p.chars > 0 && p.chars < 30_000)],
    ['bản gọn vẫn < 30k ký tự', inlineCompact.every((p) => p.chars > 0 && p.chars < 30_000)],
    [
      'nhiệm vụ trỏ vào luật trong tin nhắn',
      inlineParts.every((p) => p.prompt.includes('Bộ luật ở đầu tin nhắn là đủ cho lượt này')),
    ],
    [
      'bản gọn: chỉ phần 1 hạ confidence = "thap"',
      inlineCompact[0].prompt.includes('meta.confidence = "thap"') &&
        inlineCompact.slice(1).every((p) => !p.prompt.includes('meta.confidence')),
    ],
    [
      'bản đã cài không bị nhồi luật',
      parts.every((p) => !p.prompt.includes('# BỘ LUẬT LUẬN GIẢI')),
    ],
  ];
  for (const [label, pass] of inlineChecks) {
    console.log(`  ${pass ? '✓' : '✗'} ${label}`);
    if (!pass) process.exitCode = 1;
  }

  /* Payload kỹ năng phải mang ví dụ đầu ra + bảng chiều sâu; thiếu thì mô hình
     chỉ có luật trừu tượng để bắt chước. */
  console.log('\n▶ Payload kỹ năng có ví dụ đầu ra?');
  const fewShotSample = 'MẪU THAM KHẢO';
  const depthTable = 'CHIỀU SÂU THEO ĐIỂM ENGINE';
  const skillPayload = buildSkillPayload(chart, classical, 'compact');
  const payloadChecks: Array<[string, boolean]> = [
    ['payload kỹ năng có ví dụ đầu ra', skillPayload.prompt.includes(fewShotSample)],
    ['payload kỹ năng có bảng chiều sâu', skillPayload.prompt.includes(depthTable)],
  ];
  for (const [label, pass] of payloadChecks) {
    console.log(`  ${pass ? '✓' : '✗'} ${label}`);
    if (!pass) process.exitCode = 1;
  }

  /*
   * VÒNG KIỂM CHẤT LƯỢNG (report-quality.ts) — validator có TỰ bắt được lỗi
   * không: làm hỏng fixture có chủ đích rồi kiểm đúng tiêu chí phải rớt. Không
   * có phần này thì sửa một tiêu chí mà không ai hay — đúng cái bẫy
   * PARSER_VERSION đã gặp.
   */
  console.log('\n▶ Validator chất lượng 12 tiêu chí?');
  const failed = (r: QualityResult, id: string) => r.issues.some((i) => i.id === id && !i.pass);
  const base = checkReportQuality(SAMPLE, chart);

  const missingPalace = structuredClone(SAMPLE);
  missingPalace.careerGroup.pop();
  const qMissing = checkReportQuality(missingPalace, chart);

  const fakeEvidence = structuredClone(SAMPLE);
  /* Chú ý khi chọn chuỗi bịa: evidence-real cho qua nếu câu chứa một trong 13
     token hợp lệ ("tuần", "cục"…) nên câu thử phải sạch token, nếu không test
     sẽ "đậu" dù validator làm đúng. */
  fakeEvidence.careerGroup[0].risks[0].evidence = ['Sao Chổi Lạc Vong (Tổng Bí thư)'];
  const qFake = checkReportQuality(fakeEvidence, chart);

  const wildScore = structuredClone(SAMPLE);
  const engineScore =
    chart.palaces.find((p) => p.key === wildScore.careerGroup[0].palaceKey)?.score.total ?? 50;
  wildScore.careerGroup[0].score = engineScore > 50 ? 0 : 100;
  const qDelta = checkReportQuality(wildScore, chart);

  /* Câu phú bịa: phải rớt dù không có nguồn cổ học (không có gì để đối chiếu
     cũng là lý do hợp lệ để không tin câu dẫn). */
  const fakeQuote = structuredClone(SAMPLE);
  fakeQuote.overview.cachCuc.classicalQuote =
    'Câu phú bịa đặt không có trong bất kỳ nguồn cổ học nào';
  fakeQuote.overview.cachCuc.quoteMeaning = 'Nghĩa giả để kiểm tra validator.';
  const qFakeQuote = checkReportQuality(fakeQuote, chart, classical);

  /* Câu phú lấy đúng một đoạn trong nguồn phải đạt — nếu không, tiêu chí sẽ
     chặn cả câu dẫn thật và người dùng mất một phần giá trị của bản luận. */
  const realQuote = classical
    ? (classical.overview[0]?.text ??
        Object.values(classical.palaces).flatMap((ps) => ps ?? [])[0]?.text ??
        '').slice(0, 30)
    : '';
  const realQuoteReport = structuredClone(SAMPLE);
  if (realQuote.trim().length >= 4) {
    realQuoteReport.overview.cachCuc.classicalQuote = realQuote.trim();
    realQuoteReport.overview.cachCuc.quoteMeaning = 'Nghĩa của câu phú lấy từ nguồn.';
  }
  const qRealQuote = checkReportQuality(realQuoteReport, chart, classical);

  const qChecks: Array<[string, boolean]> = [
    ['đúng 12 tiêu chí', base.total === 12],
    ['mọi tiêu chí có nhãn VI cho UI', base.issues.every((i) => Boolean(QUALITY_LABEL[i.id]))],
    ['MOCK_REPORT: evidence đều truy được', !failed(base, 'evidence-real')],
    ['MOCK_REPORT: không dẫn câu phú → quote-real đạt', !failed(base, 'quote-real')],
    ['bỏ 1 cung → bắt được count-12', failed(qMissing, 'count-12')],
    ['evidence bịa → bắt được evidence-real', failed(qFake, 'evidence-real')],
    ['điểm tự chênh > 8 → bắt được score-delta', failed(qDelta, 'score-delta')],
    ['câu phú bịa → bắt được quote-real', failed(qFakeQuote, 'quote-real')],
    [
      'câu phú lấy đúng nguồn → quote-real đạt',
      realQuote.trim().length < 4 || !classical || !failed(qRealQuote, 'quote-real'),
    ],
    ['gửi client chỉ gồm tiêu chí rớt', qualityForClient(base).issues.every((i) => !i.pass)],
  ];
  console.log(`  • MOCK_REPORT đạt ${base.passed}/${base.total}`);
  for (const [label, pass] of qChecks) {
    console.log(`  ${pass ? '✓' : '✗'} ${label}`);
    if (!pass) process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('FAILED:', e?.message ?? e);
  process.exit(1);
});
