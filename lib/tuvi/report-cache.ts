/**
 * lib/tuvi/report-cache.ts — cache báo cáo đã sinh.
 * ---------------------------------------------------------------------------
 * VÌ SAO CẦN: một báo cáo tốn ~113k token (4 lần gọi). Nhưng phần lớn lượt xem
 * là XEM LẠI cùng một lá số: bấm "Viết luận giải" lần hai, F5, mở link chia sẻ,
 * xem lại sau vài ngày. Sinh lại từ đầu cho những lượt đó là đốt tiền vô nghĩa.
 *
 * KHOÁ CACHE = HASH CỦA CHÍNH ĐẦU VÀO, không phải của ngày sinh.
 * Đây là điểm quan trọng: nếu chỉ hash `solarDate|gender` thì sửa prompt xong
 * vẫn nhận bản cũ và tưởng code không có tác dụng — đúng cái bẫy đã gặp ba lần
 * với `PARSER_VERSION`. Hash toàn bộ prompt nghĩa là: đổi bất cứ thứ gì ảnh
 * hưởng tới kết quả (prompt, văn bản cổ học, tên đương số, năm xem hạn) thì khoá
 * tự đổi. Không cần nhớ tăng version bằng tay.
 *
 * ĐÁNH ĐỔI PHẢI NÓI RÕ: temperature = 0.7, nên hai lần sinh trên cùng đầu vào
 * vốn đã cho ra hai bản khác nhau. Cache biến nó thành "một bản, dùng lại" —
 * người dùng thấy báo cáo ổn định hơn, nhưng mất tính biến thiên. Muốn bản mới
 * thì đặt `REPORT_CACHE=false` hoặc gọi với `forceRefresh`.
 * ---------------------------------------------------------------------------
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { TuViFullReport } from '@/schemas/report.schema';
import type { AgentUsage } from './astrology-agent.service';

export interface ReportCacheEntry {
  report: TuViFullReport;
  usage: AgentUsage;
  cachedAt: string;
  /** Mô tả ngắn đầu vào — chỉ để đọc log, không tham gia tính khoá. */
  signature: string;
}

export interface ReportCacheOptions {
  dir?: string;
  /** TTL, mặc định 180 ngày. Báo cáo là văn bản, không phải dữ liệu sống. */
  ttlMs?: number;
  enabled?: boolean;
}

const DEFAULTS: Required<ReportCacheOptions> = {
  dir: path.join(process.cwd(), '.cache', 'reports'),
  ttlMs: 180 * 24 * 60 * 60 * 1000,
  enabled: process.env.REPORT_CACHE !== 'false',
};

/**
 * Khoá cache từ chính các prompt sẽ gửi đi.
 *
 * Vì sao hash prompt chứ không hash ngày sinh: prompt đã bao gồm mọi thứ ảnh
 * hưởng tới kết quả — lá số, văn bản cổ học đã nén, tên đương số, năm xem hạn,
 * và cả phiên bản prompt. Sửa bất cứ thứ gì là khoá đổi, không cần version tay.
 */
export function makeReportKey(parts: {
  prompts: string[];
  modelChain: string;
  temperature: number;
  promptVersion: string;
  /**
   * Chế độ sinh. PHẢI nằm trong khoá: `full` và `chunked` cho ra prompt khác
   * nhau nhưng cùng một lá số, nên thiếu trường này thì đổi chế độ vẫn nhận bản
   * của chế độ cũ — đúng cái bẫy đã xảy ra khi test.
   */
  mode: string;
}): string {
  const h = createHash('sha1');
  h.update(
    `pv=${parts.promptVersion}|models=${parts.modelChain}|t=${parts.temperature}|mode=${parts.mode}`,
  );
  for (const p of parts.prompts) {
    // Gộp độ dài vào khoá để tránh trường hợp nối chuỗi trùng nhau
    h.update(`|${p.length}:`);
    h.update(p);
  }
  return h.digest('hex').slice(0, 20);
}

export class ReportCache {
  private opt: Required<ReportCacheOptions>;
  private hits = 0;
  private misses = 0;

  constructor(options: ReportCacheOptions = {}) {
    this.opt = { ...DEFAULTS, ...options };
  }

  private file(key: string): string {
    return path.join(this.opt.dir, `${key}.json`);
  }

  async get(key: string): Promise<ReportCacheEntry | null> {
    if (!this.opt.enabled) return null;
    try {
      const f = this.file(key);
      const st = await stat(f);
      if (Date.now() - st.mtimeMs > this.opt.ttlMs) {
        this.misses++;
        return null;
      }
      const raw = await readFile(f, 'utf8');
      const entry = JSON.parse(raw) as ReportCacheEntry;
      if (!entry?.report) {
        this.misses++;
        return null;
      }
      this.hits++;
      return entry;
    } catch {
      this.misses++;
      return null;
    }
  }

  async set(key: string, entry: ReportCacheEntry): Promise<void> {
    if (!this.opt.enabled) return;
    try {
      await mkdir(this.opt.dir, { recursive: true });
      await writeFile(this.file(key), JSON.stringify(entry), 'utf8');
      // Dọn file hết hạn theo xác suất 1/20 — không cần cron riêng.
      if (Math.random() < 0.05) await this.prune();
    } catch {
      /* cache là best-effort, không được làm hỏng luồng chính */
    }
  }

  /** Xoá file quá TTL. Trả về số file đã xoá. */
  async prune(): Promise<number> {
    let removed = 0;
    try {
      const names = await readdir(this.opt.dir);
      for (const n of names) {
        if (!n.endsWith('.json')) continue;
        const f = path.join(this.opt.dir, n);
        try {
          const st = await stat(f);
          if (Date.now() - st.mtimeMs > this.opt.ttlMs) {
            await unlink(f);
            removed++;
          }
        } catch {
          /* bỏ qua từng file lỗi */
        }
      }
    } catch {
      /* thư mục chưa tồn tại */
    }
    return removed;
  }

  stats(): { hits: number; misses: number; enabled: boolean } {
    return { hits: this.hits, misses: this.misses, enabled: this.opt.enabled };
  }

  /** Xoá toàn bộ cache báo cáo. */
  async clear(): Promise<number> {
    let removed = 0;
    try {
      const names = await readdir(this.opt.dir);
      for (const n of names) {
        if (!n.endsWith('.json')) continue;
        await unlink(path.join(this.opt.dir, n)).catch(() => undefined);
        removed++;
      }
    } catch {
      /* không có gì để xoá */
    }
    return removed;
  }
}

export const reportCache = new ReportCache();
