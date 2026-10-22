/**
 * scripts/test-chart.ts
 * Smoke test Module 1: dựng lá số, in bảng 12 cung + điểm, kiểm tra bất biến.
 * Chạy: npm run chart:test
 */
import { chartGenerator, toKey, hourToTimeIndex } from '../lib/tuvi/chart-generator.service';
import { crossCheckChart } from '../lib/tuvi/cohoc-parser';
import type { NormalizedChartJSON } from '../types/tuvi';

const cases = [
  { label: 'Nam 21/10/1990 giờ Ngọ', input: { gender: 'nam' as const, calendarType: 'solar' as const, date: '1990-10-21', hour: 12, viewingYear: 2026 } },
  { label: 'Nữ 12/03/1985 giờ Dần', input: { gender: 'nu' as const, calendarType: 'solar' as const, date: '1985-03-12', hour: 4, viewingYear: 2026 } },
  { label: 'Nam 01/01/2000 giờ Tý sớm', input: { gender: 'nam' as const, calendarType: 'solar' as const, date: '2000-01-01', hour: 0, viewingYear: 2026 } },
  { label: 'Nữ 04/09/1990 Âm lịch giờ Ngọ', input: { gender: 'nu' as const, calendarType: 'lunar' as const, date: '1990-9-4', hour: 12, viewingYear: 2026 } },
];

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error('  ✗ FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('  ✓', msg);
  }
}

function invariants(c: NormalizedChartJSON, label: string) {
  console.log(`\n=== ${label} ===`);
  console.log(
    `${c.meta.solarDate} | ${c.meta.lunarDateText} | ${c.meta.chineseDate} | ${c.meta.timeName} ${c.meta.timeRange}`,
  );
  console.log(
    `Mệnh ${c.thienBan.menhBranch} | Thân cư ${c.thienBan.thanCu} (${c.thienBan.thanBranch}) | ${c.thienBan.cuc} | ${c.thienBan.amDuong} | Nạp âm ${c.thienBan.napAm} (${c.thienBan.napAmElement})`,
  );
  console.log(
    `Chủ mệnh ${c.thienBan.menhChu} | Chủ thân ${c.thienBan.thanChu} | Cục↔Mệnh ${c.thienBan.cucVsMenh}`,
  );
  console.log(
    `Đại vận đang chạy (${c.meta.viewingYear}): ${c.annual?.activeDecadal?.range.join('-')} tuổi — cung ${c.annual?.activeDecadal?.palaceName} (${c.annual?.activeDecadal?.score}đ) | Lưu niên ${c.annual?.chineseYear} tuổi ${c.annual?.age} | Tứ hoá ${c.annual?.mutagen?.join(', ')}`,
  );

  console.log(
    '\nCung'.padEnd(12) +
      'Chi'.padEnd(8) +
      'Chính tinh'.padEnd(26) +
      'Điểm'.padEnd(7) +
      'Hạng'.padEnd(6) +
      'T/T',
  );
  for (const p of c.palaces) {
    console.log(
      `${p.name}${p.isBodyPalace ? '*' : ''}`.padEnd(12) +
        p.branch.padEnd(8) +
        (p.majorStars.map((s) => `${s.name}(${s.brightness})`).join(', ') || 'VCD').padEnd(26) +
        String(p.score.total).padEnd(7) +
        p.score.grade.padEnd(6) +
        `${p.hasTuan ? 'Tuần ' : ''}${p.hasTriet ? 'Triệt' : ''}`,
    );
  }

  assert(c.palaces.length === 12, 'đủ 12 cung');
  assert(new Set(c.palaces.map((p) => p.key)).size === 12, 'không trùng khoá cung');
  assert(c.palaces.every((p) => p.score.total >= 5 && p.score.total <= 98), 'điểm trong [5,98]');
  assert(c.palaces.filter((p) => p.isBodyPalace).length === 1, 'đúng 1 cung Thân');
  assert(c.daiVan.length === 12, 'đủ 12 đại vận');
  assert(c.thienBan.napAm !== 'Không xác định', 'xác định được nạp âm');
}

for (const tc of cases) {
  const chart = chartGenerator.generate(tc.input);
  invariants(chart, tc.label);
  if (chart.warnings.length) console.log('\n⚠ warnings:', chart.warnings.join(' | '));
}

// Unit test nhỏ cho helper
console.log('\n=== helper ===');
assert(hourToTimeIndex(23) === 12, 'hour 23 → timeIndex 12 (Tý muộn)');
assert(hourToTimeIndex(0) === 0, 'hour 0 → timeIndex 0 (Tý sớm)');
assert(hourToTimeIndex(12) === 6, 'hour 12 → timeIndex 6 (Ngọ)');
assert(toKey('Tả Phù') === 'ta_phu', 'toKey bỏ dấu đúng');
assert(toKey('Địa Kiếp') === 'dia_kiep', 'toKey xử lý Đ→D');

/*
 * Cross-check Module 2 — chạy OFFLINE bằng fixture, không cần mạng.
 *
 * Ghim hai chỗ từng làm cross-check "báo khớp" mà không hề kiểm tra:
 *  1) so theo TÊN cung — cohoc viết "SỰ NGHIỆP"/"GIAO HỮU"/"MỆNH Thân", engine
 *     viết "Quan Lộc"/"Nô Bộc"/"Mệnh" → 3/12 cung bị bỏ qua im lặng;
 *  2) cung VCD bị bỏ qua vì điều kiện "cohoc có dữ liệu sao mới so".
 */
console.log('\n=== crossCheck cohoc (fixture offline) ===');
const ref = chartGenerator.generate(cases[0].input);
const ours = ref.palaces.map((p) => ({ name: p.name, branch: p.branch, majorStars: p.majorStars }));
const cohocStyle = ours.map((p) => ({
  name: p.name === 'Quan Lộc' ? 'SỰ NGHIỆP' : p.name === 'Nô Bộc' ? 'GIAO HỮU' : p.name === 'Mệnh' ? 'MỆNH Thân' : p.name.toUpperCase(),
  // chữ "Ấ." (can Ất) từng không tách được khỏi địa chi → mất neo
  branch: p.name === 'Nô Bộc' ? `Ấ. ${p.branch}` : p.branch,
  majorStars: p.majorStars.map((s) => s.name.toUpperCase()),
}));
assert(
  crossCheckChart(ours, { palaces: cohocStyle }).length === 0,
  'khớp cả 12 cung dù tên cung và chữ can viết khác cách',
);

const brokenStars = cohocStyle.map((p) => (p.name === 'GIAO HỮU' ? { ...p, majorStars: [] } : p));
const brokenIssues = crossCheckChart(ours, { palaces: brokenStars });
assert(
  brokenIssues.length === 1 && brokenIssues[0].includes('GIAO HỮU'),
  'bắt được lệch chính tinh ngay ở cung từng bị bỏ sót (GIAO HỮU)',
);

const missingPalace = cohocStyle.filter((p) => p.name !== 'GIAO HỮU');
assert(
  crossCheckChart(ours, { palaces: missingPalace }).length === 1,
  'cung không có trong bảng cohoc phải được báo, không được bỏ qua im lặng',
);
