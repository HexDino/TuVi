'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { NormalizedChartJSON } from '@/types/tuvi';
import type { TuViFullReport } from '@/schemas/report.schema';
import { BirthForm, type BirthFormValue } from '@/components/BirthForm';
import { ChartBoard } from '@/components/ChartBoard';
import { ReportView, type PartialReport } from '@/components/ReportView';
import { StarDrawer } from '@/components/StarDrawer';
import { ChatBridge } from '@/components/ChatBridge';
import { CohocPanel } from '@/components/CohocPanel';
import type { CohocMetrics, CohocOverviewExtras } from '@/types/tuvi';
import type { QualitySummary } from '@/lib/tuvi/report-quality';

interface UsageInfo {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  modelId: string;
  calls: number;
  cached?: boolean;
  savedTokens?: number;
  manual?: boolean;
}

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
  };
}

export default function Page() {
  const [chart, setChart] = useState<NormalizedChartJSON | null>(null);
  const [classicalMeta, setClassicalMeta] = useState<ChartApiResponse['classicalMeta'] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [report, setReport] = useState<PartialReport | null>(null);
  const [loadingChart, setLoadingChart] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<'board' | 'report'>('board');
  const [starKey, setStarKey] = useState<string | null>(null);
  /** Thông tin sinh đã nạp — dùng để chạy lại phần luận giải. */
  const [loaded, setLoaded] = useState<BirthFormValue | null>(null);
  const [copied, setCopied] = useState(false);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  /** Bảng điểm 11 tiêu chí — nhận từ SSE `quality` hoặc từ báo cáo nhập tay. */
  const [quality, setQuality] = useState<QualitySummary | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const userPickedView = useRef(false);
  const booted = useRef(false);

  const switchView = (v: 'board' | 'report') => {
    userPickedView.current = true;
    setView(v);
  };

  /* ------------------------------ luận giải ------------------------------ */
  const runReport = useCallback(async (value: BirthFormValue, forceRefresh = false) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setStreaming(true);
    setError(null);
    setNotice(null);
    setReport(null);
    setUsage(null);
    setQuality(null);
    let switched = false;

    const body = {
      name: value.name || undefined,
      gender: value.gender,
      calendarType: value.calendarType,
      date: value.date,
      hour: value.hour,
      minute: value.minute,
      viewingYear: value.viewingYear,
      forceRefresh: forceRefresh || undefined,
    };

    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `Không stream được báo cáo (HTTP ${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });

        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const lines = part.split('\n');
          const event = lines.find((l) => l.startsWith('event:'))?.slice(6).trim();
          const dataRaw = lines
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.slice(5).trim())
            .join('\n');
          if (!dataRaw) continue;

          let payload: unknown;
          try {
            payload = JSON.parse(dataRaw);
          } catch {
            continue;
          }

          if (event === 'partial') {
            setReport(payload as PartialReport);
            if (!switched && !userPickedView.current) {
              switched = true;
              setView('report');
            }
          } else if (event === 'notice') {
            setNotice((payload as { message?: string }).message ?? null);
          } else if (event === 'done') {
            setReport(payload as TuViFullReport);
            setNotice(null);
          } else if (event === 'usage') {
            setUsage(payload as UsageInfo);
          } else if (event === 'quality') {
            setQuality(payload as QualitySummary);
          } else if (event === 'error') {
            setError((payload as { message?: string }).message ?? 'LLM trả về lỗi');
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setStreaming(false);
    }
  }, []);

  /* -------------------------------- lá số -------------------------------- */
  const loadChart = useCallback(
    async (value: BirthFormValue, autoReport: boolean) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      setLoadingChart(true);
      setError(null);
      setNotice(null);
      setReport(null);
      setQuality(null);
      setWarnings([]);
      userPickedView.current = false;
      setLoaded(value);

      const body = {
        name: value.name || undefined,
        gender: value.gender,
        calendarType: value.calendarType,
        date: value.date,
        hour: value.hour,
        minute: value.minute,
        viewingYear: value.viewingYear,
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
        setWarnings(json.warnings ?? []);
        setView('board');
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError(err instanceof Error ? err.message : String(err));
        }
        setLoadingChart(false);
        return;
      }
      setLoadingChart(false);

      if (autoReport) void runReport(value);
    },
    [runReport],
  );

  const handleSubmit = useCallback(
    (value: BirthFormValue) => {
      // Ghi URL trước khi chạy: F5 hay copy link đều mở lại đúng lá số
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', `?${toQuery(value)}`);
      }
      void loadChart(value, true);
    },
    [loadChart],
  );

  /* Mở từ link chia sẻ: nạp lá số, KHÔNG tự đốt token luận giải */
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const value = fromQuery(new URLSearchParams(window.location.search));
    if (value) void loadChart(value, false);
  }, [loadChart]);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Trình duyệt không cho copy. Hãy copy thanh địa chỉ.');
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
          <div className="sub">
            Lá số an bằng engine chuẩn · đối chiếu cổ học · luận giải có cấu trúc, khử mâu thuẫn
          </div>
        </div>
        <span className="badge">iztro · cohoc.net · AI synthesis</span>
      </header>

      <div className="layout">
        <aside className="sidebar no-print">
          <BirthForm onSubmit={handleSubmit} loading={loadingChart || streaming} />

          {chart && classicalMeta && (
            <div className="panel panel-pad" style={{ marginTop: 14 }}>
              <div className="panel-title">Nguồn dữ liệu</div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.7 }}>
                <div>
                  Lá số: <b>engine nội bộ</b> (iztro vi-VN)
                </div>
                <div>
                  Cổ học:{' '}
                  {classicalMeta.available ? (
                    <>
                      <b>{classicalMeta.viewMode}</b> — {classicalMeta.passages} đoạn,{' '}
                      {(classicalMeta.cleanedChars ?? 0).toLocaleString('vi-VN')} ký tự
                      {classicalMeta.fromCache ? ' (cache)' : ''}
                    </>
                  ) : (
                    <b>không khả dụng</b>
                  )}
                </div>
                {classicalMeta.sourceUrl && (
                  <div style={{ wordBreak: 'break-all', color: 'var(--muted)', fontSize: 11 }}>
                    {classicalMeta.sourceUrl}
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>

        <section>
          {!chart && (
            <div className="empty">
              <b>Chưa có lá số</b>
              Nhập ngày giờ sinh ở cột bên trái. Lá số hiện sau ~1 giây, phần luận giải chạy tiếp
              phía sau.
              <div style={{ marginTop: 14 }}>
                <button className="btn-ghost" onClick={() => handleSubmit(DEMO)}>
                  Xem lá số mẫu
                </button>
              </div>
            </div>
          )}

          {chart && (
            <>
              {warnings.length > 0 && (
                <div className="warn no-print" style={{ marginBottom: 14 }}>
                  {warnings.map((w, i) => (
                    <div key={i}>• {w}</div>
                  ))}
                </div>
              )}

              <div className="toolbar no-print">
                <div className="mode-toggle">
                  <button data-active={view === 'board'} onClick={() => switchView('board')}>
                    Lá số
                  </button>
                  <button data-active={view === 'report'} onClick={() => switchView('report')}>
                    Luận giải
                  </button>
                </div>
                <span className="toolbar-title">
                  {chart.meta.name || 'Đương số'}
                  <span>
                    {' '}
                    · {chart.meta.gender === 'nam' ? 'Nam' : 'Nữ'} · {chart.meta.solarDate}
                    {coreScore !== null ? ` · TB ${coreScore}` : ''}
                    {usage
                      ? usage.manual
                        ? ' · viết qua chat (0đ)'
                        : usage.cached
                          ? ' · dùng lại bản cũ (0 token)'
                          : ` · ${(usage.totalTokens / 1000).toFixed(0)}k token`
                      : ''}
                  </span>
                </span>
                <span className="spacer" />
                {!report && !streaming && loaded && (
                  <button className="btn-ghost" onClick={() => void runReport(loaded)}>
                    Viết luận giải
                  </button>
                )}
                {report && !streaming && loaded && (
                  <button
                    className="btn-ghost"
                    title="Bỏ qua bản đã lưu, gọi model viết lại từ đầu (tốn token)"
                    onClick={() => void runReport(loaded, true)}
                  >
                    Viết lại
                  </button>
                )}
                {loaded && !streaming && (
                  <button
                    className="btn-ghost"
                    title="Soạn dữ liệu để dán vào Gem / chat web — không tốn token API"
                    onClick={() => setChatOpen(true)}
                  >
                    Chat 0đ
                  </button>
                )}
                {streaming && (
                  <button className="btn-ghost" onClick={() => abortRef.current?.abort()}>
                    Dừng
                  </button>
                )}
                <button className="btn-ghost" onClick={share}>
                  {copied ? 'Đã copy' : 'Chia sẻ'}
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
                  {streaming && (
                    <div className="stream-status no-print" style={{ marginTop: 16, marginBottom: 0 }}>
                      <span className="dot" />
                      AI đang viết phần luận giải — chuyển sang tab “Luận giải” để đọc dần.
                    </div>
                  )}
                </div>
              )}

              {view === 'report' && (
                <ReportView
                  report={report}
                  chart={chart}
                  streaming={streaming}
                  error={error}
                  notice={notice}
                  quality={quality}
                />
              )}
            </>
          )}
        </section>
      </div>

      <StarDrawer starKey={starKey} chart={chart} onClose={() => setStarKey(null)} />

      {chatOpen && loaded && (
        <ChatBridge
          value={loaded}
          onClose={() => setChatOpen(false)}
          onImported={(r, q) => {
            setReport(r);
            setQuality(q ?? null);
            setUsage({
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
              modelId: 'chat-manual',
              calls: 0,
              manual: true,
            });
            setChatOpen(false);
            userPickedView.current = true;
            setView('report');
          }}
        />
      )}
    </main>
  );
}
