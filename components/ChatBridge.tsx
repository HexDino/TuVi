'use client';

import { useCallback, useEffect, useState } from 'react';
import type { BirthFormValue } from './BirthForm';
import type { TuViFullReport } from '@/schemas/report.schema';
import type { QualitySummary } from '@/lib/tuvi/report-quality';

/**
 * Cầu nối chat web — đường 0 đồng.
 *
 * HAI CHẾ ĐỘ, khác nhau ở chỗ BỘ LUẬT nằm ở đâu:
 *
 *  • Kỹ năng (khuyến nghị): Gemini đã bỏ Gems, chuyển sang Skills — gói ZIP có
 *    SKILL.md. Luật nằm trong gói, cài một lần. Mỗi lá số chỉ phải dán DỮ LIỆU
 *    (5k ký tự gọn / 34k kèm cổ học) thay vì 47k như bản đầy đủ.
 *    Kỹ năng cũng là cách để câu trả lời không bị "cá nhân hoá" bởi Saved info
 *    và lịch sử chat khác — mỗi lượt gọi là một lượt riêng, mang bộ luật cố định.
 *
 *  • Chat thường: dán cả luật lẫn dữ liệu vào một chat bất kỳ. Dùng khi chưa
 *    muốn tạo Gem, hoặc dùng Grok / Claude / ChatGPT.
 *
 * Cả hai đường đều kết thúc ở cùng một chỗ: 4 khối JSON được validate và lưu
 * cache, nên những lần xem sau không tốn đồng nào.
 */

interface PayloadResponse {
  prompt: string;
  chars: number;
  tokenEstimate: number;
}

type Mode = 'skill' | 'standalone';
type SkillMode = 'full' | 'compact';

export function ChatBridge({
  value,
  onImported,
  onClose,
  prefetchedPayload,
}: {
  value: BirthFormValue;
  /**
   * Nhận báo cáo hợp lệ + bảng điểm chất lượng (nếu API trả kèm).
   * `quality` chỉ gồm các tiêu chí RỚT — UI hiển thị để người dùng biết đọc
   * lại chỗ nào trước khi tin bản dán tay.
   */
  onImported: (report: TuViFullReport, quality?: QualitySummary | null) => void;
  onClose: () => void;
  /** Dữ liệu đã có sẵn — bỏ qua bước tải. Dùng cho test render và prefetch. */
  prefetchedPayload?: PayloadResponse;
}) {
  const [mode, setMode] = useState<Mode>('skill');
  const [skillMode, setSkillMode] = useState<SkillMode>('full');
  const [payload, setPayload] = useState<PayloadResponse | null>(prefetchedPayload ?? null);
  const [loading, setLoading] = useState(!prefetchedPayload);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [folderSaved, setFolderSaved] = useState<string | null>(null);
  const [folderBusy, setFolderBusy] = useState(false);

  const birth = {
    name: value.name || undefined,
    gender: value.gender,
    calendarType: value.calendarType,
    date: value.date,
    hour: value.hour,
    minute: value.minute,
    viewingYear: value.viewingYear,
  };

  useEffect(() => {
    if (prefetchedPayload) return;
    let alive = true;
    setLoading(true);
    setPayload(null);
    setCopied(false);

    (async () => {
      try {
        const res = await fetch('/api/report/export', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            mode === 'skill'
              ? { ...birth, target: 'skill', skillMode }
              : { ...birth, target: 'standalone' },
          ),
        });
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        setPayload(json as PayloadResponse);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefetchedPayload, mode, skillMode, value.date, value.hour, value.minute, value.gender, value.calendarType, value.viewingYear, value.name]);

  /**
   * Ghi thẳng SKILL.md + references/ vào một thư mục người dùng chọn.
   *
   * Vì sao cần: Gemini KHÔNG nhận file .zip — hộp thoại chỉ nhận PDF/CSV/PY/TXT/MD
   * và nhận "thư mục". Nên phải có một thư mục thật trên máy để kéo vào. Bắt
   * người dùng tự tạo thư mục rồi tự đặt file đúng tên là chỗ dễ sai nhất, nên
   * dùng File System Access API ghi hộ — chỉ hỗ trợ trên Chromium.
   */
  const saveToFolder = useCallback(async () => {
    const picker = (
      window as unknown as {
        showDirectoryPicker?: (o?: { mode?: 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
      }
    ).showDirectoryPicker;

    if (!picker) {
      setError(
        'Trình duyệt này không cho ghi thẳng vào thư mục. Hãy tải SKILL.md rồi tự tạo một thư mục và bỏ file vào.',
      );
      return;
    }

    setFolderBusy(true);
    setError(null);
    try {
      const dir = await picker({ mode: 'readwrite' });

      const md = await fetch('/api/skill?inline=1').then((r) => r.text());
      const root = await dir.getFileHandle('SKILL.md', { create: true });
      const w = await root.createWritable();
      await w.write(md);
      await w.close();

      const refDir = await dir.getDirectoryHandle('references', { create: true });
      for (const name of ['vi-du-van-phong', 'vi-du-dau-ra', 'du-lieu-mau']) {
        const text = await fetch(`/api/skill?file=${name}`).then((r) => r.text());
        const fh = await refDir.getFileHandle(`${name}.md`, { create: true });
        const ww = await fh.createWritable();
        await ww.write(text);
        await ww.close();
      }

      setFolderSaved(dir.name);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setFolderBusy(false);
    }
  }, []);

  const copy = useCallback(async () => {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Trình duyệt không cho copy. Hãy bôi đen ô chữ và copy thủ công.');
    }
  }, [payload]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setDetail(null);
    try {
      const res = await fetch('/api/report/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...birth, text }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        setDetail(json.detail ?? null);
        return;
      }
      onImported(json.report as TuViFullReport, json.quality ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [birth, text, onImported]);

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="chatbridge" role="dialog" aria-label="Luận giải qua chat web">
        <div className="chatbridge-head">
          <div>
            <div className="drawer-kicker">Không tốn token API</div>
            <h3>Luận giải qua chat web</h3>
          </div>
          <button className="btn-ghost" onClick={onClose}>
            Đóng
          </button>
        </div>

        <div className="mode-toggle" style={{ marginBottom: 14 }}>
          <button data-active={mode === 'skill'} onClick={() => setMode('skill')}>
            Kỹ năng (khuyến nghị)
          </button>
          <button data-active={mode === 'standalone'} onClick={() => setMode('standalone')}>
            Chat thường
          </button>
        </div>

        {mode === 'skill' && (
          <div className="chatbridge-setup">
            <b>Cài một lần</b>
            <p className="chatbridge-caveat">
              Gemini <b>không nhận file .zip</b> — hộp thoại chỉ nhận PDF, CSV, PY, TXT, MD và
              nhận <b>thư mục</b>. Nên cần một thư mục thật trên máy, có <code>SKILL.md</code> ở
              gốc.
            </p>
            <ol>
              <li>
                Ghi gói vào một thư mục:{' '}
                <button className="chatbridge-inline-btn" onClick={saveToFolder} disabled={folderBusy}>
                  {folderBusy ? 'Đang ghi…' : 'Chọn thư mục & ghi'}
                </button>{' '}
                {folderSaved && <span className="chatbridge-ok">đã ghi vào “{folderSaved}”</span>}
              </li>
              <li>
                Không dùng được nút trên? Tải riêng rồi tự đặt vào thư mục:{' '}
                <a className="chatbridge-dl" href="/api/skill">
                  SKILL.md
                </a>{' '}
                ·{' '}
                <a href="/api/skill?file=vi-du-van-phong">ví dụ văn phong</a> ·{' '}
                <a href="/api/skill?file=vi-du-dau-ra">ví dụ đầu ra</a> ·{' '}
                <a href="/api/skill?file=du-lieu-mau">dữ liệu mẫu</a>{' '}
                <span style={{ opacity: 0.75 }}>
                  (3 tệp sau để trong references/; không có vẫn chạy, chỉ thiếu ví dụ)
                </span>
              </li>
              <li>
                Gemini → tab <i>Kỹ năng</i> → <i>Tải một kỹ năng lên</i> → kéo <b>cả thư mục</b> vào
                ô đó.
              </li>
              <li>
                Tắt <i>Cài đặt → Personalization → Saved info</i> nếu muốn cách ly tuyệt đối.
              </li>
            </ol>
            <p className="chatbridge-warn">
              Kỹ năng giữ bộ luật cố định và mỗi lượt gọi là một lượt riêng — đó là lý do bản luận
              không bị lẫn với các chat khác trong tài khoản. Nhưng kỹ năng không tắt được “Saved
              info” ở cấp tài khoản; app không can thiệp được chỗ đó.
            </p>
          </div>
        )}

        {mode === 'skill' && (
          <div className="chatbridge-step-head" style={{ marginBottom: 6 }}>
            <b>Mỗi lá số: chọn mức dữ liệu</b>
            <div className="mode-toggle" style={{ marginLeft: 'auto' }}>
              <button data-active={skillMode === 'full'} onClick={() => setSkillMode('full')}>
                Kèm cổ học
              </button>
              <button data-active={skillMode === 'compact'} onClick={() => setSkillMode('compact')}>
                Gọn
              </button>
            </div>
          </div>
        )}

        {mode === 'skill' && (
          <p className="chatbridge-sub">
            {skillMode === 'full'
              ? 'Có văn bản cổ học của cả 12 cung — bản luận sâu hơn, có dẫn chiếu sách cổ.'
              : 'Chỉ bảng lá số + điểm engine — dán nhanh, nhưng bản luận nông hơn và confidence bị hạ.'}
          </p>
        )}

        {loading && <div className="chatbridge-status">Đang soạn dữ liệu…</div>}

        {payload && (
          <>
            <div className="chatbridge-step">
              <div className="chatbridge-step-head">
                <b>{mode === 'skill' ? 'Dán vào chat (kỹ năng đã cài)' : '1 · Dán vào chat'}</b>
                <span>
                  {payload.chars.toLocaleString('vi-VN')} ký tự ≈{' '}
                  {payload.tokenEstimate.toLocaleString('vi-VN')} token
                </span>
                <button className="btn-ghost" onClick={copy} style={{ marginLeft: 'auto' }}>
                  {copied ? 'Đã copy' : 'Copy'}
                </button>
              </div>
              <textarea className="chatbridge-text" readOnly value={payload.prompt} rows={6} />
            </div>

            <div className="chatbridge-step">
              <div className="chatbridge-step-head">
                <b>{mode === 'skill' ? 'Dán câu trả lời về' : '2 · Dán câu trả lời về'}</b>
                <span>phải có đủ 4 dấu phân cách “=== PHẦN n ===”</span>
              </div>
              <textarea
                className="chatbridge-text"
                placeholder="Dán nguyên câu trả lời của chat vào đây…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
              />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                <button
                  className="btn-ghost"
                  disabled={saving || text.trim().length < 50}
                  onClick={save}
                >
                  {saving ? 'Đang kiểm tra…' : 'Lưu & xem báo cáo'}
                </button>
                <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                  {text.trim().length.toLocaleString('vi-VN')} ký tự đã dán
                </span>
              </div>
            </div>
          </>
        )}

        {error && (
          <div className="chatbridge-error">
            <b>{error}</b>
            {detail && <div style={{ marginTop: 4, opacity: 0.85 }}>{detail}</div>}
          </div>
        )}
      </div>
    </>
  );
}
