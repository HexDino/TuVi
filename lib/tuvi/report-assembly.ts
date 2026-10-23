/**
 * lib/tuvi/report-assembly.ts
 * ---------------------------------------------------------------------------
 * Ghép các phần rời thành báo cáo hoàn chỉnh và đối chiếu lại với lá số engine.
 *
 * Dùng chung cho đường nhập báo cáo từ Gemini: parser chỉ lo tách/validate từng
 * phần, còn tính toàn vẹn của bộ cung và dữ liệu lá số được kiểm ở đây.
 * ---------------------------------------------------------------------------
 */

import type { NormalizedChartJSON, PalaceKey } from '@/types/tuvi';
import {
  TuViFullReportSchema,
  PALACE_GROUPS,
  type TuViFullReport,
} from '@/schemas/report.schema';

/** Sắp lại thứ tự cung trong nhóm theo đúng Tam Hợp. */
function orderGroup(list: TuViFullReport['careerGroup'], keys: readonly string[]) {
  return [...list].sort((a, b) => keys.indexOf(a.palaceKey) - keys.indexOf(b.palaceKey));
}

/** Chuỗi chính tinh đúng như bảng dữ liệu engine — dùng để ghi đè phần mô hình kể lại. */
function mainStarsText(palace: NormalizedChartJSON['palaces'][number]): string {
  if (palace.isEmpty) return 'Vô chính diệu';
  return palace.majorStars
    .map((s) => {
      const brightness = s.brightness && s.brightness !== 'Vô' ? ` (${s.brightness})` : '';
      const mutagen = s.mutagen ? ` [Hóa ${s.mutagen}]` : '';
      return `${s.name}${brightness}${mutagen}`;
    })
    .join(', ');
}

/**
 * Nhóm cung phải đúng bộ 4 khoá của Tam Hợp, không thừa/thiếu/trùng.
 *
 * Vì sao chặn ở đây: schema chỉ ràng buộc "đúng 4 phần tử". Mô hình có thể trả 4
 * cung nhưng lặp một cung và bỏ một cung khác — báo cáo vẫn qua Zod, UI vẫn
 * hiển thị, nhưng thiếu hẳn một phương diện và người đọc không biết.
 */
function assertExactGroupKeys(
  list: TuViFullReport['careerGroup'],
  keys: readonly PalaceKey[],
  label: string,
): void {
  const got = list.map((p) => p.palaceKey);
  const gotSet = new Set(got);
  const missing = keys.filter((k) => !gotSet.has(k));
  const extra = [...gotSet].filter((k) => !keys.includes(k));
  const duplicated = [...new Set(got.filter((k, i) => got.indexOf(k) !== i))];
  if (!missing.length && !extra.length && !duplicated.length) return;

  const issues = [
    missing.length ? `thiếu ${missing.join(', ')}` : '',
    extra.length ? `thừa ${extra.join(', ')}` : '',
    duplicated.length ? `trùng ${duplicated.join(', ')}` : '',
  ].filter(Boolean);
  throw new Error(`${label}: sai bộ cung (${issues.join('; ')}).`);
}

/**
 * Ghi đè các TRƯỜNG DỮ LIỆU của báo cáo bằng lá số engine.
 *
 * Nội dung luận giải là của mô hình, nhưng ngày tháng, giới tính, tên cung và
 * chính tinh là sự thật tra được từ engine — mô hình chép sai một chỗ là báo cáo
 * mâu thuẫn với chính lá số hiển thị bên cạnh. Chỉ giữ `confidence` của mô hình
 * vì đó là tự đánh giá về chất lượng nguồn, không phải dữ liệu lá số.
 */
export function alignReportToChart(
  report: TuViFullReport,
  chart: NormalizedChartJSON,
): TuViFullReport {
  const byKey = new Map(chart.palaces.map((p) => [p.key, p]));

  const alignPalace = (p: TuViFullReport['careerGroup'][number]) => {
    const source = byKey.get(p.palaceKey);
    if (!source) return p;
    return { ...p, palaceName: source.name, mainStars: mainStarsText(source) };
  };

  return {
    ...report,
    meta: {
      ...report.meta,
      solarDate: chart.meta.solarDate,
      lunarDate: chart.meta.lunarDateText,
      chineseDate: chart.meta.chineseDate,
      gender: chart.meta.gender,
      viewingYear: chart.meta.viewingYear,
    },
    careerGroup: report.careerGroup.map(alignPalace),
    familyGroup: report.familyGroup.map(alignPalace),
    socialGroup: report.socialGroup.map(alignPalace),
  };
}

/** Ghép 4 phần rời thành báo cáo hoàn chỉnh + kiểm tra tính toàn vẹn. */
export function assembleReport(parts: {
  overview: unknown;
  groups: Record<string, unknown>;
}): TuViFullReport {
  const ov = parts.overview as {
    meta: TuViFullReport['meta'];
    overview: TuViFullReport['overview'];
    actionPlan: TuViFullReport['actionPlan'];
    editorialNotes: string[];
  };

  const career = (parts.groups.career as { palaces: TuViFullReport['careerGroup'] }).palaces;
  const family = (parts.groups.family as { palaces: TuViFullReport['familyGroup'] }).palaces;
  const social = (parts.groups.social as { palaces: TuViFullReport['socialGroup'] }).palaces;

  assertExactGroupKeys(career, PALACE_GROUPS.career, 'Tam hợp sự nghiệp');
  assertExactGroupKeys(family, PALACE_GROUPS.family, 'Tam hợp gia đạo');
  assertExactGroupKeys(social, PALACE_GROUPS.social, 'Quan hệ xã hội & sức khỏe');

  const merged = {
    meta: ov.meta,
    overview: ov.overview,
    careerGroup: orderGroup(career, PALACE_GROUPS.career),
    familyGroup: orderGroup(family, PALACE_GROUPS.family),
    socialGroup: orderGroup(social, PALACE_GROUPS.social),
    actionPlan: ov.actionPlan,
    editorialNotes: ov.editorialNotes ?? [],
  };

  const parsed = TuViFullReportSchema.safeParse(merged);
  if (!parsed.success) {
    throw new Error(
      `Báo cáo ghép không khớp schema: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join(' | ')}`,
    );
  }
  return parsed.data;
}
