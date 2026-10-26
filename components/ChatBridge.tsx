'use client';

import { useCallback, useEffect, useState } from 'react';
import type { BirthFormValue } from './BirthForm';

/**
 * Cầu nối Gemini — ứng dụng không gọi API của mô hình.
 *
 * Hai cách chạy, chọn bằng mục "Cách chạy":
 *   - Không cần cài: mỗi phần mang theo cả bộ luật nên dán thẳng vào một chat
 *     Gemini mới là chạy. Đây là đường dùng được trên ứng dụng điện thoại —
 *     Gemini mobile không cho tải tệp kỹ năng lên.
 *   - Đã cài kỹ năng: bộ luật nằm trong gói SKILL.md cài một lần trên web, phần
 *     dán chỉ còn dữ liệu nên nhẹ hơn nhiều.
 *
 * Ứng dụng chỉ soạn nội dung để dán sang Gemini; câu trả lời đọc ngay tại đó.
 */

interface SkillPartPayload {
  part: number;
  title: string;
  prompt: string;
  chars: number;
  tokenEstimate: number;
}

interface PayloadResponse {
  /** Chế độ một lượt. */
  prompt?: string;
  /** Chế độ 4 lượt. */
  parts?: SkillPartPayload[];
  chars: number;
  tokenEstimate: number;
  /** false = lá số không có văn bản cổ học (tháng nhuận, nguồn lỗi) → ẩn mức dữ liệu. */
  classicalAvailable?: boolean;
}

type SkillMode = 'full' | 'compact';
type SkillDelivery = 'parts' | 'single';
type SkillInstall = 'inline' | 'installed';

const GEMINI_URL = 'https://gemini.google.com/app';

/**
 * Sao chép có đường dự phòng.
 *
 * Vì sao không chỉ dùng Clipboard API: mở ứng dụng theo IP trong mạng nội bộ là
 * HTTP thường, mà `navigator.clipboard` chỉ chạy trong ngữ cảnh bảo mật — đúng
 * lúc cần nhất trên điện thoại thì nó bị từ chối. `execCommand('copy')` đã lỗi
 * thời nhưng vẫn copy được ở HTTP.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* rơi xuống đường dự phòng */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-2000px';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * Hai ô chồng nhau — dấu hiệu "sao chép" quen thuộc. Vẽ nội tuyến để không phải
 * thêm bộ icon chỉ vì một hình.
 */
function CopyIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function ChatBridge({ value, skipClassical = false }: { value: BirthFormValue; skipClassical?: boolean }) {
  const [install, setInstall] = useState<SkillInstall>('inline');
  const [skillMode, setSkillMode] = useState<SkillMode>('full');
  const [delivery, setDelivery] = useState<SkillDelivery>('parts');
  const [payload, setPayload] = useState<PayloadResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePart, setActivePart] = useState(0);
  const [copied, setCopied] = useState(false);
  const [copiedPart, setCopiedPart] = useState<number | null>(null);
  const [folderSaved, setFolderSaved] = useState<string | null>(null);
  const [folderBusy, setFolderBusy] = useState(false);
  /** Nút "Thử lại" tăng số này để chạy lại useEffect tải payload. */
  const [retry, setRetry] = useState(0);

  /** Bản inline luôn chia 4 lượt — xem ghi chú ở `app/api/report/export/route.ts`. */
  const requestDelivery: SkillDelivery = install === 'inline' ? 'parts' : delivery;
  const partMode = requestDelivery === 'parts' && (payload?.parts?.length ?? 0) === 4;
  const currentPart = payload?.parts?.[activePart] ?? null;

  const birth = {
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

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setPayload(null);
    setCopied(false);
    setError(null);

    (async () => {
      try {
        const res = await fetch('/api/report/export', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...birth,
            skillMode,
            skillDelivery: requestDelivery,
            skillInstall: install,
            /* Lá số đã không có văn bản cổ học thì đừng thử lại nguồn lần nữa:
               mỗi lần thử là một lượt chờ cohoc, dễ thành lỗi máy chủ. */
            skipClassical,
          }),
        });
        /* Phải đọc dạng text rồi tự parse: khi Worker quá tải hoặc lỗi, phản hồi
           là trang HTML; gọi thẳng res.json() sẽ ném "Unexpected token '<'" —
           người dùng chỉ thấy một câu vô nghĩa. */
        const raw = await res.text();
        let json: PayloadResponse | null = null;
        try {
          json = raw ? (JSON.parse(raw) as PayloadResponse) : null;
        } catch {
          json = null;
        }
        if (!alive) return;
        if (!json) {
          throw new Error('Máy chủ đang bận hoặc mất kết nối. Thử lại sau vài giây.');
        }
        if (!res.ok) {
          const message = (json as PayloadResponse & { error?: string }).error;
          throw new Error(message ?? `Máy chủ trả lỗi ${res.status}.`);
        }
        setPayload(json);
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
  }, [install, skillMode, requestDelivery, skipClassical, retry, value.date, value.hour, value.minute, value.gender, value.calendarType, value.viewingYear, value.name, value.isLeapMonth, value.fixLeap]);

  useEffect(() => {
    setActivePart(0);
    setCopied(false);
    setCopiedPart(null);
  }, [install, skillMode, requestDelivery]);

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
        'Trình duyệt này không cho ghi thẳng vào thư mục. Hãy tải SKILL.md rồi tự tạo một thư mục và bỏ tệp vào.',
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

  const markCopied = useCallback((part: number | null) => {
    if (part === null) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } else {
      setCopiedPart(part);
      setTimeout(() => setCopiedPart(null), 1800);
    }
  }, []);

  const copyText = useCallback(
    async (text: string, part: number | null) => {
      if (await copyToClipboard(text)) markCopied(part);
      else setError('Trình duyệt không cho sao chép. Hãy bôi đen ô chữ và sao chép thủ công.');
    },
    [markCopied],
  );

  const body = (
    <>
      <div className="chatbridge-head">
        <div>
          <div className="drawer-kicker">Chạy trong Gemini — ứng dụng không gọi API</div>
          <h3>Luận giải bằng Gemini</h3>
        </div>
      </div>

      <div className="chatbridge-step-head" style={{ marginBottom: 6 }}>
        <b>Cách chạy</b>
        <div className="mode-toggle" style={{ marginLeft: 'auto' }}>
          <button data-active={install === 'inline'} onClick={() => setInstall('inline')}>
            Không cần cài
          </button>
          <button data-active={install === 'installed'} onClick={() => setInstall('installed')}>
            Đã cài kỹ năng
          </button>
        </div>
      </div>

      {install === 'inline' && (
        <div className="chatbridge-setup">
          <b>Không cần cài đặt gì</b>
          <p className="chatbridge-lead">
            Mỗi phần đã gồm sẵn <b>bộ luật + dữ liệu lá số</b> — dán thẳng vào Gemini là chạy.
          </p>
          <ol>
            <li>
              Mở <a href={GEMINI_URL} target="_blank" rel="noreferrer">Gemini</a> (app hoặc web).
            </li>
            <li>
              Bấm <b>Sao chép</b> ở phần 1.
            </li>
            <li>
              Dán vào ô chat, gửi đi. Dán lần lượt 4 phần vào <b>cùng một chat</b> — đừng mở chat mới.
            </li>
            <li>
              Xong phần 4, hỏi tiếp thoải mái; Gemini dừng giữa chừng thì gõ “tiếp”.
            </li>
          </ol>
          <p className="chatbridge-warn">
            Không cần bật Keep Activity. Muốn bản luận ít bị “Saved info” chi phối thì tắt nó tại{' '}
            <a href="https://gemini.google.com/saved-info" target="_blank" rel="noreferrer">
              Saved info
            </a>
            .
          </p>
        </div>
      )}

      {install === 'installed' && (
        <div className="chatbridge-setup">
          <b>Cài một lần</b>
          <p className="chatbridge-lead">
            Chỉ làm được trên máy tính — Gemini trên điện thoại <b>không có nút tải kỹ năng</b>. Ở
            điện thoại hãy chọn lại “Không cần cài”.
          </p>
          <ol>
            <li>
              Bật <b>Keep Activity</b>: <i>Cài đặt &amp; trợ giúp → Hoạt động → Giữ hoạt động</i>.
            </li>
            <li>
              <a className="chatbridge-zip-btn" href="/api/skill?format=zip">
                Tải gói .zip
              </a>{' '}
              hoặc{' '}
              <button className="chatbridge-inline-btn" onClick={saveToFolder} disabled={folderBusy}>
                {folderBusy ? 'Đang ghi…' : 'Chọn thư mục & ghi'}
              </button>
              {folderSaved && <span className="chatbridge-ok">đã ghi vào “{folderSaved}”</span>}
            </li>
            <li>
              Trong Gemini: <i>Tùy chỉnh → Kỹ năng → Tạo → Tải lên</i>, chọn tệp .zip.
            </li>
            <li>
              Ở chat, gõ <code>/</code> rồi chọn <code>tuvi-dau-so</code>, dán phần 1. Ba phần sau
              gọi lại kỹ năng rồi dán <b>tiếp vào cùng chat</b>; dừng giữa chừng thì gõ “tiếp”.
            </li>
          </ol>
          <p className="chatbridge-warn">
            Đừng tắt Keep Activity. Kỹ năng không chặn được “Saved info” — cần thì xóa tại{' '}
            <a href="https://gemini.google.com/saved-info" target="_blank" rel="noreferrer">
              Saved info
            </a>
            .
          </p>
        </div>
      )}

      {payload?.classicalAvailable !== false && (
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

      {install === 'installed' && (
        <div className="chatbridge-step-head" style={{ marginBottom: 6 }}>
          <b>Cách trả lời</b>
          <div className="mode-toggle" style={{ marginLeft: 'auto' }}>
            <button data-active={delivery === 'parts'} onClick={() => setDelivery('parts')}>
              4 lượt (khuyến nghị)
            </button>
            <button data-active={delivery === 'single'} onClick={() => setDelivery('single')}>
              Một lượt
            </button>
          </div>
        </div>
      )}

      {loading && <div className="chatbridge-status">Đang soạn dữ liệu…</div>}

      {payload?.prompt && (
        <>
          <div className="chatbridge-step">
            <div className="chatbridge-step-head">
              <b>Dữ liệu cho cả 4 phần — dán vào chat đã gọi kỹ năng</b>
            </div>
            <textarea className="chatbridge-text" readOnly value={payload.prompt} rows={6} />
            <div className="chatbridge-actions">
              <button className="chatbridge-go" onClick={() => void copyText(payload.prompt!, null)}>
                {copied ? 'Đã sao chép' : 'Sao chép'}
                <CopyIcon />
              </button>
              <a className="btn-ghost" href={GEMINI_URL} target="_blank" rel="noreferrer">
                Mở Gemini
              </a>
            </div>
          </div>
        </>
      )}

      {payload?.parts && partMode && currentPart && (
        <>
          <div className="chatbridge-step">
            <div className="chatbridge-step-head">
              <b>Chọn phần</b>
            </div>
            <div className="chatbridge-parts">
              {payload.parts.map((p, i) => (
                <button key={p.part} data-active={activePart === i} onClick={() => setActivePart(i)}>
                  P{p.part} · {p.title}
                </button>
              ))}
            </div>
          </div>

          <div className="chatbridge-step">
            <div className="chatbridge-step-head">
              <b>Phần {currentPart.part}: {currentPart.title}</b>
            </div>
            <textarea className="chatbridge-text" readOnly value={currentPart.prompt} rows={8} />
            <div className="chatbridge-actions">
              <button
                className="chatbridge-go"
                onClick={() => void copyText(currentPart.prompt, currentPart.part)}
              >
                {copiedPart === currentPart.part ? 'Đã sao chép' : 'Sao chép'}
                <CopyIcon />
              </button>
              <a className="btn-ghost" href={GEMINI_URL} target="_blank" rel="noreferrer">
                Mở Gemini
              </a>
              <span className="chatbridge-pager">
                <button
                  className="btn-ghost"
                  disabled={activePart === 0}
                  onClick={() => setActivePart((p) => p - 1)}
                >
                  Phần trước
                </button>
                <button
                  className="btn-ghost"
                  disabled={activePart === 3}
                  onClick={() => setActivePart((p) => p + 1)}
                >
                  Phần sau
                </button>
              </span>
            </div>
          </div>
        </>
      )}

      {error && (
        <div className="chatbridge-error">
          <b>{error}</b>
          <button className="chatbridge-retry" onClick={() => setRetry((n) => n + 1)}>
            Thử lại
          </button>
        </div>
      )}
    </>
  );

  return <div className="chatbridge chatbridge-inline">{body}</div>;
}
