/**
 * POST /api/report/import
 * ---------------------------------------------------------------------------
 * Nhận câu trả lời từ Gemini, tách 4 khối JSON, validate, đối chiếu lá số và
 * ghép thành báo cáo. Không gọi mô hình, không lưu cache.
 */

import { z } from 'zod';
import { ChartRequestSchema } from '@/schemas/request.schema';
import { analyzeChart } from '@/lib/tuvi/pipeline';
import { parseChatResponse } from '@/lib/tuvi/chat-bundle';
import { checkReportQuality, qualityForClient } from '@/lib/tuvi/report-quality';
import { alignReportToChart } from '@/lib/tuvi/report-assembly';

export const runtime = 'nodejs';
export const maxDuration = 120;

const ImportSchema = ChartRequestSchema.extend({
  /** Toàn bộ câu trả lời dán từ chat. */
  text: z.string().min(50).max(400_000),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Nội dung gửi lên không phải JSON hợp lệ' }, { status: 400 });
  }

  const parsed = ImportSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Dữ liệu không hợp lệ', issues: parsed.error.flatten() }, { status: 422 });
  }
  const input = parsed.data;

  let chart;
  let classical;
  try {
    const ctx = await analyzeChart(
      {
        name: input.name,
        gender: input.gender,
        calendarType: input.calendarType,
        date: input.date,
        hour: input.hour,
        minute: input.minute,
        isLeapMonth: input.isLeapMonth,
        fixLeap: input.fixLeap,
        viewingYear: input.viewingYear,
      },
      { skipClassical: input.skipClassical, viewMode: input.viewMode },
    );
    chart = ctx.chart;
    classical = ctx.classical;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Không dựng lại được lá số: ${message}` }, { status: 500 });
  }

  const result = parseChatResponse(input.text);
  if (!result.ok) {
    return Response.json({ error: result.error, detail: result.detail }, { status: 422 });
  }

  /* Trường dữ liệu (ngày, giới tính, tên cung, chính tinh) phải lấy từ engine:
     chat có thể chép sai một chỗ, và báo cáo sẽ mâu thuẫn với lá số ngay bên
     cạnh. Nội dung luận giải và `confidence` thì giữ nguyên của mô hình. */
  const report = alignReportToChart(result.report, chart);

  /* Lỗi cấu trúc Zod đã chặn ở trên, nhưng các lỗi nội dung (evidence không có
     thật, sao nhắc sang cung khác, dông dài) chỉ thấy được ở đây. Vẫn trả báo
     cáo — nó dùng được — nhưng kèm bảng điểm để người dùng biết đọc lại chỗ nào. */
  const quality = checkReportQuality(report, chart, classical);

  return Response.json({
    ok: true,
    report,
    quality: qualityForClient(quality),
  });
}
