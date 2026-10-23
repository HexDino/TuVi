/**
 * scripts/test-ui-date.ts
 * Kiểm tiện ích ngày tháng dùng cho DatePicker (thuần, không phụ thuộc DOM).
 * Chạy: npm run ui:test
 */
import {
  addDays,
  addMonths,
  clampIso,
  daysInMonth,
  decadeStart,
  endOfWeekSunday,
  formatViDate,
  parseIsoDate,
  shiftDecadePage,
  startOfWeekMonday,
  todayIso,
  toIsoDate,
  weekdayIndexMonday,
} from '../components/ui/date-utils';

let failed = 0;

function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failed += 1;
    console.error(`  ✗ ${msg}\n    nhận: ${a}\n    mong: ${e}`);
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

console.log('\n▶ parseIsoDate');
eq(parseIsoDate('1990-10-21'), { year: 1990, month: 10, day: 21 }, 'nhận ngày chuẩn');
eq(parseIsoDate('1990-9-4'), { year: 1990, month: 9, day: 4 }, 'nhận tháng/ngày một chữ số');
eq(parseIsoDate('2004-02-29'), { year: 2004, month: 2, day: 29 }, 'nhận 29/02 năm nhuận');
eq(parseIsoDate('2004-02-30'), null, 'từ chối 30/02');
eq(parseIsoDate('1900-02-29'), null, 'từ chối 29/02 năm 1900 (không nhuận)');
eq(parseIsoDate('21/10/1990'), null, 'từ chối sai định dạng');
eq(parseIsoDate(''), null, 'từ chối chuỗi rỗng');

console.log('\n▶ toIsoDate / formatViDate');
eq(toIsoDate({ year: 1990, month: 9, day: 4 }), '1990-09-04', 'pad tháng và ngày');
eq(formatViDate('1990-09-04'), '04/09/1990', 'hiển thị dd/mm/yyyy');
eq(formatViDate('2004-02-30'), '', 'ngày không tồn tại → chuỗi rỗng');

console.log('\n▶ daysInMonth');
eq(daysInMonth(2004, 2), 29, 'tháng 2/2004 có 29 ngày');
eq(daysInMonth(1900, 2), 28, 'tháng 2/1900 có 28 ngày');
eq(daysInMonth(2000, 2), 29, 'tháng 2/2000 có 29 ngày');
eq(daysInMonth(2026, 4), 30, 'tháng 4/2026 có 30 ngày');

console.log('\n▶ addDays / addMonths');
eq(addDays({ year: 2025, month: 12, day: 31 }, 1), { year: 2026, month: 1, day: 1 }, 'qua năm mới');
eq(addDays({ year: 2004, month: 3, day: 1 }, -1), { year: 2004, month: 2, day: 29 }, 'lùi qua 29/02');
eq(addMonths({ year: 2024, month: 1, day: 31 }, 1), { year: 2024, month: 2, day: 29 }, '31/01 + 1 tháng → 29/02');
eq(addMonths({ year: 2023, month: 1, day: 31 }, 1), { year: 2023, month: 2, day: 28 }, '31/01 + 1 tháng → 28/02');
eq(addMonths({ year: 2026, month: 1, day: 15 }, -1), { year: 2025, month: 12, day: 15 }, 'lùi qua năm');

console.log('\n▶ tuần bắt đầu Thứ 2');
eq(weekdayIndexMonday(2026, 10, 19), 0, 'Thứ 2 → chỉ số 0');
eq(weekdayIndexMonday(2026, 10, 23), 4, 'Thứ 6 → chỉ số 4');
eq(weekdayIndexMonday(2026, 10, 25), 6, 'Chủ nhật → chỉ số 6');
eq(startOfWeekMonday({ year: 2026, month: 10, day: 23 }), { year: 2026, month: 10, day: 19 }, 'Thứ 6 → Thứ 2 cùng tuần');
eq(startOfWeekMonday({ year: 2026, month: 10, day: 19 }), { year: 2026, month: 10, day: 19 }, 'Thứ 2 giữ nguyên');
eq(startOfWeekMonday({ year: 2026, month: 10, day: 25 }), { year: 2026, month: 10, day: 19 }, 'Chủ nhật → Thứ 2 tuần trước');
eq(endOfWeekSunday({ year: 2026, month: 10, day: 19 }), { year: 2026, month: 10, day: 25 }, 'Thứ 2 → Chủ nhật cùng tuần');

console.log('\n▶ todayIso / clampIso');
eq(todayIso(new Date(2026, 9, 23, 15, 30)), '2026-10-23', 'lấy ngày địa phương, pad tháng/ngày');
eq(clampIso('1899-12-31', '1900-01-31', '2100-12-31'), '1900-01-31', 'kẹp về cận dưới');
eq(clampIso('2101-01-01', '1900-01-31', '2100-12-31'), '2100-12-31', 'kẹp về cận trên');
eq(clampIso('1990-10-21', '1900-01-31', '2100-12-31'), '1990-10-21', 'giữ nguyên khi trong khoảng');

console.log('\n▶ thập niên cho lưới năm');
eq(decadeStart(1992), 1990, '1992 → đầu thập niên 1990');
eq(decadeStart(2000), 2000, '2000 → đầu thập niên 2000');
eq(decadeStart(1900), 1900, '1900 giữ nguyên');
eq(decadeStart(2100), 2100, '2100 → đầu thập niên 2100');
eq(shiftDecadePage(1990, -1, 1900, 2100), 1980, 'lùi một thập niên');
eq(shiftDecadePage(1990, 1, 1900, 2100), 2000, 'tiến một thập niên');
eq(shiftDecadePage(1900, -1, 1900, 2100), 1900, 'không vượt cận dưới');
eq(shiftDecadePage(2100, 1, 1900, 2100), 2100, 'không vượt cận trên');
eq(shiftDecadePage(2090, 1, 1900, 2100), 2100, 'trang cuối bắt đầu từ năm tối đa');

console.log(failed === 0 ? '\n✓ Tất cả kiểm tra ngày tháng đều đạt\n' : `\n✗ ${failed} kiểm tra thất bại\n`);
if (failed > 0) process.exitCode = 1;
