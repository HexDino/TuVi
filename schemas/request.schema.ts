/**
 * schemas/request.schema.ts
 * Validate body của API route. Dùng chung cho /api/chart, /api/report/export
 * và /api/report/import.
 */

import { z } from 'zod';

export const ChartRequestSchema = z.object({
  name: z.string().max(80).optional(),
  gender: z.enum(['nam', 'nu']),
  calendarType: z.enum(['solar', 'lunar']).default('solar'),
  /** solar: YYYY-MM-DD (dương lịch). lunar: YYYY-M-D (âm lịch). */
  date: z.string().regex(/^\d{4}-\d{1,2}-\d{1,2}$/, 'Ngày phải có dạng YYYY-MM-DD'),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59).default(0),
  isLeapMonth: z.boolean().optional(),
  /**
   * Cách xử lý tháng nhuận của iztro: true = từ ngày 16 chuyển sang tháng kế,
   * false = giữ nguyên trong tháng nhuận. Mặc định true.
   */
  fixLeap: z.boolean().optional(),
  viewingYear: z.number().int().min(1900).max(2100).optional(),
  /** Bỏ qua tầng văn bản cổ học (nhanh hơn, chỉ luận từ JSON). */
  skipClassical: z.boolean().optional(),
  /** 'tong-hop' | 'pho-bien' | 'nam-phai' | 'bac-phai' | 'phi-tinh' | 'tap-luan' | 'trung-chau' */
  viewMode: z
    .enum(['pho-bien', 'bac-phai', 'nam-phai', 'tong-hop', 'phi-tinh', 'tap-luan', 'trung-chau'])
    .optional(),
});

export type ChartRequestBody = z.infer<typeof ChartRequestSchema>;
