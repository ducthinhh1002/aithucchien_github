import express from 'express';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeSchema, chatSchema, mealPlanSchema, normalizeAnalysis, emergencyAnalysis, normalizeMealPlan, safetyMealPlan, hasPortionIndicator, safetyCheck, dailyTarget, chatResponseSchema, normalizeSources, SYSTEM_PROMPT, ANALYZE_PROMPT, CHAT_PROMPT, MEAL_PLAN_PROMPT, ESTIMATE_NOTE } from './nutrition.js';

const appDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Existing process env wins; local .env wins over repo-level ../../.env.
// quiet prevents dotenv logging; no request bodies, images or gateway keys are logged.
dotenv.config({ path: [path.join(appDirectory, '.env'), path.resolve(appDirectory, '../../.env')], quiet: true });
const GATEWAY_URL = 'https://api.thucchien.ai/chat/completions';

class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export function createRateLimiter({ maxEntries = 2000, limit = 20, windowMs = 60_000, now = Date.now } = {}) {
  const clients = new Map();
  const middleware = (req, res, next) => {
    const time = now();
    // Sweep bounded memory on each request, without long-lived timers.
    for (const [key, entry] of clients) if (entry.expires <= time) clients.delete(key);
    const key = req.ip || 'unknown';
    let entry = clients.get(key);
    if (!entry) {
      // Fail closed when saturated rather than evicting live counters.
      if (clients.size >= maxEntries) return res.status(429).set('Retry-After', String(Math.ceil(windowMs / 1000))).json({ error: { code: 'RATE_LIMITED', message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' } });
      entry = { count: 0, expires: time + windowMs };
      clients.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > limit) return res.status(429).set('Retry-After', String(Math.max(1, Math.ceil((entry.expires - time) / 1000)))).json({ error: { code: 'RATE_LIMITED', message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' } });
    next();
  };
  middleware.size = () => clients.size;
  return middleware;
}

function parseCompletion(payload) {
  const choice = payload?.choices?.[0];
  if (choice?.finish_reason === 'length') throw new ApiError(502, 'GATEWAY_RESPONSE_INVALID', 'Phản hồi AI bị cắt ngắn. Vui lòng thử lại.');
  let content = choice?.message?.content;
  if (Array.isArray(content)) content = content.filter((part) => part.type === 'text').map((part) => part.text).join('');
  if (typeof content !== 'string' || content.length > 100_000) throw new ApiError(502, 'GATEWAY_RESPONSE_INVALID', 'Phản hồi AI không hợp lệ.');
  content = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(content); } catch { throw new ApiError(502, 'GATEWAY_RESPONSE_INVALID', 'AI không trả về JSON hợp lệ.'); }
}

export function createApp(options = {}) {
  const app = express();
  const key = options.gatewayKey ?? process.env.GATEWAY_KEY ?? process.env.GATEWAY_key ?? '';
  const model = options.model ?? process.env.GATEWAY_MODEL ?? 'gemini-2.5-flash';
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = Math.min(options.timeoutMs ?? 55_000, 55_000);
  const rateLimiter = createRateLimiter(options.rateLimit);
  app.disable('x-powered-by');
  // Do not trust arbitrary X-Forwarded-For; deployment adapter may set a vetted proxy policy.
  app.set('trust proxy', options.trustProxy ?? false);
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('X-Content-Type-Options', 'nosniff'); next(); });
  app.get('/api/health', (req, res) => res.json({ configured: Boolean(key.trim()) }));
  app.use('/api', rateLimiter);
  app.use('/api', express.json({ limit: '6mb', strict: true }));

  async function gateway(messages, { maxTokens = 3500, controller = new AbortController(), deadline = Date.now() + timeoutMs } = {}) {
    if (!key.trim()) throw new ApiError(503, 'GATEWAY_NOT_CONFIGURED', 'Chưa cấu hình gateway AI.');
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0 || controller.signal.aborted) { controller.abort(); throw new ApiError(504, 'GATEWAY_TIMEOUT', 'Gateway AI quá thời gian chờ.'); }
    let timer;
    let onAbort;
    const timeout = new Promise((resolve, reject) => {
      onAbort = () => reject(new ApiError(504, 'GATEWAY_TIMEOUT', 'Gateway AI quá thời gian chờ.'));
      controller.signal.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => controller.abort(), remainingMs);
    });
    const request = async () => {
      let response;
      try {
        response = await fetchImpl(GATEWAY_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: maxTokens, stream: false, response_format: { type: 'json_object' } }), signal: controller.signal });
      } catch {
        if (controller.signal.aborted) throw new ApiError(504, 'GATEWAY_TIMEOUT', 'Gateway AI quá thời gian chờ.');
        throw new ApiError(502, 'GATEWAY_UNAVAILABLE', 'Không kết nối được gateway AI. Vui lòng thử lại.');
      }
      if (!response.ok) {
        // Never relay provider bodies, headers or auth-related details to the browser.
        try { await response.body?.cancel(); } catch { /* no logging */ }
        throw new ApiError(502, 'GATEWAY_ERROR', 'Gateway AI từ chối yêu cầu. Vui lòng thử lại.');
      }
      try {
        // Bound provider response memory as well as incoming request size.
        const reader = response.body?.getReader();
        if (!reader) throw new Error('Missing body');
        let size = 0;
        const chunks = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 256 * 1024) { await reader.cancel(); throw new Error('Oversized response'); }
          chunks.push(Buffer.from(value));
        }
        return parseCompletion(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(502, 'GATEWAY_RESPONSE_INVALID', 'Phản hồi gateway AI không hợp lệ.');
      }
    };
    try { return await Promise.race([request(), timeout]); }
    finally { clearTimeout(timer); controller.signal.removeEventListener('abort', onAbort); }
  }

  const handler = (schema, analyze) => async (req, res, next) => {
    try {
      const result = schema.safeParse(req.body);
      if (!result.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Dữ liệu yêu cầu không hợp lệ.', fields: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) } });
      const input = result.data;
      const safety = safetyCheck(input.profile, analyze ? input.meal : input.question, input.mealContext || '', ...(input.clarifications || []).flatMap((entry) => [entry.question, entry.answer]));
      if (safety.emergency) return res.json(analyze ? emergencyAnalysis(input.profile, safety) : { answer: safety.flags.join('\n'), safetyFlags: safety.flags });
      const context = JSON.stringify({ profile: input.profile, ...(analyze ? { meal: input.meal, clarifications: input.clarifications || [], portionProvided: hasPortionIndicator(input.meal, input.clarifications) } : { question: input.question, mealContext: input.mealContext }), dailyTarget: dailyTarget(input.profile, safety), deterministicSafetyFlags: safety.flags });
      const content = analyze && input.image ? [{ type: 'text', text: context }, { type: 'image_url', image_url: { url: input.image } }] : context;
      const raw = await gateway([{ role: 'system', content: `${SYSTEM_PROMPT}\n${analyze ? ANALYZE_PROMPT : CHAT_PROMPT}` }, { role: 'user', content }]);
      try {
        if (analyze) return res.json(normalizeAnalysis(raw, input.profile, safety, !hasPortionIndicator(input.meal, input.clarifications)));
        const chat = chatResponseSchema.parse(raw);
        return res.json({ answer: `${safety.flags.length ? safety.flags.join('\n') + '\n\n' : ''}${chat.answer}\n\n${ESTIMATE_NOTE}`, safetyFlags: [...new Set([...safety.flags, ...chat.safetyFlags])] });
      } catch { throw new ApiError(502, 'GATEWAY_RESPONSE_INVALID', 'Cấu trúc phản hồi AI không hợp lệ. Vui lòng thử lại.'); }
    } catch (error) { next(error); }
  };
  app.post('/api/analyze', handler(analyzeSchema, true));
  app.post('/api/chat', handler(chatSchema, false));
  app.post('/api/meal-plan', async (req, res, next) => {
    const controller = new AbortController();
    const deadline = Date.now() + timeoutMs;
    try {
      const result = mealPlanSchema.safeParse(req.body);
      if (!result.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Dữ liệu yêu cầu không hợp lệ.', fields: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) } });
      const input = result.data;
      const safety = safetyCheck(input.profile, input.preferences);
      if (safety.emergency || safety.medical || input.profile.age < 18) return res.json(safetyMealPlan(input.profile, safety));
      const dayNumbers = Array.from({ length: input.days }, (_, index) => index + 1);
      const chunks = [];
      for (let index = 0; index < dayNumbers.length; index += 3) chunks.push(dayNumbers.slice(index, index + 3));
      const plans = new Array(chunks.length);
      let cursor = 0;
      const worker = async () => {
        while (cursor < chunks.length && !controller.signal.aborted) {
          const index = cursor++;
          const context = JSON.stringify({ profile: input.profile, preferences: input.preferences, requestedDays: input.days, dayNumbers: chunks[index], dailyTarget: dailyTarget(input.profile, safety), deterministicSafetyFlags: safety.flags });
          const raw = await gateway([{ role: 'system', content: `${SYSTEM_PROMPT}\n${MEAL_PLAN_PROMPT}` }, { role: 'user', content: context }], { maxTokens: 8000, controller, deadline });
          try { plans[index] = normalizeMealPlan(raw, input.profile, safety, chunks[index]); }
          catch { throw new ApiError(502, 'GATEWAY_RESPONSE_INVALID', 'Thực đơn AI không đầy đủ hoặc không hợp lệ. Vui lòng thử lại.'); }
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, chunks.length) }, () => worker()));
      const first = plans[0];
      const combined = { ...first, days: plans.flatMap((plan) => plan.days), assumptions: [...new Set(plans.flatMap((plan) => plan.assumptions))].slice(0, 30), recommendations: [...new Set(plans.flatMap((plan) => plan.recommendations))].slice(0, 30), safetyFlags: [...new Set(plans.flatMap((plan) => plan.safetyFlags))], sources: normalizeSources(plans.flatMap((plan) => plan.sources)) };
      if (combined.days.length !== input.days || combined.days.some((day, index) => day.day !== index + 1)) throw new ApiError(502, 'GATEWAY_RESPONSE_INVALID', 'Thực đơn AI thiếu ngày. Vui lòng thử lại.');
      return res.json(combined);
    } catch (error) { controller.abort(); next(error); }
  });
  app.use('/api', (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API không tồn tại.' } }));
  if (options.serveDist ?? process.env.NODE_ENV === 'production') {
    const dist = options.distDirectory ?? path.join(appDirectory, 'dist');
    app.use(express.static(dist, { index: false }));
    // Regex route works with Express 4 and 5, unlike the legacy '*' path.
    app.get(/.*/, (req, res, next) => res.sendFile(path.join(dist, 'index.html'), (error) => { if (error) next(error); }));
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === 'entity.too.large') return res.status(413).json({ error: { code: 'BODY_TOO_LARGE', message: 'Yêu cầu quá lớn; ảnh tối đa 4 MiB.' } });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'JSON không hợp lệ.' } });
    const status = error instanceof ApiError ? error.status : error.status === 404 ? 404 : 500;
    res.status(status).json({ error: { code: error instanceof ApiError ? error.code : status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR', message: error instanceof ApiError ? error.message : status === 404 ? 'Không tìm thấy nội dung.' : 'Lỗi máy chủ.' } });
  });
  return app;
}

export default createApp;
