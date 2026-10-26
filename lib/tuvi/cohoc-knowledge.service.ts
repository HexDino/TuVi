/**
 * lib/tuvi/cohoc-knowledge.service.ts — MODULE 2: CLASSICAL KNOWLEDGE RETRIEVER
 * ---------------------------------------------------------------------------
 * Lấy văn bản bình giải thô từ tuvi.cohoc.net.
 *
 * TẠI SAO PHẢI POST CHỨ KHÔNG GET:
 *  Trang kết quả của cohoc là ASP.NET WebForms. Form nhập ngày DƯƠNG lịch nằm ở
 *  `/lay-la-so-tu-vi-ngay-duong-lich.html` và yêu cầu __VIEWSTATE +
 *  __EVENTVALIDATION + cookie session. Sau khi POST, server redirect 302 sang
 *  URL tĩnh dạng:
 *     /tong-hop-la-so-tu-vi-nam-canh-ngo-thang-9-ngay-4-gio-ngo-duong-nam-lid-34647.html
 *  URL này GET lại được → dùng làm cache key tự nhiên.
 *
 *  (Form nhập ÂM lịch ở trang chủ /Default.aspx không render kết quả bằng POST
 *  — đã test thực tế. Vì vậy ta luôn quy về dương lịch trước khi gọi, và
 *  iztro đã cho ta solarDate chính xác.)
 *
 * NGUYÊN TẮC VẬN HÀNH:
 *  - Cache 30 ngày, cất qua CohocStore (đĩa khi chạy local, KV khi chạy Worker).
 *  - Serialize request + giãn cách 1.2s → không hammer server người ta.
 *  - Timeout 25s.
 *  - Lỗi mạng KHÔNG được làm sập pipeline: trả object rỗng kèm warnings để
 *    Module 3 vẫn luận được (chỉ dựa trên JSON lá số).
 *
 * HAI LOẠI CACHE, KEY KHÁC NHAU — đây là điểm quan trọng:
 *  1. JSON đã parse  → key CÓ PARSER_VERSION. Đổi cách bóc là phải bóc lại.
 *  2. HTML thô       → key KHÔNG có version. HTML không phụ thuộc parser, nên
 *     dùng lại được qua nhiều đời parser. Nhờ vậy khi mạng hỏng vẫn cứu được:
 *     đọc HTML cũ rồi parse bằng code mới, thay vì trả rỗng.
 *
 * TRANG XẾP HÀNG CỦA COHOC (phát hiện 22/10/2026):
 *  Khi server bận, POST trả về trang 18KB tiêu đề "Xử lý nghiệp vụ - <lid>"
 *  kèm `var time_redirect = 5526 + random(2000)` — tức là "chờ 5,5–7,5 giây rồi
 *  tự chuyển trang". Trang này VẪN chứa chuỗi `noi-dung` (class CSS của template
 *  404) nên guard cũ `html.includes('noi-dung')` cho qua → parser nhận trang
 *  rỗng, sinh ra "Thiếu bình giải cho: <cả 12 cung>".
 *  Nay: nhận diện bằng `giaidoan-cung` (chỉ có ở trang kết quả thật) và chờ
 *  đúng thời gian server báo rồi thử lại.
 * ---------------------------------------------------------------------------
 */

import { createHash } from 'node:crypto';
import path from 'node:path';
import type { Gender, PalaceKey, RawClassicalTexts } from '@/types/tuvi';
import {
  PARSER_VERSION,
  parseCohocPage,
  parseCohocChartTable,
  crossCheckChart,
} from './cohoc-parser';
import { createCohocStore, createFileStore, type CohocStore } from './cohoc-store';

const BASE = 'https://tuvi.cohoc.net';
const SOLAR_FORM_PATH = '/lay-la-so-tu-vi-ngay-duong-lich.html';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/** Mã `ddlCachXem` trên cohoc.net. */
export const VIEW_MODES = {
  'pho-bien': { code: '1', label: 'Phổ biến' },
  'bac-phai': { code: '2', label: 'Bắc phái' },
  'nam-phai': { code: '3', label: 'Nam phái' },
  'tong-hop': { code: '4', label: 'Tổng hợp' },
  'phi-tinh': { code: '5', label: 'Phi tinh' },
  'tap-luan': { code: '6', label: 'Tạp luận' },
  'trung-chau': { code: '7', label: 'Trung châu' },
} as const;

export type CohocViewMode = keyof typeof VIEW_MODES;

export interface CohocFetchInput {
  /** YYYY-MM-DD dương lịch. */
  solarDate: string;
  gender: Gender;
  /** 0..12 (0 = Tý sớm, 12 = Tý muộn). */
  timeIndex: number;
  viewMode?: CohocViewMode;
  forceRefresh?: boolean;
  /**
   * Tên sao đang tọa thủ từng cung (lấy từ NormalizedChartJSON).
   * Dùng để ưu tiên giữ các đoạn bình giải đúng với lá số này.
   */
  hints?: Partial<Record<PalaceKey, string[]>>;
}

export interface CohocServiceOptions {
  cacheDir?: string;
  /**
   * Nơi cất bản lưu. Mặc định là FileStore trỏ vào `cacheDir` — đủ cho máy cá
   * nhân. Trên Worker, `createCohocService()` truyền KvStore để cache sống dai
   * qua các lần tỉnh isolate.
   */
  store?: CohocStore;
  maxCharsPerPalace?: number;
  maxCharsOverview?: number;
  maxCharsPerDecadal?: number;
  timeoutMs?: number;
  /** TTL cache (ms), mặc định 30 ngày. */
  cacheTtlMs?: number;
  /** Giãn cách tối thiểu giữa 2 request (ms). */
  minIntervalMs?: number;
  /**
   * Sau một lần thất bại, không thử mạng lại trong khoảng này (ms).
   * Mặc định 10 phút. Lý do: cohoc đang chặn thì gọi thêm chỉ làm tình hình tệ
   * hơn, và mỗi lần gọi còn phải chờ 3 lượt retry (~21s) trước khi trả về.
   */
  failureBackoffMs?: number;
  /** Tắt hoàn toàn (dùng khi test offline / bị chặn IP). */
  enabled?: boolean;
  fetchImpl?: typeof fetch;
}

const DEFAULTS: Required<Omit<CohocServiceOptions, 'fetchImpl' | 'store'>> = {
  cacheDir: path.join(process.cwd(), '.cache', 'cohoc'),
  maxCharsPerPalace: 1800,
  // 8 khối tổng quan của cohoc ~3.878 ký tự; 3.000 từng cắt giữa câu khối
  // "Thất tinh định điểm" → LLM bỏ luôn cả khối.
  maxCharsOverview: 4200,
  maxCharsPerDecadal: 700,
  timeoutMs: 25_000,
  cacheTtlMs: 30 * 24 * 60 * 60 * 1000,
  minIntervalMs: 1_200,
  failureBackoffMs: 10 * 60_000,
  enabled: process.env.COHOC_ENABLED !== 'false',
};

/* --------------------------- TIỆN ÍCH HTTP --------------------------- */

function extractHidden(html: string, name: string): string {
  const re = new RegExp(`name="${name}"[^>]*value="([^"]*)"`, 'i');
  const re2 = new RegExp(`value="([^"]*)"[^>]*name="${name}"`, 'i');
  return html.match(re)?.[1] ?? html.match(re2)?.[1] ?? '';
}

function cookieFrom(res: Response): string {
  const raw = res.headers.getSetCookie?.() ?? [];
  return raw.map((c) => c.split(';')[0]).join('; ');
}

/** Trang kết quả thật luôn có các mốc này; trang xếp hàng / 404 thì không. */
function isResultPage(html: string): boolean {
  return html.includes('giaidoan-cung') && html.length > 100_000;
}

/**
 * Trang xếp hàng của cohoc: "Hệ thống đang thực hiện xử lý nghiệp vụ".
 * Trả về số ms server bảo chờ, hoặc null nếu không phải trang này.
 */
function queueWaitMs(html: string): number | null {
  if (!/Xử lý nghiệp vụ/i.test(html) && !/time_redirect/i.test(html)) return null;
  const m = html.match(/var\s+time_redirect\s*=\s*(\d+)/);
  const base = m ? Number(m[1]) : 6000;
  // Cộng thêm biên an toàn: server còn tính cả random 0–2000ms
  return Math.min(Math.max(base, 1500) + 1500, 15_000);
}

/** Giờ (0..12) → giá trị `ddlGio` (1..12, 1 = Tý). */
function timeIndexToDdlGio(timeIndex: number): string {
  return String(timeIndex === 12 ? 1 : timeIndex + 1);
}

/* ------------------------------ SERVICE ------------------------------ */

export class CohocKnowledgeService {
  private opt: Required<Omit<CohocServiceOptions, 'fetchImpl' | 'store'>>;
  private store: CohocStore;
  private fetchImpl: typeof fetch;
  private queue: Promise<unknown> = Promise.resolve();
  private lastCall = 0;
  /** Lần thất bại gần nhất — dùng để backoff, tránh đập vào server đang chặn. */
  private lastFailureAt = 0;

  constructor(options: CohocServiceOptions = {}) {
    this.opt = { ...DEFAULTS, ...options };
    this.store = options.store ?? createFileStore(this.opt.cacheDir);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** Lấy bình giải thô. Không bao giờ throw — lỗi được đẩy vào `warnings`. */
  async fetchTexts(input: CohocFetchInput): Promise<RawClassicalTexts> {
    const viewMode = input.viewMode ?? 'tong-hop';
    const mode = VIEW_MODES[viewMode];

    if (!this.opt.enabled) {
      return this.emptyResult(viewMode, 'COHOC_ENABLED=false — bỏ qua tầng tri thức cổ học.');
    }

    const cacheKey = this.cacheKey(input, viewMode);

    if (!input.forceRefresh) {
      const cached = await this.readCache(cacheKey);
      if (cached) return cached;
    }

    /* Đang trong thời gian backoff: đi thẳng vào đường cứu bằng HTML cũ.
       Không có HTML cũ thì mới thử mạng (thà chậm còn hơn không có gì). */
    const inBackoff =
      this.lastFailureAt > 0 && Date.now() - this.lastFailureAt < this.opt.failureBackoffMs;
    if (inBackoff) {
      const rescued = await this.rescueFromStaleHtml(input, viewMode, mode);
      if (rescued) return rescued;
    }

    try {
      const html = await this.fetchWithRetry(input, mode.code);

      const parsed = parseCohocPage(html, `${BASE}${SOLAR_FORM_PATH}`, mode.label, {
        hints: input.hints,
        maxCharsPerPalace: this.opt.maxCharsPerPalace,
        maxCharsOverview: this.opt.maxCharsOverview,
        maxCharsPerDecadal: this.opt.maxCharsPerDecadal,
      });

      /* KHÔNG cache kết quả không có cung nào.
         Đã xảy ra thật: trang xếp hàng lọt qua guard, parse ra 0 cung, rồi bị ghi
         vào cache 30 ngày → mọi lần sau đọc cache và tưởng cohoc không có dữ liệu.
         Một lần lỗi thoáng qua không được phép thành sự thật lâu dài. */
      if (!Object.keys(parsed.palaces).length) {
        throw new Error('Trang tải về không có bình giải cung nào (trang xếp hàng hoặc đổi cấu trúc).');
      }

      // Ghi HTML thô bằng key KHÔNG version — để đời parser sau vẫn cứu được.
      const rawKey = this.stableKey(input, viewMode);
      await this.store.write(`${rawKey}.html`, html);
      await this.store.write(`${cacheKey}.json`, JSON.stringify(parsed));
      return parsed;
    } catch (err) {
      /* Cứu bằng HTML cũ: mạng hỏng / bị chặn không có nghĩa là phải luận chay.
         Parse lại HTML đã lưu bằng code HIỆN TẠI, nên vẫn được hưởng mọi cải
         tiến parser. Chỉ thị rõ cho người đọc biết dữ liệu không phải bản mới. */
      this.lastFailureAt = Date.now();

      const rescued = await this.rescueFromStaleHtml(input, viewMode, mode);
      if (rescued) return rescued;

      const msg = err instanceof Error ? err.message : String(err);
      return this.emptyResult(
        viewMode,
        `Không lấy được văn bản cổ học: ${msg}. Bản luận chỉ dựa trên lá số đã an — vẫn đầy đủ 12 cung, nhưng thiếu dẫn chiếu sách cổ.`,
      );
    }
  }

  /**
   * POST, chờ nếu server xếp hàng, thử lại tối đa `attempts` lần.
   *
   * Vì sao không retry mù: mỗi lần POST là một lá số được server sinh lại. Thử
   * lại quá nhiều sẽ bị đánh dấu spam (cohoc có hẳn nhánh `ref=ip-spam`), nên
   * giới hạn 3 lần và luôn chờ đúng thời gian server báo.
   */
  private async fetchWithRetry(
    input: CohocFetchInput,
    cachXemCode: string,
    attempts = 3,
  ): Promise<string> {
    let lastReason = 'không rõ';

    for (let i = 0; i < attempts; i++) {
      const { html } = await this.enqueue(() => this.postForm(input, cachXemCode));

      if (isResultPage(html)) return html;

      const wait = queueWaitMs(html);
      if (wait === null) {
        lastReason = 'trang trả về không phải kết quả (có thể bị chặn hoặc đổi cấu trúc)';
        break;
      }

      lastReason = `cohoc.net đang xếp hàng xử lý (báo chờ ~${Math.round(wait / 1000)}s/lần, đã thử ${i + 1}/${attempts})`;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, wait));
    }

    throw new Error(lastReason);
  }

  /** Đọc HTML thô đã lưu (bất kể version parser) và parse lại bằng code hiện tại. */
  private async rescueFromStaleHtml(
    input: CohocFetchInput,
    viewMode: string,
    mode: { code: string; label: string },
  ): Promise<RawClassicalTexts | null> {
    try {
      const entry = await this.store.read(`${this.stableKey(input, viewMode)}.html`);
      if (!entry || !isResultPage(entry.text)) return null;

      const ageHours = Math.floor(entry.ageMs / 3_600_000);
      const ageText =
        ageHours < 1 ? 'vừa tải trong giờ' : ageHours < 24 ? `${ageHours} giờ trước` : `${Math.floor(ageHours / 24)} ngày trước`;

      const parsed = parseCohocPage(entry.text, `${BASE}${SOLAR_FORM_PATH}`, mode.label, {
        hints: input.hints,
        maxCharsPerPalace: this.opt.maxCharsPerPalace,
        maxCharsOverview: this.opt.maxCharsOverview,
        maxCharsPerDecadal: this.opt.maxCharsPerDecadal,
      });

      parsed.fromCache = true;
      parsed.stale = true;
      parsed.warnings.push(
        `Dùng bản lưu ${ageText} — chưa lấy được bản mới từ cohoc.net.`,
      );
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Lấy HTML thô — dùng cho cross-check.
   * Đọc cache trước: fetchTexts đã lưu HTML, nên cross-check không phát
   * sinh request thứ 2 (1 lá số = 1 request tới cohoc.net).
   */
  async fetchRawHtml(input: CohocFetchInput): Promise<{ html: string; finalUrl: string }> {
    const viewMode = input.viewMode ?? 'tong-hop';
    // HTML thô dùng key không-version: cùng một lá số thì cùng một bản lưu, đổi
    // parser không làm mất bản đã tải.
    const key = this.stableKey(input, viewMode);
    const cached = await this.store.read(`${key}.html`);
    if (cached && cached.text.length > 1000) return { html: cached.text, finalUrl: '' };

    const mode = VIEW_MODES[viewMode];
    const res = await this.enqueue(() => this.postForm(input, mode.code));
    await this.store.write(`${key}.html`, res.html);
    return res;
  }

  /** Đối chiếu lá số của ta với bảng trên cohoc. */
  crossCheck(
    html: string,
    ours: Array<{ name: string; branch: string; majorStars: Array<{ name: string }> }>,
  ): string[] {
    return crossCheckChart(ours, parseCohocChartTable(html));
  }

  /* ----------------------------- PRIVATE ----------------------------- */

  private cacheKey(input: CohocFetchInput, viewMode: string): string {
    return createHash('sha1')
      .update(
        `${input.solarDate}|${input.gender}|${input.timeIndex}|${viewMode}|p${PARSER_VERSION}`,
      )
      .digest('hex')
      .slice(0, 16);
  }

  /**
   * Key cho HTML thô — KHÔNG có PARSER_VERSION.
   *
   * Vì sao tách khỏi cacheKey: HTML không phụ thuộc cách bóc. Gộp chung thì mỗi
   * lần đổi parser là mất luôn bản HTML tốt, và khi mạng hỏng không còn gì để cứu.
   */
  private stableKey(input: CohocFetchInput, viewMode: string): string {
    return createHash('sha1')
      .update(`${input.solarDate}|${input.gender}|${input.timeIndex}|${viewMode}|raw`)
      .digest('hex')
      .slice(0, 16);
  }

  private async readCache(key: string): Promise<RawClassicalTexts | null> {
    const entry = await this.store.read(`${key}.json`);
    if (!entry || entry.ageMs > this.opt.cacheTtlMs) return null;
    try {
      const parsed = JSON.parse(entry.text) as RawClassicalTexts;
      // `{}` là truthy → phải kiểm tra có cung thật, nếu không cache rỗng sẽ
      // được coi là hợp lệ và che mất việc phải tải lại.
      if (!parsed?.palaces || !Object.keys(parsed.palaces).length) return null;
      // fromCache là cờ thật, không suy ra từ nội dung warnings
      return { ...parsed, fromCache: true };
    } catch {
      return null;
    }
  }

  /** Serialize + rate-limit để không đập vào server nguồn. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = async () => {
      const wait = this.opt.minIntervalMs - (Date.now() - this.lastCall);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastCall = Date.now();
      return task();
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p as Promise<T>;
  }

  /** GET form → POST form → follow redirect → HTML kết quả. */
  private async postForm(
    input: CohocFetchInput,
    cachXemCode: string,
  ): Promise<{ html: string; finalUrl: string }> {
    const url = `${BASE}${SOLAR_FORM_PATH}`;
    const signal = AbortSignal.timeout(this.opt.timeoutMs);

    const pageRes = await this.fetchImpl(url, {
      headers: { 'user-agent': UA, 'accept-language': 'vi,en;q=0.9' },
      signal,
    });
    if (!pageRes.ok) throw new Error(`GET form thất bại: HTTP ${pageRes.status}`);
    const pageHtml = await pageRes.text();
    const cookie = cookieFrom(pageRes);

    const [y, m, d] = input.solarDate.split('-');

    const body = new URLSearchParams({
      __EVENTTARGET: '',
      __EVENTARGUMENT: '',
      __VIEWSTATE: extractHidden(pageHtml, '__VIEWSTATE'),
      __VIEWSTATEGENERATOR: extractHidden(pageHtml, '__VIEWSTATEGENERATOR'),
      __EVENTVALIDATION: extractHidden(pageHtml, '__EVENTVALIDATION'),
      TokenCSRF: extractHidden(pageHtml, 'TokenCSRF'),
      ddlCachXem: cachXemCode,
      GioiTinh: input.gender === 'nam' ? 'rdNam' : 'rdNu',
      ddlNgay: String(Number(d)),
      ddlThang: String(Number(m)),
      ddlNam: String(Number(y)),
      ddlGio: timeIndexToDdlGio(input.timeIndex),
      btGiaiDoan: 'Giải đoán lá số',
    });

    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        'user-agent': UA,
        'content-type': 'application/x-www-form-urlencoded',
        origin: BASE,
        referer: url,
        cookie,
        'accept-language': 'vi,en;q=0.9',
      },
      body: body.toString(),
      signal,
    });

    if (!res.ok) throw new Error(`POST thất bại: HTTP ${res.status}`);
    const html = await res.text();

    /* KHÔNG kiểm tra `noi-dung` ở đây: trang xếp hàng của cohoc cũng chứa chuỗi
       đó (class CSS của template 404), nên guard này cho qua rồi parser nhận
       trang rỗng. Việc phân loại trang do fetchWithRetry lo, dựa trên
       `giaidoan-cung` — dấu hiệu chỉ có ở trang kết quả thật. */
    return { html, finalUrl: res.url || url };
  }

  private emptyResult(viewMode: string, warning: string): RawClassicalTexts {
    return {
      sourceUrl: `${BASE}${SOLAR_FORM_PATH}`,
      fetchedAt: new Date().toISOString(),
      viewMode: VIEW_MODES[viewMode as CohocViewMode]?.label ?? viewMode,
      title: '',
      identity: {},
      overview: [],
      bodyPalace: [],
      palaces: {},
      decadal: {},
      annual: [],
      metrics: null,
      extras: null,
      stats: { rawChars: 0, cleanedChars: 0, passageCount: 0, dedupedCount: 0, truncatedCount: 0 },
      warnings: [warning],
    };
  }
}

/**
 * Service dùng đúng nơi lưu của môi trường đang chạy.
 * Local → FileStore ở `.cache/cohoc` (giữ nguyên như trước). Worker → KV, vì đĩa của
 * workerd chỉ là RAM trong isolate và sẽ mất khi tỉnh dậy.
 */
export async function createCohocService(options: CohocServiceOptions = {}): Promise<CohocKnowledgeService> {
  const store = await createCohocStore();
  return new CohocKnowledgeService(store ? { ...options, store } : options);
}
