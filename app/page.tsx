'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { NormalizedChartJSON } from '@/types/tuvi';
import { BirthForm, type BirthFormValue } from '@/components/BirthForm';
import { ChartBoard } from '@/components/ChartBoard';
import { StarDrawer } from '@/components/StarDrawer';
import { ChatBridge } from '@/components/ChatBridge';
import { CohocPanel } from '@/components/CohocPanel';
import type { CohocMetrics, CohocOverviewExtras } from '@/types/tuvi';

interface ChartApiResponse {
  chart: NormalizedChartJSON;
  classicalMeta: {
    available: boolean;
    viewMode?: string;
    sourceUrl?: string;
    palaces?: number;
    passages?: number;
    cleanedChars?: number;
    fromCache?: boolean;
    metrics?: CohocMetrics | null;
    extras?: CohocOverviewExtras | null;
    annualCount?: number;
    stale?: boolean;
    fetchedAt?: string;
  };
  warnings: string[];
}

const DEMO: BirthFormValue = {
  name: 'Nguyễn Văn A',
  gender: 'nam',
  calendarType: 'solar',
  date: '1990-10-21',
  hour: 12,
  minute: 0,
  viewingYear: new Date().getFullYear(),
  isLeapMonth: false,
  fixLeap: true,
};

/** Ghi thông tin sinh vào URL để chia sẻ / mở lại được. */
function toQuery(v: BirthFormValue): string {
  const q = new URLSearchParams();
  if (v.name) q.set('n', v.name);
  q.set('g', v.gender);
  q.set('c', v.calendarType);
  q.set('d', v.date);
  q.set('h', String(v.hour));
  q.set('m', String(v.minute));
  q.set('y', String(v.viewingYear));
  if (v.calendarType === 'lunar' && v.isLeapMonth) q.set('l', '1');
  if (v.calendarType === 'lunar' && !v.fixLeap) q.set('fl', '0');
  return q.toString();
}

function fromQuery(q: URLSearchParams): BirthFormValue | null {
  const d = q.get('d');
  if (!d) return null;
  return {
    name: q.get('n') ?? '',
    gender: q.get('g') === 'nu' ? 'nu' : 'nam',
    calendarType: q.get('c') === 'lunar' ? 'lunar' : 'solar',
    date: d,
    hour: Number(q.get('h') ?? 12),
    minute: Number(q.get('m') ?? 0),
    viewingYear: Number(q.get('y') ?? new Date().getFullYear()),
    isLeapMonth: q.get('l') === '1',
    fixLeap: q.get('fl') !== '0',
  };
}

export default function Page() {
  const [chart, setChart] = useState<NormalizedChartJSON | null>(null);
  const [classicalMeta, setClassicalMeta] = useState<ChartApiResponse['classicalMeta'] | null>(null);
  const [loadingChart, setLoadingChart] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'board' | 'report'>('board');
  const [starKey, setStarKey] = useState<string | null>(null);
  /** Thông tin sinh đã nạp — dùng để soạn dữ liệu cho tab Luận giải. */
  const [loaded, setLoaded] = useState<BirthFormValue | null>(null);
  const [copied, setCopied] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const booted = useRef(false);

  /* -------------------------------- lá số -------------------------------- */
  const loadChart = useCallback(async (value: BirthFormValue) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoadingChart(true);
    setError(null);

    const body = {
      name: value.name || undefined,
      gender: value.gender,
      calendarType: value.calendarType,
      date: value.date,
      hour: value.hour,
      minute: value.minute,
      viewingYear: value.viewingYear,
      isLeapMonth: value.isLeapMonth,
      fixLeap: value.fixLeap,
    };

    try {
      const res = await fetch('/api/chart', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setChart(json.chart as NormalizedChartJSON);
      setClassicalMeta(json.classicalMeta);
      setLoaded(value);
      setView('board');
    } catch (err) {
      // Bỏ qua lỗi của request đã bị request mới hơn thay thế.
      if (abortRef.current === ac && (err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (abortRef.current === ac) setLoadingChart(false);
    }
  }, []);

  const handleSubmit = useCallback(
    (value: BirthFormValue) => {
      // Ghi URL trước khi chạy: F5 hay copy link đều mở lại đúng lá số
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', `?${toQuery(value)}`);
      }
      void loadChart(value);
    },
    [loadChart],
  );

  /* Mở từ link chia sẻ: nạp lá số, không tự chạy gì thêm */
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const value = fromQuery(new URLSearchParams(window.location.search));
    if (value) void loadChart(value);
  }, [loadChart]);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Trình duyệt không cho sao chép. Hãy sao chép thanh địa chỉ.');
    }
  };

  const coreScore = chart
    ? Math.round(
        ['menh', 'tai_bach', 'quan_loc', 'thien_di'].reduce(
          (a, k) => a + (chart.palaces.find((p) => p.key === k)?.score.total ?? 0),
          0,
        ) / 4,
      )
    : null;

  return (
    <main className="shell">
      <header className="masthead no-print">
        <div>
          <h1>Tử Vi Đẩu Số</h1>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar no-print">
          <BirthForm onSubmit={handleSubmit} loading={loadingChart} initial={loaded} />
        </aside>

        <section>
          {error && (
            <div className="err no-print" style={{ marginBottom: 14 }}>
              {error}
            </div>
          )}

          {!chart && (
            <div className="empty">
              <b>Chưa có lá số</b>
              <div style={{ marginTop: 14 }}>
                <button className="btn-ghost" onClick={() => handleSubmit(DEMO)}>
                  Xem lá số mẫu
                </button>
              </div>
            </div>
          )}

          {chart && (
            <>
              <div className="toolbar no-print">
                <div className="mode-toggle">
                  <button data-active={view === 'board'} onClick={() => setView('board')}>
                    Lá số
                  </button>
                  <button data-active={view === 'report'} onClick={() => setView('report')}>
                    Luận giải
                  </button>
                </div>
                <span className="toolbar-title">
                  {chart.meta.name || 'Đương số'}
                  <span>
                    {' '}
                    · {chart.meta.gender === 'nam' ? 'Nam' : 'Nữ'} · {chart.meta.solarDate}
                    {coreScore !== null ? ` · TB ${coreScore}` : ''}
                  </span>
                </span>
                <span className="spacer" />
                <button className="btn-ghost" onClick={share}>
                  {copied ? 'Đã sao chép' : 'Chia sẻ'}
                </button>
                <button className="btn-ghost" onClick={() => window.print()}>
                  In
                </button>
              </div>

              {view === 'board' && (
                <div className="panel panel-pad">
                  <ChartBoard chart={chart} onSelectStar={setStarKey} />
                  {classicalMeta?.metrics && (
                    <CohocPanel
                      metrics={classicalMeta.metrics}
                      extras={classicalMeta.extras}
                      chart={chart}
                    />
                  )}
                </div>
              )}

              {view === 'report' && loaded && (
                <ChatBridge value={loaded} skipClassical={classicalMeta?.available === false} />
              )}
            </>
          )}
        </section>
      </div>

      <StarDrawer starKey={starKey} chart={chart} onClose={() => setStarKey(null)} />
    </main>
  );
}
