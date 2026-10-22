import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // iztro và cheerio là CJS thuần — không bundle phía server để tránh lỗi ESM interop
  serverExternalPackages: ['iztro', 'cheerio'],
  experimental: {
    // Báo cáo đầy đủ có thể mất 60–90s với model chậm
    proxyTimeout: 180_000,
  },
};

export default nextConfig;
