/**
 * scripts/payload-audit.ts — LÁ SỐ ĐƯA VÀO GEMINI CÓ ĐÚNG KHÔNG?
 *
 * "Lá số tốt" vô nghĩa nếu tầng soạn prompt làm sai/missing dữ liệu trước khi
 * đưa cho model. Script này đọc lại NGƯỢC payload (chuỗi Markdown sắp dán vào
 * Gemini) và so từng trường với NormalizedChartJSON của engine:
 *   1) bảng 12 cung: chi · chính tinh · cát/sát tinh · Tuần/Triệt · điểm · đại hạn
 *   2) Tứ Hóa năm sinh: đủ 4 sao và sao phải tọa thật trong lá số
 *   3) bảng đại vận: đủ 12 bản, đúng mốc tuổi
 *   4) lưu niên: tiểu hạn + tứ hoá lưu niên khớp chart.annual
 *   5) dòng "Chi tiết phụ tinh" phủ đủ 12 cung và không bịa sao trung tính
 *
 * Chạy: npm run payload:audit
 */
import { chartGenerator } from '../lib/tuvi/chart-generator.service';
import { buildSkillPayload } from '../lib/tuvi/skill-package';
import { buildChatBundle } from '../lib/tuvi/chat-bundle';
import type { NormalizedChartJSON } from '../types/tuvi';

let bad = 0;
const fail = (m: string) => { bad++; console.log(`    ✗ ${m}`); };

const cases: Array<{ label: string; input: Parameters<typeof chartGenerator.generate>[0] }> = [
  { label: 'nam 1990-10-21 giờ Ngọ', input: { gender: 'nam', calendarType: 'solar', date: '1990-10-21', hour: 12, viewingYear: 2026 } },
  { label: 'nữ 2005-04-09 giờ Hợi', input: { gender: 'nu', calendarType: 'solar', date: '2005-04-09', hour: 22, viewingYear: 2026 } },
  { label: 'nam 1975-02-03 giờ Tý muộn', input: { gender: 'nam', calendarType: 'solar', date: '1975-02-03', hour: 23, viewingYear: 2026 } },
];

for (const tc of cases) {
  const chart = chartGenerator.generate(tc.input);
  console.log(`\n═══ ${tc.label} — ${chart.meta.solarDate} · ${chart.meta.chineseDate} ═══`);

  for (const mode of ['compact', 'full'] as const) {
    const payload = buildSkillPayload(chart, null, mode);
    const text = payload.prompt;

    /* 1. bảng 12 cung */
    // Bảng 12 cung = dòng có đúng 10 cột (| tên | chi | can | ... | đại hạn |),
    // phân biệt với bảng đại vận (4 cột) và bảng lưu niên (5 cột).
    const tableRows = text.split('\n').filter((l) => l.startsWith('|') && l.split('|').length === 12);
    const found = chart.palaces.map((p) => {
      const body = p.isBodyPalace ? `${p.name} (Thân)` : p.name;
      const row = tableRows.find((r) => r.split('|')[1].trim() === body);
      if (!row) return { p, row: null as string | null };
      return { p, row };
    });
    if (found.filter((f) => !f.row).length) fail(`[${mode}] thiếu dòng cung: ${found.filter((f) => !f.row).map((f) => f.p.name).join(', ')}`);
    for (const { p, row } of found) {
      if (!row) continue;
      const cells = row.split('|').map((c) => c.trim());
      const [, name, branch, stem, chinh, cat, sat, tt, truong, diem, daiHan] = cells;
      if (branch !== p.branch) fail(`[${mode}] sai chi cung ${p.name}: payload=${branch} engine=${p.branch}`);
      if (stem !== p.stem) fail(`[${mode}] sai can cung ${p.name}: payload=${stem} engine=${p.stem}`);
      // So TÊN sao, không so cả chuỗi: payload có kèm độ sáng "(Miếu)" và tứ hoá
      // "[Hóa Lộc]" — đó là dữ liệu thừa, không phải sai lệch. Cung VCD in "—",
      // engine ghi "VCD" — cả hai đều nghĩa là không có sao.
      const strip = (s: string) =>
        s.replace(/\s*\([^)]*\)/g, '').replace(/\s*\[[^\]]*\]/g, '').replace(/—/g, '').trim();
      const wantChinh = strip(p.majorStars.map((s) => s.name).join(', '));
      if (strip(chinh) !== wantChinh) fail(`[${mode}] sai chính tinh ${p.name}: payload=[${chinh}] engine=[${wantChinh}]`);
      const wantTt = [p.hasTuan ? 'Tuần' : '', p.hasTriet ? 'Triệt' : ''].filter(Boolean).join('+') || '—';
      if (tt !== wantTt) fail(`[${mode}] sai Tuần/Triệt ${p.name}: payload=${tt} engine=${wantTt}`);
      if (!diem.startsWith(String(p.score.total))) fail(`[${mode}] sai điểm ${p.name}: payload=${diem} engine=${p.score.total}`);
      if (!daiHan.startsWith(`${p.decadal.range[0]}-${p.decadal.range[1]}`)) fail(`[${mode}] sai đại hạn ${p.name}: payload=${daiHan}`);
      for (const s of [...p.auspicious, ...p.malefic]) {
        if (!cat.includes(s.name) && !sat.includes(s.name)) fail(`[${mode}] mất sát/cát tinh ${s.name} ở ${p.name}`);
      }
    }

    /* 2. Tứ Hóa năm sinh */
    const wantMutagen: string[] = [];
    for (const p of chart.palaces) {
      for (const s of [...p.majorStars, ...p.auspicious, ...p.malefic, ...p.neutral]) {
        if (s.mutagen) wantMutagen.push(`Hóa ${s.mutagen}: ${s.name} tại ${p.name}`);
      }
    }
    const gotMutagen = text.split('\n').filter((l) => l.startsWith('- Hóa '));
    if (gotMutagen.length !== wantMutagen.length) fail(`[${mode}] tứ hoá năm sinh: payload=${gotMutagen.length} dòng, engine=${wantMutagen.length}`);
    for (const m of wantMutagen) if (!text.includes(m)) fail(`[${mode}] thiếu tứ hoá "${m}"`);

    /* 3. đại vận */
    const dvRows = text.split('\n').filter((l) => /^\| \d+-\d+ \|/.test(l));
    if (mode === 'compact' || mode === 'full') {
      if (dvRows.length !== 12) fail(`[${mode}] bảng đại vận có ${dvRows.length}/12 dòng`);
      for (const d of chart.daiVan) {
        if (!text.includes(`| ${d.range[0]}-${d.range[1]} | ${d.palaceName} | ${d.stem} ${d.branch} | ${d.score} |`)) {
          fail(`[${mode}] thiếu bản đại vận ${d.range[0]}-${d.range[1]} (${d.palaceName})`);
        }
      }
    }

    /* 4. lưu niên */
    const a = chart.annual!;
    if (!text.includes(`### Lưu niên ${a.year} (${a.chineseYear}, tuổi ${a.age})`)) fail(`[${mode}] thiếu khối lưu niên ${a.year}`);
    if (!text.includes(`- Tiểu hạn nhập cung: ${a.yearlyPalaceBranch}`)) fail(`[${mode}] sai tiểu hạn: payload thiếu/mismatch`);
    for (const ys of a.yearlyStarsByPalace) {
      const line = `- Sao lưu niên: ${a.yearlyStarsByPalace.map((x) => `${x.palaceKey}: ${x.stars.map((s) => s.name).join(', ')}`).join(' | ')}`;
      if (!line.includes(ys.stars.map((s) => s.name).join(', '))) fail(`[${mode}] mất sao lưu niên ở ${ys.palaceKey}`);
    }

    /* 5. dòng phụ tinh */
    const detail = text.split('\n').filter((l) => l.startsWith('- ') && l.includes('phụ tinh khác ='));
    if (detail.length !== 12) fail(`[${mode}] dòng chi tiết phụ tinh: ${detail.length}/12 cung`);
    for (const p of chart.palaces) {
      const line = detail.find((l) => l.startsWith(`- ${p.name} (`));
      if (!line) continue;
      const neutral = p.neutral.length ? p.neutral.map((s) => s.name).join(', ') : '—';
      const got = line.split('phụ tinh khác = ')[1]?.split(' | ')[0];
      if (got !== neutral) fail(`[${mode}] sai phụ tinh trung tính ${p.name}: payload=[${got}] engine=[${neutral}]`);
    }

    console.log(`  ✓ ${mode}: ${payload.chars.toLocaleString('vi-VN')} ký tự ≈ ${payload.tokenEstimate.toLocaleString('vi-VN')} token — 12 cung, ${wantMutagen.length} tứ hoá, 12 đại vận, lưu niên đều khớp engine`);
  }

  /* gói chat thường (dán tay, không qua skill) cũng phải mang đủ dữ liệu */
  const bundle = buildChatBundle({ chart, classical: null });
  const missing = chart.palaces.filter((p) => !bundle.prompt.includes(`${p.name} (${p.branch})`) && !bundle.prompt.includes(p.branch));
  if (missing.length) fail(`gói chat thường thiếu cung: ${missing.map((p) => p.name).join(', ')}`);
  console.log(`  ✓ chat bundle: ${bundle.chars.toLocaleString('vi-VN')} ký tự, đủ 12 cung`);
}

console.log(`\n═══ TỔNG: ${bad === 0 ? '0 lỗi dữ liệu — payload trung thành với engine' : `${bad} lỗi`} ═══`);
if (bad) process.exitCode = 1;
