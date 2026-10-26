/**
 * POST /api/report/export
 * ---------------------------------------------------------------------------
 * Soạn dữ liệu lá số để dán vào Gemini.
 *
 * Hai đường, tuỳ người dùng có cài kỹ năng hay không:
 *   - 'installed' (mặc định): luật nằm trong SKILL.md đã cài → payload chỉ mang
 *     dữ liệu, nhẹ hơn nhiều.
 *   - 'inline': mỗi phần mang luôn bộ luật ở đầu tin nhắn → dán thẳng được, chạy
 *     trên ứng dụng Gemini mobile (nơi không tải tệp kỹ năng lên được). Vì mỗi
 *     phần phải tự chứa cả luật lẫn dữ liệu nên chỉ có bản 4 lượt — một lượt sẽ
 *     vượt ngân sách ký tự.
 */

import { z } from 'zod';
import { ChartRequestSchema } from '@/schemas/request.schema';
import { analyzeChart } from '@/lib/tuvi/pipeline';
import { buildSkillPayload, buildSkillPartPayloads } from '@/lib/tuvi/skill-package';

const ExportSchema = ChartRequestSchema.extend({
  skillMode: z.enum(['full', 'compact']).optional(),
  /** 'parts' = chia 4 lượt (tổng quan + 3 nhóm cung), 'single' = một câu trả lời. */
  skillDelivery: z.enum(['single', 'parts']).optional(),
  /** 'inline' = nhúng bộ luật vào từng phần, không cần cài kỹ năng. */
  skillInstall: z.enum(['installed', 'inline']).optional(),
});

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Nội dung gửi lên không phải JSON hợp lệ' }, { status: 400 });
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
        fixLeap: input.fixLeap,
        viewingYear: input.viewingYear,
      },
      { skipClassical: input.skipClassical, viewMode: input.viewMode },
    );

    const mode = input.skillMode ?? 'full';
    const install = input.skillInstall ?? 'installed';
    /* Bản inline luôn chia 4 lượt: một lượt duy nhất phải mang cả luật lẫn 12
       cung thì vượt quá mức an toàn để dán trên điện thoại. */
    if (install === 'inline' || input.skillDelivery === 'parts') {
      const parts = buildSkillPartPayloads(chart, classical, mode, install);
      return Response.json({
        parts,
        chars: parts.reduce((sum, p) => sum + p.chars, 0),
        tokenEstimate: parts.reduce((sum, p) => sum + p.tokenEstimate, 0),
        mode,
        install,
        hasClassical: mode === 'full' && Boolean(classical),
        /* Có nguồn cổ học hay không — tách khỏi `hasClassical` (phụ thuộc chế
           độ đang chọn) để giao diện biết khi nào KHÔNG nên mời chọn mức dữ liệu. */
        classicalAvailable: Boolean(classical),
      });
    }

    const payload = buildSkillPayload(chart, classical, mode);
    return Response.json({ ...payload, classicalAvailable: Boolean(classical) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
