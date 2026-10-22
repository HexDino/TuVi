/**
 * GET /api/skill — xuất kỹ năng cho Gemini Skills.
 * ---------------------------------------------------------------------------
 * SỬA LẦN 2 (22/10/2026): bản trước trả file `.zip` và KHÔNG upload được.
 * Hộp thoại "Tải một kỹ năng lên" của Gemini ghi rõ:
 *
 *   "Kéo hoặc chọn hình ảnh, tệp hoặc thư mục để tải tệp PDF, CSV, PY, TXT và MD lên"
 *
 * Tức là: nhận **thư mục** (kéo cả folder) và các tệp .md/.txt/.py/.csv/.pdf —
 * KHÔNG nhận .zip. Vậy đường đúng là để người dùng tải `SKILL.md` rồi bỏ vào một
 * thư mục và kéo thư mục đó vào.
 *
 * Các dạng trả về:
 *   (mặc định)         text/markdown + attachment "SKILL.md"  → tải về, bỏ vào thư mục
 *   ?inline=1          text/markdown, không attachment          → để fetch/đọc trước
 *   ?file=vi-du-van-phong | vi-du-dau-ra | du-lieu-mau            → 3 tệp tham khảo
 *   ?format=zip        application/zip                          → cho nền tảng KHÁC nhận zip
 *                                                                 (Claude, công cụ agent…)
 *
 * Vì sao vẫn giữ zip: định dạng skill dạng zip dùng được ở nơi khác. Nhưng với
 * Gemini thì đừng đưa zip — sai định dạng, mất thời gian của người dùng.
 * ---------------------------------------------------------------------------
 */

import {
  buildSkillMd,
  buildSkillFiles,
  buildSkillZip,
  SKILL_NAME,
} from '@/lib/tuvi/skill-package';

export const runtime = 'nodejs';

const REFERENCE_FILES: Record<string, string> = {
  'vi-du-van-phong': 'references/vi-du-van-phong.md',
  'vi-du-dau-ra': 'references/vi-du-dau-ra.md',
  'du-lieu-mau': 'references/du-lieu-mau.md',
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const format = url.searchParams.get('format');
  const file = url.searchParams.get('file');
  const inline = url.searchParams.get('inline') === '1';

  /* --- tệp tham khảo (3 tệp, lấy theo map ở trên) --- */
  if (file) {
    const path = REFERENCE_FILES[file];
    if (!path) {
      return Response.json(
        { error: `Không có tệp "${file}". Chọn: ${Object.keys(REFERENCE_FILES).join(' | ')}` },
        { status: 404 },
      );
    }
    const entry = buildSkillFiles().find((f) => f.path === path);
    if (!entry) return Response.json({ error: 'Không dựng được tệp.' }, { status: 500 });

    return new Response(entry.content, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${path.split('/').pop()}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  /* --- zip, cho nền tảng khác --- */
  if (format === 'zip') {
    const zip = buildSkillZip();
    return new Response(new Uint8Array(zip), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${SKILL_NAME}.zip"`,
        'Content-Length': String(zip.length),
        'Cache-Control': 'no-store',
      },
    });
  }

  /* --- mặc định: SKILL.md, đây là thứ Gemini cần --- */
  return new Response(buildSkillMd(), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(inline ? {} : { 'Content-Disposition': 'attachment; filename="SKILL.md"' }),
    },
  });
}
