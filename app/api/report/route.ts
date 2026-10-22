/**
 * POST /api/report
 * Module 3 — stream báo cáo luận giải qua SSE.
 *
 * Client đọc:
 *   event: stage    → { stage, label } — tiến độ
 *   event: partial  → object dở dang (merge vào state, render dần)
 *   event: done     → object hoàn chỉnh
 *   event: quality  → { passed, total, issues[] } — 11 tiêu chí kiểm máy, CHỈ gồm
 *                     tiêu chí rớt (UI render thành bảng "đọc lại chỗ nào")
 *   event: usage    → token đã dùng (cached: true nếu lấy từ cache, calls: 0)
 *   event: error    → { message }
 *
 * CACHE: cùng một lá số + cùng prompt + cùng model thì lần thứ hai trả ngay từ
 * cache, không gọi model. `forceRefresh: true` trong body để buộc sinh lại.
 */

import { ChartRequestSchema } from '@/schemas/request.schema';
import { analyzeChart } from '@/lib/tuvi/pipeline';
import { AstrologyAgentService } from '@/lib/tuvi/astrology-agent.service';
import { PROMPT_VERSION } from '@/lib/tuvi/prompts';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body không phải JSON hợp lệ' }, { status: 400 });
  }

  const parsed = ChartRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Dữ liệu không hợp lệ', issues: parsed.error.flatten() }, { status: 422 });
  }
  const input = parsed.data;

  let context;
  try {
    context = await analyzeChart(
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }

  let stream: ReadableStream<Uint8Array>;
  try {
    const agent = new AstrologyAgentService({ forceRefresh: input.forceRefresh });
    stream = agent.toSSEStream({
      chart: context.chart,
      classical: context.classical,
      name: input.name,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Không khởi tạo được LLM: ${message}` }, { status: 500 });
  }

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Prompt-Version': PROMPT_VERSION,
    },
  });
}
