/**
 * lib/tuvi/cohoc-store.ts — nơi cất bản cache của Module 2
 * ---------------------------------------------------------------------------
 * Service cohoc trước đây gọi thẳng node:fs. Chạy trên Cloudflare Worker thì
 * đĩa chỉ là bộ nhớ tạm trong isolate, nên mỗi lần tỉnh dậy là phải tải lại
 * cohoc.net — trái với nguyên tắc "một lá số một request" đã ghi ở đầu service.
 *
 * Vì vậy việc lưu được tách khỏi việc parse:
 *  - FileStore: máy cá nhân (`next dev`, scripts, test). Giữ đúng hành vi cũ —
 *    file dưới .cache/cohoc, tuổi bản lưu đọc từ mtime do service tự xét.
 *  - KvStore: Worker, ghi vào KV namespace COHOC_CACHE. Tuổi bản lưu lấy từ
 *    metadata ghi lúc write vì KV không lộ mtime qua API.
 *
 * Chọn store theo binding có thật lúc chạy (lib/tuvi/pipeline.ts gọi
 * createCohocService()); scripts và test vẫn dùng FileStore mặc định nên hành vi
 * local không đổi một chút nào.
 * ---------------------------------------------------------------------------
 */

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface CohocStoreEntry {
  text: string;
  /** Bản lưu này đã bao nhiêu tuổi tính tới lúc đọc (ms). */
  ageMs: number;
}

export interface CohocStore {
  /** null khi chưa có; KHÔNG tự cắt theo TTL — chính sách tuổi thuộc về service. */
  read(name: string): Promise<CohocStoreEntry | null>;
  write(name: string, text: string): Promise<void>;
}

/* ------------------------------- ĐĨA ------------------------------- */

export function createFileStore(dir: string): CohocStore {
  return {
    async read(name) {
      const file = path.join(dir, name);
      try {
        const [text, s] = await Promise.all([readFile(file, 'utf8'), stat(file)]);
        return { text, ageMs: Date.now() - s.mtimeMs };
      } catch {
        return null;
      }
    },
    async write(name, text) {
      try {
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, name), text, 'utf8');
      } catch {
        /* cache là best-effort */
      }
    },
  };
}

/* -------------------------------- KV -------------------------------- */

/**
 * Bề mặt KV binding mà store này cần. Khai báo tại chỗ thay vì thêm
 * @cloudflare/workers-types vào dependencies — Worker nhận binding thật lúc
 * chạy, còn TS chỉ cần đúng hai method này.
 */
export interface KvNamespaceLike {
  getWithMetadata(
    key: string,
    options: { type: 'text' },
  ): Promise<{ value: string | null; metadata?: { t?: number } | null }>;
  put(key: string, value: string, options?: { expirationTtl?: number; metadata?: unknown }): Promise<void>;
}

/** Trần của KV là 45 ngày. Service vẫn tự xét 30 ngày cho JSON nên số này chỉ giới hạn tuổi HTML. */
const KV_MAX_TTL_SECONDS = 45 * 24 * 60 * 60;

export function createKvStore(ns: KvNamespaceLike): CohocStore {
  return {
    async read(name) {
      try {
        const res = await ns.getWithMetadata(name, { type: 'text' });
        if (res.value === null) return null;
        const t = res.metadata?.t;
        return { text: res.value, ageMs: typeof t === 'number' ? Math.max(0, Date.now() - t) : 0 };
      } catch {
        return null;
      }
    },
    async write(name, text) {
      try {
        await ns.put(name, text, {
          expirationTtl: KV_MAX_TTL_SECONDS,
          metadata: { t: Date.now() },
        });
      } catch {
        /* cache là best-effort */
      }
    },
  };
}

/* ------------------------------ LỰA CHỌN ------------------------------ */

/**
 * Store tốt nhất cho môi trường đang chạy: có binding KV thì dùng KV, không thì
 * trả null để service tự dựng FileStore.
 *
 * Nhận diện bằng chính binding chứ không đoán runtime: workerd đời 2026 đã bỏ
 * `process.versions.webworker` (đo thực tế trên `wrangler dev`: versions chỉ còn
 * `node: 22.19.0` và một loạt chuỗi rỗng), nên mọi kiểu "đo xem có phải Worker
 * không" đều dễ sai — mà sai thì cache lỗ âm thầm, mỗi isolate tải lại cohoc.net.
 * Tại Node, `getCloudflareContext()` văng exception → bắt được → FileStore.
 */
export async function createCohocStore(): Promise<CohocStore | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    // CloudflareEnv không biết binding nào đã khai trong wrangler.jsonc nên
    // phải xin kiểu một lần tại đây.
    const env = getCloudflareContext().env as unknown as { COHOC_CACHE?: KvNamespaceLike };
    return env.COHOC_CACHE ? createKvStore(env.COHOC_CACHE) : null;
  } catch {
    return null;
  }
}
