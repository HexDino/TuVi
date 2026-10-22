/**
 * lib/tuvi/star-dictionary.ts
 * ---------------------------------------------------------------------------
 * Từ điển sao — dữ liệu tra cứu cho người đọc.
 *
 * Vì sao cần: bàn lá số hiện "Tham Lang (Miếu)" nhưng người không học tử vi
 * không biết nghĩa là gì. Các trang lớn (tuviglobal, cohoc) đều không có từ điển
 * tra cứu được — chỉ có bài viết rời. Đây là chỗ khác biệt của hệ thống này.
 *
 * Nội dung viết ngắn, theo lối sách cổ: bản chất → miếu/hãm → chủ quản gì.
 * Không chép nguyên văn bất kỳ nguồn nào.
 * ---------------------------------------------------------------------------
 */

import type { FiveElement } from '@/types/tuvi';

export interface StarEntry {
  /** Tên hiển thị. */
  name: string;
  /** Khoá ASCII khớp với StarInfo.key. */
  key: string;
  /** 'chinh' 14 chính tinh · 'cat' lục cát · 'hung' lục sát · 'khac' phụ tinh quan trọng. */
  group: 'chinh' | 'cat' | 'hung' | 'khac';
  element: FiveElement;
  /** Một dòng bản chất. */
  essence: string;
  /** Khi đắc địa (Miếu/Vượng/Đắc). */
  good: string;
  /** Khi hãm địa. */
  bad: string;
  /** Chủ quản phương diện gì. */
  domain: string;
}

export const STAR_DICTIONARY: StarEntry[] = [
  /* ---------------------------- 14 chính tinh ---------------------------- */
  {
    name: 'Tử Vi',
    key: 'tu_vi',
    group: 'chinh',
    element: 'Thổ',
    essence: 'Sao đế tinh, chủ về uy quyền, địa vị và khả năng quy tụ người khác.',
    good: 'Miếu địa thì có uy mà không lạm quyền, dễ được nể trọng, hợp vai trò lãnh đạo.',
    bad: 'Hãm thì dễ độc đoán, thích hình thức, giữ thể diện hơn giữ việc.',
    domain: 'Địa vị · quyền lực · quan hệ cấp trên',
  },
  {
    name: 'Thiên Cơ',
    key: 'thien_co',
    group: 'chinh',
    element: 'Mộc',
    essence: 'Sao mưu lược, chủ về suy nghĩ, tính toán và sự thay đổi.',
    good: 'Đắc địa thì ứng biến nhanh, giỏi hoạch định, hợp nghề phân tích và kỹ thuật.',
    bad: 'Hãm thì nghĩ nhiều mà làm ít, hay đổi ý, dễ lo xa quá mức.',
    domain: 'Trí tuệ · kế hoạch · anh em, thầy bạn',
  },
  {
    name: 'Thái Dương',
    key: 'thai_duong',
    group: 'chinh',
    element: 'Hỏa',
    essence: 'Sao mặt trời, chủ về sự nghiệp công khai, danh tiếng và người cha.',
    good: 'Miếu địa thì rộng rãi, sáng sủa, dễ nổi danh, hợp việc đối ngoại.',
    bad: 'Hãm thì vất vả mà ít người biết, dễ tổn hại mắt và tim mạch.',
    domain: 'Công danh · danh tiếng · cha, chồng',
  },
  {
    name: 'Vũ Khúc',
    key: 'vu_khuc',
    group: 'chinh',
    element: 'Kim',
    essence: 'Sao tài tinh, chủ về tiền bạc, sự quyết đoán và tính thực tế.',
    good: 'Miếu địa thì kiếm tiền giỏi, giữ tiền chắc, làm việc có nguyên tắc.',
    bad: 'Hãm thì khô khan, nặng vật chất, dễ cô độc vì quá cứng.',
    domain: 'Tiền tài · tài chính · vợ chồng',
  },
  {
    name: 'Thiên Đồng',
    key: 'thien_dong',
    group: 'chinh',
    element: 'Thủy',
    essence: 'Sao phúc tinh, chủ về sự an nhàn, hưởng thụ và tính thiện.',
    good: 'Miếu thì hiền hòa, có phúc, sống dễ chịu, ít bon chen.',
    bad: 'Hãm thì lười biếng, thiếu quyết đoán, dễ bị người khác dắt.',
    domain: 'Phúc khí · an nhàn · con cái',
  },
  {
    name: 'Liêm Trinh',
    key: 'liem_trinh',
    group: 'chinh',
    element: 'Hỏa',
    essence: 'Sao đào hoa kiêm hình tinh, chủ về nguyên tắc, dục vọng và sự đa đoan.',
    good: 'Đắc địa thì chính trực, có nguyên tắc, giỏi việc hình luật, kiểm soát.',
    bad: 'Hãm thì dễ vướng thị phi, đa tình, dễ dính chuyện tình cảm rắc rối.',
    domain: 'Nguyên tắc · tình cảm · hình luật',
  },
  {
    name: 'Thiên Phủ',
    key: 'thien_phu',
    group: 'chinh',
    element: 'Thổ',
    essence: 'Sao kho lẫm, chủ về khả năng tích lũy, quản lý và sự ổn định.',
    good: 'Miếu thì giữ của giỏi, biết vun vén, làm nơi nương tựa cho người khác.',
    bad: 'Hãm thì bảo thủ, chỉ giữ mà không mở, dễ bỏ lỡ cơ hội.',
    domain: 'Tích lũy · quản lý · nhà cửa',
  },
  {
    name: 'Thái Âm',
    key: 'thai_am',
    group: 'chinh',
    element: 'Thủy',
    essence: 'Sao mặt trăng, chủ về điền sản, sự tinh tế và người mẹ, vợ.',
    good: 'Miếu thì sâu sắc, khéo léo, dễ có của, hợp việc cần sự tế nhị.',
    bad: 'Hãm thì dễ u uất, đa sầu, của cải đến rồi đi.',
    domain: 'Điền sản · tình cảm kín · mẹ, vợ',
  },
  {
    name: 'Tham Lang',
    key: 'tham_lang',
    group: 'chinh',
    element: 'Thủy',
    essence: 'Sao ham muốn, chủ về khát vọng, tài nghệ và sự đa dạng.',
    good: 'Miếu thì đa tài, giao tế rộng, hợp kinh doanh và nghề cần khéo léo.',
    bad: 'Hãm thì dễ sa vào tửu sắc, cờ bạc, làm nhiều mà không giữ được.',
    domain: 'Khát vọng · tài nghệ · giao tế',
  },
  {
    name: 'Cự Môn',
    key: 'cu_mon',
    group: 'chinh',
    element: 'Thủy',
    essence: 'Sao ngôn ngữ, chủ về lời nói, tranh luận và sự che giấu.',
    good: 'Vượng thì ăn nói có sức nặng, hợp nghề nói, dạy, tranh biện.',
    bad: 'Hãm thì thị phi, khẩu thiệt, nói ra dễ mất lòng.',
    domain: 'Ngôn ngữ · thị phi · tranh chấp',
  },
  {
    name: 'Thiên Tướng',
    key: 'thien_tuong',
    group: 'chinh',
    element: 'Thủy',
    essence: 'Sao ấn tín, chủ về sự cân bằng, trách nhiệm và lòng trung hậu.',
    good: 'Miếu thì đôn hậu, biết điều, làm việc có trách nhiệm, được tin cậy.',
    bad: 'Hãm thì ba phải, thiếu chính kiến, dễ bị lôi kéo.',
    domain: 'Trách nhiệm · cân bằng · quan hệ đối tác',
  },
  {
    name: 'Thiên Lương',
    key: 'thien_luong',
    group: 'chinh',
    element: 'Thổ',
    essence: 'Sao ấm tinh, chủ về sự che chở, tuổi thọ và tính nghiêm cẩn.',
    good: 'Vượng thì có uy đức, hay giúp người, dễ được nhờ cậy, hợp nghề y và giáo.',
    bad: 'Hãm thì cố chấp, hay lo chuyện bao đồng, dễ cô đơn.',
    domain: 'Che chở · sức khỏe · bậc trưởng thượng',
  },
  {
    name: 'Thất Sát',
    key: 'that_sat',
    group: 'chinh',
    element: 'Kim',
    essence: 'Sao quyền biến, chủ về sự quyết liệt, độc lập và khả năng chịu áp lực.',
    good: 'Miếu thì quyết đoán, dám làm việc khó, hợp môi trường cạnh tranh.',
    bad: 'Hãm thì liều lĩnh, dễ đứt gánh giữa đường, cô độc.',
    domain: 'Quyết đoán · sự nghiệp · áp lực',
  },
  {
    name: 'Phá Quân',
    key: 'pha_quan',
    group: 'chinh',
    element: 'Thủy',
    essence: 'Sao phá cách, chủ về sự đổi mới, phá bỏ và làm lại từ đầu.',
    good: 'Miếu thì dám đổi, mở đường mới, hợp khởi nghiệp và nghề cần đột phá.',
    bad: 'Hãm thì phá nhiều hơn xây, hao tài, thay đổi liên tục mà không bền.',
    domain: 'Đổi mới · khởi nghiệp · hao tán',
  },

  /* ------------------------------ Lục cát ------------------------------- */
  {
    name: 'Thiên Khôi',
    key: 'thien_khoi',
    group: 'cat',
    element: 'Hỏa',
    essence: 'Quý nhân bậc trên, chủ về sự nâng đỡ từ người có vị thế.',
    good: 'Đắc thì gặp khó có người đỡ, thi cử, xin việc thuận.',
    bad: 'Không có khái niệm hãm; yếu đi khi cung nhiều sát tinh.',
    domain: 'Quý nhân · cơ hội · đề bạt',
  },
  {
    name: 'Thiên Việt',
    key: 'thien_viet',
    group: 'cat',
    element: 'Hỏa',
    essence: 'Quý nhân bậc dưới, chủ về sự giúp đỡ thiết thực, gần gũi.',
    good: 'Đắc thì được người cùng cấp hoặc cấp dưới giúp việc lớn.',
    bad: 'Yếu khi đồng cung với Không Kiếp.',
    domain: 'Trợ lực · hợp tác · người giúp việc',
  },
  {
    name: 'Tả Phù',
    key: 'ta_phu',
    group: 'cat',
    element: 'Thổ',
    essence: 'Sao phò tá bên trái, chủ về sự hỗ trợ đắc lực và khả năng phối hợp.',
    good: 'Đắc thì có người cùng làm, việc lớn chia nhỏ được.',
    bad: 'Gặp sát tinh thì giảm trợ lực, dễ bị mang ơn mà không được đền.',
    domain: 'Phò tá · đồng đội · tổ chức',
  },
  {
    name: 'Hữu Bật',
    key: 'huu_bat',
    group: 'cat',
    element: 'Thủy',
    essence: 'Sao phò tá bên phải, chủ về sự trợ giúp mềm và khả năng dung hòa.',
    good: 'Đắc thì được lòng người, dễ hòa giải, có bạn đời đắc lực.',
    bad: 'Gặp sát tinh thì trợ lực thành gánh nặng.',
    domain: 'Dung hòa · bạn đời · quan hệ',
  },
  {
    name: 'Văn Xương',
    key: 'van_xuong',
    group: 'cat',
    element: 'Kim',
    essence: 'Sao văn chương, chủ về học vấn, thi cử và cách diễn đạt.',
    good: 'Đắc thì học nhanh, nói có lý, viết rõ, hợp nghề cần chữ nghĩa.',
    bad: 'Hãm thì giỏi lý thuyết mà thiếu thực hành, dễ viện dẫn lời người khác.',
    domain: 'Học vấn · thi cử · diễn đạt',
  },
  {
    name: 'Văn Khúc',
    key: 'van_khuc',
    group: 'cat',
    element: 'Thủy',
    essence: 'Sao văn hoa, chủ về sự khéo léo, tài lẻ và khả năng thuyết phục.',
    good: 'Đắc thì ăn nói khéo, có duyên, hợp nghề giao tiếp và sáng tạo.',
    bad: 'Hãm thì lời nói dễ gây hiểu lầm, khéo ngoài mà rỗng trong.',
    domain: 'Khéo léo · giao tiếp · tài lẻ',
  },

  /* ------------------------------ Lục sát ------------------------------- */
  {
    name: 'Kình Dương',
    key: 'kinh_duong',
    group: 'hung',
    element: 'Kim',
    essence: 'Sát tinh chủ về sự cứng rắn, xung đột và va chạm.',
    good: 'Đắc địa thì thành sức mạnh phá việc khó, hợp nghề cần đối kháng.',
    bad: 'Hãm thì dễ tai nạn, kiện tụng, quan hệ đổ vỡ vì lời nói thẳng.',
    domain: 'Xung đột · tai nạn · sự cứng cỏi',
  },
  {
    name: 'Đà La',
    key: 'da_la',
    group: 'hung',
    element: 'Kim',
    essence: 'Sát tinh chủ về sự trì trệ, dây dưa và kéo dài.',
    good: 'Đắc thì kiên trì, chịu được việc dài hơi.',
    bad: 'Hãm thì việc gì cũng chậm, dễ trễ hạn, mất cơ hội vì chần chừ.',
    domain: 'Trì trệ · dây dưa · chậm trễ',
  },
  {
    name: 'Hỏa Tinh',
    key: 'hoa_tinh',
    group: 'hung',
    element: 'Hỏa',
    essence: 'Sát tinh chủ về sự bốc đồng, nóng nảy và biến cố nhanh.',
    good: 'Đắc thì phản ứng nhanh, dám làm, hợp việc cần tốc độ.',
    bad: 'Hãm thì nóng vội, dễ hỏng việc trong phút bốc đồng.',
    domain: 'Bốc đồng · biến cố · tốc độ',
  },
  {
    name: 'Linh Tinh',
    key: 'linh_tinh',
    group: 'hung',
    element: 'Hỏa',
    essence: 'Sát tinh chủ về sự âm ỉ, bức bối và tích tụ căng thẳng.',
    good: 'Đắc thì chịu đựng dai, giỏi việc cần bền bỉ trong im lặng.',
    bad: 'Hãm thì ấm ức lâu ngày, dễ nổ tung thành quyết định sai.',
    domain: 'Âm ỉ · bức bối · tích tụ',
  },
  {
    name: 'Địa Không',
    key: 'dia_khong',
    group: 'hung',
    element: 'Hỏa',
    essence: 'Sao không vong, chủ về sự hụt hẫng, mất đi rồi mới nhận ra.',
    good: 'Đắc thì buông được, ít tham, hợp việc tâm linh và nghiên cứu.',
    bad: 'Hãm thì tiền vào tay rồi mất, kế hoạch hay hụt ở phút cuối.',
    domain: 'Hụt hẫng · buông bỏ · tâm linh',
  },
  {
    name: 'Địa Kiếp',
    key: 'dia_kiep',
    group: 'hung',
    element: 'Hỏa',
    essence: 'Sao cướp đoạt, chủ về sự hao tán đột ngột và mất mát khó lường.',
    good: 'Đắc thì dám liều, có lúc thắng lớn nhờ đi ngược số đông.',
    bad: 'Hãm thì hao tài bất ngờ, dễ bị lừa hoặc mất vì người thân.',
    domain: 'Hao tán · rủi ro · mất mát',
  },

  /* --------------------------- Phụ tinh quan trọng --------------------------- */
  {
    name: 'Lộc Tồn',
    key: 'loc_ton',
    group: 'khac',
    element: 'Thổ',
    essence: 'Sao giữ của, chủ về nguồn lực ổn định và sự tích lũy bền.',
    good: 'Đắc thì có của ăn của để, tiền đến đều, ít khi túng.',
    bad: 'Đi với Không Kiếp thì thành giữ của hão; đi với Kình Đà thì bị cắt nguồn.',
    domain: 'Tài lộc · tích lũy · nguồn lực',
  },
  {
    name: 'Thiên Mã',
    key: 'thien_ma',
    group: 'khac',
    element: 'Hỏa',
    essence: 'Sao di chuyển, chủ về sự đi lại, thay đổi chỗ ở và cơ hội từ nơi xa.',
    good: 'Đắc thì đi xa phát, hợp nghề phải di chuyển, buôn bán liên vùng.',
    bad: 'Hãm thì đi nhiều mà không tới, chạy việc mà chẳng đâu vào đâu.',
    domain: 'Di chuyển · cơ hội xa · thay đổi',
  },
  {
    name: 'Tuần Không',
    key: 'tuan_khong',
    group: 'khac',
    element: 'Hỏa',
    essence: 'Vòng Tuần chặn giữa hai cung, làm tính chất cung bị "ngăn lại".',
    good: 'Cung Vô chính diệu gặp Tuần thì lại vững, hung tinh bị chặn bớt.',
    bad: 'Cung có cát tinh gặp Tuần thì phát chậm, muộn nhưng thường bền.',
    domain: 'Bộ lọc · chặn · làm chậm',
  },
  {
    name: 'Triệt Lộ',
    key: 'triet_lo',
    group: 'khac',
    element: 'Kim',
    essence: 'Vòng Triệt cắt ngang cung, làm tính chất cung bị "cắt" mạnh hơn Tuần.',
    good: 'Chặn được sát tinh mạnh, giảm tai họa rõ rệt.',
    bad: 'Cắt cả cát tinh: đường công danh thường đứt đoạn đầu đời rồi mới nối.',
    domain: 'Bộ lọc · cắt · đứt đoạn',
  },
];

const BY_KEY = new Map(STAR_DICTIONARY.map((s) => [s.key, s]));

export function lookupStar(key: string): StarEntry | undefined {
  return BY_KEY.get(key);
}

/** Nhóm hiển thị để gom trong từ điển. */
export const STAR_GROUPS: Array<{ id: StarEntry['group']; label: string }> = [
  { id: 'chinh', label: '14 chính tinh' },
  { id: 'cat', label: 'Lục cát' },
  { id: 'hung', label: 'Lục sát' },
  { id: 'khac', label: 'Phụ tinh quan trọng' },
];
