/**
 * scripts/build-snapshot.ts
 * ---------------------------------------------------------------------------
 * Xuất trang HTML tĩnh để xem giao diện mà không cần chạy Next.
 * Render bằng CHÍNH component của ứng dụng (react-dom/server) nên nhìn là nhìn UI thật.
 *
 * Nguồn dữ liệu:
 *  - Lá số: THẬT (Module 1 + 2)
 *  - Báo cáo: ưu tiên demo/report-real.json (bản mẫu đã lưu);
 *    nếu chưa có thì dùng fixture mock.
 *
 * Chạy: npm run snapshot
 * ---------------------------------------------------------------------------
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { analyzeChart } from '../lib/tuvi/pipeline';
import { ChartBoard } from '../components/ChartBoard';
import { CohocPanel } from '../components/CohocPanel';
import { ReportView } from '../components/ReportView';
import { MOCK_REPORT } from './fixtures/mock-report';
import { TuViFullReportSchema } from '../schemas/report.schema';

async function main() {
  console.log('▶ Dựng lá số thật…');
  const { chart, classical, warnings } = await analyzeChart({
    name: 'Nguyễn Văn A',
    gender: 'nam',
    calendarType: 'solar',
    date: '1990-10-21',
    hour: 12,
    viewingYear: 2026,
  });

  const realPath = path.join(process.cwd(), 'demo', 'report-real.json');
  let report = MOCK_REPORT as unknown;
  let source = 'MOCK (chưa có report-real.json)';

  if (existsSync(realPath)) {
    const raw = JSON.parse(readFileSync(realPath, 'utf8')) as { report?: unknown };
    const parsed = TuViFullReportSchema.safeParse(raw.report ?? raw);
    if (parsed.success) {
      report = parsed.data;
      source = 'báo cáo mẫu (demo/report-real.json)';
    } else {
      console.warn('  ! report-real.json không khớp schema, dùng fixture');
    }
  }

  // Phải dùng createElement: component có hook, gọi trực tiếp sẽ vỡ dispatcher.
  const board = renderToStaticMarkup(createElement(ChartBoard, { chart }));
  const cohoc = classical?.metrics
    ? renderToStaticMarkup(
        createElement(CohocPanel, {
          metrics: classical.metrics,
          extras: classical.extras,
          chart,
        }),
      )
    : '';
  const reportHtml = renderToStaticMarkup(
    createElement(ReportView, {
      report: report as never,
      chart,
      quality: null,
      onOpenSkill: () => {},
    }),
  );

  const css = readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8');

  const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>TuVi Engine — bản xem trước</title>
<style>${css}
.snap-h2{font-family:var(--serif);font-size:20px;margin:34px 0 6px}
.snap-note{font-size:12px;color:var(--muted);margin-bottom:14px}
.banner{background:var(--jade-soft);border:1px solid #c9e0d5;border-radius:var(--radius-sm);padding:12px 14px;font-size:12.5px;line-height:1.65;color:#1d4a3a;margin-bottom:18px}
.banner b{color:#123a2d}
</style>
</head>
<body>
<main class="shell">
  <header class="masthead">
    <div>
      <h1>Tử Vi Đẩu Số</h1>
      <div class="sub">Bản xem trước giao diện — lá số thật, báo cáo mẫu</div>
    </div>
    <span class="badge">iztro · cohoc.net · Gemini skill</span>
  </header>

  <div class="banner">
    <b>Nguồn nội dung:</b> ${source}. Lá số dựng bằng engine nội bộ (iztro), đối chiếu cohoc.net
    (${classical?.stats.passageCount ?? 0} đoạn văn bản cổ học đã bóc, ${(classical?.stats.cleanedChars ?? 0).toLocaleString('vi-VN')} ký tự).
    Điểm từng cung do engine chấm; phần chữ do Gemini viết bằng gói kỹ năng ở <code>demo/SKILL.md</code>.
    ${warnings.length ? `Có ${warnings.length} cảnh báo từ pipeline.` : ''}
  </div>

  <div class="panel panel-pad">
    <div class="panel-title">Bản đồ 12 cung — ${chart.meta.solarDate} · ${chart.meta.lunarDateText} · ${chart.meta.timeName}</div>
    ${board}
    ${cohoc}
  </div>

  <h2 class="snap-h2">Luận giải</h2>
  <div class="snap-note">Chế độ “Đọc” — một cột, văn xuôi liền mạch. Bấm vào từng mục để mở phần tra cứu.</div>
  ${reportHtml}
</main>
</body>
</html>`;

  const outDir = path.join(process.cwd(), 'demo');
  mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'snapshot.html');
  writeFileSync(outFile, html, 'utf8');

  console.log(`✓ ${outFile} (${(html.length / 1024).toFixed(0)} KB) — nguồn: ${source}`);
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
