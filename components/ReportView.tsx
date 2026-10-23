'use client';

import { useMemo, useState } from 'react';
import type { TuViFullReport } from '@/schemas/report.schema';
import type { NormalizedChartJSON } from '@/types/tuvi';
import { QUALITY_LABEL, type QualitySummary } from '@/lib/tuvi/report-quality';

/** Partial object trong lúc ghép 4 phần — mọi field đều có thể chưa có. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T[K] extends object | undefined
      ? DeepPartial<NonNullable<T[K]>>
      : T[K];
};

export type PartialReport = DeepPartial<TuViFullReport>;

type PalaceItem = NonNullable<PartialReport['careerGroup']>[number];
type InsightItem = NonNullable<NonNullable<PalaceItem['strengths']>[number]>;

const VERDICT_LABEL: Record<string, string> = {
  thuan_loi: 'Thuận lợi',
  trung_binh: 'Trung bình',
  thu_thach: 'Nhiều thử thách',
};

const ACTION_LABEL: Record<string, string> = {
  tich_luy: 'Tích luỹ',
  but_pha: 'Bứt phá',
  phong_thu: 'Phòng thủ',
  chuyen_huong: 'Chuyển hướng',
};

const GROUP_LABEL: Record<string, string> = {
  menh: 'Mệnh',
  quan_loc: 'Quan Lộc',
  tai_bach: 'Tài Bạch',
  thien_di: 'Thiên Di',
  phuc_duc: 'Phúc Đức',
  phu_the: 'Phu Thê',
  tu_nu: 'Tử Nữ',
  dien_trach: 'Điền Trạch',
  phu_mau: 'Phụ Mẫu',
  huynh_de: 'Huynh Đệ',
  no_boc: 'Nô Bộc',
  tat_ach: 'Tật Ách',
};

const GROUP_META: Record<string, { kicker: string; title: string }> = {
  career: { kicker: 'Phần II', title: 'Sự nghiệp & tài chính' },
  family: { kicker: 'Phần III', title: 'Gia đạo & phúc phận' },
  social: { kicker: 'Phần IV', title: 'Quan hệ xã hội & sức khỏe' },
};

/* ------------------------------ atoms ------------------------------ */

function ScorePill({ score }: { score?: number }) {
  if (typeof score !== 'number') return null;
  const grade = score >= 75 ? 'A' : score >= 58 ? 'B' : score >= 42 ? 'C' : 'D';
  return (
    <span className="score-pill" data-grade={grade}>
      {score}
    </span>
  );
}

function Insight({ item, tone }: { item: InsightItem; tone: 'good' | 'risk' }) {
  return (
    <div
      className="reader-insight"
      style={tone === 'risk' ? { background: 'var(--danger-soft)', borderColor: 'transparent' } : undefined}
    >
      <div className="t">{item?.title}</div>
      <div className="d">{item?.detail}</div>
      {!!item?.evidence?.length && (
        <div className="ev">
          {item.evidence.map((e, i) => (
            <span key={i}>{e}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------- reading mode --------------------------- */

function ReaderPalace({ data, chartScore }: { data: PalaceItem; chartScore?: number }) {
  const score = data?.score ?? chartScore;
  const paragraphs = (data?.narrative ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <section className="reader-section" id={`p-${data?.palaceKey ?? 'x'}`}>
      <div className="reader-head">
        <h3>{data?.palaceName || GROUP_LABEL[String(data?.palaceKey)] || '…'}</h3>
        {data?.verdict && (
          <span className="verdict" data-v={data.verdict} style={{ fontSize: 10 }}>
            {VERDICT_LABEL[data.verdict] ?? data.verdict}
          </span>
        )}
        <span style={{ marginLeft: 'auto' }}>
          <ScorePill score={score} />
        </span>
      </div>

      {data?.mainStars && <div className="reader-stars">{data.mainStars}</div>}

      {data?.headline && (
        <p
          style={{
            fontSize: 15,
            fontWeight: 600,
            lineHeight: 1.65,
            color: 'var(--ink)',
            margin: '2px 0 12px',
          }}
        >
          {data.headline}
        </p>
      )}

      {paragraphs.length > 0 ? (
        paragraphs.map((p, i) => (
          <p className="reader-p" key={i}>
            {p}
          </p>
        ))
      ) : null}

      {(!!data?.strengths?.length || !!data?.risks?.length || !!data?.strategy?.length) && (
        <details className="reader-details">
          <summary>Điểm sáng, điểm nghẽn và việc nên làm</summary>
          <div className="inner">
            {data.strengths?.map((s, i) => (
              <Insight key={`s${i}`} item={s} tone="good" />
            ))}
            {data.risks?.map((s, i) => (
              <Insight key={`r${i}`} item={s} tone="risk" />
            ))}
            {!!data.strategy?.length && (
              <div className="reader-insight">
                <div className="t">Việc nên làm</div>
                <ul className="strategy" style={{ marginTop: 6 }}>
                  {data.strategy.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}

      {data?.scoreReason && (
        <div className="score-note">
          {typeof score === 'number' ? `${score}/100` : ''}
          {typeof data.scoreDelta === 'number' && data.scoreDelta !== 0
            ? ` (${data.scoreDelta > 0 ? '+' : ''}${data.scoreDelta} so với engine)`
            : ''}{' '}
          — {data.scoreReason}
        </div>
      )}
    </section>
  );
}

function ReaderView({ report, scoreOf }: { report: PartialReport; scoreOf: (k: string) => number | undefined }) {
  const ov = report.overview;
  const all = [
    ...(report.careerGroup ?? []),
    ...(report.familyGroup ?? []),
    ...(report.socialGroup ?? []),
  ];
  const plan = report.actionPlan;

  const jump = [
    { id: 'sec-ov', label: 'Tổng quan' },
    ...all.map((p) => ({ id: `p-${p?.palaceKey}`, label: GROUP_LABEL[String(p?.palaceKey)] ?? '' })),
    { id: 'sec-plan', label: 'Đại vận' },
  ].filter((x) => x.label);

  return (
    <article className="reader">
      {ov?.opening && <p className="reader-opening">{ov.opening}</p>}

      {/* Dải "nhìn nhanh": 3 con số người đọc cần trước khi đi vào chi tiết. */}
      {(() => {
        const scored = all.filter((p) => typeof p?.score === 'number');
        if (!scored.length) return null;
        const best = scored.reduce((a, b) => ((b?.score ?? 0) > (a?.score ?? 0) ? b : a));
        const worst = scored.reduce((a, b) => ((b?.score ?? 0) < (a?.score ?? 0) ? b : a));

        /* Lấy đúng chỉ số engine dùng ở đầu trang (TB 4 cung lõi) thay vì điểm
           tổng thể do AI tự cho — tránh hai con số khác nhau trên cùng một màn. */
        const core = ['menh', 'tai_bach', 'quan_loc', 'thien_di']
          .map((k) => scored.find((p) => p?.palaceKey === k)?.score)
          .filter((n): n is number => typeof n === 'number');
        const coreAvg = core.length ? Math.round(core.reduce((a, b) => a + b, 0) / core.length) : null;

        return (
          <div className="glance">
            {coreAvg !== null && (
              <div className="glance-item">
                <span>TB Mệnh–Tài–Quan–Di</span>
                <b>{coreAvg}/100</b>
              </div>
            )}
            <div className="glance-item">
              <span>Mạnh nhất</span>
              <b>
                {GROUP_LABEL[String(best?.palaceKey)]} · {best?.score}
              </b>
            </div>
            <div className="glance-item">
              <span>Yếu nhất</span>
              <b>
                {GROUP_LABEL[String(worst?.palaceKey)]} · {worst?.score}
              </b>
            </div>
            {ov?.oneLineVerdict && (
              <div className="glance-item wide">
                <span>Chốt</span>
                <b style={{ fontWeight: 500 }}>{ov.oneLineVerdict}</b>
              </div>
            )}
          </div>
        );
      })()}

      <nav className="jumpnav">
        {jump.map((j) => (
          <a key={j.id} href={`#${j.id}`}>
            {j.label}
          </a>
        ))}
      </nav>

      <section className="reader-section" id="sec-ov">
        <div className="reader-kicker">Phần I</div>
        <h2 className="reader-h2">Bức tranh tổng quan &amp; cốt cách</h2>
        <div className="reader-rule" />

        {ov?.thienDiaNhan?.analysis && <p className="reader-p">{ov.thienDiaNhan.analysis}</p>}

        {ov?.cachCuc?.name && (
          <p className="reader-p">
            {ov.cachCuc.classicalQuote && (
              <>
                Cổ nhân nói “{ov.cachCuc.classicalQuote}” — {ov.cachCuc.quoteMeaning}.{' '}
              </>
            )}
            {ov.cachCuc.explanation}
          </p>
        )}

        {ov?.thanCu?.meaning && <p className="reader-p">{ov.thanCu.meaning}</p>}

        {!!ov?.personality?.traits?.length && (
          <>
            <div className="reader-rule" />
            {ov.personality.traits.map((t, i) => (
              <p className="reader-p" key={i}>
                {t?.detail}
              </p>
            ))}
          </>
        )}

        {(ov?.oneLineVerdict || typeof ov?.overallScore === 'number') && (
          <div className="reader-insight" style={{ marginTop: 16 }}>
            <div className="t">
              Chốt lại{typeof ov?.overallScore === 'number' ? ` · ${ov.overallScore}/100` : ''}
            </div>
            <div className="d">{ov?.oneLineVerdict}</div>
          </div>
        )}
      </section>

      {(['careerGroup', 'familyGroup', 'socialGroup'] as const).map((key) => {
        const list = report[key];
        if (!list?.length) return null;
        const meta = GROUP_META[key.replace('Group', '')];
        return (
          <div key={key}>
            <section className="reader-section">
              <div className="reader-kicker">{meta.kicker}</div>
              <h2 className="reader-h2">{meta.title}</h2>
              <div className="reader-rule" />
            </section>
            {list.map((p) => (
              <ReaderPalace key={p?.palaceKey} data={p} chartScore={scoreOf(String(p?.palaceKey))} />
            ))}
          </div>
        );
      })}

      <section className="reader-section" id="sec-plan">
        <div className="reader-kicker">Phần V</div>
        <h2 className="reader-h2">Lộ trình đại vận &amp; kim chỉ nam</h2>
        <div className="reader-rule" />

        {plan?.decadalAnalysis?.map((d, i) => (
          <p className="reader-p" key={i}>
            <b>
              {d?.range} tuổi — {ACTION_LABEL[String(d?.action)] ?? ''}.
            </b>{' '}
            {d?.theme} {d?.opportunity} {d?.risk}
          </p>
        ))}

        {!!plan?.goldenRules?.length && (
          <>
            <div className="reader-rule" />
            {plan.goldenRules.map((g, i) => (
              <p className="reader-p" key={i}>
                <b>
                  {i + 1}. {g?.rule}
                </b>{' '}
                {g?.rationale}
              </p>
            ))}
          </>
        )}
      </section>

      {!!report.editorialNotes?.length && (
        <section className="reader-section">
          <div className="reader-kicker">Ghi chú biên tập</div>
          <div className="reader-rule" />
          <ul className="strategy">
            {report.editorialNotes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

/* ---------------------------- scan mode ---------------------------- */

export function PalaceCard({ data, chartScore }: { data: PalaceItem; chartScore?: number }) {
  const score = data?.score ?? chartScore ?? 0;
  return (
    <article className="rcard">
      <div className="rcard-top">
        <div>
          <h3>{data?.palaceName || GROUP_LABEL[String(data?.palaceKey)] || '…'}</h3>
          <div className="stars">{data?.mainStars || 'đang luận…'}</div>
        </div>
        {data?.verdict && (
          <span className="verdict" data-v={data.verdict}>
            {VERDICT_LABEL[data.verdict] ?? data.verdict}
          </span>
        )}
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
          <span>Điểm cung</span>
          <b style={{ color: 'var(--ink)' }}>
            {score}/100
            {typeof data?.scoreDelta === 'number' && data.scoreDelta !== 0 && (
              <span style={{ color: 'var(--muted)', fontWeight: 500 }}>
                {' '}
                ({data.scoreDelta > 0 ? '+' : ''}
                {data.scoreDelta})
              </span>
            )}
          </b>
        </div>
        <div className="bar">
          <i style={{ width: `${Math.max(2, Math.min(100, score))}%` }} />
        </div>
      </div>

      {data?.headline && <p className="headline">{data.headline}</p>}

      {data?.narrative && (
        <p
          style={{
            fontSize: 12.5,
            color: 'var(--ink-2)',
            display: '-webkit-box',
            WebkitLineClamp: 5,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {data.narrative}
        </p>
      )}

      {!!data?.strengths?.length && (
        <div>
          <div className="block-label">Điểm sáng</div>
          {data.strengths.map((s, i) => (
            <Insight key={i} item={s} tone="good" />
          ))}
        </div>
      )}

      {!!data?.risks?.length && (
        <div>
          <div className="block-label">Điểm nghẽn</div>
          {data.risks.map((s, i) => (
            <Insight key={i} item={s} tone="risk" />
          ))}
        </div>
      )}

      {!!data?.strategy?.length && (
        <div>
          <div className="block-label">Chiến lược hành động</div>
          <ul className="strategy">
            {data.strategy.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rcard">
      <div className="skeleton" style={{ width: '45%', height: 16 }} />
      <div className="skeleton" style={{ width: '70%' }} />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function OverviewView({ report }: { report: PartialReport }) {
  const ov = report.overview;
  if (!ov) return <SkeletonCard lines={6} />;

  return (
    <div className="ov">
      <div className="ov-hero">
        {ov.opening && <p className="one-line">{ov.opening}</p>}
        {ov.oneLineVerdict && (
          <p style={{ fontSize: 13.5, color: 'var(--ink-2)', marginBottom: 12 }}>{ov.oneLineVerdict}</p>
        )}
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
          {typeof ov.overallScore === 'number' && (
            <span>
              Điểm tổng thể <b style={{ color: 'var(--accent)', fontSize: 15 }}>{ov.overallScore}</b>/100
            </span>
          )}
          {report.meta?.confidence && (
            <span>
              Độ tin cậy <b style={{ color: 'var(--ink)' }}>{report.meta.confidence}</b>
            </span>
          )}
          {ov.thienDiaNhan?.verdict && (
            <span>
              Thiên–Địa–Nhân <b style={{ color: 'var(--ink)' }}>{ov.thienDiaNhan.verdict.replace(/_/g, ' ')}</b>
            </span>
          )}
        </div>
      </div>

      <div className="ov-grid">
        {ov.thienDiaNhan?.analysis && (
          <div className="ov-cell">
            <h4>Tương quan Thiên – Địa – Nhân</h4>
            <div className="v">{ov.thienDiaNhan.analysis}</div>
          </div>
        )}

        {ov.cachCuc?.name && (
          <div className="ov-cell">
            <h4>Cách cục chủ đạo</h4>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{ov.cachCuc.name}</div>
            <div className="v">{ov.cachCuc.explanation}</div>
            {ov.cachCuc.classicalQuote && (
              <div style={{ marginTop: 8 }}>
                <div className="quote">“{ov.cachCuc.classicalQuote}”</div>
                {ov.cachCuc.quoteMeaning && (
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{ov.cachCuc.quoteMeaning}</div>
                )}
              </div>
            )}
          </div>
        )}

        {ov.thanCu?.palace && (
          <div className="ov-cell">
            <h4>Hậu vận — Thân cư {ov.thanCu.palace}</h4>
            <div className="v">{ov.thanCu.meaning}</div>
          </div>
        )}
      </div>

      {!!ov.personality?.traits?.length && (
        <div className="ov-cell">
          <h4>Chân dung tính cách</h4>
          <div className="traits">
            {ov.personality.traits.map((t, i) => (
              <div className="trait" key={i}>
                <div className="t">
                  {i + 1}. {t?.title}
                </div>
                <div className="d">{t?.detail}</div>
              </div>
            ))}
          </div>
          {!!ov.personality.coreCompetencies?.length && (
            <div style={{ marginTop: 12 }}>
              <div className="block-label">Năng lực cốt lõi</div>
              <div className="ev">
                {ov.personality.coreCompetencies.map((c, i) => (
                  <span key={i} className="tag cat" style={{ fontSize: 11, padding: '3px 8px' }}>
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
          {!!ov.personality.blindSpots?.length && (
            <div style={{ marginTop: 10 }}>
              <div className="block-label">Điểm mù</div>
              <ul className="strategy">
                {ov.personality.blindSpots.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PlanView({ report }: { report: PartialReport }) {
  const plan = report.actionPlan;
  return (
    <div>
      {plan?.decadalAnalysis?.length ? (
        <div className="timeline">
          {plan.decadalAnalysis.map((d, i) => (
            <div className="tl-item" key={i}>
              <div>
                <div className="tl-range">{d?.range}</div>
                <div className="tl-action">{ACTION_LABEL[String(d?.action)] ?? ''}</div>
              </div>
              <div className="tl-body">
                <div className="t">{d?.theme}</div>
                {d?.opportunity && <div className="r">Cơ hội: {d.opportunity}</div>}
                {d?.risk && <div className="r">Rủi ro: {d.risk}</div>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <SkeletonCard lines={4} />
      )}

      {!!plan?.goldenRules?.length && (
        <div style={{ marginTop: 22 }}>
          <div className="panel-title">Kim chỉ nam</div>
          <div className="golden">
            {plan.goldenRules.map((g, i) => (
              <div className="golden-item" key={i}>
                <div className="golden-num">{i + 1}</div>
                <div>
                  <div style={{ fontWeight: 650, fontSize: 14 }}>{g?.rule}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 2 }}>{g?.rationale}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!!report.editorialNotes?.length && (
        <div style={{ marginTop: 20 }}>
          <div className="panel-title">Ghi chú biên tập — mâu thuẫn đã phân xử</div>
          <ul className="strategy">
            {report.editorialNotes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* --------------------------- quality card --------------------------- */

/**
 * Bảng điểm chất lượng — 12 tiêu chí kiểm máy trên báo cáo người dùng dán về.
 *
 * Chỉ liệt kê tiêu chí RỚT: 12 dòng xì xụp sẽ che mất đúng thứ người dùng cần
 * đọc; còn 12/12 thì một dòng chốt là đủ.
 */
function QualityCard({ quality }: { quality: QualitySummary }) {
  if (!quality.issues.length) {
    return (
      <div className="notice no-print" style={{ marginBottom: 14 }}>
        ✓ Kiểm tra chất lượng {quality.passed}/{quality.total} — không phát hiện lỗi nào cần đọc lại.
      </div>
    );
  }
  return (
    <div className="warn no-print" style={{ marginBottom: 14 }}>
      <div>
        <b>Kiểm tra chất lượng {quality.passed}/{quality.total}</b> — những chỗ nên đọc lại trước khi tin bản
        này:
      </div>
      {quality.issues.map((i) => (
        <div key={i.id}>
          • <b>{QUALITY_LABEL[i.id] ?? i.id}:</b> {i.detail}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------- main ------------------------------- */

const TABS = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'career', label: 'Sự nghiệp · Tài chính' },
  { id: 'family', label: 'Gia đạo · Phúc phận' },
  { id: 'social', label: 'Xã hội · Sức khỏe' },
  { id: 'plan', label: 'Đại vận · Cải mệnh' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function ReportView({
  report,
  chart,
  quality,
  onOpenSkill,
}: {
  report: PartialReport | null;
  chart: NormalizedChartJSON | null;
  quality?: QualitySummary | null;
  onOpenSkill: () => void;
}) {
  const [mode, setMode] = useState<'doc' | 'scan'>('doc');
  const [tab, setTab] = useState<TabId>('overview');

  const counts = useMemo(() => {
    const c = report?.careerGroup?.length ?? 0;
    const f = report?.familyGroup?.length ?? 0;
    const s = report?.socialGroup?.length ?? 0;
    return { career: c, family: f, social: s, total: c + f + s };
  }, [report]);

  const scoreOf = (key: string) => chart?.palaces.find((p) => p.key === key)?.score.total;
  const starsOf = (key: string) => {
    const p = chart?.palaces.find((x) => x.key === key);
    if (!p) return undefined;
    return p.isEmpty ? 'Vô chính diệu' : p.majorStars.map((s) => `${s.name} (${s.brightness})`).join(', ');
  };

  if (!report) {
    return (
      <div className="empty empty-guide">
        <b>Chưa có luận giải</b>
        <p className="guide-intro">
          Ứng dụng không gọi API của mô hình. Bạn cài gói kỹ năng trong Gemini, dán dữ liệu lá số, rồi
          đọc câu trả lời ngay trong chat Gemini.
        </p>
        <ol className="guide-steps">
          <li>
            <b>Cài gói kỹ năng một lần.</b> Bật <i>Keep Activity</i>, tải gói .zip trong hộp thoại,
            rồi vào Gemini → <i>Tùy chỉnh (Customize) → Kỹ năng (Skills) → Tạo (Create) → Tải lên
            (Upload)</i> và chọn tệp đó. Đã cài rồi thì bỏ qua bước này.
          </li>
          <li>
            <b>Lấy dữ liệu lá số.</b> Trong chat, gõ <code>/</code> và chọn{' '}
            <code>tuvi-dau-so</code>, rồi chọn “Kèm cổ học” (sâu hơn) hoặc “Gọn” và sao chép từng
            phần — nên dùng 4 lượt để mô hình không bị cắt giữa chừng.
          </li>
          <li>
            <b>Đọc kết quả trong Gemini.</b> Dán từng phần theo hướng dẫn; câu trả lời hiển thị ngay
            trong chat, không cần dán lại vào ứng dụng.
          </li>
        </ol>
        <div style={{ marginTop: 18 }}>
          <button className="btn-ghost" onClick={onOpenSkill}>
            Luận giải bằng Gemini
          </button>
        </div>
      </div>
    );
  }

  const renderGroup = (group: PartialReport['careerGroup']) => {
    if (!group?.length) {
      return (
        <div className="bento">
          <SkeletonCard lines={5} />
          <SkeletonCard lines={4} />
        </div>
      );
    }
    return (
      <div className="bento">
        {group.map((d, i) => (
          <PalaceCard
            key={d?.palaceKey ?? i}
            data={{ ...d, mainStars: d?.mainStars ?? starsOf(String(d?.palaceKey)) }}
            chartScore={scoreOf(String(d?.palaceKey))}
          />
        ))}
      </div>
    );
  };

  return (
    <div>
      <div className="toolbar" style={{ marginTop: -6 }}>
        <div className="mode-toggle">
          <button data-active={mode === 'doc'} onClick={() => setMode('doc')}>
            Đọc
          </button>
          <button data-active={mode === 'scan'} onClick={() => setMode('scan')}>
            Tra cứu
          </button>
        </div>
        <span className="toolbar-title">
          {counts.total}/12 cung{' '}
          <span>· {mode === 'doc' ? 'đọc liền mạch' : 'dạng thẻ'}</span>
        </span>
        <span className="spacer" />
      </div>

      {quality && <QualityCard quality={quality} />}

      {mode === 'doc' ? (
        <ReaderView report={report} scoreOf={scoreOf} />
      ) : (
        <>
          <div className="tabs">
            {TABS.map((t) => (
              <button key={t.id} data-active={tab === t.id} onClick={() => setTab(t.id)}>
                {t.label}
                {t.id === 'career' && <span className="tab-count">{counts.career}/4</span>}
                {t.id === 'family' && <span className="tab-count">{counts.family}/4</span>}
                {t.id === 'social' && <span className="tab-count">{counts.social}/4</span>}
              </button>
            ))}
          </div>

          {tab === 'overview' && <OverviewView report={report} />}
          {tab === 'career' && renderGroup(report.careerGroup)}
          {tab === 'family' && renderGroup(report.familyGroup)}
          {tab === 'social' && renderGroup(report.socialGroup)}
          {tab === 'plan' && <PlanView report={report} />}
        </>
      )}
    </div>
  );
}
