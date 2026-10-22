/**
 * lib/tuvi/pipeline.ts
 * ---------------------------------------------------------------------------
 * Orchestrator: ChartInput → (Module 1) → (Module 2) → sẵn sàng cho (Module 3).
 *
 * Tách riêng khỏi API route để: test được bằng CLI, tái dùng được cho cron,
 * và route chỉ còn lo HTTP.
 * ---------------------------------------------------------------------------
 */

import type { ChartInput, NormalizedChartJSON, RawClassicalTexts } from '@/types/tuvi';
import { chartGenerator } from './chart-generator.service';
import { CohocKnowledgeService, type CohocViewMode } from './cohoc-knowledge.service';
import { buildHints } from './prompt-builder';
import { parseCohocChartTable, crossCheckChart } from './cohoc-parser';

export interface AnalyzeOptions {
  /** Chế độ xem trên cohoc: mặc định 'tong-hop'. */
  viewMode?: CohocViewMode;
  /** Bỏ qua tầng văn bản cổ học (luận nhanh / khi bị chặn IP). */
  skipClassical?: boolean;
  forceRefresh?: boolean;
  cohoc?: CohocKnowledgeService;
}

export interface AnalyzeResult {
  chart: NormalizedChartJSON;
  classical: RawClassicalTexts | null;
  /** Cảnh báo gộp từ mọi tầng — hiển thị cho người dùng biết độ tin cậy. */
  warnings: string[];
}

export async function analyzeChart(input: ChartInput, options: AnalyzeOptions = {}): Promise<AnalyzeResult> {
  /* Module 1 — luôn chạy, luôn thành công hoặc throw rõ ràng */
  const chart = chartGenerator.generate(input);
  const warnings = [...chart.warnings];

  if (options.skipClassical) {
    return { chart, classical: null, warnings };
  }

  /*
   * THÁNG NHUẬN — chặn trước khi gọi cohoc.
   *
   * Form nhập của cohoc chỉ có ddlNgay/ddlThang/ddlNam/ddlGio, KHÔNG có ô tháng
   * nhuận. Nên với người sinh vào tháng nhuận, cohoc luôn trả lá số của tháng
   * thường — tức là một lá số KHÁC, vài cung lệch hẳn chính tinh.
   *
   * Đã gặp thật: 27/03/2004 = ngày 7 tháng nhuận 2 (iztro), cohoc trả ngày 8
   * tháng 2 → 6/12 cung lệch chính tinh. Nếu vẫn đưa văn bản đó cho LLM thì bản
   * luận bị trộn hai lá số, và cảnh báo cũ ("kiểm tra lại giờ sinh") chỉ sai
   * đường — lỗi ở tháng nhuận, không phải ở giờ.
   */
  if (chart.meta.lunar.isLeapMonth) {
    warnings.push(
      `Sinh vào tháng ${chart.meta.lunar.month} nhuận. cohoc.net không có tuỳ chọn tháng nhuận nên dữ liệu cổ học sẽ là của một lá số khác — đã bỏ qua tầng này. Bản luận chỉ dựa trên lá số engine (vẫn đủ 12 cung).`,
    );
    return { chart, classical: null, warnings };
  }

  /* Module 2 — best effort, không được làm sập pipeline */
  const service = options.cohoc ?? new CohocKnowledgeService();
  const classical = await service.fetchTexts({
    solarDate: chart.meta.solarDate,
    gender: chart.meta.gender,
    timeIndex: chart.meta.timeIndex,
    viewMode: options.viewMode ?? 'tong-hop',
    forceRefresh: options.forceRefresh,
    hints: buildHints(chart),
  });

  warnings.push(...classical.warnings);

  /* Cross-check: phát hiện lệch phái an sao giữa engine và nguồn cổ học */
  if (classical.overview.length || Object.keys(classical.palaces).length) {
    try {
      const html = await service.fetchRawHtml({
        solarDate: chart.meta.solarDate,
        gender: chart.meta.gender,
        timeIndex: chart.meta.timeIndex,
        viewMode: options.viewMode ?? 'tong-hop',
      });
      const issues = crossCheckChart(chart.palaces, parseCohocChartTable(html.html));
      if (issues.length) {
        warnings.push(
          `Lệch phái an sao so với cohoc.net: ${issues.join('; ')}. Báo cáo vẫn dựa trên lá số engine — kiểm tra lại ngày/giờ sinh nếu thấy bất thường.`,
        );
      }
    } catch {
      /* cross-check là tuỳ chọn */
    }
  }

  return { chart, classical, warnings };
}
