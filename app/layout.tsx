import type { Metadata } from 'next';
import { Be_Vietnam_Pro } from 'next/font/google';
import './globals.css';

/*
 * Be Vietnam Pro dựng riêng bộ glyph tiếng Việt nên dấu hai tầng (ế, ộ, ẩ) luôn
 * nằm đúng chỗ, không bị tách dấu như các font Latin thường. next/font tải và
 * tự host tệp font lúc build → lúc chạy không phụ thuộc Google Fonts.
 */
const fontUi = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ui',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Tử Vi Đẩu Số — Lập lá số & luận giải chuyên sâu',
  description:
    'Lập lá số Tử Vi chuẩn xác bằng iztro, đối chiếu với cổ học, luận giải có cấu trúc theo gói kỹ năng Gemini.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={fontUi.variable}>
      <body>{children}</body>
    </html>
  );
}
