'use client';

import { useEffect } from 'react';
import { lookupStar, STAR_GROUPS } from '@/lib/tuvi/star-dictionary';
import type { NormalizedChartJSON } from '@/types/tuvi';

/**
 * Ngăn kéo tra cứu sao.
 *
 * Lý do có: trên bàn lá số chỉ hiện "Tham Lang (Miếu)". Người không học tử vi
 * không biết sao đó nói gì. Bấm vào là ra nghĩa + nơi nó xuất hiện trong chính
 * lá này — cách học nhanh nhất mà không phải mở tab khác.
 */
export function StarDrawer({
  starKey,
  chart,
  onClose,
}: {
  starKey: string | null;
  chart: NormalizedChartJSON | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!starKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [starKey, onClose]);

  if (!starKey) return null;

  const entry = lookupStar(starKey);
  const groupLabel = STAR_GROUPS.find((g) => g.id === entry?.group)?.label ?? '';

  // Sao này nằm ở cung nào trong lá đang xem
  const places =
    chart?.palaces
      .map((p) => {
        const all = [...p.majorStars, ...p.auspicious, ...p.malefic, ...p.neutral];
        const hit = all.find((s) => s.key === starKey);
        return hit ? { palace: p, star: hit } : null;
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x)) ?? [];

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={entry?.name ?? 'Tra cứu sao'}>
        <div className="drawer-head">
          <div>
            <div className="drawer-kicker">{groupLabel || 'Tra cứu sao'}</div>
            <h3>{entry?.name ?? starKey}</h3>
          </div>
          <button className="btn-ghost" onClick={onClose} aria-label="Đóng">
            Đóng
          </button>
        </div>

        {entry ? (
          <>
            <div className="drawer-meta">
              <span className="tag">{entry.element}</span>
              <span className="tag">{entry.domain}</span>
            </div>

            <p className="drawer-essence">{entry.essence}</p>

            <div className="drawer-block">
              <div className="drawer-label">Khi đắc địa</div>
              <p>{entry.good}</p>
            </div>
            <div className="drawer-block risk">
              <div className="drawer-label">Khi hãm địa</div>
              <p>{entry.bad}</p>
            </div>

            {places.length > 0 && (
              <div className="drawer-block">
                <div className="drawer-label">Trong lá số này</div>
                <ul className="drawer-places">
                  {places.map(({ palace, star }) => (
                    <li key={palace.key}>
                      <b>{palace.name}</b> — {palace.stem} {palace.branch}
                      {star.brightness !== 'Vô' && ` · ${star.brightness}`}
                      {star.mutagen && ` · Hóa ${star.mutagen}`}
                      <span className={`pill g-${palace.score.grade}`}>{palace.score.total}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="drawer-essence">Chưa có mục từ cho sao này.</p>
        )}
      </aside>
    </>
  );
}
