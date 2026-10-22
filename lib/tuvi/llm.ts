/**
 * lib/tuvi/llm.ts
 * ---------------------------------------------------------------------------
 * Factory model LLM — provider-agnostic qua giao diện OpenAI-compatible.
 *
 * Đã kiểm chứng với:
 *  - Google Gemini  (https://generativelanguage.googleapis.com/v1beta/openai/)
 *  - OpenAI, DeepSeek, OpenRouter, Together, vLLM tự host...
 *
 * BA CẠM BẪY khi dùng Gemini qua endpoint OpenAI-compatible — đều đã xử lý ở đây:
 *
 * 1. `generateObject`/`streamObject` mặc định dùng TOOL MODE (function calling).
 *    Gemini compat trả về text thường → SDK báo "the tool was not called".
 *    → Ép `mode: 'json'` ở service (xem astrology-agent.service.ts).
 *
 * 2. Gemini 3.x "thinking" ăn hết `max_tokens` trước khi kịp viết nội dung:
 *    request 60 token → finish_reason "length", content rỗng.
 *    → Inject `reasoning_effort` vào body qua fetch wrapper (LLM_REASONING_EFFORT).
 *
 * 3. Model cũ bị retire (gemini-2.5-flash trả 404 với user mới).
 *    → Luôn liệt kê model trước khi đổi, đừng hard-code.
 * ---------------------------------------------------------------------------
 */

import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

export interface LlmConfig {
  apiKey: string;
  baseURL?: string;
  modelId: string;
  /** Field bổ sung nhét vào body request (JSON). */
  extraBody: Record<string, unknown>;
  /** Field phải xoá khỏi body (provider không chấp nhận). */
  stripFields: string[];
  /**
   * Thay json_schema chi tiết bằng schema "mở".
   * Claude compat từ chối minItems > 1 và length cố định. Zod vẫn là hợp đồng
   * thật (validate sau khi parse), nên schema gửi lên chỉ cần đủ để ép JSON.
   */
  looseJsonSchema: boolean;
  /** Bỏ hẳn response_format khỏi request (provider không hỗ trợ schema lớn). */
  dropResponseFormat: boolean;
}

/**
 * Đọc cấu hình từ env. Không throw ở đây — chỉ throw khi thực sự cần gọi model,
 * để `next build` và các trang tĩnh không nổ khi thiếu key.
 */
export function readLlmConfig(): LlmConfig {
  const apiKey = process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY ?? '';
  const baseURL = process.env.LLM_BASE_URL || undefined;
  const modelId = process.env.LLM_MODEL ?? 'gpt-4o-mini';

  if (!apiKey) {
    throw new Error(
      'Thiếu LLM_API_KEY. Tạo file .env.local với: LLM_API_KEY=... (và tuỳ chọn LLM_BASE_URL, LLM_MODEL)',
    );
  }

  /* reasoning_effort: chỉ gửi khi được cấu hình, để không phá provider không hỗ trợ. */
  const extraBody: Record<string, unknown> = {};
  void extraBody;
  const effort = process.env.LLM_REASONING_EFFORT;
  if (effort) extraBody.reasoning_effort = effort;

  const extraJson = process.env.LLM_EXTRA_BODY;
  if (extraJson) {
    try {
      Object.assign(extraBody, JSON.parse(extraJson));
    } catch {
      console.warn('[llm] LLM_EXTRA_BODY không phải JSON hợp lệ, bỏ qua');
    }
  }

  /**
   * Field cần xoá khỏi body.
   * Claude 5.x qua endpoint compat trả 400 "`temperature` is deprecated" → phải bỏ.
   * Cấu hình thêm bằng LLM_STRIP_FIELDS (phẩy phân cách).
   */
  const stripFields = (process.env.LLM_STRIP_FIELDS ?? '')
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);
  if (!stripFields.length && /anthropic\.com/.test(baseURL ?? '')) {
    stripFields.push('temperature');
  }

  // Mặc định KHÔNG nới schema: giữ nguyên schema thật để API ép cấu trúc.
  // Chỉ bật khi provider từ chối schema của ta (xem README mục "Tương thích provider").
  const looseJsonSchema = process.env.LLM_LOOSE_JSON_SCHEMA === 'true';
  const dropResponseFormat = process.env.LLM_DROP_RESPONSE_FORMAT === 'true';

  return { apiKey, baseURL, modelId, extraBody, stripFields, looseJsonSchema, dropResponseFormat };
}

/**
 * Bỏ các keyword mà một số provider từ chối trong json_schema strict mode.
 *
 * Claude compat trả 400 với `maxItems` (không hỗ trợ) và `minItems > 1`.
 * Ta KHÔNG nới Zod — Zod vẫn là hợp đồng thật, validate sau khi parse. Chỉ làm
 * sạch bản schema gửi lên để provider chấp nhận.
 */
function sanitizeJsonSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeJsonSchema);
  if (!node || typeof node !== 'object') return node;

  const obj = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  /** Keyword Claude strict mode từ chối (đã kiểm chứng bằng lỗi 400 thật). */
  const DROP = new Set([
    'maxItems',
    'maxLength',
    'maxProperties',
    'maximum',
    'minimum',
    'exclusiveMaximum',
    'exclusiveMinimum',
    'uniqueItems',
    'pattern',
  ]);

  for (const [k, v] of Object.entries(obj)) {
    if (DROP.has(k)) continue;
    if (k === 'minItems' || k === 'minProperties') {
      const n = Number(v);
      out[k] = Number.isFinite(n) && n > 1 ? 1 : n;
      continue;
    }
    out[k] = sanitizeJsonSchema(v);
  }
  return out;
}

/**
 * Chèn / xoá field trong body JSON mà không cần SDK hỗ trợ.
 * Nhờ lớp này mà cùng một service chạy được với Gemini (cần reasoning_effort)
 * và Claude (cấm temperature) mà không phải rẽ nhánh ở tầng nghiệp vụ.
 */
function makeFetch(
  extra: Record<string, unknown>,
  strip: string[],
  looseJsonSchema: boolean,
  dropResponseFormat: boolean,
): typeof fetch {
  if (!Object.keys(extra).length && !strip.length && !looseJsonSchema && !dropResponseFormat) {
    return fetch;
  }

  return async (input, init) => {
    if (init?.body && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body) as Record<string, unknown>;
        for (const k of strip) delete body[k];
        for (const [k, v] of Object.entries(extra)) {
          if (!(k in body)) body[k] = v;
        }

        const rf = body.response_format as
          | { type?: string; json_schema?: { name?: string; schema?: unknown; strict?: boolean } }
          | undefined;

        /**
         * LLM_DROP_RESPONSE_FORMAT: bỏ hẳn response_format.
         * Claude compat không dùng được json_schema strict với schema lớn
         * ("compiled grammar is too large"), nên để prompt ép JSON và Zod
         * kiểm tra sau. Chỉ bật cho provider gặp giới hạn này.
         */
        if (dropResponseFormat) {
          delete body.response_format;
        } else if (rf?.type === 'json_schema' && rf.json_schema) {
          rf.json_schema.schema = looseJsonSchema
            ? { type: 'object', properties: {}, additionalProperties: true }
            : sanitizeJsonSchema(rf.json_schema.schema);
        }

        init = { ...init, body: JSON.stringify(body) };
      } catch {
        /* body không phải JSON → để nguyên */
      }
    }
    return fetch(input, init);
  };
}

let cached: { key: string; model: LanguageModel } | null = null;

/** Trả về model đã cấu hình (cache theo apiKey + baseURL + model + extraBody). */
export function getLanguageModel(modelIdOverride?: string): LanguageModel {
  const cfg = readLlmConfig();
  if (modelIdOverride) cfg.modelId = modelIdOverride;
  const key = `${cfg.apiKey.slice(-6)}|${cfg.baseURL ?? ''}|${cfg.modelId}|${JSON.stringify(cfg.extraBody)}|${cfg.stripFields.join(',')}`;
  if (cached?.key === key) return cached.model;

  const provider = createOpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseURL,
    // Nhiều provider không hỗ trợ "responses API" → ép dùng chat completions
    compatibility: 'compatible',
    fetch: makeFetch(cfg.extraBody, cfg.stripFields, cfg.looseJsonSchema, cfg.dropResponseFormat),
  });

  /**
   * structuredOutputs: bắt buộc với Claude qua endpoint compat — nó chỉ nhận
   * response_format.type = 'json_schema', không nhận 'json_object'.
   * Với provider khác, cờ này vô hại (chỉ đổi định dạng gửi schema).
   */
  const structured = process.env.LLM_STRUCTURED_OUTPUTS !== 'false';
  const model = structured
    ? provider(cfg.modelId, { structuredOutputs: true } as never)
    : provider(cfg.modelId);
  cached = { key, model };
  return model;
}

/** Model ID đang dùng — để log/telemetry. */
export function currentModelId(): string {
  return process.env.LLM_MODEL ?? 'gpt-4o-mini';
}

/**
 * Chuỗi model dự phòng: primary → LLM_MODEL_FALLBACKS (phẩy phân cách).
 *
 * Vì sao cần: Gemini free tier trả 503 "high demand" khá thường xuyên. Không có
 * fallback thì một lá số đang stream dở sẽ chết giữa đường và người dùng mất
 * toàn bộ phần đã luận.
 */
export function getModelChain(): string[] {
  const primary = currentModelId();
  const fallbacks = (process.env.LLM_MODEL_FALLBACKS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [primary, ...fallbacks.filter((m) => m !== primary)];
}

/** Lỗi có nên thử model kế tiếp không (quá tải / hết quota / mạng). */
export function isModelFallbackError(err: unknown): boolean {
  const e = err as { statusCode?: number; isRetryable?: boolean; message?: string; cause?: unknown };
  const code = e?.statusCode ?? (e?.cause as { statusCode?: number })?.statusCode;
  if (code === 429 || code === 503 || code === 500 || code === 502 || code === 504) return true;
  if (e?.isRetryable === true) return true;
  const msg = String(e?.message ?? '');
  return /high demand|overloaded|unavailable|rate limit|quota/i.test(msg);
}
