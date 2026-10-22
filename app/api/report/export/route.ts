/**
 * POST /api/report/export
 * ---------------------------------------------------------------------------
 * Soạn "gói chat": prompt đầy đủ để người dùng dán vào chat web (Claude, Gemini,
 * Grok…), cùng khoá cache mà báo cáo nhập về sẽ được lưu dưới đó.
 *
 * Vì sao có route này: chat web không có API và điều khoản cấm tự động hoá, nên
 * đây là con đường hợp lệ duy nhất để dùng gói chat đã trả tiền — con người tự
 * copy-paste. Đổi lại: lá số đó về sau phục vụ 0 đồng.
 */

import { z } from 'zod';
import { ChartRequestSchema } from '@/schemas/request.schema';
import { analyzeChart } from '@/lib/tuvi/pipeline';
import { buildChatBundle } from '@/lib/tuvi/chat-bundle';
import { buildSkillPayload } from '@/lib/tuvi/skill-package';

/**
 * 'standalone' = gói đầy đủ (luật + dữ liệu) để dán vào chat thường.
 * 'skill'      = chỉ dữ liệu, vì luật đã nằm trong gói kỹ năng tải lên Gemini.
 */
const ExportSchema = ChartRequestSchema.extend({
  target: z.enum(['standalone', 'skill']).optional(),
  skillMode: z.enum(['full', 'compact']).optional(),
});

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body không phải JSON hợp lệ' }, { status: 400 });
  }

  const parsed = ExportSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Dữ liệu không hợp lệ', issues: parsed.error.flatten() }, { status: 422 });
  }
  const input = parsed.data;

  try {
    const { chart, classical } = await analyzeChart(
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

    if (input.target === 'skill') {
      const payload = buildSkillPayload(chart, classical, input.skillMode ?? 'full');
      return Response.json(payload);
    }

    const bundle = buildChatBundle({ chart, classical, name: input.name });
    return Response.json(bundle);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
