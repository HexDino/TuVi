'use client';

import type { EarthlyBranch, Mutagen, NormalizedChartJSON, PalaceInfo, StarInfo } from '@/types/tuvi';

/**
 * Bàn 12 cung theo cách trình bày cổ điển:
 *
 *   Tỵ    Ngọ   Mùi   Thân
 *   Thìn  [trung tâm]  Dậu
 *   Mão   [trung tâm]  Tuất
 *   Dần   Sửu   Tý    Hợi
 *
 * NGUYÊN TẮC BỐ CỤC: vị trí ô do ĐỊA CHI quyết định, không do thứ tự mảng.
 * Bàn luôn giữ 4×4 và cuộn ngang trên màn hẹp — không reflow làm ô trung tâm
 * rơi xuống cuối.
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

const BRANCH_INDEX: Record<EarthlyBranch, number> = {
  Tý: 0,
  Sửu: 1,
  Dần: 2,
  Mão: 3,
  Thìn: 4,
  Tỵ: 5,
  Ngọ: 6,
  Mùi: 7,
  Thân: 8,
  Dậu: 9,
  Tuất: 10,
  Hợi: 11,
};

/** Độ sáng viết tắt như sách cổ: M V Đ L B b H. */
const BRIGHT_ABBR: Record<string, string> = {
  Miếu: 'M',
  Vượng: 'V',
  Đắc: 'Đ',
  Lợi: 'L',
  Bình: 'B',
  Bất: 'b',
  Hãm: 'H',
};

const HOA_ORDER: Mutagen[] = ['Lộc', 'Quyền', 'Khoa', 'Kỵ'];
const PILLAR_LABELS = ['Năm', 'Tháng', 'Ngày', 'Giờ'] as const;

function starTitle(star: StarInfo): string {
  const parts = [star.name];
  if (star.element) parts.push(`hành ${star.element}`);
  if (star.brightness !== 'Vô') parts.push(star.brightness);
  if (star.mutagen) parts.push(`Hóa ${star.mutagen}`);
  return parts.join(' · ');
}

function StarRow({
  star,
  tone,
  onSelect,
  main = false,
}: {
  star: StarInfo;
  tone: 'main' | 'cat' | 'hung' | 'neutral';
  onSelect?: (key: string) => void;
  main?: boolean;
}) {
  const abbr = BRIGHT_ABBR[star.brightness];
  return (
    <button
      type="button"
      className={`tv-star tv-${tone}${main ? ' tv-main-star' : ''}`}
      data-element={main ? (star.element ?? '') : undefined}
      onClick={() => onSelect?.(star.key)}
      title={`Tra cứu ${starTitle(star)}`}
    >
      {main && star.element ? (
        <span className="tv-elem-dot" data-element={star.element} aria-hidden="true" />
      ) : null}
      {main ? null : <span className={`tv-tone-dot tv-tone-${tone}`} aria-hidden="true" />}
      <span className="tv-star-name">{star.name}</span>
      {abbr ? (
        <span className="tv-bright" data-brightness={star.brightness}>
          ({abbr})
        </span>
      ) : null}
      {star.mutagen ? (
        <span className="tv-hoa-chip" data-hoa={star.mutagen}>
          Hóa {star.mutagen}
        </span>
      ) : null}
    </button>
  );
}

/**
 * Những năm có chi trùng với cung — cách lá số giấy ghi dãy năm lưu niên.
 *
 * Bắt đầu từ tuổi 10 (năm sinh + 9) và lấy 8 mốc cách nhau 12 năm, đúng nhịp
 * một vòng hoa giáp. Năm hiện tại được tô đậm ở ô tương ứng.
 */
function yearsForBranch(birthYear: number, branch: EarthlyBranch): number[] {
  // Năm 2020 là Canh Tý → chi Tý ứng với năm chia 12 dư 4.
  const target = (BRANCH_INDEX[branch] + 4) % 12;
  let year = birthYear + 9;
  while (year % 12 !== target) year += 1;
  return Array.from({ length: 8 }, (_, i) => year + i * 12);
}

function Cell({
  palace,
  opposite,
  years,
  viewingYear,
  decadalNo,
  isCurrentDecadal,
  isAnnual,
  annualStars,
  onSelectStar,
}: {
  palace: PalaceInfo;
  opposite?: PalaceInfo;
  years: number[];
  viewingYear: number;
  decadalNo?: number;
  isCurrentDecadal: boolean;
  isAnnual: boolean;
  annualStars: StarInfo[];
  onSelectStar?: (key: string) => void;
}) {
  const pos = BOARD_POS[palace.branch];
  const grade = palace.score.grade;

  return (
    <div
      className="tv-cell"
      style={{ gridColumn: pos.col, gridRow: pos.row }}
      data-body={palace.isBodyPalace}
      data-menh={palace.key === 'menh'}
      data-decadal={isCurrentDecadal}
      data-annual={isAnnual}
    >
      <div className="tv-head">
        <span className="tv-canchi">
          {palace.stem.charAt(0)}.{palace.branch}
        </span>
        <span className="tv-name">{palace.name}</span>
        {palace.isBodyPalace && <i className="tv-than">Thân</i>}
        <span className="tv-score" data-grade={grade} title={`Điểm engine ${palace.score.total}/100`}>
          {palace.score.total}
        </span>
      </div>

      {(isCurrentDecadal || isAnnual) && (
        <div className="tv-tags">
          {isCurrentDecadal && <span className="tv-tag tv-tag-dh">ĐH hiện tại</span>}
          {isAnnual && <span className="tv-tag tv-tag-ln">Lưu niên {viewingYear}</span>}
        </div>
      )}

      <div className="tv-body">
        <div className="tv-major">
          {palace.isEmpty ? (
            <div className="tv-vcd">
              <span>Vô chính diệu</span>
              {opposite && opposite.majorStars.length > 0 && (
                <em className="tv-borrow">
                  Mượn {opposite.name}: {opposite.majorStars.map((s) => s.name).join(' · ')}
                </em>
              )}
            </div>
          ) : (
            palace.majorStars.map((s) => (
              <StarRow key={s.key} star={s} tone="main" main onSelect={onSelectStar} />
            ))
          )}
        </div>

        <div className={`tv-cols${palace.malefic.length === 0 ? ' tv-cols-single' : ''}`}>
          <div className="tv-col">
            {palace.auspicious.map((s) => (
              <StarRow key={s.key} star={s} tone="cat" onSelect={onSelectStar} />
            ))}
            {palace.neutral.map((s) => (
              <StarRow key={s.key} star={s} tone="neutral" onSelect={onSelectStar} />
            ))}
          </div>
          <div className="tv-col tv-col-right">
            {palace.malefic.map((s) => (
              <StarRow key={s.key} star={s} tone="hung" onSelect={onSelectStar} />
            ))}
          </div>
        </div>

        {(palace.hasTuan || palace.hasTriet) && (
          <div className="tv-flags">
            {palace.hasTuan && (
              <span className="tv-flag" data-flag="tuan">
                Tuần
              </span>
            )}
            {palace.hasTriet && (
              <span className="tv-flag" data-flag="triet">
                Triệt
              </span>
            )}
          </div>
        )}

        {annualStars.length > 0 && (
          <div className="tv-annual-stars">
            <span className="tv-annual-label">Lưu niên</span>
            {annualStars.map((s) => (
              <span key={s.key} className="tv-annual-star" title={starTitle(s)}>
                {s.name}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="tv-foot">
        <div className="tv-foot-line">
          <span className="tv-changsheng">{palace.changsheng12}</span>
          <span className="tv-daihan">
            {decadalNo ? `ĐH ${decadalNo} · ` : ''}
            {palace.decadal.range[0]}–{palace.decadal.range[1]}
          </span>
        </div>
        <div className="tv-years" title="Các năm có chi trùng với cung này (lưu niên)">
          {years.map((y) => (
            <span key={y} className="tv-year" data-current={y === viewingYear}>
              {y}
            </span>
          ))}
        </div>
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
  const { meta, thienBan, annual } = chart;
  const birthYear = meta.lunar.year;

  const byBranch = new Map(chart.palaces.map((p) => [p.branch, p]));
  const annualStarsByPalace = new Map(
    (annual?.yearlyStarsByPalace ?? []).map((entry) => [entry.palaceKey, entry.stars]),
  );

  const decadalList = [...chart.daiVan].sort((a, b) => a.range[0] - b.range[0]);
  const decadalOrder = new Map(decadalList.map((d, i) => [d.palaceKey, i + 1]));

  const annualPalace = annual ? byBranch.get(annual.yearlyPalaceBranch) : undefined;
  const activeDecadal = annual?.activeDecadal ?? null;

  const pillars = meta.chineseDate
    .split(/\s*[-–]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);

  const lunarText = `${meta.lunar.day}/${meta.lunar.month}${
    meta.lunar.isLeapMonth ? ' nhuận' : ''
  } · ${meta.lunar.year}`;

  const timeName = meta.timeName
    .replace(/^Giờ\s+/i, '')
    .replace(/^./, (c) => c.toUpperCase());

  const yearHoa =
    annual?.mutagen?.map((name, i) => ({ name, hoa: HOA_ORDER[i] })).filter((x) => x.hoa) ?? [];

  const summary: Array<[string, string]> = [
    ['Âm dương', thienBan.amDuong],
    ['Mệnh', `cung ${thienBan.menhBranch}`],
    ['Cục', thienBan.cuc],
    ['Nạp âm', thienBan.napAm],
    ['Thân cư', thienBan.thanCu],
    ['Mệnh chủ', thienBan.menhChu],
    ['Thân chủ', thienBan.thanChu],
    ['Năm sinh', meta.yearCanChi],
  ];

  return (
    <div className="tv-scroll">
      <div className="tv-board">
        {chart.palaces.map((p) => {
          const opposite = byBranch.get(p.oppositeBranch);
          return (
            <Cell
              key={p.key}
              palace={p}
              opposite={opposite}
              years={yearsForBranch(birthYear, p.branch)}
              viewingYear={meta.viewingYear}
              decadalNo={decadalOrder.get(p.key)}
              isCurrentDecadal={activeDecadal?.palaceKey === p.key}
              isAnnual={annualPalace?.key === p.key}
              annualStars={annualStarsByPalace.get(p.key) ?? []}
              onSelectStar={onSelectStar}
            />
          );
        })}

        <div className="tv-center">
          <div className="tv-center-inner">
            <div className="tv-center-head">
              <div>
                <div className="tv-title">
                  LÁ SỐ <span>TỬ VI</span>
                </div>
                <div className="tv-subtitle">
                  {meta.name ? `${meta.name} · ` : ''}
                  {thienBan.amDuong}
                  {annual ? ` · ${annual.age} tuổi` : ''}
                </div>
              </div>
              <Seal />
            </div>

            <div className="tv-facts">
              <div>
                <span>Dương lịch</span>
                <b>{meta.solarDate}</b>
              </div>
              <div>
                <span>Âm lịch</span>
                <b>{lunarText}</b>
              </div>
              <div>
                <span>Giờ sinh</span>
                <b>
                  {timeName} · {meta.timeRange}
                </b>
              </div>
              <div>
                <span>Năm xem</span>
                <b>{meta.viewingYear}</b>
              </div>
            </div>

            {pillars.length > 0 && (
              <div className="tv-pillars">
                {pillars.map((p, i) => (
                  <div className="tv-pillar" key={`${p}-${i}`}>
                    <b>{p}</b>
                    <span>{PILLAR_LABELS[i] ?? 'Trụ'}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="tv-summary">
              {summary.map(([k, v]) => (
                <div key={k}>
                  <span>{k}</span>
                  <b>{v}</b>
                </div>
              ))}
            </div>

            {annual && (
              <div className="tv-han">
                <div className="tv-han-title">Vận hạn năm {meta.viewingYear}</div>
                <div className="tv-han-row">
                  <span>Lưu niên</span>
                  <b>
                    {annual.chineseYear} · tuổi {annual.age} · cung{' '}
                    {annualPalace?.name ?? '—'} ({annual.yearlyPalaceBranch})
                  </b>
                </div>
                <div className="tv-han-row">
                  <span>Đại hạn</span>
                  <b>
                    {activeDecadal
                      ? `${activeDecadal.range[0]}–${activeDecadal.range[1]} tuổi · ${activeDecadal.palaceName} (${activeDecadal.branch})`
                      : '—'}
                  </b>
                </div>
                <div className="tv-han-row">
                  <span>Tứ hóa</span>
                  <b>
                    {yearHoa.length > 0
                      ? yearHoa.map((x) => `${x.name} ${x.hoa}`).join(' · ')
                      : '—'}
                  </b>
                </div>
              </div>
            )}

            {decadalList.length > 0 && (
              <div className="tv-dv">
                <div className="tv-dv-title">
                  Mười hai đại hạn <span>tuổi · can chi · cung</span>
                </div>
                <div className="tv-dv-grid">
                  {decadalList.map((d) => (
                    <div
                      className="tv-dv-item"
                      key={d.palaceKey}
                      data-active={activeDecadal?.palaceKey === d.palaceKey}
                    >
                      <span className="tv-dv-range">
                        {d.range[0]}–{d.range[1]}
                      </span>
                      <span className="tv-dv-cc">
                        {d.stem} {d.branch}
                      </span>
                      <span className="tv-dv-palace">{d.palaceName}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="tv-legend">
        <span>
          Độ sáng: <b data-tone="good">M</b> Miếu · <b data-tone="good">V</b> Vượng ·{' '}
          <b data-tone="good">Đ</b> Đắc · <b data-tone="mid">L</b> Lợi ·{' '}
          <b data-tone="mid">B</b> Bình · <b data-tone="bad">b</b> Bất ·{' '}
          <b data-tone="bad">H</b> Hãm
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
        <span>
          <i className="tv-dot cat" /> Cát
          <i className="tv-dot hung" /> Sát
          <i className="tv-dot neutral" /> Tạp
        </span>
        <span className="tv-legend-note">
          Bấm một sao để tra cứu · ĐH = đại hạn · số dưới cung = năm lưu niên
        </span>
      </div>
    </div>
  );
}
