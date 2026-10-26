/**
 * lib/tuvi/constants.ts
 * ---------------------------------------------------------------------------
 * Toàn bộ "kiến thức tĩnh" của hệ thống: bảng ngũ hành sao, bảng trọng số
 * độ sáng, bảng nạp âm 60 hoa giáp, map tên cung, quan hệ địa chi.
 *
 * Tách khỏi logic để: (1) dễ review với chuyên gia tử vi, (2) dễ hot-fix khi
 * phát hiện sai lệch, (3) scoring engine đọc bảng thay vì hard-code if/else.
 * ---------------------------------------------------------------------------
 */

import type {
  Brightness,
  EarthlyBranch,
  FiveElement,
  PalaceKey,
  StarClass,
} from '@/types/tuvi';

/* -------------------------------- KEY ------------------------------------ */

/**
 * Bỏ dấu tiếng Việt + chuẩn hoá thành khoá ASCII: "Tả Phù" → "ta_phu".
 *
 * ĐÂY LÀ HÀM GỐC DUY NHẤT. Mọi bảng tra trong file này đều được chuẩn hoá qua
 * nó (xem các *_SET bên dưới). Trước đây bảng ghi "văn xương" còn key sinh ra
 * "van_xuong" → không match, khiến mọi sao rơi vào nhóm "trung" và điểm số
 * chỉ còn phản ánh độ sáng chính tinh.
 */
export function toKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/* ------------------------------- ĐỘ SÁNG -------------------------------- */

/** Trọng số độ sáng: dùng cho scoring. Miếu = 1.0, Hãm = 0.15. */
export const BRIGHTNESS_WEIGHT: Record<Brightness, number> = {
  Miếu: 1.0,
  Vượng: 0.9,
  Đắc: 0.75,
  Lợi: 0.62,
  Bình: 0.5,
  Bất: 0.32,
  Hãm: 0.15,
  Vô: 0.5,
};

/** Chuẩn hoá mọi biến thể độ sáng (Việt/Trung/viết tắt 1 ký tự) về Brightness. */
export const BRIGHTNESS_ALIASES: Record<string, Brightness> = {
  miếu: 'Miếu',
  m: 'Miếu',
  庙: 'Miếu',
  vượng: 'Vượng',
  v: 'Vượng',
  旺: 'Vượng',
  đắc: 'Đắc',
  đ: 'Đắc',
  d: 'Đắc',
  得: 'Đắc',
  lợi: 'Lợi',
  l: 'Lợi',
  利: 'Lợi',
  bình: 'Bình',
  b: 'Bình',
  平: 'Bình',
  bất: 'Bất',
  不: 'Bất',
  hãm: 'Hãm',
  h: 'Hãm',
  陷: 'Hãm',
};

/* ------------------------------ NGŨ HÀNH SAO ------------------------------ */

/** Ngũ hành của 14 chính tinh + các phụ tinh thường gặp. */
export const STAR_ELEMENT: Record<string, FiveElement> = {
  // 14 chính tinh
  'tử vi': 'Thổ',
  'thiên cơ': 'Mộc',
  'thái dương': 'Hỏa',
  'vũ khúc': 'Kim',
  'thiên đồng': 'Thủy',
  'liêm trinh': 'Hỏa',
  'thiên phủ': 'Thổ',
  'thái âm': 'Thủy',
  'tham lang': 'Thủy',
  'cự môn': 'Thủy',
  'thiên tướng': 'Thủy',
  'thiên lương': 'Thổ',
  'thất sát': 'Kim',
  'phá quân': 'Thủy',
  // Lục cát
  'tả phù': 'Thổ',
  'hữu bật': 'Thủy',
  'văn xương': 'Kim',
  'văn khúc': 'Thủy',
  'thiên khôi': 'Hỏa',
  'thiên việt': 'Hỏa',
  // Lục sát
  'kình dương': 'Kim',
  'đà la': 'Kim',
  'hỏa tinh': 'Hỏa',
  'linh tinh': 'Hỏa',
  'địa không': 'Hỏa',
  'địa kiếp': 'Hỏa',
  // Khác
  'lộc tồn': 'Thổ',
  'thiên mã': 'Hỏa',
  'tuần không': 'Hỏa',
  'triệt lộ': 'Kim',
  'hồng loan': 'Thủy',
  'thiên hỷ': 'Thủy',
  'thiên hình': 'Hỏa',
  'thiên riêu': 'Thủy',
  'kiếp sát': 'Hỏa',
  'thiên không': 'Hỏa',
  'cô thần': 'Thổ',
  'quả tú': 'Thổ',
  'đào hoa': 'Mộc',
  'hàm trì': 'Thủy',
  'long trì': 'Thủy',
  'phượng các': 'Thổ',
  'thiên tài': 'Thổ',
  'thiên thọ': 'Thổ',
  'thiên khốc': 'Kim',
  'thiên hư': 'Thổ',
  'bạch hổ': 'Kim',
  'tang môn': 'Mộc',
  'điếu khách': 'Hỏa',
  'tuế phá': 'Hỏa',
  'quan phù': 'Hỏa',
  'bệnh phù': 'Thổ',
  'đại hao': 'Hỏa',
  'tiểu hao': 'Hỏa',
  'phục binh': 'Hỏa',
  'tướng quân': 'Mộc',
  'tử phù': 'Thủy',
  'long đức': 'Thủy',
  'thiên đức': 'Hỏa',
  'nguyệt đức': 'Hỏa',
  'thiên quan': 'Hỏa',
  'thiên phúc': 'Hỏa',
  'ân quang': 'Mộc',
  'thiên quý': 'Thổ',
  'thiên trù': 'Hỏa',
  'thiên y': 'Thổ',
  'quốc ấn': 'Thổ',
  'đường phù': 'Mộc',
  'bát tọa': 'Thổ',
  'tam thai': 'Thủy',
  'phong cáo': 'Thổ',
  'đài phụ': 'Thổ',
  'thiên vu': 'Hỏa',
  'thiên sứ': 'Thủy',
  'nguyệt giải': 'Thủy',
  'niên giải': 'Thủy',
  'giải thần': 'Mộc',
  'địa giải': 'Thổ',
  'thiên giải': 'Hỏa',
  'hoa cái': 'Mộc',
  'thiên la': 'Thổ',
  'địa võng': 'Thổ',
  'âm sát': 'Hỏa',
  'tai sát': 'Hỏa',
  'vong thần': 'Hỏa',
  'phá toái': 'Hỏa',
  'thiên thương': 'Thủy',
  'thiên diêu': 'Thủy',
  'đẩu quân': 'Hỏa',
  'văn tinh': 'Kim',
  'lộc tài': 'Thổ',
  'lộc khố': 'Thổ',
  'thiên khố': 'Thổ',
  'tuế dịch': 'Hỏa',
  'chỉ bối': 'Thủy',
  'tức thần': 'Thủy',
  'hỉ thần': 'Hỏa',
  'bác sĩ': 'Thủy',
  'lực sĩ': 'Hỏa',
  'thanh long': 'Thủy',
  'tướng tinh': 'Hỏa',
  'phàn an': 'Thủy',
  'tuế kiện': 'Hỏa',
  'hối khí': 'Thủy',
  'quán sách': 'Hỏa',
  'trực phù': 'Hỏa',
};

/** Bảng tra ngũ hành sao đã chuẩn hoá về toKey. */
const STAR_ELEMENT_BY_KEY = new Map(
  Object.entries(STAR_ELEMENT).map(([name, el]) => [toKey(name), el]),
);

/** Ngũ hành của sao theo key ASCII. */
export function starElement(key: string): FiveElement | undefined {
  return STAR_ELEMENT_BY_KEY.get(toKey(key));
}

/* --------------------------- PHÂN LOẠI SAO -------------------------------- */

/** 14 chính tinh. */
export const MAJOR_STARS = [
  'tử vi',
  'thiên cơ',
  'thái dương',
  'vũ khúc',
  'thiên đồng',
  'liêm trinh',
  'thiên phủ',
  'thái âm',
  'tham lang',
  'cự môn',
  'thiên tướng',
  'thiên lương',
  'thất sát',
  'phá quân',
];

/** Lục cát — 6 sao tốt chủ lực. */
export const AUSPICIOUS_STARS = [
  'thiên khôi',
  'thiên việt',
  'tả phù',
  'hữu bật',
  'văn xương',
  'văn khúc',
];

/** Lục sát — 6 sao hung chủ lực. */
export const MALEFIC_STARS = [
  'kình dương',
  'đà la',
  'hỏa tinh',
  'linh tinh',
  'địa không',
  'địa kiếp',
];

/** Cát tinh phụ trợ (được tính điểm nhẹ hơn Lục cát). */
export const MINOR_AUSPICIOUS = [
  'thiên quan',
  'thiên phúc',
  'ân quang',
  'thiên quý',
  'long trì',
  'phượng các',
  'thiên đức',
  'nguyệt đức',
  'long đức',
  'thiên trù',
  'thiên y',
  'quốc ấn',
  'đường phù',
  'tam thai',
  'bát tọa',
  'phong cáo',
  'đài phụ',
  'thiên tài',
  'thiên thọ',
  'hồng loan',
  'thiên hỷ',
  'giải thần',
  'địa giải',
  'thiên giải',
  'nguyệt giải',
  'niên giải',
  'văn tinh',
  'lộc tài',
  'lộc khố',
];

/** Hung tinh phụ trợ (tính điểm âm nhẹ). */
export const MINOR_MALEFIC = [
  'thiên hình',
  'thiên riêu',
  'kiếp sát',
  'thiên không',
  'cô thần',
  'quả tú',
  'thiên khốc',
  'thiên hư',
  'tang môn',
  'điếu khách',
  'tuế phá',
  'quan phù',
  'bệnh phù',
  'đại hao',
  'tiểu hao',
  'phục binh',
  'tử phù',
  'âm sát',
  'tai sát',
  'vong thần',
  'phá toái',
  'thiên thương',
  'thiên sứ',
  'thiên la',
  'địa võng',
  'bạch hổ',
  'hối khí',
  'tuế kiện',
];

/** Bảng tra đã chuẩn hoá về toKey — tránh lệch dấu/cách. */
const keySet = (arr: string[]) => new Set(arr.map(toKey));

const MAJOR_SET = keySet(MAJOR_STARS);
const AUSPICIOUS_SET = keySet(AUSPICIOUS_STARS);
const MALEFIC_SET = keySet(MALEFIC_STARS);
const MINOR_AUSPICIOUS_SET = keySet(MINOR_AUSPICIOUS);
const MINOR_MALEFIC_SET = keySet(MINOR_MALEFIC);

/**
 * Phân loại 1 sao theo key ASCII (đã chuẩn hoá hoặc tên gốc đều được —
 * hàm tự gọi toKey nên idempotent).
 */
export function classifyStar(key: string): StarClass {
  const k = toKey(key);
  if (MAJOR_SET.has(k)) return 'chinh';
  if (AUSPICIOUS_SET.has(k)) return 'cat';
  if (MALEFIC_SET.has(k)) return 'hung';
  if (k === 'loc_ton') return 'loc';
  if (k === 'thien_ma') return 'ma';
  if (MINOR_AUSPICIOUS_SET.has(k)) return 'trung';
  if (MINOR_MALEFIC_SET.has(k)) return 'hung';
  if (/^(van|luu|nien)_/.test(k)) return 'ta';
  return 'trung';
}

/* ------------------------------ TÊN CUNG --------------------------------- */

/**
 * Map tên cung (đã localize, nhiều biến thể) → PalaceKey.
 * iztro vi-VN trả: Mệnh, Huynh Đệ, Phu Thê, Tử Nữ, Tài Bạch, Tật Ách,
 * Thiên Di, Nô Bộc, Quan Lộc, Điền Trạch, Phúc Đức, Phụ Mẫu.
 */
export const PALACE_KEY_MAP: Record<string, PalaceKey> = {
  mệnh: 'menh',
  'huynh đệ': 'huynh_de',
  'huynh đệ cung': 'huynh_de',
  'phu thê': 'phu_the',
  'phối': 'phu_the',
  'vợ chồng': 'phu_the',
  'tử nữ': 'tu_nu',
  'tử tức': 'tu_nu',
  'tài bạch': 'tai_bach',
  'tật ách': 'tat_ach',
  'thiên di': 'thien_di',
  'nô bộc': 'no_boc',
  'giao hữu': 'no_boc',
  'quan lộc': 'quan_loc',
  'sự nghiệp': 'quan_loc',
  'điền trạch': 'dien_trach',
  'phúc đức': 'phuc_duc',
  'phụ mẫu': 'phu_mau',
};

/** Tên chuẩn để hiển thị. */
export const PALACE_DISPLAY: Record<PalaceKey, string> = {
  menh: 'Mệnh',
  huynh_de: 'Huynh Đệ',
  phu_the: 'Phu Thê',
  tu_nu: 'Tử Nữ',
  tai_bach: 'Tài Bạch',
  tat_ach: 'Tật Ách',
  thien_di: 'Thiên Di',
  no_boc: 'Nô Bộc',
  quan_loc: 'Quan Lộc',
  dien_trach: 'Điền Trạch',
  phuc_duc: 'Phúc Đức',
  phu_mau: 'Phụ Mẫu',
};

/** Thứ tự hiển thị mong muốn của 12 cung (theo tam hợp). */
export const PALACE_ORDER: PalaceKey[] = [
  'menh',
  'tai_bach',
  'quan_loc',
  'thien_di',
  'phu_the',
  'phuc_duc',
  'dien_trach',
  'tu_nu',
  'huynh_de',
  'no_boc',
  'phu_mau',
  'tat_ach',
];

/** Nhóm cung theo Tam Hợp — dùng chung cho payload và kỹ năng Gemini. */
export const PALACE_GROUPS = {
  career: ['menh', 'quan_loc', 'tai_bach', 'thien_di'],
  family: ['phuc_duc', 'phu_the', 'tu_nu', 'dien_trach'],
  social: ['phu_mau', 'huynh_de', 'no_boc', 'tat_ach'],
} as const satisfies Record<string, readonly PalaceKey[]>;

/* ------------------------------ ĐỊA CHI ---------------------------------- */

export const BRANCHES: EarthlyBranch[] = [
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
];

/** Cung xung chiếu: lục xung (cách 6 vị trí). */
export function oppositeBranch(branch: EarthlyBranch): EarthlyBranch {
  const i = BRANCHES.indexOf(branch);
  return BRANCHES[(i + 6) % 12];
}

/** Hai cung tam hợp (cách 4 và 8 vị trí). */
export function trineBranches(branch: EarthlyBranch): [EarthlyBranch, EarthlyBranch] {
  const i = BRANCHES.indexOf(branch);
  return [BRANCHES[(i + 4) % 12], BRANCHES[(i + 8) % 12]];
}

/* ------------------------------- NẠP ÂM ---------------------------------- */

/** 30 cặp nạp âm của vòng 60 hoa giáp, theo thứ tự Giáp Tý → Quý Hợi. */
export const NAP_AM_PAIRS: Array<{ name: string; element: FiveElement }> = [
  { name: 'Hải Trung Kim', element: 'Kim' },
  { name: 'Lô Trung Hỏa', element: 'Hỏa' },
  { name: 'Đại Lâm Mộc', element: 'Mộc' },
  { name: 'Lộ Thượng Thổ', element: 'Thổ' },
  { name: 'Kiếm Phong Kim', element: 'Kim' },
  { name: 'Sơn Đầu Hỏa', element: 'Hỏa' },
  { name: 'Giản Hạ Thủy', element: 'Thủy' },
  { name: 'Thành Đầu Thổ', element: 'Thổ' },
  { name: 'Bạch Lạp Kim', element: 'Kim' },
  { name: 'Dương Liễu Mộc', element: 'Mộc' },
  { name: 'Tuyền Trung Thủy', element: 'Thủy' },
  { name: 'Ốc Thượng Thổ', element: 'Thổ' },
  { name: 'Tích Lịch Hỏa', element: 'Hỏa' },
  { name: 'Tùng Bách Mộc', element: 'Mộc' },
  { name: 'Trường Lưu Thủy', element: 'Thủy' },
  { name: 'Sa Trung Kim', element: 'Kim' },
  { name: 'Sơn Hạ Hỏa', element: 'Hỏa' },
  { name: 'Bình Địa Mộc', element: 'Mộc' },
  { name: 'Bích Thượng Thổ', element: 'Thổ' },
  { name: 'Kim Bạch Kim', element: 'Kim' },
  { name: 'Phú Đăng Hỏa', element: 'Hỏa' },
  { name: 'Thiên Hà Thủy', element: 'Thủy' },
  { name: 'Đại Dịch Thổ', element: 'Thổ' },
  { name: 'Thoa Xuyến Kim', element: 'Kim' },
  { name: 'Tang Đố Mộc', element: 'Mộc' },
  { name: 'Đại Khê Thủy', element: 'Thủy' },
  { name: 'Sa Trung Thổ', element: 'Thổ' },
  { name: 'Thiên Thượng Hỏa', element: 'Hỏa' },
  { name: 'Thạch Lựu Mộc', element: 'Mộc' },
  { name: 'Đại Hải Thủy', element: 'Thủy' },
];

export const STEMS = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý'];

/* --------------------------- NGŨ HÀNH SINH KHẮC --------------------------- */

/** Quan hệ A → B. */
export function elementRelation(a: FiveElement, b: FiveElement) {
  if (a === b) return 'tuong_hoa' as const;
  const sinh: Record<FiveElement, FiveElement> = {
    Kim: 'Thủy',
    Thủy: 'Mộc',
    Mộc: 'Hỏa',
    Hỏa: 'Thổ',
    Thổ: 'Kim',
  };
  const khac: Record<FiveElement, FiveElement> = {
    Kim: 'Mộc',
    Mộc: 'Thổ',
    Thổ: 'Thủy',
    Thủy: 'Hỏa',
    Hỏa: 'Kim',
  };
  if (sinh[a] === b) return 'tuong_sinh' as const;
  if (sinh[b] === a) return 'duoc_sinh' as const;
  if (khac[a] === b) return 'tuong_khac' as const;
  return 'bi_khac' as const;
}

export const ELEMENT_LABEL_VI: Record<string, string> = {
  tuong_sinh: 'Cục sinh Mệnh — thuận, được nâng đỡ',
  duoc_sinh: 'Mệnh sinh Cục — hao xuất, phải cố gắng',
  tuong_khac: 'Mệnh khắc Cục — chủ động nhưng mệt',
  bi_khac: 'Cục khắc Mệnh — áp lực từ hoàn cảnh',
  tuong_hoa: 'đồng hành — trung tính',
};
