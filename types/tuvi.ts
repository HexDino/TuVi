/**
 * types/tuvi.ts
 * ---------------------------------------------------------------------------
 * Hợp đồng dữ liệu (data contract) của toàn bộ hệ thống Tử Vi.
 *
 * Nguyên tắc thiết kế:
 *  - `NormalizedChartJSON` là format DUY NHẤT mà tầng UI và tầng LLM được đọc.
 *    Không module nào phía sau được phép chạm vào raw output của iztro.
 *  - Mọi trường đều optional-tolerant ở tầng đọc, nhưng bắt buộc ở tầng ghi,
 *    để khi iztro đổi version thì lỗi nổ ngay tại normalizer, không rò rỉ ra UI.
 *  - Tên sao giữ nguyên tiếng Việt (đã localize qua iztro lang='vi-VN'),
 *    nhưng LUÔN kèm `key` ASCII không dấu để làm khoá tra cứu ổn định
 *    (dùng cho scoring, cache, prompt compression).
 * ---------------------------------------------------------------------------
 */

/** Giới tính đầu vào của người dùng. */
export type Gender = 'nam' | 'nu';

/** Loại lịch của ngày sinh nhập vào. */
export type CalendarType = 'solar' | 'lunar';

/** Độ sáng của sao theo thang 7 bậc cổ điển + trạng thái "Vô" (không xét). */
export type Brightness = 'Miếu' | 'Vượng' | 'Đắc' | 'Lợi' | 'Bình' | 'Bất' | 'Hãm' | 'Vô';

/** Phân loại sao theo vai trò luận đoán (không theo iztro type). */
export type StarClass =
  | 'chinh' // 14 chính tinh
  | 'cat' // Lục cát: Khôi Việt Tả Hữu Xương Khúc
  | 'hung' // Lục sát: Kình Đà Hỏa Linh Không Kiếp
  | 'loc' // Lộc Tồn
  | 'ma' // Thiên Mã
  | 'trung' // phụ tinh trung tính (Thai, Đẩu Quân, Thiên Trù, ...)
  | 'ta'; // tạp diệu / sao lưu (vận, lưu niên)

/** Tứ Hóa. */
export type Mutagen = 'Lộc' | 'Quyền' | 'Khoa' | 'Kỵ';

/** 12 cung, khoá ASCII ổn định. */
export type PalaceKey =
  | 'menh'
  | 'huynh_de'
  | 'phu_the'
  | 'tu_nu'
  | 'tai_bach'
  | 'tat_ach'
  | 'thien_di'
  | 'no_boc'
  | 'quan_loc'
  | 'dien_trach'
  | 'phuc_duc'
  | 'phu_mau';

/** Địa chi 12 cung. */
export type EarthlyBranch =
  | 'Tý'
  | 'Sửu'
  | 'Dần'
  | 'Mão'
  | 'Thìn'
  | 'Tỵ'
  | 'Ngọ'
  | 'Mùi'
  | 'Thân'
  | 'Dậu'
  | 'Tuất'
  | 'Hợi';

/** Ngũ hành. */
export type FiveElement = 'Kim' | 'Mộc' | 'Thủy' | 'Hỏa' | 'Thổ';

/** Quan hệ sinh khắc giữa hai ngũ hành. */
export type ElementRelation =
  | 'tuong_sinh' // A sinh B
  | 'duoc_sinh' // B sinh A
  | 'tuong_khac' // A khắc B
  | 'bi_khac' // B khắc A
  | 'tuong_hoa'; // cùng hành

/** Một sao đã chuẩn hoá. */
export interface StarInfo {
  /** Tên hiển thị tiếng Việt, ví dụ "Tử Vi". */
  name: string;
  /** Khoá ASCII: "tu_vi". Dùng cho scoring / cache / prompt. */
  key: string;
  /** Phân loại luận đoán. */
  class: StarClass;
  /** Độ sáng; 'Vô' nếu sao không có khái niệm miếu hãm. */
  brightness: Brightness;
  /** Tứ Hóa nếu sao này hoá. */
  mutagen?: Mutagen;
  /** Ngũ hành của sao (suy ra từ bảng cổ điển, dùng cho luận Tật Ách). */
  element?: FiveElement;
}

/** Điểm số do scoring engine tính (deterministic, không phụ thuộc LLM). */
export interface PalaceScore {
  /** 0..100, đã quy về thang điểm người dùng hiểu được. */
  total: number;
  /** Xếp hạng A (rất thuận) / B (thuận) / C (trung bình) / D (nhiều thử thách). */
  grade: 'A' | 'B' | 'C' | 'D';
  /** Điểm phần gốc rễ: chính tinh + cách cục (trọng số 60%). */
  majorScore: number;
  /** Điểm phần biến số: cát tinh + Tứ Hóa (trọng số 30%). */
  supportScore: number;
  /** Điểm phần rủi ro: sát tinh + Hóa Kỵ (đã trừ). */
  riskScore: number;
  /** Hệ số Tuần/Triệt đã áp (0.3..1). */
  damping: number;
  /** Các ghi chú giải thích vì sao ra điểm này — đẩy thẳng vào prompt để LLM không suy diễn sai. */
  notes: string[];
}

/** Một cung đã chuẩn hoá. */
export interface PalaceInfo {
  /** 0..11 theo thứ tự iztro (đã đảm bảo đủ 12 cung). */
  index: number;
  /** Tên hiển thị: "Mệnh", "Quan Lộc", "Tài Bạch", ... */
  name: string;
  /** Khoá ASCII. */
  key: PalaceKey;
  /** Địa chi của cung. */
  branch: EarthlyBranch;
  /** Thiên can của cung. */
  stem: string;
  /** Cung này có phải cung Thân (Thân cư) không. */
  isBodyPalace: boolean;
  /** Vô chính diệu. */
  isEmpty: boolean;
  /** 14 chính tinh tọa thủ (0, 1 hoặc 2 sao). */
  majorStars: StarInfo[];
  /** Cát tinh + Tứ Hóa tốt. */
  auspicious: StarInfo[];
  /** Sát tinh + Hóa Kỵ. */
  malefic: StarInfo[];
  /** Phụ tinh trung tính / tạp diệu. */
  neutral: StarInfo[];
  /** Vòng Tràng Sinh (Trường Sinh, Mộc Dục, ...). */
  changsheng12: string;
  /** Có Tuần Không. */
  hasTuan: boolean;
  /** Có Triệt Lộ. */
  hasTriet: boolean;
  /** Đại hạn 10 năm gắn với cung này. */
  decadal: {
    range: [number, number];
    stem: string;
    branch: string;
  };
  /** Điểm do scoring engine tính. */
  score: PalaceScore;
  /** Địa chi cung xung chiếu (nhị hợp? không — lục xung). */
  oppositeBranch: EarthlyBranch;
  /** Địa chi 2 cung tam hợp. */
  trineBranches: [EarthlyBranch, EarthlyBranch];
}

/** Thông tin thiên bàn (bản thể lá số). */
export interface ThienBan {
  /** Cung Mệnh an tại chi nào. */
  menhBranch: EarthlyBranch;
  /** Cung Thân an tại chi nào. */
  thanBranch: EarthlyBranch;
  /** Thân cư cung gì: 'Mệnh' | 'Quan Lộc' | 'Tài Bạch' | 'Thiên Di' | 'Phúc Đức' | 'Phu Thê'. */
  thanCu: string;
  /** Tên Cục: "Kim Tứ Cục". */
  cuc: string;
  /** Ngũ hành của Cục. */
  cucElement: FiveElement;
  /** Chủ mệnh (sao). */
  menhChu: string;
  /** Chủ thân (sao). */
  thanChu: string;
  /** "Dương Nam" | "Âm Nam" | "Dương Nữ" | "Âm Nữ". */
  amDuong: string;
  /** Nạp âm bản mệnh, ví dụ "Thạch Lựu Mộc". */
  napAm: string;
  /** Ngũ hành nạp âm. */
  napAmElement: FiveElement;
  /** Quan hệ Cục ↔ Mệnh. */
  cucVsMenh: ElementRelation;
  /** Quan hệ Bản Mệnh (nạp âm) ↔ Cục. */
  menhVsCuc: ElementRelation;
}

/** Đại vận 10 năm. */
export interface DecadalInfo {
  range: [number, number];
  palaceName: string;
  palaceKey: PalaceKey;
  branch: EarthlyBranch;
  stem: string;
  /** Điểm cung đại hạn (lấy từ score cung gốc). */
  score: number;
  grade: PalaceScore['grade'];
}

/** Lưu niên (năm xem hạn). */
export interface AnnualInfo {
  /** Năm dương lịch xem hạn. */
  year: number;
  /** Can chi năm xem hạn. */
  chineseYear: string;
  /** Tuổi âm (mụ) tại năm xem hạn. */
  age: number;
  /** Cung Tiểu hạn / lưu niên nhập cung nào. */
  yearlyPalaceBranch: EarthlyBranch;
  /** 4 sao hoá của năm xem hạn, theo thứ tự Lộc - Quyền - Khoa - Kỵ. */
  mutagen: [string, string, string, string] | null;
  /** Đại vận đang chạy. */
  activeDecadal: DecadalInfo | null;
  /** Các sao lưu niên nhập cung, gom theo cung. */
  yearlyStarsByPalace: Array<{ palaceKey: PalaceKey; stars: StarInfo[] }>;
}

/**
 * OUTPUT CHUẨN CỦA MODULE 1.
 * Đây là thứ duy nhất được đẩy vào prompt LLM và vào UI.
 */
export interface NormalizedChartJSON {
  /** Version schema — tăng khi breaking change để cache cũ tự invalid. */
  schemaVersion: 1;
  meta: {
    name?: string;
    gender: Gender;
    calendarType: CalendarType;
    /** YYYY-MM-DD dương lịch. */
    solarDate: string;
    /** Chuỗi âm lịch đã localize, ví dụ "Âm lịch ngày 4 tháng 9 năm 1990". */
    lunarDateText: string;
    lunar: { day: number; month: number; year: number; isLeapMonth: boolean };
    /** "Canh Ngọ - Bính Tuất - Kỷ Mùi - Canh Ngọ" (năm-tháng-ngày-giờ). */
    chineseDate: string;
    /** Can chi năm sinh, ví dụ "Canh Ngọ". */
    yearCanChi: string;
    timeName: string;
    timeRange: string;
    timeIndex: number;
    zodiac: string;
    westernSign: string;
    /** Năm xem hạn (dương lịch). */
    viewingYear: number;
  };
  thienBan: ThienBan;
  /** Luôn đủ 12 phần tử, sắp theo thứ tự iztro (Mệnh → Huynh Đệ → ...). */
  palaces: PalaceInfo[];
  daiVan: DecadalInfo[];
  annual: AnnualInfo | null;
  /** Cảnh báo dữ liệu (giờ giáp ranh, thiếu dữ liệu...) để UI hiển thị. */
  warnings: string[];
}

/** Input cho Module 1. */
export interface ChartInput {
  name?: string;
  gender: Gender;
  calendarType: CalendarType;
  /** solar: "YYYY-MM-DD". lunar: "YYYY-MM-DD" theo âm lịch. */
  date: string;
  /** 0..23 */
  hour: number;
  /** 0..59 */
  minute?: number;
  /** Chỉ dùng khi calendarType = 'lunar'. */
  isLeapMonth?: boolean;
  /** Năm xem hạn; mặc định = năm hiện tại. */
  viewingYear?: number;
  /** Có điều chỉnh theo tiết khí / nhuận không (mặc định true). */
  fixLeap?: boolean;
}

/* ------------------------------------------------------------------------- */
/* MODULE 2 — Raw classical texts                                            */
/* ------------------------------------------------------------------------- */

/** Một đoạn bình giải thô đã làm sạch. */
export interface RawPassage {
  /** Tiêu đề h4 gốc trên cohoc.net, ví dụ "Cung Mệnh an tại Thìn có Tham lang". */
  heading: string;
  /** Nội dung prose đã strip HTML. */
  text: string;
  /** Nguồn trích (em.thamkhao), ví dụ "Phù Cừ - Tử Vi Cổ Học". */
  source?: string;
  /** Đã bị cắt bớt do vượt ngân sách token. */
  truncated?: boolean;
}

/**
 * Số liệu định lượng do cohoc.net tự tính cho lá số.
 *
 * Trước đây parser XOÁ toàn bộ <table> khi làm sạch HTML — mất trắng phần này.
 * Đây là thứ engine nội bộ không có: Đẩu Minh theo ngũ hành cung, cung khí,
 * tỉ lệ sao tốt, và ngũ hành hỉ kị dùng để cải vận.
 */
export interface CohocMetrics {
  /** Điểm Đẩu Minh từng cung: thiên bàn / địa bàn / nhân bàn. */
  dauMinh: Array<{
    palaceKey: PalaceKey;
    palaceName: string;
    thienBan: number | null;
    diaBan: number | null;
    nhanBan: number | null;
    /** Ghi chú "(VCD)" nếu cung vô chính diệu. */
    note?: string;
  }>;
  /** Tổng điểm toàn lá theo 3 bàn. */
  totals: { thienBan: number | null; diaBan: number | null; nhanBan: number | null };
  /** Cung khí + sao hỉ/kị của từng cung (thiên bàn). */
  cungKhi: Array<{
    palaceKey: PalaceKey;
    palaceName: string;
    khi: string;
    saoHiKi: string;
  }>;
  /** Tỉ lệ sao tốt (không tính chính tinh). */
  tiLeSaoTot: Array<{
    palaceKey: PalaceKey;
    palaceName: string;
    toaCung: string;
    tamPhuong: string;
  }>;
  /** Ngũ hành hỉ kị toàn lá. */
  nguHanh: {
    hiThan: string[];
    kiThan: string[];
    nhanThan: string[];
    dungThan: string;
  } | null;
}

/**
 * Khối "Cửu Thiên Phi Tinh" + "Khảo sát vượng suy" — dữ liệu cohoc trình bày
 * dưới dạng VĂN XUÔI nhưng bản chất là dữ liệu có cấu trúc.
 *
 * Vì sao phải bóc thành field riêng: khối "Thất tinh định điểm" dài 536 ký tự,
 * nằm thứ 5 trong 8 khối tổng quan (3.878 ký tự) nên bị ngân sách 3.000 cắt
 * giữa câu. LLM từng ghi trong editorialNotes: "đoạn Thất tinh định điểm bị cắt
 * dở nên không dùng được". Bóc cấu trúc thì không còn gì để cắt.
 */
export interface CohocOverviewExtras {
  /**
   * Thất tinh định điểm (Khâm Thiên Vô Cực Môn): 3 vị trí Thiên/Địa/Nhân
   * ánh xạ sang 3 cung. Thiên = tháng sinh, Địa = ngày sinh (trung gian),
   * Nhân = giờ sinh (quan trọng nhất).
   */
  thatTinh: {
    thien?: CohocPalaceRef;
    dia?: CohocPalaceRef;
    nhan?: CohocPalaceRef;
    /** Câu liên kết nguyên văn, ví dụ "Sự nghiệp + Phụ mẫu = lấy Tật ách làm trung gian". */
    linkage?: string;
  } | null;
  /** Cung Mệnh Ẩn + Tứ Hóa ẩn (Khâm Thiên Vô Cực Môn). */
  menhAn: {
    branch: string;
    tuHoa: Array<{ hoa: 'Lộc' | 'Quyền' | 'Khoa' | 'Kỵ' } & CohocPalaceRef & { branch: string }>;
  } | null;
  /** Vượng suy theo tinh đẩu: ngũ hành của từng chính tinh + độ số. */
  tinhDau: Array<{ star: string; element: string; doSo: number }>;
  /** Câu "Cung Mệnh, Thân trùng lặp ở Thìn THỔ vượng…" — ngũ hành cung tại Mệnh. */
  vuongSuyCung: string | null;
}

export interface CohocPalaceRef {
  /** Tên cung như cohoc ghi: "Sự nghiệp", "Tật ách", "Phụ mẫu". */
  palaceName: string;
  /** Key chuẩn hoá; null nếu tên không map được. */
  palaceKey: PalaceKey | null;
}

/** Một vận năm (lưu niên) cohoc bình giải. */
export interface CohocAnnualSection {
  /** Tuổi âm tại năm đó, ví dụ "35". */
  age: string;
  /** Nhãn gốc, ví dụ "VẬN NĂM: 35 TUỔI - NĂM GIÁP THÌN". */
  label: string;
  passages: RawPassage[];
}

/** Toàn bộ văn bản thô bóc được từ cohoc.net. */
export interface RawClassicalTexts {
  /** URL nguồn. */
  sourceUrl: string;
  /** Thời điểm fetch (ISO). */
  fetchedAt: string;
  /** Chế độ xem: "Tổng hợp" | "Phổ biến" | ... */
  viewMode: string;
  /** Tiêu đề trang gốc. */
  title: string;
  /** Thông tin nhận dạng lá số theo cohoc (để cross-check với Module 1). */
  identity: {
    genderText?: string;
    yearCanChi?: string;
    lunarDay?: number;
    lunarMonth?: number;
    timeName?: string;
  };
  /** Bình giải tổng quan. */
  overview: RawPassage[];
  /** Bình giải riêng cung Thân (cohoc.net tách thành section "CUNG THÂN"). */
  bodyPalace: RawPassage[];
  /** Bình giải theo từng cung. */
  palaces: Partial<Record<PalaceKey, RawPassage[]>>;
  /** Bình giải đại vận (key = "4-13", "14-23", ...). */
  decadal: Record<string, RawPassage[]>;
  /** Bình giải vận năm (lưu niên). */
  annual: CohocAnnualSection[];
  /** Số liệu định lượng của cohoc. */
  metrics: CohocMetrics | null;
  /** Khối Cửu Thiên Phi Tinh / vượng suy — bóc từ văn xuôi thành cấu trúc. */
  extras: CohocOverviewExtras | null;
  /** Thống kê phục vụ debug/observability. */
  stats: {
    rawChars: number;
    cleanedChars: number;
    passageCount: number;
    dedupedCount: number;
    truncatedCount: number;
  };
  /** Lỗi không nghiêm trọng (parse thiếu section...). */
  warnings: string[];
  /** Kết quả lấy từ cache đĩa (không gọi lại nguồn). */
  fromCache?: boolean;
  /** Lấy từ HTML cũ vì không gọi được nguồn — dữ liệu có thể đã lạc hậu. */
  stale?: boolean;
}
