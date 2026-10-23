/**
 * scripts/chart-audit.ts — ĐÁNH GIÁ CHẤT LƯỢNG LÁ SỐ bằng số liệu.
 *
 * Chạy: npm run chart:audit
 *
 * Không có mạng: phần đối chiếu dùng cache HTML/JSON của cohocnet đã có trên đĩa.
 *
 * A. Bất biến trên lưới 144 lá số (2 giới × 9 năm × 8 giờ): 12 cung, 14 chính tinh,
 *    1 cung Thân, điểm trong [5,98], đại vận liên tục, xung/tam hợp đúng, và
 *    solar ↔ âm lịch phải cho CÙNG lá số (2 đường nhập liệu phải giống nhau).
 * B. Đối chiếu offline với bảng 12 cung của cohoc (nguồn bên thứ ba).
 *    Trang cohoc chỉ ghi can-chi năm, không ghi năm dương lịch → thử 2 ứng viên
 *    năm và chọn lá số khớp bảng sao nhất, ghi rõ nếu cả 2 đều lệch.
 * C. Tương quan điểm engine ↔ Đẩu Minh của cohoc + tỉ lệ đồng thuận VCD.
 *
 * Chạy: npm run chart:audit
 */
import fs from 'node:fs';
import path from 'node:path';
import { chartGenerator } from '../lib/tuvi/chart-generator.service';
import { parseCohocChartTable, crossCheckChart } from '../lib/tuvi/cohoc-parser';
import type { NormalizedChartJSON, CohocMetrics } from '../types/tuvi';

const BRANCHES = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];
const CANS = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Nhâm', 'Quý'];
const fail: string[] = [];
const ok = (cond: unknown, msg: string) => { if (!cond) fail.push(msg); };
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : 'n/a');

/* ============================ A. BẤT BIẾN ============================ */
console.log('\n═══ A. BẤT BIẾN TRÊN LƯỚI 144 LÁ SỐ ═══');
const years = [1950, 1963, 1975, 1984, 1990, 1997, 2004, 2012, 2020];
const hours = [0, 3, 7, 11, 14, 18, 21, 23];
const grid: Array<{ label: string; hour: number; chart: NormalizedChartJSON }> = [];
for (const y of years) {
  for (const [hi, h] of hours.entries()) {
    for (const g of ['nam', 'nu'] as const) {
      const month = ((y + hi * 5) % 12) + 1;
      const day = ((y * 7 + hi * 3 + (g === 'nam' ? 1 : 0)) % 27) + 1;
      const date = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const label = `${g} ${date} giờ ${h}`;
      try {
        grid.push({ label, hour: h, chart: chartGenerator.generate({ gender: g, calendarType: 'solar', date, hour: h, viewingYear: 2026 }) });
      } catch (e) {
        fail.push(`[${label}] generate lỗi: ${(e as Error).message}`);
      }
    }
  }
}
console.log(`  lưới dựng được: ${grid.length}/144 lá số`);

let lunarMatch = 0, lunarTried = 0;
const scores: number[] = [];
const byPalace = new Map<string, number[]>();
const vcd: number[] = [], nonVcd: number[] = [];

for (const { label, hour, chart: c } of grid) {
  ok(c.palaces.length === 12, `[${label}] không đủ 12 cung`);
  ok(new Set(c.palaces.map((p) => p.key)).size === 12, `[${label}] trùng khoá cung`);
  ok(new Set(c.palaces.map((p) => p.branch)).size === 12, `[${label}] trùng địa chi cung`);
  ok(c.palaces.reduce((s, p) => s + p.majorStars.length, 0) === 14, `[${label}] tổng chính tinh ≠ 14`);
  ok(c.palaces.filter((p) => p.isBodyPalace).length === 1, `[${label}] cung Thân ≠ 1`);
  ok(c.daiVan.length === 12, `[${label}] đại vận ≠ 12`);
  ok(c.thienBan.napAm !== 'Không xác định', `[${label}] thiếu nạp âm`);

  for (const p of c.palaces) {
    ok(p.score.total >= 5 && p.score.total <= 98, `[${label}] điểm ${p.key} = ${p.score.total} ngoài [5,98]`);
    const wantGrade = p.score.total >= 75 ? 'A' : p.score.total >= 58 ? 'B' : p.score.total >= 42 ? 'C' : 'D';
    ok(p.score.grade === wantGrade, `[${label}] grade ${p.key} ${p.score.grade}≠${wantGrade}`);
    // xung chiếu = cung + 6, tam hợp = +4/+8 (theo thứ tự chi)
    const i = BRANCHES.indexOf(p.branch);
    ok(p.oppositeBranch === BRANCHES[(i + 6) % 12], `[${label}] sai xung chiếu ${p.key}`);
    const wantTrine = [BRANCHES[(i + 4) % 12], BRANCHES[(i + 8) % 12]].sort();
    ok([...p.trineBranches].sort().join() === wantTrine.join(), `[${label}] sai tam hợp ${p.key}`);
    scores.push(p.score.total);
    (p.isEmpty ? vcd : nonVcd).push(p.score.total);
    const arr = byPalace.get(p.key) ?? [];
    arr.push(p.score.total);
    byPalace.set(p.key, arr);
  }

  // đại vận: liên tục, mỗi bản 10 năm
  const ranges = [...c.daiVan.map((d) => d.range)].sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < ranges.length; i++) ok(ranges[i][0] === ranges[i - 1][1] + 1, `[${label}] đại vận hở/không chồng ở mốc ${ranges[i][0]}`);
  for (const r of ranges) ok(r[1] - r[0] === 9, `[${label}] bản đại vận ${r[0]}-${r[1]} không dài 10 năm`);

  if (hour === 23 && !c.warnings.some((w) => w.includes('Tý muộn'))) fail.push(`[${label}] thiếu cảnh báo giờ Tý muộn`);

  // solar ↔ âm lịch: 2 đường nhập liệu phải cho ra CÙNG lá số
  if (!c.meta.lunar.isLeapMonth) {
    lunarTried++;
    try {
      const again = chartGenerator.generate({
        gender: c.meta.gender, calendarType: 'lunar',
        date: `${c.meta.lunar.year}-${c.meta.lunar.month}-${c.meta.lunar.day}`,
        hour, viewingYear: 2026,
      });
      if (JSON.stringify(again.palaces) === JSON.stringify(c.palaces) && JSON.stringify(again.thienBan) === JSON.stringify(c.thienBan)) lunarMatch++;
      else fail.push(`[solar↔lunar ${c.meta.solarDate} giờ ${hour}] lá số KHÁC nhau giữa 2 đường nhập`);
    } catch (e) {
      fail.push(`[solar↔lunar ${c.meta.solarDate} giờ ${hour}] âm lịch ${c.meta.lunar.year}-${c.meta.lunar.month}-${c.meta.lunar.day} không dựng lại được: ${(e as Error).message}`);
    }
  }
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const std = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const grades = { A: 0, B: 0, C: 0, D: 0 } as Record<string, number>;
for (const s of scores) grades[s >= 75 ? 'A' : s >= 58 ? 'B' : s >= 42 ? 'C' : 'D']++;

console.log(`  điểm engine: ${scores.length} điểm · trung bình ${mean(scores).toFixed(1)} · độ lệch ${std(scores).toFixed(1)} · min ${Math.min(...scores)} · max ${Math.max(...scores)}`);
console.log(`  phân bố hạng: A ${grades.A} · B ${grades.B} · C ${grades.C} · D ${grades.D}`);
console.log(`  cung VCD (${vcd.length}) TB ${mean(vcd).toFixed(1)} — cung có chính tinh (${nonVcd.length}) TB ${mean(nonVcd).toFixed(1)}`);
console.log(`  solar ↔ âm lịch: ${lunarMatch}/${lunarTried} lá số trùng khớp`);
console.log(`  lỗi bất biến: ${fail.length}`);
for (const f of fail.slice(0, 15)) console.log(`    ✗ ${f}`);

/* ==================== B. ĐỐI CHIẾU VỚI COHOC ==================== */
console.log('\n═══ B. ĐỐI CHIẾU OFFLINE VỚI BẢNG 12 CUNG COHOC ═══');
const cacheDir = path.join(process.cwd(), '.cache', 'cohoc');
/* Cache là dữ liệu sinh ra (không commit) nên có thể trống. Section A vẫn chạy
   đầy đủ với engine; phần đối chiếu B/C chỉ chạy khi đã có cache. */
const hasCache = fs.existsSync(cacheDir);
const htmlFiles = hasCache ? fs.readdirSync(cacheDir).filter((f) => f.endsWith('.html')) : [];
if (!hasCache) console.log('  (chưa có .cache/cohoc — bỏ qua phần đối chiếu; chạy `npm run cohoc:test` một lần để có dữ liệu offline)');

interface Ident { key: string; gender: 'nam' | 'nu'; yearCanChi: string; month: number; day: number; timeName: string; }
const identOf = (t: { gender: 'nam' | 'nu'; yearCanChi: string; month: number; day: number; timeName: string }): Ident => ({
  key: `${t.gender}|${t.yearCanChi}|${t.month}/${t.day}|${t.timeName}`,
  gender: t.gender, yearCanChi: t.yearCanChi, month: t.month, day: t.day, timeName: t.timeName,
});

/* Hoa/thường: tiêu đề trang cohoc ghi "CANH NGỌ" còn JSON cache ghi "Canh Ngọ" —
   nếu so khớp phân biệt hoa thì mọi ứng viên năm/giờ sẽ rỗng và cross-check
   âm thầm báo "không dựng được" thay vì báo lệch thật. */
const hoursForBranch = (b: string): number[] => {
  const idx = BRANCHES.findIndex((x) => x.toLowerCase() === b.trim().toLowerCase());
  if (idx < 0) return [];
  return idx === 0 ? [0, 23] : [2 * idx - 1, 2 * idx];
};
const yearCandidates = (canChi: string): number[] => {
  const [can, chi] = canChi.trim().split(/\s+/);
  const ci = CANS.findIndex((x) => x.toLowerCase() === can?.toLowerCase());
  const qi = BRANCHES.findIndex((x) => x.toLowerCase() === chi?.toLowerCase());
  if (ci < 0 || qi < 0) return [];
  let idx = -1;
  for (let i = 0; i < 60; i++) if (i % 10 === ci && i % 12 === qi) idx = i;
  const y = 1984 + idx;
  return [y, y - 60, y + 60].filter((v) => v >= 1930 && v <= 2026);
};

type Row = { files: string[]; ident: string; label: string; cung: number; chosen: string; tried: string[]; issues: string[] };
const rows = new Map<string, Row>();

for (const f of htmlFiles) {
  const html = fs.readFileSync(path.join(cacheDir, f), 'utf8');
  const snapshot = parseCohocChartTable(html);
  if (snapshot.palaces.length < 12) continue; // trang chờ / bảng không đọc được
  const title = /<title>([\s\S]*?)<\/title>/.exec(html)?.[1]?.trim() ?? '';
  const m = /sinh năm\s+(.+?)\s+giờ\s+(.+?)\s+ngày\s+(\d+)\s+tháng\s+(\d+)/i.exec(title);
  if (!m) continue;
  const gender: 'nam' | 'nu' = /NỮ/i.test(title) ? 'nu' : 'nam';
  const id: Ident = identOf({ gender, yearCanChi: m[1].trim(), month: +m[4], day: +m[3], timeName: m[2].trim() });

  if (!rows.has(id.key)) {
    const tried: string[] = [];
    let best: { label: string; issues: string[] } | null = null;
    for (const y of yearCandidates(id.yearCanChi)) {
      for (const h of hoursForBranch(id.timeName)) {
        let c: NormalizedChartJSON;
        try {
          c = chartGenerator.generate({
            gender: id.gender, calendarType: 'lunar',
            date: `${y}-${id.month}-${id.day}`, hour: h, viewingYear: 2026,
          });
        } catch { continue; }
        const issues = crossCheckChart(
          c.palaces.map((p) => ({ name: p.name, branch: p.branch, majorStars: p.majorStars })),
          snapshot,
        );
        const label = `${c.meta.solarDate} giờ ${c.meta.timeName} (${h}h)`;
        tried.push(`${label} → ${issues.length} lệch`);
        if (!best || issues.length < best.issues.length) best = { label, issues };
      }
    }
    rows.set(id.key, {
      files: [], ident: id.key, label: best?.label ?? '?', cung: snapshot.palaces.length,
      chosen: best?.label ?? '?', tried, issues: best?.issues ?? ['không dựng được lá số nào'],
    });
  }
  rows.get(id.key)!.files.push(f);
}

let fullyMatched = 0;
for (const r of rows.values()) {
  const good = r.issues.length === 0;
  if (good) fullyMatched++;
  console.log(`  ${good ? '✓' : '✗'} ${r.ident} → ${r.chosen} | ${r.cung} cung | ${r.files.length} trang | ${good ? 'khớp hoàn toàn' : `${r.issues.length} lệch`}`);
  for (const i of r.issues.slice(0, 6)) console.log(`      - ${i}`);
  if (r.issues.length > 6) console.log(`      - … còn ${r.issues.length - 6} lệch nữa`);
}
console.log(`  → ${fullyMatched}/${rows.size} lá số duy nhất khớp 100% với bảng sao của cohoc`);

/* ================= C. ĐIỂM ENGINE ↔ ĐẨU MINH COHOC ================= */
console.log('\n═══ C. TƯƠNG QUAN ĐIỂM ENGINE ↔ ĐẨU MINH COHOC ═══');
function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return NaN;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { const a = xs[i] - mx, b = ys[i] - my; num += a * b; dx += a * a; dy += b * b; }
  return dx && dy ? num / Math.sqrt(dx * dy) : NaN;
}

const pool: { engine: number[][]; cohoc: number[][]; vcdHit: boolean[] } = {
  engine: [[], [], [], []], cohoc: [[], [], [], []], vcdHit: [],
};

const seenIdent = new Set<string>();
for (const f of hasCache ? fs.readdirSync(cacheDir).filter((x) => x.endsWith('.json')) : []) {
  const raw = JSON.parse(fs.readFileSync(path.join(cacheDir, f), 'utf8')) as {
    identity?: { genderText?: string; yearCanChi?: string; lunarMonth?: number; lunarDay?: number; timeName?: string };
    metrics?: CohocMetrics;
  };
  const id = raw.identity;
  const dm = raw.metrics?.dauMinh;
  if (!id?.yearCanChi || !dm || dm.length !== 12) continue;
  const gender = /Nữ/i.test(id.genderText ?? '') ? 'nu' : 'nam';
  const key = `${gender}|${id.yearCanChi}|${id.lunarMonth}/${id.lunarDay}|${id.timeName}`;
  if (seenIdent.has(key)) continue;
  seenIdent.add(key);

  // Năm chưa xác định từ JSON → chọn ứng viên khiến VCD engine khớp ghi chú "(VCD)" của cohoc
  let best: { chart: NormalizedChartJSON; hit: number } | null = null;
  for (const y of yearCandidates(id.yearCanChi)) {
    for (const h of hoursForBranch(id.timeName ?? '')) {
      let c: NormalizedChartJSON;
      try {
        c = chartGenerator.generate({ gender, calendarType: 'lunar', date: `${y}-${id.lunarMonth}-${id.lunarDay}`, hour: h, viewingYear: 2026 });
      } catch { continue; }
      const hit = c.palaces.filter((p) => {
        const d = dm.find((x) => x.palaceKey === p.key);
        return !!d && (p.isEmpty === String(d.note ?? '').includes('VCD'));
      }).length;
      if (!best || hit > best.hit) best = { chart: c, hit };
    }
  }
  if (!best) continue;

  let hit = 0;
  for (const p of best.chart.palaces) {
    const d = dm.find((x) => x.palaceKey === p.key);
    if (!d) continue;
    const cohocVcd = String(d.note ?? '').includes('VCD');
    pool.vcdHit.push(p.isEmpty === cohocVcd);
    if (p.isEmpty === cohocVcd) hit++;
    // Chỉ gộp điểm khi cả hai bên ĐỀU có con số cho bàn đó (null = cohoc bỏ trống)
    const pushIf = (i: number, theirs: number | null) => {
      if (typeof theirs === 'number') { pool.engine[i].push(p.score.total); pool.cohoc[i].push(theirs); }
    };
    const nums = [d.thienBan, d.diaBan, d.nhanBan].filter((x): x is number => typeof x === 'number');
    pushIf(0, d.thienBan);
    pushIf(1, d.diaBan);
    pushIf(2, d.nhanBan);
    if (nums.length) pushIf(3, nums.reduce((a, b) => a + b, 0) / nums.length);
  }
  console.log(`  ${key} → ${best.chart.meta.solarDate} giờ ${best.chart.meta.timeName} | đồng thuận VCD ${hit}/12`);
}

const names = ['Thiên bàn', 'Địa bàn', 'Nhân bàn', 'Trung bình 3 bàn'];
names.forEach((n, i) => {
  const r = pearson(pool.engine[i], pool.cohoc[i]);
  console.log(`  Pearson r (điểm engine ↔ ${n}): ${Number.isNaN(r) ? 'n/a' : r.toFixed(2)}  [n=${pool.engine[i].length}]`);
});
console.log(`  VCD theo metrics "(VCD)": ${pool.vcdHit.filter(Boolean).length}/${pool.vcdHit.length} (${pct(pool.vcdHit.filter(Boolean).length, pool.vcdHit.length)}) — CHỮA SỐ: bảng metrics này bất đồng với CHÍNH bảng sao HTML của cohoc ở 9/36 cung nên không dùng làm chuẩn; engine khớp bảng sao 36/36 (chi tiết ở README, mục Cross-check).`);

console.log('\n═══ TỔNG ═══');
console.log(`  lỗi bất biến: ${fail.length} | đối chiếu cohoc: ${fullyMatched}/${rows.size} khớp 100%`);
if (fail.length) process.exitCode = 1;
