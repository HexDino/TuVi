import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/* Trang chủ và các route handler của TuVi đều động (lá số tính theo query), không có
   trang tĩnh nào cần ISR — nên không bật incremental cache R2. */
export default defineCloudflareConfig({});
