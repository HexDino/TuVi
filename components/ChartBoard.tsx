'use client';

import type { EarthlyBranch, NormalizedChartJSON, PalaceInfo, StarInfo } from '@/types/tuvi';

/**
 * Bàn 12 cung theo cách trình bày cổ điển:
 *
 *   Tỵ    Ngọ   Mùi   Thân
 *   Thìn  [trung tâm]  Dậu
 *   Mão   [trung tâm]  Tuất
 *   Dần   Sửu   Tý    Hợi
 *
 * NGUYÊN TẮC BỐ CỤC: vị trí ô do ĐỊA CHI quyết định, không do thứ tự mảng.
 * Trước đây ô trung tâm dùng `grid-row: 2/4` + media query đổi sang 2 cột, trong khi
 * các ô vẫn giữ gridColumn 1..4 inline → ở khổ hẹp bàn vỡ và ô trung tâm rơi xuống
 * cuối. Nay bàn giữ nguyên 4×4 và cuộn ngang trên màn hẹp, không reflow.
 */
const BOARD_POS: Record<EarthlyBranch, { col: number; row: number }> = {
  Tỵ: { col: 1, row: 1 },
  Ngọ: { col: 2, row: 1 },
  Mùi: { col: 3, row: 1 },
  Thân: { col: 4, row: 1 },
  Thìn: { col: 1, row: 2 },
  Dậu: { col: 4, row: 2 },
  Mão: { col: 1, row: 3 },
  Tuất: { col: 4, row: 3 },
  Dần: { col: 1, row: 4 },
  Sửu: { col: 2, row: 4 },
  Tý: { col: 3, row: 4 },
  Hợi: { col: 4, row: 4 },
};

/** Độ sáng viết tắt như sách cổ: M V Đ B H. */
const BRIGHT_ABBR: Record<string, string> = {
  Miếu: 'M',
  Vượng: 'V',
  Đắc: 'Đ',
  Lợi: 'L',
  Bình: 'B',
  Bất: 'b',
  Hãm: 'H',
};

const HOA: Record<string, string> = { Lộc: 'Lộc', Quyền: 'Quyền', Khoa: 'Khoa', Kỵ: 'Kỵ' };

function StarRow({
  star,
  tone,
  onSelect,
}: {
  star: StarInfo;
  tone: 'main' | 'cat' | 'hung' | 'neutral';
  onSelect?: (key: string) => void;
}) {
  const abbr = BRIGHT_ABBR[star.brightness];
  return (
    <button
      type="button"
      className={`tv-star tv-${tone}`}
      onClick={() => onSelect?.(star.key)}
      title={`Tra cứu ${star.name}`}
    >
      {star.name}
      {abbr ? ` (${abbr})` : ''}
      {star.mutagen ? <em className="tv-hoa">Hóa {HOA[star.mutagen]}</em> : null}
    </button>
  );
}

function Cell({ palace, onSelectStar }: { palace: PalaceInfo; onSelectStar?: (k: string) => void }) {
  const pos = BOARD_POS[palace.branch];
  const grade = palace.score.grade;

  return (
    <div
      className="tv-cell"
      style={{ gridColumn: pos.col, gridRow: pos.row }}
      data-body={palace.isBodyPalace}
    >
      <div className="tv-head">
        <span className="tv-canchi">
          {palace.stem.charAt(0)}.{palace.branch}
        </span>
        <span className="tv-name">
          {palace.name}
          {palace.isBodyPalace && <i className="tv-than">Thân</i>}
        </span>
        <span className="tv-score" data-grade={grade}>
          {palace.score.total}
        </span>
      </div>

      <div className="tv-body">
        {palace.isEmpty ? (
          <div className="tv-vcd">Vô chính diệu</div>
        ) : (
          <div className="tv-major">
            {palace.majorStars.map((s) => (
              <StarRow key={s.key} star={s} tone="main" onSelect={onSelectStar} />
            ))}
          </div>
        )}

        <div className="tv-cols">
          <div className="tv-col">
            {palace.auspicious.map((s) => (
              <StarRow key={s.key} star={s} tone="cat" onSelect={onSelectStar} />
            ))}
            {/* Tạp diệu: lá số giấy liệt kê đủ, bỏ đi thì ô trống trơn và mất dữ liệu */}
            {palace.neutral.map((s) => (
              <StarRow key={s.key} star={s} tone="neutral" onSelect={onSelectStar} />
            ))}
            {palace.hasTuan && <span className="tv-flag">Tuần</span>}
            {palace.hasTriet && <span className="tv-flag">Triệt</span>}
          </div>
          <div className="tv-col tv-col-right">
            {palace.malefic.map((s) => (
              <StarRow key={s.key} star={s} tone="hung" onSelect={onSelectStar} />
            ))}
          </div>
        </div>
      </div>

      <div className="tv-foot">
        <span className="tv-chi">{palace.branch}</span>
        <span className="tv-changsheng">{palace.changsheng12}</span>
        <span className="tv-daihan">T.{palace.decadal.range[0]}</span>
      </div>
    </div>
  );
}

/** Con dấu đỏ trang trí — thuần CSS, không ảnh. */
function Seal() {
  return (
    <div className="tv-seal" aria-hidden="true">
      <span>紫微</span>
    </div>
  );
}

export function ChartBoard({
  chart,
  onSelectStar,
}: {
  chart: NormalizedChartJSON;
  onSelectStar?: (key: string) => void;
}) {
  const { meta, thienBan } = chart;

  /**
   * Thứ tự cặp đôi theo hàng: lưới 2 cột điền từng hàng, nên cặp [trái, phải]
   * phải cùng chủ đề — tránh cảnh "Âm lịch" nằm cạnh "Giờ sinh" rồi giá trị dài
   * đè sang ô bên.
   */
  const rows: Array<[string, string]> = [
    ['Họ tên', meta.name || '—'],
    ['Dương lịch', meta.solarDate],
    ['Âm lịch', `${meta.lunar.day}/${meta.lunar.month}${meta.lunar.isLeapMonth ? ' nhuận' : ''}/${meta.lunar.year}`],
    ['Giờ sinh', `${meta.timeName.replace(/^Giờ\s+/i, '')} · ${meta.timeRange}`],
    ['Năm xem', String(meta.viewingYear)],
    ['Âm dương', thienBan.amDuong],
    ['Mệnh', `cư ${thienBan.menhBranch}`],
    ['Cục', thienBan.cuc],
    ['Nạp âm', thienBan.napAm],
    ['Thân cư', thienBan.thanCu],
    ['Mệnh chủ', thienBan.menhChu],
    ['Thân chủ', thienBan.thanChu],
  ];

  return (
    <div className="tv-scroll">
      <div className="tv-board">
        {chart.palaces.map((p) => (
          <Cell key={p.key} palace={p} onSelectStar={onSelectStar} />
        ))}

        <div className="tv-center">
          <div className="tv-center-inner">
            <div className="tv-title">
              LÁ SỐ <span>TỬ VI</span>
            </div>
            <div className="tv-subtitle">
              {meta.gender === 'nam' ? 'Nam mệnh' : 'Nữ mệnh'} · {meta.zodiac} · {meta.westernSign}
            </div>

            <div className="tv-info">
              {rows.map(([k, v]) => (
                <div className="tv-info-row" key={k}>
                  <span>{k}</span>
                  <b>{v}</b>
                </div>
              ))}
            </div>

            <Seal />
          </div>
        </div>
      </div>

      <div className="tv-legend">
        <span>
          <b>M</b> Miếu · <b>V</b> Vượng · <b>Đ</b> Đắc · <b>B</b> Bình · <b>H</b> Hãm
        </span>
        <span className="tv-elem">
          <i className="e-kim" />
          Kim
          <i className="e-moc" />
          Mộc
          <i className="e-thuy" />
          Thủy
          <i className="e-hoa" />
          Hỏa
          <i className="e-tho" />
          Thổ
        </span>
        <span className="tv-legend-note">Điểm góc phải do engine chấm · T.x = tuổi bắt đầu đại hạn</span>
      </div>
    </div>
  );
}
