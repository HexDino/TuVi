/**
 * scripts/test-pipeline.ts
 * ---------------------------------------------------------------------------
 * Kiểm thử pipeline:
 *   - mặc định: dựng context thật, in ngân sách token, kiểm tra fixture khớp schema
 *   - --real:   gọi LLM thật (4 lần gọi), lưu demo/report-real.json
 *   - --sse:    gọi LLM thật qua đúng đường SSE mà UI dùng
 *   - --dump-prompt: ghi prompt ra demo/prompt-sample.md
 *
 * Chạy: npx tsx scripts/test-pipeline.ts [--real|--sse] [--dump-prompt]
 * ---------------------------------------------------------------------------
 */
import './load-env';
import { analyzeChart } from '../lib/tuvi/pipeline';
import { buildUserPrompt, buildHints, buildOverviewPrompt, buildGroupPrompt } from '../lib/tuvi/prompt-builder';
import { AstrologyAgentService } from '../lib/tuvi/astrology-agent.service';
import { TuViFullReportSchema } from '../schemas/report.schema';
import { MOCK_REPORT as SAMPLE } from './fixtures/mock-report';
import {
  buildSkillMd,
  buildSkillPayload,
  buildSkillFiles,
  buildSkillZip,
  skillPackageStats,
  SKILL_NAME,
} from '../lib/tuvi/skill-package';
import { parseChatResponse, buildChatBundle } from '../lib/tuvi/chat-bundle';
import { GET as getSkillFile } from '../app/api/skill/route';
import {
  checkReportQuality,
  qualityForClient,
  QUALITY_LABEL,
  type QualityResult,
  type QualitySummary,
} from '../lib/tuvi/report-quality';
import { ReportCache } from '../lib/tuvi/report-cache';
import { PALACE_GROUPS } from '../schemas/report.schema';

async function main() {
  const real = process.argv.includes('--real');
  const sse = process.argv.includes('--sse');

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

  console.log('\n▶ Prompt: 1 cục (cũ) vs chia 4 phần (mới)');
  const full = buildUserPrompt({ chart, classical, name: 'Nguyễn Văn A' });
  const ovPrompt = buildOverviewPrompt({ chart, classical, name: 'Nguyễn Văn A' });
  const gPrompt = buildGroupPrompt({
    chart,
    classical,
    name: 'Nguyễn Văn A',
    keys: [...PALACE_GROUPS.career],
    groupLabel: 'PHẦN II',
  });
  /*
   * Tiếng Việt tokenize RẤT kém: đo thực tế trên lá số này là ~1,2 ký tự/token,
   * không phải 3,4 như tiếng Anh. Dùng 3,4 sẽ báo thấp hơn thực tế gần 3 lần —
   * đúng lý do các con số "≈ token" trước đây trông nhỏ hơn hoá đơn thật.
   */
  const tok = (s: string) => Math.round(s.length / 1.2);
  console.log(`  • một cục : ${full.length.toLocaleString('vi-VN')} ký tự ≈ ${tok(full).toLocaleString('vi-VN')} token`);
  console.log(`  • tổng quan: ${ovPrompt.length.toLocaleString('vi-VN')} ký tự ≈ ${tok(ovPrompt).toLocaleString('vi-VN')} token`);
  console.log(`  • 1 nhóm  : ${gPrompt.length.toLocaleString('vi-VN')} ký tự ≈ ${tok(gPrompt).toLocaleString('vi-VN')} token`);

  if (process.argv.includes('--dump-prompt')) {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = path.join(process.cwd(), 'demo');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'prompt-sample.md'), full, 'utf8');
    fs.writeFileSync(path.join(dir, 'prompt-overview.md'), ovPrompt, 'utf8');
    fs.writeFileSync(path.join(dir, 'prompt-group.md'), gPrompt, 'utf8');
    console.log('  ✓ đã ghi demo/prompt-{sample,overview,group}.md');
  }

  if (!real && !sse) {
    console.log('\n▶ Fixture khớp schema?');
    const ok = TuViFullReportSchema.safeParse(SAMPLE);
    console.log(`  ${ok.success ? '✓' : '✗'} MOCK_REPORT khớp TuViFullReportSchema`);
    if (!ok.success) {
      console.error(ok.error.issues.slice(0, 3));
      process.exitCode = 1;
    }

    /*
     * CHỐNG LỆCH GIỮA BỘ LUẬT GEM VÀ SCHEMA.
     * Bộ luật Gem dạy model tên field bằng văn bản; schema kiểm tra bằng Zod.
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
      /* Bản văn xuôi đã bị gỡ theo yêu cầu: quay lại JSON-only. */
      ['hop dong JSON bat buoc', gem.includes('Trả lời bằng **đúng 4 khối JSON**')],
    ];
    for (const [label, pass] of gemChecks) {
      console.log(`  ${pass ? '✓' : '✗'} ${label}`);
      if (!pass) process.exitCode = 1;
    }

    /* Dựng một câu trả lời ĐÚNG định dạng Gem rồi cho parser xử lý — đây là
       kiểm tra end-to-end thật sự: bộ luật → model trả lời → app nhập về. */
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
      '=== PHẦN 4: QUAN HỆ XÃ HỘI & SỨC KHOẺ ===',
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
     * không trỏ tới thì model không bao giờ đọc, thành công cốc âm. Canh cả hai
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
     * SKILL.md trỏ model tới "references/vi-du-dau-ra.md". Route không có key
     * tương ứng thì người dùng tải không ra file: model thấy đường dẫn trong luật
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

    /*
     * HAI ĐƯỜNG DÁN TAY PHẢI MANG CÙNG VÍ DỤ ĐẦU RA.
     * Kỹ năng có (trong payload) mà chat thường không có thì cùng một người
     * dùng, hai đường cho chất lượng khác nhau — và không ai phát hiện vì mỗi
     * đường chỉ gặp một lần.
     */
    console.log('\n▶ Ví dụ đầu ra có ở cả hai đường?');
    const fewShotSample = 'MẪU THAM KHẢO';
    const depthTable = 'CHIỀU SÂU THEO ĐIỂM ENGINE';
    const bundle = buildChatBundle({ chart, classical });
    const skillPayload = buildSkillPayload(chart, classical, 'compact');
    const pairChecks: Array<[string, boolean]> = [
      ['gói chat thường có ví dụ đầu ra', bundle.prompt.includes(fewShotSample)],
      ['payload kỹ năng có ví dụ đầu ra', skillPayload.prompt.includes(fewShotSample)],
      ['gói chat thường có bảng chiều sâu', bundle.prompt.includes(depthTable)],
      ['payload kỹ năng có bảng chiều sâu', skillPayload.prompt.includes(depthTable)],
    ];
    for (const [label, pass] of pairChecks) {
      console.log(`  ${pass ? '✓' : '✗'} ${label}`);
      if (!pass) process.exitCode = 1;
    }

    /*
     * VÒNG KIỂM CHẤT LƯỢNG (report-quality.ts) — hai việc một lúc:
     *  (a) validator có TỰ bắt được lỗi không: làm hỏng fixture có chủ đích rồi
     *      kiểm đúng tiêu chí phải rớt. Không có phần này thì sửa một tiêu chí
     *      mà không ai hay — đúng cái bẫy PARSER_VERSION đã gặp.
     *  (b) đường SSE có PHÁT event `quality` không: chạy bằng MockLanguageModelV1
     *      nên không cần API key. Validator chạy đúng ở server mà UI không nhận
     *      được gì thì cũng bằng không.
     */
    console.log('\n▶ Validator chất lượng 11 tiêu chí?');
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

    const qChecks: Array<[string, boolean]> = [
      ['đúng 11 tiêu chí', base.total === 11],
      ['mọi tiêu chí có nhãn VI cho UI', base.issues.every((i) => Boolean(QUALITY_LABEL[i.id]))],
      ['MOCK_REPORT: evidence đều truy được', !failed(base, 'evidence-real')],
      ['bỏ 1 cung → bắt được count-12', failed(qMissing, 'count-12')],
      ['evidence bịa → bắt được evidence-real', failed(qFake, 'evidence-real')],
      ['điểm tự chênh > 8 → bắt được score-delta', failed(qDelta, 'score-delta')],
      ['gửi client chỉ gồm tiêu chí rớt', qualityForClient(base).issues.every((i) => !i.pass)],
    ];
    console.log(`  • MOCK_REPORT đạt ${base.passed}/${base.total}`);
    for (const [label, pass] of qChecks) {
      console.log(`  ${pass ? '✓' : '✗'} ${label}`);
      if (!pass) process.exitCode = 1;
    }

    console.log('\n▶ SSE có gửi event `quality`? (MockLanguageModelV1)');
    const { MockLanguageModelV1 } = await import('ai/test');
    const replies = [
      JSON.stringify({
        meta: SAMPLE.meta,
        overview: SAMPLE.overview,
        actionPlan: SAMPLE.actionPlan,
        editorialNotes: SAMPLE.editorialNotes,
      }),
      JSON.stringify({ palaces: SAMPLE.careerGroup }),
      JSON.stringify({ palaces: SAMPLE.familyGroup }),
      JSON.stringify({ palaces: SAMPLE.socialGroup }),
    ];
    let replyIdx = 0;
    const mockModel = new MockLanguageModelV1({
      defaultObjectGenerationMode: 'json',
      doGenerate: async () => ({
        rawCall: { rawPrompt: null, rawSettings: {} },
        finishReason: 'stop',
        usage: { promptTokens: 1, completionTokens: 1 },
        text: replies[Math.min(replyIdx++, replies.length - 1)],
      }),
    });

    const mockAgent = new AstrologyAgentService({
      model: mockModel,
      /* Cache tắt hẳn: test không được ghi bản mock vào đĩa — lần chạy thật sau
         đó đọc nhầm bản này thì lỗi sẽ hiện ở tay người dùng, rất khó truy. */
      cache: new ReportCache({ enabled: false }),
      forceRefresh: true,
    });
    const sseStream = mockAgent.toSSEStream({ chart, classical, name: 'Nguyễn Văn A' });
    const sseReader = sseStream.getReader();
    const sseDec = new TextDecoder();
    let sseRaw = '';
    for (;;) {
      const { done, value } = await sseReader.read();
      if (done) break;
      sseRaw += sseDec.decode(value, { stream: true });
    }

    const sseEvents = [...sseRaw.matchAll(/event: (\w+)/g)].map((m) => m[1]);
    const qMatch = sseRaw.match(/event: quality\ndata: (.*)/);
    const sseQuality = qMatch ? (JSON.parse(qMatch[1]) as QualitySummary) : null;
    const sseChecks: Array<[string, boolean]> = [
      ['đủ done + usage, không error', sseEvents.includes('done') && sseEvents.includes('usage') && !sseEvents.includes('error')],
      ['có event quality, sau done', Boolean(sseQuality) && sseEvents.indexOf('done') < sseEvents.indexOf('quality')],
      ['quality: đúng 11 tiêu chí', sseQuality?.total === 11],
      ['quality: chỉ kèm tiêu chí rớt', !!sseQuality && sseQuality.issues.every((i) => !i.pass)],
      [
        `quality: điểm đạt (${sseQuality?.passed ?? 0}/${sseQuality?.total ?? 0})`,
        typeof sseQuality?.passed === 'number',
      ],
    ];
    for (const [label, pass] of sseChecks) {
      console.log(`  ${pass ? '✓' : '✗'} ${label}`);
      if (!pass) process.exitCode = 1;
    }

    return;
  }

  const fs = await import('node:fs');
  const path = await import('node:path');
  const dir = path.join(process.cwd(), 'demo');
  fs.mkdirSync(dir, { recursive: true });

  if (sse) {
    console.log('\n▶ SSE (đúng đường UI dùng)…');
    const agent = new AstrologyAgentService();
    const stream = agent.toSSEStream({ chart, classical, name: 'Nguyễn Văn A' });
    const reader = stream.getReader();
    const dec = new TextDecoder();
    let raw = '';
    const t0 = Date.now();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      raw += dec.decode(value, { stream: true });
      const stages = [...raw.matchAll(/event: stage\ndata: (.*)/g)];
      if (stages.length) {
        const last = JSON.parse(stages[stages.length - 1][1]) as { label: string };
        process.stdout.write(`\r  … ${last.label} (${Math.round((Date.now() - t0) / 1000)}s)   `);
      }
    }
    const events = [...raw.matchAll(/event: (\w+)/g)].map((m) => m[1]);
    console.log(`\n  ✓ events: ${events.length} → ${events.join(', ')}`);
    const doneMatch = raw.match(/event: done\ndata: (.*)/);
    if (doneMatch) {
      const report = JSON.parse(doneMatch[1]);
      console.log('  ✓ cung:', report.careerGroup.length + report.familyGroup.length + report.socialGroup.length);
      fs.writeFileSync(path.join(dir, 'report-sse.json'), JSON.stringify(report, null, 2), 'utf8');
      console.log('  ✓ đã ghi demo/report-sse.json');
    }
    if (raw.includes('event: error')) console.error('  ✗ có error event');
    const qEvent = raw.match(/event: quality\ndata: (.*)/);
    if (qEvent) {
      const q = JSON.parse(qEvent[1]) as { passed: number; total: number; issues: Array<{ id: string; detail: string }> };
      console.log(`  ✓ chất lượng: ${q.passed}/${q.total}`);
      for (const i of q.issues) console.log(`    ✗ [${i.id}] ${i.detail}`);
    } else {
      console.error('  ✗ thiếu event quality');
      process.exitCode = 1;
    }
    return;
  }

  console.log('\n▶ Gọi LLM thật (4 lần)…');
  const agent = new AstrologyAgentService();
  const t0 = Date.now();
  const { report, usage } = await agent.generateReport({ chart, classical, name: 'Nguyễn Văn A' });
  console.log(`  ✓ xong sau ${Math.round((Date.now() - t0) / 1000)}s`);
  console.log('  ✓ usage:', usage);
  console.log('  ✓ cung:', report.careerGroup.length + report.familyGroup.length + report.socialGroup.length);
  console.log('  ✓ điểm Mệnh:', report.careerGroup[0]?.score, '| delta', report.careerGroup[0]?.scoreDelta);
  console.log('  ✓ narrative dài:', report.careerGroup[0]?.narrative?.length, 'ký tự');
  console.log('  ✓ editorialNotes:', report.editorialNotes.length);

  /* Bảng điểm của chính bản vừa sinh — rớt tiêu chí nào thì biết ngay, không
     phải chờ người dùng đọc rồi báo lại. */
  const q = checkReportQuality(report, chart);
  console.log(`  ✓ chất lượng: ${q.passed}/${q.total}`);
  for (const i of q.issues.filter((x) => !x.pass)) console.log(`    ✗ [${i.id}] ${i.detail}`);

  fs.writeFileSync(path.join(dir, 'report-real.json'), JSON.stringify({ report, usage }, null, 2), 'utf8');
  console.log('  ✓ đã ghi demo/report-real.json');
}

main().catch((e) => {
  console.error('FAILED:', e?.message ?? e);
  process.exit(1);
});
