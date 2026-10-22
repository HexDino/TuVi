/**
 * lib/tuvi/chart-generator.service.ts — MODULE 1: CHART ENGINE
 * ---------------------------------------------------------------------------
 * Trách nhiệm duy nhất: input người dùng → NormalizedChartJSON.
 *
 * Bọc iztro (lang = 'vi-VN'), chuẩn hoá, chấm điểm. Không gọi mạng, không gọi
 * LLM, không đọc file → hàm thuần, test được, chạy được cả server và client
 * bundle (nếu cần).
 *
 * Các quyết định kỹ thuật quan trọng:
 *  1. `timeIndex` của iztro: 0 = 00:00–00:59 (Tý sớm), 1 = Sửu ... 11 = Hợi,
 *     12 = 23:00–23:59 (Tý muộn). Xem `hourToTimeIndex`.
 *  2. iztro xếp `palaces[0]` tại Dần, tăng dần theo địa chi →
 *     branch = BRANCHES[(index + 2) % 12].
 *  3. Tuần/Triệt nằm lẫn trong `adjectiveStars` dưới tên "Tuần Không"/"Triệt Lộ"
 *     → phải bóc ra thành cờ boolean, nếu không scoring sẽ nhiễu.
 *  4. Không bao giờ trả về raw astrolabe. Mọi field lạ bị loại bỏ để prompt
 *     không phình token.
 * ---------------------------------------------------------------------------
 */

import { astro } from 'iztro';
import type { Astrolabe, Star } from 'iztro/lib/data/types';

/** iztro không export type Palace riêng — lấy từ Astrolabe để luôn khớp version. */
type Palace = Astrolabe['palaces'][number];

/**
 * astro.bySolar trả FunctionalAstrolabe (có .horoscope()). Nếu khai báo kiểu
 * `Astrolabe` sẽ mất method → luôn suy ra từ hàm để không lệch version.
 */
type FullAstrolabe = ReturnType<typeof astro.bySolar>;
import type {
  AnnualInfo,
  ChartInput,
  DecadalInfo,
  EarthlyBranch,
  FiveElement,
  Mutagen,
  NormalizedChartJSON,
  PalaceInfo,
  PalaceKey,
  StarInfo,
  ThienBan,
} from '@/types/tuvi';
import {
  BRANCHES,
  BRIGHTNESS_ALIASES,
  NAP_AM_PAIRS,
  PALACE_KEY_MAP,
  STEMS,
  classifyStar,
  elementRelation,
  oppositeBranch,
  starElement,
  toKey,
  trineBranches,
} from './constants';

export { toKey };
import { scoreAllPalaces } from './scoring';

/* ----------------------------- TIỆN ÍCH ----------------------------- */

/** Giờ:phút → timeIndex của iztro (0..12). */
export function hourToTimeIndex(hour: number, minute = 0): number {
  if (hour < 0 || hour > 23) throw new Error(`Giờ không hợp lệ: ${hour}`);
  if (hour === 23) return 12; // Tý muộn (23:00–23:59)
  if (hour === 0) return 0; // Tý sớm (00:00–00:59)
  const idx = Math.floor((hour + 1) / 2);
  // minute không làm đổi chi (chi tính theo giờ tròn) — giữ tham số để log cảnh báo
  void minute;
  return idx;
}

/** timeIndex → tên giờ tiếng Việt. */
export const TIME_NAMES = [
  'Tý',
  'Sửu',
  'Dần',
  'Mão',
  'Thìn',
  'Tỵ',
  'Ngọ',
  'Mùi',
  'Thân',
  'Dậu',
  'Tuất',
  'Hợi',
  'Tý',
];

/** Chuẩn hoá độ sáng về 1 trong 8 giá trị của Brightness. */
function normalizeBrightness(raw?: string): StarInfo['brightness'] {
  if (!raw) return 'Vô';
  const k = raw.trim().toLowerCase();
  return BRIGHTNESS_ALIASES[k] ?? BRIGHTNESS_ALIASES[toKey(raw)] ?? 'Vô';
}

function normalizeMutagen(raw?: string): Mutagen | undefined {
  if (!raw) return undefined;
  const k = toKey(raw);
  if (k === 'loc' || k === 'lộc') return 'Lộc';
  if (k === 'quyen') return 'Quyền';
  if (k === 'khoa') return 'Khoa';
  if (k === 'ky') return 'Kỵ';
  return undefined;
}

function toStarInfo(star: Star): StarInfo {
  const key = toKey(star.name);
  return {
    name: star.name,
    key,
    class: classifyStar(key),
    brightness: normalizeBrightness((star as { brightness?: string }).brightness),
    mutagen: normalizeMutagen((star as { mutagen?: string }).mutagen),
    element: starElement(key),
  };
}

/** Cung index (0 = Dần) → địa chi. */
function branchOfIndex(index: number): EarthlyBranch {
  return BRANCHES[(index + 2) % 12];
}

function palaceKeyOf(name: string): PalaceKey {
  const k = PALACE_KEY_MAP[name.trim().toLowerCase()];
  if (!k) throw new Error(`Không map được tên cung: "${name}"`);
  return k;
}

/** Can chi năm → chỉ số trong vòng 60 hoa giáp. */
function sexagenaryIndex(canChi: string): number {
  const [canRaw, chiRaw] = canChi.trim().split(/\s+/);
  const s = STEMS.indexOf(canRaw);
  const b = BRANCHES.indexOf(chiRaw as EarthlyBranch);
  if (s < 0 || b < 0) return -1;
  for (let i = 0; i < 60; i++) {
    if (i % 10 === s && i % 12 === b) return i;
  }
  return -1;
}

function cucElement(cuc: string): FiveElement {
  const first = cuc.trim().split(/\s+/)[0];
  return (['Kim', 'Mộc', 'Thủy', 'Hỏa', 'Thổ'] as FiveElement[]).includes(first as FiveElement)
    ? (first as FiveElement)
    : 'Thổ';
}

/* ------------------------- SERVICE ------------------------- */

export class ChartGeneratorService {
  /**
   * Sinh lá số đã chuẩn hoá.
   * @throws Error nếu input không hợp lệ hoặc iztro không dựng được lá số.
   */
  generate(input: ChartInput): NormalizedChartJSON {
    const warnings: string[] = [];

    /* 1. Validate */
    if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(input.date)) {
      throw new Error('Ngày sinh phải có dạng YYYY-MM-DD');
    }
    if (!['nam', 'nu'].includes(input.gender)) {
      throw new Error('Giới tính phải là "nam" hoặc "nu"');
    }

    const timeIndex = hourToTimeIndex(input.hour, input.minute ?? 0);
    if (input.hour === 23) {
      warnings.push(
        'Sinh giờ Tý muộn (23:00–23:59): nhiều trường phái an theo ngày hôm sau. Hệ thống dùng Tý muộn cùng ngày dương lịch — nếu thấy lệch 1 ngày, hãy thử lại với 00:30 ngày kế tiếp.',
      );
    }
    const nearBoundary = input.hour % 2 === 1 && (input.minute ?? 0) >= 55;
    if (nearBoundary) {
      warnings.push('Giờ sinh sát ranh giới 2 giờ — sai lệch 5 phút có thể đổi cả lá số. Nên xác nhận lại giờ sinh.');
    }

    /* 2. Dựng lá số bằng iztro */
    const genderArg = input.gender === 'nam' ? '男' : '女';
    const fixLeap = input.fixLeap ?? true;

    const astrolabe: FullAstrolabe =
      input.calendarType === 'lunar'
        ? astro.byLunar(input.date, timeIndex, genderArg, input.isLeapMonth ?? false, fixLeap, 'vi-VN')
        : astro.bySolar(input.date, timeIndex, genderArg, fixLeap, 'vi-VN');

    if (!astrolabe?.palaces?.length) {
      throw new Error('Không dựng được lá số từ dữ liệu đã cho');
    }

    /* 3. Meta */
    const raw = astrolabe.rawDates;
    const chineseDate = astrolabe.chineseDate; // "Canh Ngọ - Bính Tuất - Kỷ Mùi - Canh Ngọ"
    const yearCanChi = chineseDate.split('-')[0].trim();
    const canIdx = STEMS.indexOf(yearCanChi.split(/\s+/)[0]);
    const amDuong = `${canIdx % 2 === 0 ? 'Dương' : 'Âm'} ${input.gender === 'nam' ? 'Nam' : 'Nữ'}`;

    /* 4. 12 cung */
    const built = astrolabe.palaces.map((p, i) => this.buildPalace(p, i));
    const scored = scoreAllPalaces(built as PalaceInfo[]);

    /* 5. Thiên bàn */
    const thienBan = this.buildThienBan(astrolabe, yearCanChi, amDuong, scored);

    /* 6. Đại vận */
    const daiVan = this.buildDecadal(scored);

    /* 7. Lưu niên */
    const viewingYear = input.viewingYear ?? new Date().getFullYear();
    const annual = this.buildAnnual(astrolabe, scored, daiVan, viewingYear, input);

    return {
      schemaVersion: 1,
      meta: {
        name: input.name,
        gender: input.gender,
        calendarType: input.calendarType,
        solarDate: astrolabe.solarDate,
        lunarDateText: astrolabe.lunarDate,
        lunar: {
          day: raw.lunarDate.lunarDay,
          month: raw.lunarDate.lunarMonth,
          year: raw.lunarDate.lunarYear,
          isLeapMonth: Boolean(raw.lunarDate.isLeap),
        },
        chineseDate,
        yearCanChi,
        timeName: astrolabe.time,
        timeRange: astrolabe.timeRange,
        timeIndex,
        zodiac: astrolabe.zodiac,
        westernSign: astrolabe.sign,
        viewingYear,
      },
      thienBan,
      palaces: scored,
      daiVan,
      annual,
      warnings,
    };
  }

  /* ----------------------------- BUILDERS ----------------------------- */

  private buildPalace(p: Palace, index: number): Omit<PalaceInfo, 'score'> {
    const branch = branchOfIndex(index);

    const majorStars: StarInfo[] = (p.majorStars ?? []).map(toStarInfo);
    const minors: StarInfo[] = (p.minorStars ?? []).map(toStarInfo);
    const adjectives: StarInfo[] = (p.adjectiveStars ?? []).map(toStarInfo);

    // Bóc Tuần / Triệt ra khỏi danh sách sao
    const hasTuan = adjectives.some((s) => s.key === 'tuan_khong');
    const hasTriet = adjectives.some((s) => s.key === 'triet_lo');
    const restAdjectives = adjectives.filter((s) => s.key !== 'tuan_khong' && s.key !== 'triet_lo');

    const all: StarInfo[] = [...minors, ...restAdjectives];

    const auspicious: StarInfo[] = [];
    const malefic: StarInfo[] = [];
    const neutral: StarInfo[] = [];

    for (const s of all) {
      const isKy = s.mutagen === 'Kỵ';
      if (isKy || s.class === 'hung') malefic.push(s);
      else if (s.class === 'cat' || s.class === 'loc' || s.mutagen) auspicious.push(s);
      else neutral.push(s);
    }

    return {
      index,
      name: p.name,
      key: palaceKeyOf(p.name),
      branch,
      stem: p.heavenlyStem,
      isBodyPalace: Boolean(p.isBodyPalace),
      isEmpty: majorStars.length === 0,
      majorStars,
      auspicious,
      malefic,
      neutral,
      changsheng12: p.changsheng12 ?? '',
      hasTuan,
      hasTriet,
      decadal: {
        range: [p.decadal?.range?.[0] ?? 0, p.decadal?.range?.[1] ?? 0],
        stem: p.decadal?.heavenlyStem ?? '',
        branch: (p.decadal?.earthlyBranch as EarthlyBranch) ?? branch,
      },
      oppositeBranch: oppositeBranch(branch),
      trineBranches: trineBranches(branch),
    };
  }

  private buildThienBan(
    astrolabe: FullAstrolabe,
    yearCanChi: string,
    amDuong: string,
    palaces: PalaceInfo[],
  ): ThienBan {
    const menh = palaces.find((p) => p.key === 'menh')!;
    const bodyPalace = palaces.find((p) => p.isBodyPalace);

    const idx = sexagenaryIndex(yearCanChi);
    const napAm = idx >= 0 ? NAP_AM_PAIRS[Math.floor(idx / 2)] : { name: 'Không xác định', element: 'Thổ' as FiveElement };
    const cucEl = cucElement(astrolabe.fiveElementsClass);

    return {
      menhBranch: menh.branch,
      thanBranch: (astrolabe.earthlyBranchOfBodyPalace as EarthlyBranch) ?? menh.branch,
      thanCu: bodyPalace?.name ?? 'Mệnh',
      cuc: astrolabe.fiveElementsClass,
      cucElement: cucEl,
      menhChu: astrolabe.soul,
      thanChu: astrolabe.body,
      amDuong,
      napAm: napAm.name,
      napAmElement: napAm.element,
      cucVsMenh: elementRelation(cucEl, napAm.element),
      menhVsCuc: elementRelation(napAm.element, cucEl),
    };
  }

  private buildDecadal(palaces: PalaceInfo[]): DecadalInfo[] {
    return palaces
      .map((p) => ({
        range: p.decadal.range,
        palaceName: p.name,
        palaceKey: p.key,
        branch: p.branch,
        stem: p.decadal.stem,
        score: p.score.total,
        grade: p.score.grade,
      }))
      .sort((a, b) => a.range[0] - b.range[0]);
  }

  private buildAnnual(
    astrolabe: FullAstrolabe,
    palaces: PalaceInfo[],
    daiVan: DecadalInfo[],
    viewingYear: number,
    input: ChartInput,
  ): AnnualInfo | null {
    try {
      // Dùng đúng ngày/tháng sinh trong năm xem hạn để horoscope tính cả lưu nguyệt
      const [, mm, dd] = astrolabe.solarDate.split('-');
      const horoscope = astrolabe.horoscope(`${viewingYear}-${mm}-${dd}`);

      const age = (horoscope.age as unknown as { nominalAge?: number })?.nominalAge ?? 0;

      const yearlyBranch = branchOfIndex(horoscope.yearly.index);

      // Sao lưu niên gom theo cung gốc
      const yearlyStarsByPalace = (horoscope.yearly.stars ?? []).map((stars: Star[], i: number) => {
        const branch = branchOfIndex(i);
        const natal = palaces.find((p) => p.branch === branch);
        return {
          palaceKey: (natal?.key ?? 'menh') as PalaceKey,
          stars: (stars ?? []).map(toStarInfo),
        };
      });

      return {
        year: viewingYear,
        chineseYear: `${horoscope.yearly.heavenlyStem} ${horoscope.yearly.earthlyBranch}`,
        age,
        yearlyPalaceBranch: yearlyBranch,
        mutagen: (horoscope.yearly.mutagen as [string, string, string, string]) ?? null,
        activeDecadal: daiVan.find((d) => age >= d.range[0] && age <= d.range[1]) ?? null,
        yearlyStarsByPalace: yearlyStarsByPalace.filter((x) => x.stars.length > 0),
      };
    } catch {
      void input;
      return null;
    }
  }
}

/** Singleton tiện dụng. */
export const chartGenerator = new ChartGeneratorService();
