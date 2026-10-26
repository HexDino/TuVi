/**
 * scripts/test-pipeline.ts
 * ---------------------------------------------------------------------------
 * Kiểm thử pipeline không cần API mô hình:
 *   - dựng context thật (lá số + văn bản cổ học)
 *   - tháng nhuận: bỏ tầng cổ học nhưng có cờ lý do
 *   - hợp đồng đầu ra Markdown của gói kỹ năng, đủ tài liệu tham khảo, tải được từng tệp
 *   - payload 4 phần và bản nhúng bộ luật (điện thoại)
 *
 * Chạy: npm run pipeline:test
 * ---------------------------------------------------------------------------
 */
import './load-env';
import { analyzeChart } from '../lib/tuvi/pipeline';
import { buildHints } from '../lib/tuvi/prompt-builder';
import {
  buildSkillMd,
  buildSkillPayload,
  buildSkillPartPayloads,
  buildSkillFiles,
  buildSkillZip,
  SKILL_NAME,
} from '../lib/tuvi/skill-package';
import { GET as getSkillFile } from '../app/api/skill/route';
import { PALACE_GROUPS } from '../lib/tuvi/constants';

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

  /*
   * THÁNG NHUẬN — bỏ tầng cổ học nhưng phải nói được LÝ DO bằng dữ liệu, không
   * phải bằng câu cảnh báo. Giao diện đã giải thích ngay chỗ đáng lẽ là bảng Đẩu
   * Minh, nên một dải vàng lặp lại ở đầu trang chỉ làm rối.
   */
  console.log('\n▶ Tháng nhuận: bỏ tầng cổ học có kèm lý do?');
  const leap = await analyzeChart({
    name: 'B',
    gender: 'nam',
    calendarType: 'solar',
    date: '2004-03-27',
    hour: 15,
    viewingYear: 2026,
  });
  const leapChecks: Array<[string, boolean]> = [
    ['engine vẫn ra đủ 12 cung', leap.chart.palaces.length === 12],
    ['lunar.isLeapMonth = true', leap.chart.meta.lunar.isLeapMonth],
    ['classical = null', leap.classical === null],
    ['có cờ classicalSkip = "leap-month"', leap.classicalSkip === 'leap-month'],
    [
      'không đẩy cảnh báo trùng lặp vào warnings',
      !leap.warnings.some((w) => w.includes('Sinh vào tháng')),
    ],
  ];
  for (const [label, pass] of leapChecks) {
    console.log(`  ${pass ? '✓' : '✗'} ${label}`);
    if (!pass) process.exitCode = 1;
  }

  /*
   * CHỐNG LỆCH GIỮA GÓI KỸ NĂNG VÀ HỢP ĐỒNG ĐẦU RA.
   * Hợp đồng đầu ra là Markdown: mô hình trả lời để NGƯỜI ĐỌC đọc trong chat
   * Gemini, không phải để ứng dụng parse JSON. Ba thứ phải còn đủ trong SKILL.md:
   * tiêu đề phần, mẫu tiêu đề cung, ba nhãn Mạnh/Rủi ro/Nên làm, và luật hỏi tiếp.
   */
  console.log('\n▶ Hợp đồng đầu ra của gói kỹ năng?');
  const gem = buildSkillMd();
  const gemChecks: Array<[string, boolean]> = [
    ['đầu ra là Markdown, cấm JSON', gem.includes('KHÔNG JSON')],
    ['có mẫu dòng mở đầu mỗi phần', gem.includes('## PHẦN n — <TÊN PHẦN>')],
    ['có mẫu tiêu đề cung', gem.includes('### <Tên cung> —')],
    [
      'có đủ 3 nhãn Mạnh/Rủi ro/Nên làm',
      ['**Mạnh:**', '**Rủi ro:**', '**Nên làm:**'].every((s) => gem.includes(s)),
    ],
    ['có luật hỏi tiếp trong cùng chat', gem.includes('HỎI TIẾP TRONG CÙNG CHAT')],
    ['có luật dừng ở mục trọn vẹn khi hết độ dài', gem.includes('gõ "tiếp" để viết tiếp')],
    ['đủ 4 phần', [1, 2, 3, 4].every((n) => gem.includes(`PHẦN ${n}`))],
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
    ['không còn dạy mô hình trả JSON', !gem.includes('khối JSON') && !gem.includes('"palaceKey"')],
  ];
  for (const [label, pass] of gemChecks) {
    console.log(`  ${pass ? '✓' : '✗'} ${label}`);
    if (!pass) process.exitCode = 1;
  }

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
      'SKILL.md có luật độ dài theo điểm',
      skillMd.includes('Cung mạnh (≥ 75) và cung yếu (≤ 50)'),
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
      'mỗi phần yêu cầu đúng dòng mở đầu',
      parts.every((p) => p.prompt.includes(`## PHẦN ${p.part} — ${p.title}`)),
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
    ['phần 2–4 có mẫu tiêu đề cung', parts.slice(1).every((p) => p.prompt.includes('### <Tên cung> —'))],
    ['phần 2–4 có ví dụ văn phong', parts.slice(1).every((p) => p.prompt.includes('MẪU THAM KHẢO'))],
    [
      'chỉ phần 4 mời hỏi tiếp',
      parts[3].prompt.includes('### Hỏi tiếp') &&
        parts.slice(0, 3).every((p) => !p.prompt.includes('### Hỏi tiếp')),
    ],
    ['mỗi phần là prompt độc lập (< 30k ký tự)', parts.every((p) => p.chars > 0 && p.chars < 30_000)],
    [
      'bản gọn: chỉ phần 1 ghi độ tin cậy thấp',
      compactParts[0].prompt.includes('ghi "độ tin cậy: thấp"') &&
        compactParts.slice(1).every((p) => !p.prompt.includes('ghi "độ tin cậy: thấp"')),
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
          'lệch tối đa ±8',
          '2 đoạn ngắn',
          'KHÔNG ĐƯỢC',
          'TỰ KIỂM TRƯỚC KHI TRẢ LỜI',
          'HỎI TIẾP TRONG CÙNG CHAT',
        ].every((rule) => p.prompt.includes(rule)),
      ),
    ],
    [
      'không bắt người dùng mở tệp không có',
      inlineParts.every((p) => !p.prompt.includes('SKILL.md') && !p.prompt.includes('references/')),
    ],
    [
      'luật nhúng bỏ phần kích hoạt và hợp đồng JSON',
      inlineParts.every(
        (p) => !p.prompt.includes('KÍCH HOẠT') && !p.prompt.includes('khối JSON'),
      ),
    ],
    ['bản kèm cổ học vẫn < 30k ký tự', inlineParts.every((p) => p.chars > 0 && p.chars < 30_000)],
    ['bản gọn vẫn < 30k ký tự', inlineCompact.every((p) => p.chars > 0 && p.chars < 30_000)],
    [
      'nhiệm vụ trỏ vào luật trong tin nhắn',
      inlineParts.every((p) => p.prompt.includes('Bộ luật ở đầu tin nhắn là đủ cho lượt này')),
    ],
    [
      'bản gọn: chỉ phần 1 ghi độ tin cậy thấp',
      inlineCompact[0].prompt.includes('ghi "độ tin cậy: thấp"') &&
        inlineCompact.slice(1).every((p) => !p.prompt.includes('ghi "độ tin cậy: thấp"')),
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
}

main().catch((e) => {
  console.error('FAILED:', e?.message ?? e);
  process.exit(1);
});
