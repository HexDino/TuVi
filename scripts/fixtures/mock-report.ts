/**
 * scripts/fixtures/mock-report.ts
 * Fixture báo cáo để test UI/schema KHÔNG cần LLM.
 * Nội dung là MOCK — chỉ dùng để kiểm tra layout và ràng buộc Zod.
 */
import type { TuViFullReport } from '../../schemas/report.schema';
import type { PalaceKey } from '../../types/tuvi';

const SAMPLE: TuViFullReport = {
  meta: {
    solarDate: '1990-10-21',
    lunarDate: 'Âm lịch ngày 4 tháng 9 năm 1990',
    chineseDate: 'Canh Ngọ - Bính Tuất - Kỷ Mùi - Canh Ngọ',
    gender: 'nam',
    viewingYear: 2026,
    confidence: 'cao',
  },
  overview: {
    opening:
      'Lá số này mở ra bằng Tham Lang tại Thìn — một sao ham sống, ham biết, đặt cạnh Văn Xương thì cái ham ấy nghiêng về chữ nghĩa và cái đẹp. (mock)',
    thienDiaNhan: {
      verdict: 'thuan',
      analysis:
        'Cục Kim sinh nạp âm Thổ... (mock) Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore.',
    },
    cachCuc: { name: 'Tham Lang độc tọa Thìn Tuất', explanation: 'Mock explanation cho cách cục Tham Lang độc tọa, đủ dài để vượt ràng buộc min 80 ký tự của schema.' },
    thanCu: { palace: 'Mệnh', meaning: 'Thân cư Mệnh nghĩa là hậu vận gắn chặt với bản thân, tự lực cánh sinh, không ỷ lại ai.' },
    personality: {
      traits: [
        { title: 'Thực tế', detail: 'Mock detail đủ dài cho trait thứ nhất, vượt 40 ký tự.' },
        { title: 'Đa dục', detail: 'Mock detail đủ dài cho trait thứ hai, vượt 40 ký tự.' },
        { title: 'Kiên nhẫn', detail: 'Mock detail đủ dài cho trait thứ ba, vượt 40 ký tự.' },
      ],
      coreCompetencies: ['Kinh doanh', 'Thuyết phục'],
      blindSpots: ['Dễ ôm đồm'],
    },
    overallScore: 72,
    oneLineVerdict: 'Bạn là kiểu người thực tế, con đường phù hợp là kinh doanh tự lực.',
  },
  careerGroup: [],
  familyGroup: [],
  socialGroup: [],
  actionPlan: {
    decadalAnalysis: [
      { range: '34-43', theme: 'Mock theme của đại vận, đủ dài để vượt ràng buộc min 30 ký tự.', opportunity: 'Mock cơ hội của đại vận, đủ dài trên hai mươi ký tự', risk: 'Mock rủi ro của đại vận, đủ dài trên hai mươi ký tự', action: 'but_pha' },
      { range: '44-53', theme: 'Mock theme của đại vận, đủ dài để vượt ràng buộc min 30 ký tự.', opportunity: 'Mock cơ hội của đại vận, đủ dài trên hai mươi ký tự', risk: 'Mock rủi ro của đại vận, đủ dài trên hai mươi ký tự', action: 'phong_thu' },
      { range: '54-63', theme: 'Mock theme của đại vận, đủ dài để vượt ràng buộc min 30 ký tự.', opportunity: 'Mock cơ hội của đại vận, đủ dài trên hai mươi ký tự', risk: 'Mock rủi ro của đại vận, đủ dài trên hai mươi ký tự', action: 'tich_luy' },
    ],
    goldenRules: [
      { rule: 'Mock rule 1 phải đủ dài trên hai mươi ký tự', rationale: 'Mock rationale 1 đủ dài cho schema.' },
      { rule: 'Mock rule 2 phải đủ dài trên hai mươi ký tự', rationale: 'Mock rationale 2 đủ dài cho schema.' },
      { rule: 'Mock rule 3 phải đủ dài trên hai mươi ký tự', rationale: 'Mock rationale 3 đủ dài cho schema.' },
    ],
  },
  editorialNotes: [],
};

function mockPalace(key: PalaceKey, name: string) {
  return {
    palaceKey: key,
    palaceName: name,
    mainStars: 'Tham Lang (Miếu)',
    verdict: 'thuan_loi' as const,
    narrative:
      'Đoạn một mô tả bản chất của cung dựa trên chính tinh và trạng thái. Đây là văn bản mock dùng để kiểm tra layout chế độ đọc, độ dài vượt ràng buộc 280 ký tự của schema.\n\nĐoạn hai nói về biểu hiện thực tế trong công việc và tiền bạc, kèm cái giá phải trả. Vẫn là mock, nhưng đủ dài để thấy cách đoạn văn xuống dòng và ngắt nhịp trong giao diện.\n\nĐoạn ba là lời khuyên ngắn, đặt ở cuối như người thầy dặn thêm trước khi gấp lá số lại.',
    headline: 'Đây là headline mock đủ dài để vượt qua ràng buộc min length của schema Zod.',
    strengths: [
      {
        title: 'Mock strength',
        detail: 'Mock detail của strength, đủ dài để vượt ràng buộc 40 ký tự trong schema.',
        evidence: ['Tham Lang (Miếu)'],
      },
    ],
    risks: [
      {
        title: 'Mock risk',
        detail: 'Mock detail của risk, đủ dài để vượt ràng buộc 40 ký tự trong schema.',
        evidence: ['Hóa Kỵ tại Nô Bộc'],
      },
    ],
    strategy: ['Mock chiến lược 1 phải dài hơn hai mươi ký tự', 'Mock chiến lược 2 phải dài hơn hai mươi ký tự'],
    score: 72,
    scoreDelta: -2,
    scoreReason: 'Mock lý do điều chỉnh điểm, đủ dài cho ràng buộc schema.',
  };
}

SAMPLE.careerGroup = [
  mockPalace('menh', 'Mệnh'),
  mockPalace('quan_loc', 'Quan Lộc'),
  mockPalace('tai_bach', 'Tài Bạch'),
  mockPalace('thien_di', 'Thiên Di'),
];
SAMPLE.familyGroup = [
  mockPalace('phuc_duc', 'Phúc Đức'),
  mockPalace('phu_the', 'Phu Thê'),
  mockPalace('tu_nu', 'Tử Nữ'),
  mockPalace('dien_trach', 'Điền Trạch'),
];
SAMPLE.socialGroup = [
  mockPalace('phu_mau', 'Phụ Mẫu'),
  mockPalace('huynh_de', 'Huynh Đệ'),
  mockPalace('no_boc', 'Nô Bộc'),
  mockPalace('tat_ach', 'Tật Ách'),
];


export { SAMPLE as MOCK_REPORT };
