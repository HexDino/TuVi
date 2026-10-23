import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tử Vi Đẩu Số — Lập lá số & luận giải chuyên sâu',
  description:
    'Lập lá số Tử Vi chuẩn xác bằng iztro, đối chiếu với cổ học, luận giải có cấu trúc theo gói kỹ năng Gemini.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
