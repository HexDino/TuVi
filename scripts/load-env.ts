/**
 * scripts/load-env.ts
 * Next.js tự nạp .env.local; script CLI thì không. Helper này nạp thủ công
 * để `npm run pipeline:test` đọc đúng COHOC_ENABLED như ứng dụng.
 *
 * Không dùng dotenv để tránh thêm dependency — định dạng .env đơn giản là đủ.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function loadEnv(files = ['.env.local', '.env']): void {
  for (const f of files) {
    const p = path.join(process.cwd(), f);
    if (!existsSync(p)) continue;
    for (const raw of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  }
}

loadEnv();
