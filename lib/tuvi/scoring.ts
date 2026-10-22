/**
 * lib/tuvi/scoring.ts
 * ---------------------------------------------------------------------------
 * Scoring engine — chấm điểm từng cung theo đúng triết lý trọng số của
 * system prompt, nhưng bằng CODE (deterministic) chứ không để LLM tự bịa số.
 *
 * Công thức:
 *   delta = 0.60 * majorSignal        (gốc rễ: chính tinh + độ sáng)
 *         + 0.40 * (support + risk)   (biến số: cát tinh/Tứ Hóa vs sát tinh/Kỵ)
 *   total = 50 + 45 * delta * damping (Tuần/Triệt bóp biên độ về 50)
 *
 * Điểm này được đẩy vào prompt để LLM có "xương sống số học" và vào UI để vẽ
 * thanh điểm. Nhờ vậy UI và bản luận giải không bao giờ lệch nhau.
 * ---------------------------------------------------------------------------
 */

import type {
  NormalizedChartJSON,
  PalaceInfo,
  PalaceScore,
  StarInfo,
} from '@/types/tuvi';
import { BRIGHTNESS_WEIGHT, classifyStar } from './constants';

/** Tín hiệu từ 1 chính tinh: -1 (Hãm) .. +1 (Miếu). */
function majorSignal(star: StarInfo): number {
  const w = BRIGHTNESS_WEIGHT[star.brightness] ?? 0.5;
  return (w - 0.5) * 2;
}

const MUTAGEN_BONUS: Record<string, number> = {
  Lộc: 0.16,
  Quyền: 0.11,
  Khoa: 0.09,
  Kỵ: -0.26,
};

function supportOf(palace: PalaceInfo): { support: number; risk: number; notes: string[] } {
  let support = 0;
  let risk = 0;
  const notes: string[] = [];

  const all = [...palace.auspicious, ...palace.malefic, ...palace.neutral];

  for (const s of all) {
    const cls = classifyStar(s.key);

    // Cát tinh yếu (Hãm) không thể cho trợ lực bằng cát tinh Miếu — nhân theo độ sáng.
    // Văn Khúc (Hãm) ở Thiên Di không đáng +0.11 như Văn Khúc (Miếu).
    const brightnessFactor = s.brightness === 'Vô' ? 1 : (BRIGHTNESS_WEIGHT[s.brightness] ?? 0.5);

    if (cls === 'cat') {
      support += 0.11 * brightnessFactor;
      notes.push(`+${s.name} (cát tinh${s.brightness !== 'Vô' ? ` ${s.brightness}` : ''}) tăng trợ lực`);
    } else if (cls === 'hung') {
      // Sát tinh phụ trợ (Thiên Hình, Tang Môn...) nhẹ hơn Lục sát
      const isMajorMalefic = ['kình dương', 'đà la', 'hỏa tinh', 'linh tinh', 'địa không', 'địa kiếp'].includes(
        s.key,
      );
      risk -= isMajorMalefic ? 0.18 : 0.05;
      if (isMajorMalefic) notes.push(`−${s.name} (sát tinh) tạo điểm nghẽn`);
    } else if (cls === 'loc') {
      support += 0.12;
      notes.push(`+${s.name} (Lộc Tồn) tăng nguồn lực tài chính`);
    } else if (cls === 'ma') {
      support += 0.04;
    } else if (cls === 'trung') {
      support += 0.025;
    }

    if (s.mutagen) {
      const b = MUTAGEN_BONUS[s.mutagen];
      if (b > 0) {
        support += b;
        notes.push(`+Hóa ${s.mutagen} tại ${s.name}: ${MUTAGEN_TEXT[s.mutagen]}`);
      } else {
        risk += b;
        notes.push(`−Hóa ${s.mutagen} tại ${s.name}: ${MUTAGEN_TEXT[s.mutagen]}`);
      }
    }
  }

  return {
    support: Math.min(0.55, support),
    risk: Math.max(-0.65, risk),
    notes,
  };
}

const MUTAGEN_TEXT: Record<string, string> = {
  Lộc: 'nguồn tiền/duyên may mở ra',
  Quyền: 'quyền chủ động, khả năng điều hành',
  Khoa: 'danh tiếng, học vấn, được nể trọng',
  Kỵ: 'nút thắt, thị phi, hao tâm',
};

/**
 * Chấm điểm 1 cung.
 * @param palace cung cần chấm
 * @param opposite cung xung chiếu (dùng khi VCD)
 */
export function scorePalace(palace: PalaceInfo, opposite?: PalaceInfo): PalaceScore {
  const notes: string[] = [];

  /* ---------- 1. Tín hiệu gốc rễ: chính tinh ---------- */
  let major = 0;
  if (palace.majorStars.length > 0) {
    major =
      palace.majorStars.reduce((acc, s) => acc + majorSignal(s), 0) / palace.majorStars.length;
    for (const s of palace.majorStars) {
      notes.push(
        `${s.name} ${s.brightness === 'Vô' ? '' : `(${s.brightness})`} → tín hiệu ${
          majorSignal(s) > 0 ? 'thuận' : majorSignal(s) < 0 ? 'nghịch' : 'trung tính'
        }`,
      );
    }
  } else {
    // Vô chính diệu: vay 60% tín hiệu cung xung chiếu (theo cổ pháp "mượn sao đối cung")
    const oppSignal =
      opposite && opposite.majorStars.length > 0
        ? opposite.majorStars.reduce((acc, s) => acc + majorSignal(s), 0) /
          opposite.majorStars.length
        : 0;
    major = oppSignal * 0.6 - 0.08; // trừ nhẹ vì thiếu chủ lực tại chỗ
    notes.push(
      `Vô chính diệu — mượn 60% tín hiệu đối cung (${opposite?.name ?? '?'}): ${oppSignal.toFixed(2)}`,
    );
  }

  /* ---------- 2. Biến số: cát/hung + Tứ Hóa ---------- */
  const { support, risk, notes: srNotes } = supportOf(palace);
  notes.push(...srNotes);

  /* ---------- 3. Bộ lọc Tuần/Triệt ---------- */
  let damping = 1;
  if (palace.hasTuan && palace.hasTriet) damping = 0.4;
  else if (palace.hasTuan || palace.hasTriet) damping = 0.55;

  const filter = palace.hasTuan && palace.hasTriet ? 'Tuần + Triệt' : palace.hasTuan ? 'Tuần' : palace.hasTriet ? 'Triệt' : '';

  if (filter) {
    if (palace.isEmpty) {
      // VCD gặp Tuần/Triệt: hung biến thành "được che", không còn phá
      damping = 0.9;
      notes.push(`${filter} tại cung VCD: tác dụng che chắn, giúp ổn định thay vì phá`);
    } else if (major > 0) {
      notes.push(`${filter}: cát tinh bị chặn — phát chậm, muộn nhưng bền`);
    } else {
      notes.push(`${filter}: giảm bớt hung tính — đỡ xấu hơn danh nghĩa`);
    }
  }

  /* ---------- 4. Tổng hợp ---------- */
  const delta = 0.6 * major + 0.4 * (support + risk);
  let total = 50 + 45 * delta * damping;
  total = Math.max(5, Math.min(98, Math.round(total)));

  const grade: PalaceScore['grade'] = total >= 75 ? 'A' : total >= 58 ? 'B' : total >= 42 ? 'C' : 'D';

  return {
    total,
    grade,
    majorScore: Math.round(major * 100) / 100,
    supportScore: Math.round(support * 100) / 100,
    riskScore: Math.round(risk * 100) / 100,
    damping,
    notes,
  };
}

/**
 * Chấm điểm toàn bộ 12 cung. Phải chạy SAU khi đã dựng đủ 12 PalaceInfo
 * (vì VCD cần đối cung) nhưng TRƯỚC khi trả NormalizedChartJSON.
 */
export function scoreAllPalaces(palaces: PalaceInfo[]): PalaceInfo[] {
  const byBranch = new Map(palaces.map((p) => [p.branch, p]));
  return palaces.map((p) => {
    const opposite = byBranch.get(p.oppositeBranch);
    return { ...p, score: scorePalace(p, opposite) };
  });
}

/** Điểm trung bình toàn lá số — dùng để xếp hạng tổng thể ở UI. */
export function overallScore(chart: NormalizedChartJSON): number {
  const core = ['menh', 'tai_bach', 'quan_loc', 'thien_di'];
  const corePalaces = chart.palaces.filter((p) => core.includes(p.key));
  if (!corePalaces.length) return 50;
  return Math.round(corePalaces.reduce((a, p) => a + p.score.total, 0) / corePalaces.length);
}
