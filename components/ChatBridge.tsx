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

export function ChatBridge({ value }: { value: BirthFormValue }) {
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
  const [canShare, setCanShare] = useState(false);

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
    setCanShare(typeof navigator.share === 'function');
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setPayload(null);
    setCopied(false);

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
          }),
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
  }, [install, skillMode, requestDelivery, value.date, value.hour, value.minute, value.gender, value.calendarType, value.viewingYear, value.name, value.isLeapMonth, value.fixLeap]);

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

  /**
   * Đẩy nội dung sang bảng chia sẻ của hệ điều hành — trên điện thoại bớt được
   * một bước dán. Bảng chia sẻ có thể bị đóng vì khối chữ quá dài, nên vẫn rơi
   * về sao chép; nút đổi nhãn "Đã sao chép" là người dùng biết mình đang ở đâu.
   */
  const shareText = useCallback(
    async (text: string, title: string, part: number | null) => {
      if (canShare) {
        try {
          await navigator.share({ title, text });
          return;
        } catch (err) {
          if ((err as Error).name === 'AbortError') return;
        }
      }
      if (await copyToClipboard(text)) markCopied(part);
      else setError('Không chia sẻ được và trình duyệt cũng không cho sao chép. Hãy bôi đen ô chữ và sao chép thủ công.');
    },
    [canShare, markCopied],
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
            Mỗi phần dưới đây đã gồm sẵn <b>bộ luật + dữ liệu lá số</b>, nên dán thẳng vào Gemini
            là chạy — dùng trên điện thoại vẫn được, không phải tải tệp kỹ năng lên.
          </p>
          <ol>
            <li>
              Mở <a href={GEMINI_URL} target="_blank" rel="noreferrer">Gemini</a> — ứng dụng trên
              điện thoại hoặc bản web trên máy tính đều dùng được.
            </li>
            <li>
              Bấm <b>Sao chép</b> ở phần 1. Trên điện thoại, bấm <b>Chia sẻ</b> rồi chọn Gemini nếu
              trình duyệt có sẵn bảng chia sẻ.
            </li>
            <li>
              Dán vào ô chat, gửi đi. Làm lần lượt 4 phần, mỗi phần một chat mới — không cần giữ
              lịch sử giữa các chat.
            </li>
          </ol>
          <p className="chatbridge-warn">
            Cách này không cần bật Keep Activity. Mỗi phần dài hơn bản có kỹ năng vì mang theo bộ
            luật. Muốn bản luận ít bị "Saved info" chi phối thì xóa hoặc tắt nó tại{' '}
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
          <p className="chatbridge-caveat">
            Cách này cần tải tệp lên Gemini, mà ứng dụng Gemini trên điện thoại <b>không có nút
            tải kỹ năng</b> — chỉ làm được trên máy tính. Ở điện thoại hãy chọn lại “Không cần cài”.
          </p>
          <p className="chatbridge-lead">
            Gemini nhận thẳng <b>SKILL.md</b>, một <b>thư mục</b>, hoặc <b>tệp .zip</b> có{' '}
            <code>SKILL.md</code> ở thư mục gốc. Gói của ứng dụng đã gồm <code>SKILL.md</code> và
            thư mục <code>references/</code> — chỉ cần tải một lần.
          </p>
          <ol>
            <li>
              <b>Bật Keep Activity.</b> Trong Gemini, mở{' '}
              <i>Cài đặt &amp; trợ giúp → Hoạt động → Giữ hoạt động (Keep Activity)</i> và bật
              lên. Kỹ năng yêu cầu mục này; tắt đi thì không tạo hoặc dùng kỹ năng được.
            </li>
            <li>
              <b>Tải gói.</b>{' '}
              <a className="chatbridge-zip-btn" href="/api/skill?format=zip">
                Tải gói .zip
              </a>{' '}
              — cách nhanh nhất. Hoặc{' '}
              <button className="chatbridge-inline-btn" onClick={saveToFolder} disabled={folderBusy}>
                {folderBusy ? 'Đang ghi…' : 'Chọn thư mục & ghi'}
              </button>{' '}
              nếu muốn để dạng thư mục.{' '}
              {folderSaved && <span className="chatbridge-ok">đã ghi vào “{folderSaved}”</span>}
            </li>
            <li>
              <b>Tải lên Gemini.</b> Mở <i>Tùy chỉnh (Customize) → Kỹ năng (Skills)</i>; không
              thấy Tùy chỉnh thì bấm <i>Thêm (More)</i>. Bấm <i>Tạo (Create) → Tải lên (Upload)</i>,
              rồi chọn tệp .zip hoặc kéo cả thư mục vào. Tên kỹ năng phải viết thường, có gạch nối —
              gói này đã đặt sẵn <code>tuvi-dau-so</code>.
            </li>
            <li>
              <b>Gọi kỹ năng.</b> Trong chat, gõ <code>/</code> (hoặc <code>@</code>) và chọn{' '}
              <code>tuvi-dau-so</code>. Không thấy tên này thì quay lại bước 3. Sau đó dán dữ liệu
              phần 1; với 3 phần còn lại, gọi lại kỹ năng trước khi dán.
            </li>
          </ol>
          <p className="chatbridge-warn">
            Kỹ năng là bộ luật cố định, dùng lại được qua các chat; mỗi chat vẫn có ngữ cảnh riêng.
            Kỹ năng không tắt được Saved info/Memory ở cấp tài khoản — muốn giảm ảnh hưởng, xóa tại{' '}
            <a href="https://gemini.google.com/saved-info" target="_blank" rel="noreferrer">
              Saved info
            </a>{' '}
            hoặc tắt <i>Memory</i> trong <i>Cài đặt → Personal Intelligence</i>. Đừng tắt Keep
            Activity.
          </p>
          <p className="chatbridge-sub">
            Gói .zip đã kèm 3 tệp trong <code>references/</code>. Nếu tải lẻ, đặt chúng đúng thư mục{' '}
            <code>references/</code> cạnh <code>SKILL.md</code>; thiếu tệp tham khảo thì kỹ năng
            vẫn chạy nhưng mất ví dụ.
          </p>
        </div>
      )}

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

      <p className="chatbridge-sub">
        {requestDelivery === 'parts'
          ? 'Chia 4 lượt: Tổng quan + 3 nhóm cung. Mỗi lượt gọn hơn nên mô hình luận sâu và ít bị cắt hơn.'
          : skillMode === 'full'
            ? 'Có văn bản cổ học của cả 12 cung — bản luận sâu hơn, có dẫn chiếu sách cổ.'
            : 'Chỉ bảng lá số + điểm engine — dán nhanh, nhưng bản luận nông hơn và độ tin cậy bị hạ.'}
      </p>

      {loading && <div className="chatbridge-status">Đang soạn dữ liệu…</div>}

      {payload?.prompt && (
        <>
          <div className="chatbridge-step">
            <div className="chatbridge-step-head">
              <b>Dữ liệu cho cả 4 phần — dán vào chat đã gọi kỹ năng</b>
              <span>
                {payload.chars.toLocaleString('vi-VN')} ký tự ≈{' '}
                {payload.tokenEstimate.toLocaleString('vi-VN')} token
              </span>
            </div>
            <textarea className="chatbridge-text" readOnly value={payload.prompt} rows={6} />
            <div className="chatbridge-actions">
              <button className="chatbridge-go" onClick={() => void copyText(payload.prompt!, null)}>
                {copied ? 'Đã sao chép' : 'Sao chép'}
              </button>
              {canShare && (
                <button
                  className="btn-ghost"
                  onClick={() => void shareText(payload.prompt!, 'Tử Vi Đẩu Số — lá số', null)}
                >
                  Chia sẻ
                </button>
              )}
              <a className="btn-ghost" href={GEMINI_URL} target="_blank" rel="noreferrer">
                Mở Gemini
              </a>
            </div>
          </div>

          <p className="chatbridge-sub">
            Câu trả lời hiển thị ngay trong Gemini; ứng dụng không cần nhận lại.
          </p>
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
              <span>
                {currentPart.chars.toLocaleString('vi-VN')} ký tự ≈{' '}
                {currentPart.tokenEstimate.toLocaleString('vi-VN')} token
              </span>
            </div>
            <textarea className="chatbridge-text" readOnly value={currentPart.prompt} rows={8} />
            <div className="chatbridge-actions">
              <button
                className="chatbridge-go"
                onClick={() => void copyText(currentPart.prompt, currentPart.part)}
              >
                {copiedPart === currentPart.part ? 'Đã sao chép' : 'Sao chép'}
              </button>
              {canShare && (
                <button
                  className="btn-ghost"
                  onClick={() =>
                    void shareText(currentPart.prompt, `Tử Vi — phần ${currentPart.part}`, currentPart.part)
                  }
                >
                  Chia sẻ
                </button>
              )}
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
            <p className="chatbridge-sub" style={{ marginTop: 9 }}>
              {install === 'inline'
                ? 'Phần này tự chứa bộ luật — dán vào một chat Gemini mới là chạy được ngay.'
                : 'Kỹ năng đã cài nắm bộ luật, phần này chỉ mang dữ liệu; nhớ gọi lại kỹ năng trước mỗi lượt dán.'}
            </p>
          </div>
        </>
      )}

      {error && (
        <div className="chatbridge-error">
          <b>{error}</b>
        </div>
      )}
    </>
  );

  return <div className="chatbridge chatbridge-inline">{body}</div>;
}
