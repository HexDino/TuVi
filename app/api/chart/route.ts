/**
 * POST /api/chart
 * Module 1 (+2 tuỳ chọn) — trả lá số đã chuẩn hoá NGAY, không chờ LLM.
 * UI gọi endpoint này trước để vẽ bản đồ 12 cung trong ~200ms.
 */

import { NextResponse } from 'next/server';
import { ChartRequestSchema } from '@/schemas/request.schema';
import { analyzeChart } from '@/lib/tuvi/pipeline';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body không phải JSON hợp lệ' }, { status: 400 });
  }

  const parsed = ChartRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Dữ liệu không hợp lệ', issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const input = parsed.data;

  try {
    const { chart, classical, warnings } = await analyzeChart(
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
      {
        skipClassical: input.skipClassical,
        viewMode: input.viewMode,
      },
    );

    return NextResponse.json({
      chart,
      classicalMeta: classical
        ? {
            available: true,
            viewMode: classical.viewMode,
            sourceUrl: classical.sourceUrl,
            palaces: Object.keys(classical.palaces).length,
            passages: classical.stats.passageCount,
            cleanedChars: classical.stats.cleanedChars,
            fromCache: Boolean(classical.fromCache),
            stale: Boolean(classical.stale),
            fetchedAt: classical.fetchedAt,
            extras: classical.extras,
            metrics: classical.metrics,
            annualCount: classical.annual.length,
          }
        : { available: false },
      warnings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
