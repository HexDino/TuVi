import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // iztro và cheerio là CJS thuần — không bundle phía server để tránh lỗi ESM interop
  serverExternalPackages: ['iztro', 'cheerio'],
};

export default nextConfig;
