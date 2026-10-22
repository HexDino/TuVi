/**
 * POST /api/report/import
 * ---------------------------------------------------------------------------
 * Nhận câu trả lời từ chat web, tách 4 khối JSON, validate, ghép thành báo cáo
 * và LƯU CACHE. Từ lần này trở đi, lá số đó phục vụ 0 đồng qua đúng đường SSE
 * của app.
 *
 * Điểm quan trọng: báo cáo nhập tay được lưu dưới khoá `chat-manual`, độc lập
 * với model. Đổi model trong .env không làm mất bản đã viết.
 */

import { z } from 'zod';
import { ChartRequestSchema } from '@/schemas/request.schema';
import { analyzeChart } from '@/lib/tuvi/pipeline';
import { parseChatResponse, chatCacheKey } from '@/lib/tuvi/chat-bundle';
import { reportCache } from '@/lib/tuvi/report-cache';
import { checkReportQuality, qualityForClient } from '@/lib/tuvi/report-quality';
import type { AgentUsage } from '@/lib/tuvi/astrology-agent.service';
import { PROMPT_VERSION } from '@/lib/tuvi/prompts';

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
    return Response.json({ error: 'Body không phải JSON hợp lệ' }, { status: 400 });
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

  /* Token = 0: báo cáo do chat viết, không đi qua API. Ghi rõ để UI hiển thị
     đúng và để sau này không ai tưởng đây là lượt gọi model có tính tiền. */
  const usage: AgentUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    promptVersion: PROMPT_VERSION,
    modelId: 'chat-manual',
    calls: 0,
    manual: true,
  };

  /* Chấm chất lượng TRƯỚC khi lưu: lỗi cấu trúc Zod đã chặn ở trên, nhưng các
     lỗi nội dung (evidence không có thật, sao nhác sang cung khác, dông dài) chỉ
     thấy được ở đây. Vẫn lưu — báo cáo có dùng được — nhưng trả kèm bảng điểm để
     người dùng biết phải đọc lại chỗ nào. */
  const quality = checkReportQuality(result.report, chart);

  const key = chatCacheKey(chart, classical, input.name);
  await reportCache.set(key, {
    report: result.report,
    usage,
    cachedAt: new Date().toISOString(),
    signature: `${chart.meta.solarDate}|${chart.meta.gender}|${chart.meta.timeName}|chat`,
  });

  return Response.json({
    ok: true,
    report: result.report,
    usage,
    cacheKey: key,
    quality: qualityForClient(quality),
  });
}
