/**
 * lib/tuvi/astrology-agent.service.ts — MODULE 3: AI SYNTHESIS AGENT
 * ---------------------------------------------------------------------------
 * Ghép (NormalizedChartJSON + RawClassicalTexts) → prompt → LLM → TuViFullReport.
 *
 * KIẾN TRÚC: CHIA 4 LẦN GỌI, KHÔNG PHẢI 1.
 *
 * Vì sao: một báo cáo đầy đủ là ~12–15k token JSON. Gọi một phát thì model bị cắt
 * giữa chừng (finishReason=length) và mất trắng; prompt lại phải gánh 33k token
 * văn bản cổ học của cả 12 cung. Chia 4 lần:
 *   (1) meta + overview + actionPlan        — prompt chỉ nạp phần Tổng quan
 *   (2) careerGroup  (Mệnh–Quan–Tài–Di)     — chỉ nạp văn bản 4 cung này
 *   (3) familyGroup  (Phúc–Phu–Tử–Điền)
 *   (4) socialGroup  (Phụ–Huynh–Nô–Tật)
 *
 * Lợi ích: mỗi lần ~8k token prompt thay vì 33k, lỗi cô lập (retry đúng nhóm hỏng),
 * và UI nhận Tổng quan sau ~25s thay vì chờ 4 phút.
 *
 * BA CẠM BẪY PROVIDER ĐÃ XỬ LÝ (xem thêm lib/tuvi/llm.ts):
 *  - Gemini: cần `mode:'json'` + reasoning_effort, không thì tool-mode hoặc cắt cụt.
 *  - Claude compat: cấm `temperature`, json_schema strict không compile nổi schema lớn.
 *  - Cả hai: trả 503/429 khá thường → có chuỗi model dự phòng.
 * ---------------------------------------------------------------------------
 */

import { generateObject, type LanguageModel } from 'ai';
import type { z } from 'zod';
import type { NormalizedChartJSON, PalaceKey, RawClassicalTexts } from '@/types/tuvi';
import {
  TuViFullReportSchema,
  OverviewPartSchema,
  PalaceGroupPartSchema,
  PALACE_GROUPS,
  type TuViFullReport,
} from '@/schemas/report.schema';
import { TUVIAST_SYSTEM_PROMPT, PROMPT_VERSION } from './prompts';
import {
  buildOverviewPrompt,
  buildGroupPrompt,
  buildUserPrompt,
  chatInputSignature,
} from './prompt-builder';
import { getLanguageModel, getModelChain, isModelFallbackError } from './llm';
import { reportCache, makeReportKey, type ReportCache } from './report-cache';
import { checkReportQuality, qualityForClient } from './report-quality';

export interface AgentInput {
  chart: NormalizedChartJSON;
  classical: RawClassicalTexts | null;
  name?: string;
}

export interface AgentOptions {
  /** Bỏ qua chuỗi model từ env, dùng đúng model này (test / mock). */
  model?: LanguageModel;
  temperature?: number;
  maxRetries?: number;
  maxOutputTokens?: number;
  objectMode?: 'json' | 'auto';
  /**
   * 'chunked' (mặc định): 4 lần gọi — Tổng quan + 3 nhóm cung.
   *   Ưu: hiện dần trên UI, lỗi cô lập, retry đúng nhóm hỏng.
   *   Nhược: system prompt + bảng lá số lặp 4 lần → input gấp ~1.8 lần.
   * 'full': 1 lần gọi duy nhất.
   *   Ưu: input rẻ nhất. Nhược: không stream dần, hỏng là hỏng cả báo cáo.
   *   ĐÃ THỬ với Claude: hỏng — "compiled grammar is too large" vì schema 12 cung
   *   vượt giới hạn strict json_schema. Chỉ dùng được với provider không compile
   *   grammar (Gemini json_object, OpenAI json_schema không strict).
   */
  chunkMode?: 'chunked' | 'full';
  /**
   * Bỏ qua cache, buộc sinh lại. Dùng khi người dùng bấm "viết lại".
   * Mặc định đọc từ env REPORT_CACHE (false = tắt hẳn cache).
   */
  forceRefresh?: boolean;
  /** Cache tuỳ biến (test). Mặc định dùng singleton đĩa. */
  cache?: ReportCache;
}

export interface AgentUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  promptVersion: string;
  modelId: string;
  /** Số lần gọi model (4 với báo cáo đầy đủ, 0 khi lấy từ cache). */
  calls: number;
  /** Báo cáo lấy từ cache — không gọi model, không tốn token. */
  cached?: boolean;
  /** Số token tiết kiệm được nhờ cache (bằng totalTokens của lần sinh gốc). */
  savedTokens?: number;
  /** Báo cáo do người dùng dán từ chat web — không tốn token API nào. */
  manual?: boolean;
}

const GROUPS: Array<{ key: 'career' | 'family' | 'social'; keys: readonly PalaceKey[]; label: string }> = [
  { key: 'career', keys: PALACE_GROUPS.career, label: 'PHẦN II — Tam hợp sự nghiệp (Mệnh, Quan Lộc, Tài Bạch, Thiên Di)' },
  { key: 'family', keys: PALACE_GROUPS.family, label: 'PHẦN III — Tam hợp gia đạo (Phúc Đức, Phu Thê, Tử Nữ, Điền Trạch)' },
  { key: 'social', keys: PALACE_GROUPS.social, label: 'PHẦN IV — Quan hệ xã hội & sức khoẻ (Phụ Mẫu, Huynh Đệ, Nô Bộc, Tật Ách)' },
];

/**
 * Cứu JSON khi model trả kèm rác.
 *
 * Vì sao cần: với provider không nhận response_format (Claude compat), model vẫn
 * có thể bọc JSON trong ```json hoặc thêm một câu dẫn. ai-sdk sẽ báo
 * "could not parse the response" dù nội dung đúng. Hàm này bóc vỏ và lấy object.
 */
function repairJsonText({ text }: { text: string }): Promise<string | null> {
  let t = text.trim();

  // Bỏ code fence ```json ... ```
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();

  // Cắt từ { đầu tiên tới } cuối cùng
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) t = t.slice(start, end + 1);

  try {
    JSON.parse(t);
    return Promise.resolve(t);
  } catch {
    return Promise.resolve(null);
  }
}

/** Sắp lại thứ tự cung trong nhóm theo đúng Tam Hợp. */
function orderGroup(list: TuViFullReport['careerGroup'], keys: readonly string[]) {
  return [...list].sort((a, b) => keys.indexOf(a.palaceKey) - keys.indexOf(b.palaceKey));
}

/**
 * Ghép các phần rời thành báo cáo hoàn chỉnh + kiểm tra tính toàn vẹn.
 * Export để đường "nhập từ chat" dùng lại đúng logic sắp xếp + validate này,
 * thay vì viết bản sao rồi lệch nhau.
 */
export function assembleReport(parts: {
  overview: unknown;
  groups: Record<string, unknown>;
}): TuViFullReport {
  const ov = parts.overview as {
    meta: TuViFullReport['meta'];
    overview: TuViFullReport['overview'];
    actionPlan: TuViFullReport['actionPlan'];
    editorialNotes: string[];
  };

  const career = (parts.groups.career as { palaces: TuViFullReport['careerGroup'] }).palaces;
  const family = (parts.groups.family as { palaces: TuViFullReport['familyGroup'] }).palaces;
  const social = (parts.groups.social as { palaces: TuViFullReport['socialGroup'] }).palaces;

  const merged = {
    meta: ov.meta,
    overview: ov.overview,
    careerGroup: orderGroup(career, PALACE_GROUPS.career),
    familyGroup: orderGroup(family, PALACE_GROUPS.family),
    socialGroup: orderGroup(social, PALACE_GROUPS.social),
    actionPlan: ov.actionPlan,
    editorialNotes: ov.editorialNotes ?? [],
  };

  const parsed = TuViFullReportSchema.safeParse(merged);
  if (!parsed.success) {
    throw new Error(
      `Báo cáo ghép không khớp schema: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join(' | ')}`,
    );
  }
  return parsed.data;
}

export class AstrologyAgentService {
  private fixedModel?: LanguageModel;
  private temperature: number;
  private maxRetries: number;
  private maxOutputTokens: number;
  private objectMode: 'json' | 'auto';
  private chunkMode: 'chunked' | 'full';
  private forceRefresh: boolean;
  private cache: ReportCache;

  constructor(options: AgentOptions = {}) {
    this.fixedModel = options.model;
    this.temperature = options.temperature ?? 0.7;
    this.maxRetries = options.maxRetries ?? 2;
    this.maxOutputTokens =
      options.maxOutputTokens ?? Number(process.env.LLM_MAX_OUTPUT_TOKENS ?? 24000);
    this.objectMode =
      options.objectMode ?? ((process.env.LLM_OBJECT_MODE as 'json' | 'auto') || 'json');
    this.chunkMode =
      options.chunkMode ?? ((process.env.LLM_CHUNK_MODE as 'chunked' | 'full') || 'chunked');
    this.forceRefresh = options.forceRefresh ?? false;
    this.cache = options.cache ?? reportCache;
  }

  /**
   * Dựng toàn bộ prompt MỘT LẦN.
   *
   * Vì sao tách ra: khoá cache được hash từ chính các prompt này. Nếu vừa build
   * prompt trong lúc gọi vừa build lại để hash thì hai bên có thể lệch nhau khi
   * prompt-builder đổi hành vi → cache trượt vĩnh viễn mà không ai biết.
   */
  private buildPrompts(input: AgentInput): {
    overview: string;
    groups: Array<{ key: 'career' | 'family' | 'social'; prompt: string; label: string }>;
  } {
    const base = { chart: input.chart, classical: input.classical, name: input.name };
    return {
      overview: buildOverviewPrompt(base),
      groups: GROUPS.map((g) => ({
        key: g.key,
        label: g.label,
        prompt: buildGroupPrompt({ ...base, keys: [...g.keys], groupLabel: g.label }),
      })),
    };
  }

  /**
   * Khoá cache cho một đầu vào.
   *
   * `prompts` phải là ĐÚNG bộ prompt sẽ gửi đi theo chế độ đang chạy — chế độ
   * `full` chỉ gửi một prompt gộp, `chunked` gửi 4. Hash lẫn hai loại là cache
   * trả bản của chế độ kia.
   */
  private cacheKeyOf(input: AgentInput, prompts: string[]) {
    return makeReportKey({
      prompts,
      modelChain: this.fixedModel ? 'fixed' : getModelChain().join(','),
      temperature: this.temperature,
      promptVersion: PROMPT_VERSION,
      mode: this.chunkMode,
    });
  }

  /**
   * Khoá của báo cáo NHẬP TỪ CHAT (dán tay từ claude.ai / gemini…).
   *
   * Không phụ thuộc model: bản viết tay không do model nào sinh ra, nên đổi
   * LLM_MODEL không được làm mất nó. Nhờ vậy một lá số chỉ cần viết tay MỘT lần
   * là phục vụ vô hạn, kể cả sau khi đổi provider.
   */
  private manualKeyOf(input: AgentInput): string {
    return makeReportKey({
      prompts: chatInputSignature(input.chart, input.classical, input.name),
      modelChain: 'chat-manual',
      temperature: 0,
      promptVersion: PROMPT_VERSION,
      mode: 'chat',
    });
  }

  /** Mô tả ngắn để đọc log cache. */
  private signatureOf(input: AgentInput): string {
    const m = input.chart.meta;
    return `${m.solarDate}|${m.gender}|${m.timeName}|y${m.viewingYear}|${input.name ?? ''}`;
  }

  private resolveModels(): Array<{ model: LanguageModel; id: string }> {
    if (this.fixedModel) return [{ model: this.fixedModel, id: 'fixed' }];
    return getModelChain().map((id) => ({ model: getLanguageModel(id), id }));
  }

  /** Gọi 1 lần có fallback model + kiểm tra cắt cụt. */
  private async call<S>(
    schema: z.ZodType<S>,
    prompt: string,
    maxTokens: number,
  ): Promise<{ object: S; modelId: string; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
    const models = this.resolveModels();
    let lastError: unknown;

    for (const { model, id } of models) {
      try {
        const result = await generateObject<S>({
          model,
          schema,
          mode: this.objectMode,
          system: TUVIAST_SYSTEM_PROMPT,
          prompt,
          temperature: this.temperature,
          maxRetries: this.maxRetries,
          maxTokens,
          experimental_repairText: repairJsonText,
        });

        if (result.finishReason === 'length') {
          throw new Error(
            'Model dừng vì hết token (finishReason=length) — JSON bị cắt. Tăng LLM_MAX_OUTPUT_TOKENS.',
          );
        }

        return {
          object: result.object,
          modelId: id,
          usage: {
            promptTokens: result.usage?.promptTokens ?? 0,
            completionTokens: result.usage?.completionTokens ?? 0,
            totalTokens: result.usage?.totalTokens ?? 0,
          },
        };
      } catch (err) {
        lastError = err;
        if (!isModelFallbackError(err)) throw err;
        console.warn(`[agent] model ${id} quá tải/lỗi, thử model kế tiếp…`);
      }
    }
    throw lastError;
  }

  /**
   * Sinh báo cáo đầy đủ (4 lần gọi tuần tự).
   */
  async generateReport(input: AgentInput): Promise<{ report: TuViFullReport; usage: AgentUsage }> {
    const base = { chart: input.chart, classical: input.classical, name: input.name };
    const prompts = this.buildPrompts(input);
    const fullPrompt = this.chunkMode === 'full' ? buildUserPrompt(base) : null;
    const key = this.cacheKeyOf(
      input,
      fullPrompt ? [fullPrompt] : [prompts.overview, ...prompts.groups.map((g) => g.prompt)],
    );

    if (!this.forceRefresh) {
      const hit = await this.cache.get(key);
      if (hit) {
        return {
          report: hit.report,
          usage: { ...hit.usage, calls: 0, cached: true, savedTokens: hit.usage.totalTokens },
        };
      }

      /* Chưa có bản do model viết, nhưng có thể đã có bản người dùng dán từ chat.
         Bản đó dùng được ngay và không tốn đồng nào — không có lý gì phải gọi model. */
      const manual = await this.cache.get(this.manualKeyOf(input));
      if (manual) {
        return {
          report: manual.report,
          usage: { ...manual.usage, calls: 0, cached: true, manual: true },
        };
      }
    }

    if (this.chunkMode === 'full' && fullPrompt) {
      const one = await this.call<TuViFullReport>(
        TuViFullReportSchema,
        fullPrompt,
        this.maxOutputTokens,
      );
      const usage: AgentUsage = {
        promptTokens: one.usage.promptTokens,
        completionTokens: one.usage.completionTokens,
        totalTokens: one.usage.totalTokens,
        promptVersion: PROMPT_VERSION,
        modelId: one.modelId,
        calls: 1,
      };
      await this.cache.set(key, {
        report: one.object,
        usage,
        cachedAt: new Date().toISOString(),
        signature: this.signatureOf(input),
      });
      return { report: one.object, usage };
    }

    const ov = await this.call<unknown>(OverviewPartSchema, prompts.overview, this.maxOutputTokens);
    const groups: Record<string, unknown> = {};
    let calls = 1;
    let promptTokens = ov.usage.promptTokens;
    let completionTokens = ov.usage.completionTokens;

    for (const g of prompts.groups) {
      const part = await this.call<unknown>(PalaceGroupPartSchema, g.prompt, this.maxOutputTokens);
      groups[g.key] = part.object;
      calls++;
      promptTokens += part.usage.promptTokens;
      completionTokens += part.usage.completionTokens;
    }

    const report = assembleReport({ overview: ov.object, groups });

    const usage: AgentUsage = {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      promptVersion: PROMPT_VERSION,
      modelId: ov.modelId,
      calls,
    };

    await this.cache.set(key, {
      report,
      usage,
      cachedAt: new Date().toISOString(),
      signature: this.signatureOf(input),
    });

    return { report, usage };
  }

  /**
   * Stream báo cáo: mỗi lần một phần xong thì đẩy object ghép dở dang lên UI.
   * UI thấy Tổng quan trước, rồi từng nhóm cung — không phải chờ cả báo cáo.
   */
  toSSEStream(input: AgentInput): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const self = this;
    /* Build prompt một lần rồi dùng cho cả khoá cache lẫn các lần gọi — tránh
       trường hợp khoá tính trên prompt A còn gửi prompt B. */
    const prompts = this.buildPrompts(input);
    const key = this.cacheKeyOf(
      input,
      this.chunkMode === 'full'
        ? [buildUserPrompt({ chart: input.chart, classical: input.classical, name: input.name })]
        : [prompts.overview, ...prompts.groups.map((g) => g.prompt)],
    );

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        /** Object dở dang để UI render dần. */
        let partial: Record<string, unknown> = {};

        try {
          /* Cache hit: trả ngay, không gọi model. Vẫn phát 'stage' để UI không
             nhảy thẳng vào trạng thái xong mà không có phản hồi nào. */
          if (!self.forceRefresh) {
            const hit = (await self.cache.get(key)) ?? (await self.cache.get(self.manualKeyOf(input)));
            if (hit) {
              send('stage', { stage: 'cache', label: 'Dùng bản đã luận trước đó…' });
              send('done', hit.report);
              /* Chấm lại trên bản cache: báo cáo cũ sinh trước khi có validator
                 nên không phải lúc nào cũng sạch — chấm là hàm thuần, không tốn
                 token, và bỏ qua thì người dùng không biết đang đọc bản lỗi. */
              send('quality', qualityForClient(checkReportQuality(hit.report, input.chart)));
              send('usage', {
                ...hit.usage,
                calls: 0,
                cached: true,
                savedTokens: hit.usage.totalTokens,
              });
              /* KHÔNG close ở đây: `finally` bên dưới đã close. Gọi hai lần thì
                 lần thứ hai ném "Invalid state: Controller is already closed",
                 làm đứt pipe và client nhận "upstream connect failed" thay vì
                 báo cáo — đúng lỗi đã gặp khi test qua server thật. */
              return;
            }
          }

          send('stage', { stage: 'overview', label: 'Đang viết phần tổng quan…' });
          const ov = await self.call<{
            meta: unknown;
            overview: unknown;
            actionPlan: unknown;
            editorialNotes: unknown;
          }>(OverviewPartSchema, prompts.overview, self.maxOutputTokens);

          partial = {
            meta: ov.object.meta,
            overview: ov.object.overview,
            actionPlan: ov.object.actionPlan,
            editorialNotes: ov.object.editorialNotes,
          };
          send('partial', partial);

          const groups: Record<string, unknown> = {};
          let groupsCount = 0;
          /* Token của các lần gọi nhóm. Phải là biến CỤC BỘ trong closure: để ở
             field của service thì hai request chạy song song sẽ cộng dồn vào nhau. */
          const groupTokens = { prompt: 0, completion: 0 };

          for (const g of prompts.groups) {
            send('stage', { stage: g.key, label: `Đang viết ${g.label.split('—')[1]?.trim() ?? g.key}…` });

            const part = await self.call<{ palaces: unknown[] }>(
              PalaceGroupPartSchema,
              g.prompt,
              self.maxOutputTokens,
            );

            groups[g.key] = part.object;
            groupsCount++;
            groupTokens.prompt += part.usage.promptTokens;
            groupTokens.completion += part.usage.completionTokens;
            partial = {
              ...partial,
              [`${g.key}Group`]: part.object.palaces,
            };
            send('partial', partial);
          }

          const report = assembleReport({ overview: ov.object, groups });

          /* Ghi cache TRƯỚC khi send('done'): nếu client ngắt giữa chừng thì bản
             đã viết vẫn còn, lần sau không phải trả tiền lại. */
          const usage: AgentUsage = {
            promptTokens: ov.usage.promptTokens + groupTokens.prompt,
            completionTokens: ov.usage.completionTokens + groupTokens.completion,
            totalTokens: ov.usage.totalTokens + groupTokens.prompt + groupTokens.completion,
            promptVersion: PROMPT_VERSION,
            modelId: ov.modelId,
            calls: 1 + groupsCount,
          };
          await self.cache.set(key, {
            report,
            usage,
            cachedAt: new Date().toISOString(),
            signature: self.signatureOf(input),
          });

          send('done', report);
          /*
           * Bước kiểm cuối cùng — và là chỗ CẦN nhất: đường này gọi model bằng
           * tiền thật, nên để lỗi tới tay người dùng rồi mới phát hiện là đã trả
           * tiền cho bản hỏng. Vẫn KHÔNG chặn (báo cáo đã sinh xong, ghi cache
           * rồi): trả kèm bảng điểm để người dùng biết đọc lại chỗ nào.
           */
          send('quality', qualityForClient(checkReportQuality(report, input.chart)));
          send('usage', usage);
        } catch (err) {
          send('error', {
            message: err instanceof Error ? err.message : String(err),
            partial,
          });
        } finally {
          controller.close();
        }
      },
    });
  }
}

/** Singleton dùng trong API route. */
export const astrologyAgent = new AstrologyAgentService();
