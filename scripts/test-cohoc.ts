/**
 * scripts/test-cohoc.ts
 * Smoke test Module 2: POST lên cohoc.net, parse, in thống kê + mẫu văn bản.
 * Chạy: npm run cohoc:test
 */
import { CohocKnowledgeService } from '../lib/tuvi/cohoc-knowledge.service';
import { chartGenerator } from '../lib/tuvi/chart-generator.service';

async function main() {
  const svc = new CohocKnowledgeService({ cacheDir: '.cache/cohoc-test' });

  const chart = chartGenerator.generate({
    gender: 'nam',
    calendarType: 'solar',
    date: '1990-10-21',
    hour: 12,
    viewingYear: 2026,
  });

  console.log('Lá số:', chart.meta.solarDate, chart.meta.lunarDateText, chart.meta.timeName);
  console.time('fetch+parse');
  const texts = await svc.fetchTexts({
    solarDate: chart.meta.solarDate,
    gender: chart.meta.gender,
    timeIndex: chart.meta.timeIndex,
    viewMode: 'tong-hop',
    forceRefresh: true,
    hints: Object.fromEntries(
      chart.palaces.map((p) => [
        p.key,
        [...p.majorStars, ...p.auspicious, ...p.malefic].map((s) => s.name.toLowerCase()),
      ]),
    ),
  });
  console.timeEnd('fetch+parse');

  console.log('\n--- stats ---');
  console.log(texts.stats);
  console.log('title:', texts.title);
  console.log('identity:', texts.identity);
  console.log('sourceUrl:', texts.sourceUrl);
  console.log('warnings:', texts.warnings);

  console.log(`\n--- overview (${texts.overview.length} đoạn) ---`);
  for (const p of texts.overview.slice(0, 4)) {
    console.log(`\n[${p.heading}] (${p.text.length} ký tự)${p.source ? ` — ${p.source}` : ''}`);
    console.log(p.text.slice(0, 300).replace(/\n/g, ' '), '…');
  }

  console.log('\n--- palaces ---');
  for (const [k, v] of Object.entries(texts.palaces)) {
    const chars = (v ?? []).reduce((a, p) => a + p.text.length, 0);
    console.log(`${k.padEnd(12)} ${String(v?.length ?? 0).padStart(2)} đoạn / ${String(chars).padStart(5)} ký tự`);
  }

  const menh = texts.palaces.menh ?? [];
  console.log('\n--- cung Mệnh, 2 đoạn đầu ---');
  for (const p of menh.slice(0, 2)) {
    console.log(`\n[${p.heading}]`);
    console.log(p.text.slice(0, 500), '…');
  }

  console.log('\n--- decadal ---', Object.keys(texts.decadal));

  /* Cross-check với bảng lá số của cohoc */
  const raw = await svc.fetchRawHtml({
    solarDate: chart.meta.solarDate,
    gender: chart.meta.gender,
    timeIndex: chart.meta.timeIndex,
  });
  const issues = svc.crossCheck(raw.html, chart.palaces);
  console.log('\n--- cross-check iztro vs cohoc ---');
  console.log(issues.length ? issues.join('\n') : '✓ Khớp hoàn toàn (12 cung + chính tinh)');

  const total = JSON.stringify(texts).length;
  console.log(`\nTổng JSON RawClassicalTexts: ${total} ký tự (~${Math.round(total / 3.5)} token tiếng Việt)`);
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
