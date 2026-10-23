'use client';

import type { CohocMetrics, CohocOverviewExtras, NormalizedChartJSON, PalaceKey } from '@/types/tuvi';

/**
 * Bảng số liệu do cohoc.net tự tính.
 *
 * Đây là thứ engine nội bộ KHÔNG có: Đẩu Minh theo ngũ hành can-chi của cung
 * (khác hoàn toàn với điểm theo sao), cung khí, tỉ lệ sao tốt, và ngũ hành
 * hỉ-kị dùng để cải vận. Trước đây parser xóa sạch bảng nên mất trắng.
 *
 * Không trộn với điểm engine: hai hệ quy chiếu khác nhau, để cạnh nhau cho
 * người đọc thấy chỗ đồng thuận và chỗ lệch.
 */

const EL_CLASS: Record<string, string> = {
  kim: 'el-kim',
  mộc: 'el-moc',
  moc: 'el-moc',
  thủy: 'el-thuy',
  thuy: 'el-thuy',
  hỏa: 'el-hoa',
  hoa: 'el-hoa',
  thổ: 'el-tho',
  tho: 'el-tho',
};

function ElementChip({ raw }: { raw: string }) {
  const label = raw.trim().toLowerCase();
  const cls = EL_CLASS[label] ?? '';
  const pretty = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  return <span className={`el-chip ${cls}`}>{pretty}</span>;
}

/** Điểm Đẩu Minh âm/dương → thanh ngắn để so nhanh. */
function Bar({ value }: { value: number | null }) {
  if (value === null) return <span style={{ color: 'var(--muted)' }}>—</span>;
  const pct = Math.min(100, Math.abs(value) * 33);
  const positive = value >= 0;
  return (
    <span className="dm-bar" title={`${value}`}>
      <i
        style={{
          width: `${Math.max(3, pct)}%`,
          background: positive ? 'var(--jade)' : 'var(--danger)',
        }}
      />
      <b style={{ color: positive ? 'var(--jade)' : 'var(--danger)' }}>{value.toFixed(2)}</b>
    </span>
  );
}

const HOA_LABEL: Record<string, string> = { Lộc: 'Hóa Lộc', Quyền: 'Hóa Quyền', Khoa: 'Hóa Khoa', Kỵ: 'Hóa Kỵ' };

/**
 * "Cửu Thiên Phi Tinh" — ba vị trí Thiên/Địa/Nhân ứng với ba cung.
 *
 * Vì sao đáng hiển thị: đây là cách đọc hoàn toàn khác Đẩu Minh. Nó không chấm
 * điểm mà chỉ ra BA cung quyết định cục diện: tháng sinh (Thiên), ngày sinh
 * (Địa, trung gian), giờ sinh (Nhân, quan trọng nhất). Người đọc có lá số nhưng
 * không biết môn phái này sẽ không tự suy ra được.
 */
function ThatTinh({
  extras,
  chart,
}: {
  extras: CohocOverviewExtras;
  chart?: NormalizedChartJSON;
}) {
  const tt = extras.thatTinh;
  if (!tt) return null;

  const scoreOf = (key: PalaceKey | null) =>
    key ? chart?.palaces.find((p) => p.key === key)?.score.total : undefined;

  const slots: Array<[string, string, typeof tt.thien]> = [
    ['Thiên', 'tháng sinh', tt.thien],
    ['Địa', 'ngày sinh · trung gian', tt.dia],
    ['Nhân', 'giờ sinh · quan trọng nhất', tt.nhan],
  ];

  return (
    <div className="ctt">
      <div className="ctt-head">
        <b>Cửu Thiên Phi Tinh · Thất tinh định điểm</b>
        <span>Khâm Thiên Vô Cực Môn — ba vị trí ứng ba cung</span>
      </div>

      <div className="ctt-grid">
        {slots.map(([pos, sub, ref]) => {
          if (!ref) return null;
          const score = scoreOf(ref.palaceKey);
          return (
            <div className="ctt-cell" key={pos}>
              <span className="ctt-pos">{pos}</span>
              <span className="ctt-sub">{sub}</span>
              <span className="ctt-palace">{ref.palaceName}</span>
              {typeof score === 'number' && <span className="ctt-score">{score} điểm</span>}
            </div>
          );
        })}
      </div>

      {tt.linkage && <div className="ctt-link">Liên kết: {tt.linkage}</div>}
    </div>
  );
}

/** Cung Mệnh Ẩn + Tứ Hóa ẩn. */
function MenhAn({ extras }: { extras: CohocOverviewExtras }) {
  const ma = extras.menhAn;
  if (!ma || (!ma.branch && !ma.tuHoa.length)) return null;

  return (
    <div className="ctt ctt-compact">
      <div className="ctt-head">
        <b>Mệnh Ẩn</b>
        <span>
          {ma.branch ? `tại ${ma.branch}` : ''}
          {ma.tuHoa.length ? ' · Tứ Hóa ẩn' : ''}
        </span>
      </div>
      {ma.tuHoa.length > 0 && (
        <div className="ctt-hoa">
          {ma.tuHoa.map((h) => (
            <span className="ctt-hoa-item" key={h.hoa}>
              <em data-hoa={h.hoa}>{HOA_LABEL[h.hoa] ?? h.hoa}</em>
              <span>
                {h.palaceName} · {h.branch}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function CohocPanel({
  metrics,
  extras,
  chart,
}: {
  metrics: CohocMetrics;
  extras?: CohocOverviewExtras | null;
  chart?: NormalizedChartJSON;
}) {
  const khiOf = (k: string) => metrics.cungKhi.find((x) => x.palaceKey === k);
  const tiLeOf = (k: string) => metrics.tiLeSaoTot.find((x) => x.palaceKey === k);

  return (
    <details className="cohoc-panel" open>
      <summary>
        <span className="cohoc-title">Chấm theo Tử Vi Cổ Học (Đẩu Minh)</span>
        <span className="cohoc-hint">
          hệ quy chiếu khác với engine — theo ngũ hành can-chi của cung, không theo sao
        </span>
      </summary>

      {metrics.nguHanh && (
        <div className="cohoc-nguhanh">
          <div>
            <span className="cohoc-label">Hỉ thần</span>
            {metrics.nguHanh.hiThan.map((e) => (
              <ElementChip key={e} raw={e} />
            ))}
          </div>
          <div>
            <span className="cohoc-label">Kị thần</span>
            {metrics.nguHanh.kiThan.map((e) => (
              <ElementChip key={e} raw={e} />
            ))}
          </div>
          <div>
            <span className="cohoc-label">Nhàn thần</span>
            {metrics.nguHanh.nhanThan.map((e) => (
              <ElementChip key={e} raw={e} />
            ))}
          </div>
          {metrics.nguHanh.dungThan && (
            <div className="dung">
              <span className="cohoc-label">Dụng thần</span>
              <ElementChip raw={metrics.nguHanh.dungThan} />
            </div>
          )}
        </div>
      )}

      <div className="cohoc-table">
        <div className="cohoc-row head">
          <span>Cung</span>
          <span>Đẩu Minh</span>
          <span>Cung khí</span>
          <span>Sao tốt</span>
        </div>
        {metrics.dauMinh.map((d) => {
          const khi = khiOf(d.palaceKey);
          const tiLe = tiLeOf(d.palaceKey);
          return (
            <div className="cohoc-row" key={d.palaceKey}>
              <span className="name">{d.palaceName}</span>
              <Bar value={d.thienBan} />
              <span className="khi" title={khi?.saoHiKi}>
                {khi?.khi ?? '—'}
                {d.note ? ` · ${d.note}` : ''}
              </span>
              <span className="tile">{tiLe?.toaCung ?? '—'}</span>
            </div>
          );
        })}
      </div>

      <div className="cohoc-foot">
        Tổng điểm: thiên bàn {metrics.totals.thienBan?.toFixed(2) ?? '—'} · địa bàn{' '}
        {metrics.totals.diaBan?.toFixed(2) ?? '—'} · nhân bàn {metrics.totals.nhanBan?.toFixed(2) ?? '—'} ·
        thang −3 đến +3.
      </div>

      {extras && (
        <>
          <ThatTinh extras={extras} chart={chart} />
          <MenhAn extras={extras} />
        </>
      )}
    </details>
  );
}
