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
import {
  createCohocService,
  type CohocKnowledgeService,
  type CohocViewMode,
} from './cohoc-knowledge.service';
import { buildHints } from './prompt-builder';

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
  /**
   * Vì sao không có tầng cổ học. Trả về dạng cờ thay vì câu cảnh báo, vì giao
   * diện đã nói lý do ngay chỗ đáng lẽ là bảng Đẩu Minh; nhét thêm một dải vàng
   * ở đầu trang chỉ lặp lại cùng một câu.
   */
  classicalSkip?: 'leap-month';
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
    return { chart, classical: null, warnings, classicalSkip: 'leap-month' };
  }

  /* Module 2 — best effort, không được làm sập pipeline */
  const service = options.cohoc ?? (await createCohocService());
  const classical = await service.fetchTexts({
    solarDate: chart.meta.solarDate,
    gender: chart.meta.gender,
    timeIndex: chart.meta.timeIndex,
    viewMode: options.viewMode ?? 'tong-hop',
    forceRefresh: options.forceRefresh,
    hints: buildHints(chart),
  });

  warnings.push(...classical.warnings);

  return { chart, classical, warnings };
}
