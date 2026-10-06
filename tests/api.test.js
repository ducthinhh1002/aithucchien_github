import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp, createRateLimiter } from '../server/app.js';
import { analyzeSchema, chatSchema, safetyCheck, dailyTarget, normalizeAnalysis, normalizeSources, ALLOWED_SOURCES, profileSchema, mealPlanSchema, hasPortionIndicator, normalizeMealPlan } from '../server/nutrition.js';

const profile = { age: 25, weight: 65, height: 170, sex: 'male', goal: 'maintain', activity: 'moderate', sports: ['Chạy bộ'], sessionMinutes: 45 };
const meal = { profile, meal: 'Một bát cơm với gà' };
const analysis = { title: 'Bữa cơm', summary: 'Ước lượng bữa ăn', confidence: 'high', totals: { calories: 500, protein: 30, carbs: 60, fat: 15 }, items: [{ name: 'Cơm gà', portion: '1 bát', calories: 500, protein: 30, carbs: 60, fat: 15, note: 'Khẩu phần chưa rõ' }], assumptions: [], recommendations: ['Bổ sung rau'], questions: ['Bao nhiêu gram?'], safetyFlags: [], sources: [] };
const completion = (value) => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

async function withApi(options, run) {
  const server = createApp({ gatewayKey: 'unit-test-key', serveDist: false, ...options }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (route, body) => {
    const response = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json(), headers: response.headers };
  };
  try { await run({ base, post }); }
  finally { await new Promise((resolve, reject) => { server.close((error) => error ? reject(error) : resolve()); server.closeAllConnections(); }); }
}

test('validation rejects malformed profile, overlong strings, unknown fields and remote images', () => {
  assert.equal(analyzeSchema.safeParse(meal).success, true);
  assert.equal(analyzeSchema.safeParse({ ...meal, profile: { ...profile, height: undefined, sex: 'unspecified' } }).success, false);
  for (const patch of [{ age: 17.5 }, { age: 0 }, { weight: 0 }, { weight: '65' }, { height: 999 }, { sex: 'other' }, { goal: 'cut' }, { activity: 'low' }, { sport: 'Chạy bộ' }, { sports: [] }, { sports: ['unknown'] }, { sports: ['Chạy bộ', 'Chạy bộ'] }, { sports: 'Chạy bộ' }, { sessionMinutes: 9 }, { sessionMinutes: 301 }, { sessionMinutes: 60.5 }, { sessionMinutes: undefined }, { age: 9 }, { age: 101 }, { weight: 24 }, { weight: 301 }, { height: 99 }, { height: 251 }, { goal: 'custom' }, { goal: 'custom', customGoal: '  ' }, { customGoal: 'x'.repeat(501) }, { medicalHistory: 'private' }]) {
    assert.equal(analyzeSchema.safeParse({ ...meal, profile: { ...profile, ...patch } }).success, false);
  }
  for (const image of ['https://example.com/photo.jpg', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,ZmFrZQ==']) assert.equal(analyzeSchema.safeParse({ ...meal, image }).success, false);
  assert.equal(analyzeSchema.safeParse({ ...meal, image: tinyPng }).success, true);
  assert.equal(analyzeSchema.safeParse({ ...meal, meal: 'a'.repeat(6001) }).success, false);
  assert.equal(chatSchema.safeParse({ profile, question: '  ' }).success, false);
});

test('deterministic safety covers accented/unaccented Vietnamese and English emergency terms', () => {
  for (const text of ['Tôi bị đau ngực', 'kho tho', 'vừa ngất', 'fainted', 'shortness of breath', 'co giat', 'đột quỵ', 'người bất tỉnh']) {
    const safety = safetyCheck(profile, text);
    assert.equal(safety.emergency, true, text);
    assert.match(safety.flags[0], /115/);
    assert.match(safety.flags[0], /không phải chẩn đoán/);
  }
});

test('safety avoids common idioms, partial words and explicit symptom negations', () => {
  for (const text of ['Ăn ngon ngất ngây', 'Tôi ngắt kết nối', 'Bài tập thuộc nhóm sức bền', 'Không đau ngực, không khó thở', 'No chest pain']) {
    const safety = safetyCheck(profile, text);
    assert.equal(safety.emergency, false, text);
    assert.equal(safety.medical, false, text);
  }
  assert.equal(safetyCheck(profile, 'ĐAU NGỰC').emergency, true);
  assert.equal(safetyCheck(profile, 'Không đau ngực nhưng tôi bị khó thở').emergency, true);
  assert.equal(safetyCheck(profile, 'Tôi đang uống thuốc').medical, true);
});

test('daily target never calculated for minors, missing sex/height or medical context', () => {
  const child = { ...profile, age: 17 };
  for (const [p, text] of [[child, 'cơm'], [{ ...profile, height: undefined }, 'cơm'], [{ ...profile, sex: 'unspecified' }, 'cơm'], [profile, 'Tôi đang mang thai'], [profile, 'Tôi bị bệnh thận'], [profile, 'breastfeeding'], [profile, 'đau ngực']]) {
    const target = dailyTarget(p, safetyCheck(p, text));
    assert.equal(target.calories, null);
    assert.equal(target.proteinMin, null);
    assert.equal(target.proteinMax, null);
  }
  const target = dailyTarget(profile, safetyCheck(profile, 'cơm'));
  assert.equal(target.calories, Math.round((650 + 1062.5 - 125 + 5) * 1.55));
  assert.match(target.note, /Ước lượng, chưa kiểm chứng/);
});

test('normalization overrides model targets, estimated and fake source metadata', () => {
  const safety = safetyCheck(profile, 'cơm');
  const raw = { ...analysis, estimated: false, dailyTarget: { calories: 9999 }, sources: [{ title: 'Fake quote p42', url: ALLOWED_SOURCES[1].url, note: 'Verified 500 calories exact' }, { title: 'Evil', url: 'https://viendinhduong.vn.evil.com/table' }, { title: 'Unknown', url: 'https://example.com' }] };
  const value = normalizeAnalysis(raw, profile, safety);
  assert.equal(value.estimated, true);
  assert.equal(value.confidence, 'medium');
  assert.match(value.summary, /chưa kiểm chứng/);
  assert.match(value.items[0].note, /chưa kiểm chứng/);
  assert.notEqual(value.dailyTarget.calories, 9999);
  assert.deepEqual(value.sources, [ALLOWED_SOURCES[1]]);
  assert.equal(normalizeSources([{ url: 'https://viendinhduong.vn/news/unknown' }])[0].url, 'https://viendinhduong.vn');
  assert.equal(normalizeSources([{ url: 'https://evil@viendinhduong.vn' }, { url: 'http://viendinhduong.vn' }, { url: 'https://doi.org/10.1093/ajcn/51.2.241?fake=1' }]).length, 0);
  assert.throws(() => normalizeAnalysis({ ...analysis, totals: { calories: -5 } }, profile, safety));
});

test('health reports configured only; analyze text forwards gateway contract and returns normalized response', async () => {
  let called = 0;
  await withApi({ fetchImpl: async (url, options) => {
    called += 1;
    assert.equal(url, 'https://api.thucchien.ai/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer unit-test-key');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'gemini-2.5-flash');
    assert.equal(typeof body.messages[1].content, 'string');
    assert.equal(JSON.parse(body.messages[1].content).meal, meal.meal);
    return completion(analysis);
  } }, async ({ base, post }) => {
    const health = await fetch(base + '/api/health');
    assert.deepEqual(await health.json(), { configured: true });
    assert.equal(health.headers.get('cache-control'), 'no-store');
    const result = await post('/api/analyze', meal);
    assert.equal(result.status, 200);
    assert.equal(result.data.estimated, true);
    assert.equal(result.data.items.length, 1);
    assert.equal(called, 1);
  });
});

test('missing nutrient fields normalize to null and minor targets cannot be injected by model', () => {
  const p = { ...profile, age: 12 };
  const value = normalizeAnalysis({ title: 'Thiếu dữ liệu', summary: 'Cần hỏi lại khẩu phần', items: [{ name: 'Cơm' }], dailyTarget: { calories: 1800, proteinMin: 70, proteinMax: 100 }, estimated: false }, p, safetyCheck(p, 'cơm'));
  assert.deepEqual(value.totals, { calories: null, protein: null, carbs: null, fat: null });
  assert.equal(value.items[0].calories, null);
  assert.equal(value.dailyTarget.calories, null);
  assert.equal(value.dailyTarget.proteinMin, null);
  assert.equal(value.estimated, true);
});

test('gateway key supports lowercase alias and uppercase takes precedence', async () => {
  const upper = process.env.GATEWAY_KEY;
  const lower = process.env.GATEWAY_key;
  try {
    delete process.env.GATEWAY_KEY;
    process.env.GATEWAY_key = 'alias-test-key';
    await withApi({ gatewayKey: undefined, fetchImpl: async (url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer alias-test-key');
      return completion(analysis);
    } }, async ({ post }) => { assert.equal((await post('/api/analyze', meal)).status, 200); });
    process.env.GATEWAY_KEY = 'uppercase-test-key';
    await withApi({ gatewayKey: undefined, fetchImpl: async (url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer uppercase-test-key');
      return completion(analysis);
    } }, async ({ post }) => { assert.equal((await post('/api/analyze', meal)).status, 200); });
  } finally {
    if (upper === undefined) delete process.env.GATEWAY_KEY; else process.env.GATEWAY_KEY = upper;
    if (lower === undefined) delete process.env.GATEWAY_key; else process.env.GATEWAY_key = lower;
  }
});

test('image analyze sends documented text and image_url content parts with data URL', async () => {
  await withApi({ fetchImpl: async (url, options) => {
    const body = JSON.parse(options.body);
    const parts = body.messages[1].content;
    assert.equal(parts[0].type, 'text');
    assert.deepEqual(parts[1], { type: 'image_url', image_url: { url: tinyPng } });
    return completion(analysis);
  } }, async ({ post }) => { assert.equal((await post('/api/analyze', { ...meal, image: tinyPng })).status, 200); });
});

test('chat returns answer and deterministic flags; medical targets are null in prompt', async () => {
  await withApi({ fetchImpl: async (url, options) => {
    const context = JSON.parse(JSON.parse(options.body).messages[1].content);
    assert.equal(context.dailyTarget.calories, null);
    return completion({ answer: 'Trao đổi với chuyên gia y tế để cá nhân hóa.', safetyFlags: [] });
  } }, async ({ post }) => {
    const result = await post('/api/chat', { profile, question: 'Tôi đang mang thai, nên ăn gì?', mealContext: 'Cơm gà' });
    assert.equal(result.status, 200);
    assert.match(result.data.answer, /Thai kỳ/);
    assert.match(result.data.answer, /chưa kiểm chứng/);
    assert.equal(result.data.safetyFlags.length, 1);
  });
});

test('emergency analyze and chat short circuit gateway even when unconfigured', async () => {
  await withApi({ gatewayKey: '', fetchImpl: () => { throw new Error('Must not call'); } }, async ({ post }) => {
    const analyze = await post('/api/analyze', { ...meal, meal: 'Sau khi ăn tôi đau ngực và khó thở' });
    assert.equal(analyze.status, 200);
    assert.match(analyze.data.summary, /115/);
    assert.equal(analyze.data.dailyTarget.calories, null);
    assert.equal(analyze.data.totals.calories, null);
    const chat = await post('/api/chat', { profile, question: 'Tôi vừa ngất' });
    assert.equal(chat.status, 200);
    assert.match(chat.data.answer, /115/);
  });
});

test('missing key returns 503 without fake nutrition fallback', async () => {
  await withApi({ gatewayKey: '' }, async ({ base, post }) => {
    assert.deepEqual(await (await fetch(base + '/api/health')).json(), { configured: false });
    const result = await post('/api/analyze', meal);
    assert.equal(result.status, 503);
    assert.equal(result.data.error.code, 'GATEWAY_NOT_CONFIGURED');
    assert.equal(result.data.totals, undefined);
  });
});

test('validation and malformed JSON return 400 without calling provider', async () => {
  await withApi({ fetchImpl: () => { throw new Error('Must not call'); } }, async ({ base, post }) => {
    const invalid = await post('/api/analyze', { ...meal, profile: { ...profile, weight: -1 } });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.data.error.fields[0].path, 'profile.weight');
    const malformed = await fetch(base + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).error.code, 'INVALID_JSON');
  });
});

test('gateway HTTP and network errors are sanitized; no fake success', async () => {
  for (const mock of [async () => new Response('SECRET health history', { status: 401 }), async () => { throw new Error('unit-test-key and private history'); }]) {
    await withApi({ fetchImpl: mock }, async ({ post }) => {
      const result = await post('/api/analyze', meal);
      assert.equal(result.status, 502);
      assert.equal(result.data.estimated, undefined);
      assert.doesNotMatch(JSON.stringify(result.data), /unit-test-key|SECRET|private history/);
    });
  }
});

test('invalid and oversized gateway responses return 502', async () => {
  for (const mock of [async () => completion({ bogus: true }), async () => new Response('not JSON'), async () => new Response('x'.repeat(256 * 1024 + 1)), async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }))]) {
    await withApi({ fetchImpl: mock }, async ({ post }) => {
      const result = await post('/api/analyze', meal);
      assert.equal(result.status, 502);
      assert.equal(result.data.error.code, 'GATEWAY_RESPONSE_INVALID');
    });
  }
});

test('timeout aborts request and returns 504 even if mocked fetch ignores abort', async () => {
  let signal;
  await withApi({ timeoutMs: 15, fetchImpl: (url, options) => { signal = options.signal; return new Promise(() => {}); } }, async ({ post }) => {
    const result = await post('/api/analyze', meal);
    assert.equal(result.status, 504);
    assert.equal(result.data.error.code, 'GATEWAY_TIMEOUT');
    assert.equal(signal.aborted, true);
  });
});

test('API rate limiting rejects excess requests and body limit rejects huge image bodies', async () => {
  await withApi({ rateLimit: { limit: 1 }, fetchImpl: async () => completion(analysis) }, async ({ post }) => {
    assert.equal((await post('/api/analyze', meal)).status, 200);
    const limited = await post('/api/analyze', meal);
    assert.equal(limited.status, 429);
    assert.ok(limited.headers.get('retry-after'));
  });
  await withApi({}, async ({ post }) => {
    const result = await post('/api/analyze', { ...meal, image: 'a'.repeat(6 * 1024 * 1024 + 100) });
    assert.equal(result.status, 413);
  });
});

test('rate limiter bounds client map and releases expired entries without timers', () => {
  let time = 0;
  const limiter = createRateLimiter({ maxEntries: 2, limit: 2, windowMs: 1000, now: () => time });
  const invoke = (ip) => {
    let status = 200;
    const res = { status(value) { status = value; return this; }, set() { return this; }, json() { return this; } };
    limiter({ ip }, res, () => {});
    return status;
  };
  assert.equal(invoke('a'), 200);
  assert.equal(invoke('b'), 200);
  assert.equal(invoke('c'), 429);
  assert.equal(limiter.size(), 2);
  time = 1001;
  assert.equal(invoke('c'), 200);
  assert.equal(limiter.size(), 1);
});

const planFixture = (dayNumbers) => ({ title: 'Thực đơn tham khảo', summary: 'Món Việt cân đối', days: dayNumbers.map(day => ({ day, meals: ['Bữa sáng', 'Bữa trưa', 'Bữa tối'].map(name => ({ name, time: 'Theo lịch tập', foods: [{ name: 'Cơm', portion: '150 g (chín)' }, { name: 'Đậu phụ và rau', portion: '200 g (chín)' }], note: 'Điều chỉnh theo cảm giác đói và buổi chạy.' })) })), assumptions: ['Tập sau giờ làm'], recommendations: ['Ăn đa dạng'], safetyFlags: [], sources: [{ title: 'fake', url: ALLOWED_SOURCES[0].url, note: 'fake quote' }, { title: 'evil', url: 'https://example.com' }] });
const planInput = { profile, preferences: 'Món Việt dễ nấu', days: 3 };

test('profile custom goal, sports and session boundaries; clarification schema strict and bounded', () => {
  assert.equal(profileSchema.safeParse({ ...profile, goal: 'custom', customGoal: 'Bền sức cho buổi chạy', sports: ['Chạy bộ', 'Yoga / Pilates'], sessionMinutes: 300 }).success, true);
  assert.equal(profileSchema.safeParse({ ...profile, age: 10, weight: 25, height: 100, sessionMinutes: 10 }).success, true);
  const entry = { question: 'Khẩu phần?', answer: 'Bát to' };
  assert.equal(analyzeSchema.safeParse({ ...meal, clarifications: [entry] }).success, true);
  for (const clarifications of [Array(6).fill(entry), [{ ...entry, answer: ' ' }], [{ ...entry, question: 'x'.repeat(1001) }], [{ ...entry, answer: 'x'.repeat(1501) }], [{ ...entry, unknown: true }]]) assert.equal(analyzeSchema.safeParse({ ...meal, clarifications }).success, false);
  for (const patch of [{ days: 0 }, { days: 16 }, { days: 1.5 }, { days: '3' }, { preferences: '' }, { preferences: 'x'.repeat(1501) }, { unknown: true }]) assert.equal(mealPlanSchema.safeParse({ ...planInput, ...patch }).success, false);
});

test('portion guard requires an indicator anywhere in meal or answers, never question alone', () => {
  for (const text of ['1 suất phở', 'Một suất phở', '1 tô phở', 'Tôi vừa ăn phở', 'Vừa ăn 1 tô phở', 'phở', 'Một phần cơm']) assert.equal(hasPortionIndicator(text), false, text);
  for (const text of ['1 bát phở', 'Một bát cơm', '150 g cơm', '100gram', '200 ml sữa', 'bát to', 'tô nhỏ', 'tô phở to', 'suất vừa', 'kích thước to', 'phở nhỏ', 'size large', 'half bowl']) assert.equal(hasPortionIndicator(text), true, text);
  assert.equal(hasPortionIndicator('1 suất phở', [{ question: 'Bao nhiêu gram, bát to hay nhỏ?', answer: 'Không biết' }]), false);
  assert.equal(hasPortionIndicator('1 suất phở', [{ question: 'Kích thước?', answer: 'Bát to' }]), true);
  for (const answer of ['to', 'nhỏ', 'vừa', '150 g']) assert.equal(hasPortionIndicator('1 suất phở', [{ question: 'Kích thước?', answer }]), true);
  assert.equal(hasPortionIndicator('1 suất phở', [{ question: 'Kích thước?', answer: 'Tôi vừa ăn một tô' }]), false);
});

test('vague meal enforces clarification and nulls even an overconfident fabricated response; image retained after answers', async () => {
  let calls = 0;
  await withApi({ fetchImpl: async (url, options) => {
    calls++;
    const body = JSON.parse(options.body);
    const content = body.messages[1].content;
    if (calls === 2) {
      assert.deepEqual(content[1], { type: 'image_url', image_url: { url: tinyPng } });
      const context = JSON.parse(content[0].text);
      assert.equal(context.clarifications[0].answer, 'Bát to, 200 g bánh phở chín');
      assert.equal(context.portionProvided, true);
      assert.deepEqual(context.profile.sports, ['Chạy bộ', 'Bơi lội']);
      assert.equal(context.profile.sessionMinutes, 90);
      assert.equal(context.profile.customGoal, 'Bền sức');
    }
    return completion({ ...analysis, questions: [], needsClarification: false });
  } }, async ({ post }) => {
    const vague = await post('/api/analyze', { profile, meal: '1 suất phở' });
    assert.equal(vague.data.needsClarification, true);
    assert.deepEqual(vague.data.totals, { calories: null, protein: null, carbs: null, fat: null });
    assert.equal(vague.data.items[0].calories, null);
    assert.equal(vague.data.items[0].protein, null);
    assert.ok(vague.data.questions.length > 0);
    const clarified = await post('/api/analyze', { profile: { ...profile, goal: 'custom', customGoal: 'Bền sức', sports: ['Chạy bộ', 'Bơi lội'], sessionMinutes: 90 }, meal: '1 suất phở', image: tinyPng, clarifications: [{ question: vague.data.questions[0], answer: 'Bát to, 200 g bánh phở chín' }] });
    assert.equal(clarified.status, 200);
    assert.equal(clarified.data.needsClarification, false);
    assert.equal(clarified.data.totals.calories, 500);
  });
});

test('model low/null confidence still asks after portion clarification; emergency does not ask', async () => {
  for (const confidence of ['low', null]) {
    await withApi({ fetchImpl: async () => completion({ ...analysis, confidence, questions: [] }) }, async ({ post }) => {
      const result = await post('/api/analyze', { ...meal, clarifications: [{ question: 'Kích thước?', answer: 'Bát to' }] });
      assert.equal(result.status, 200);
      assert.equal(result.data.needsClarification, true);
      assert.equal(result.data.totals.calories, null);
      assert.ok(result.data.questions.length);
    });
  }
  await withApi({ fetchImpl: () => { throw new Error('no AI'); } }, async ({ post }) => {
    for (const body of [{ ...meal, clarifications: [{ question: 'Bạn ổn?', answer: 'Đau ngực và khó thở' }] }, { ...meal, profile: { ...profile, goal: 'custom', customGoal: 'Tôi đau ngực' } }]) {
      const result = await post('/api/analyze', body);
      assert.equal(result.data.needsClarification, false);
      assert.deepEqual(result.data.questions, []);
      assert.match(result.data.summary, /115/);
    }
  });
});

test('meal plans 1/3/15 days use fixed Gateway, explicit days, max3 chunks and bounded3 concurrency', async () => {
  for (const days of [1, 3, 15]) {
    let active = 0, peak = 0, calls = 0;
    await withApi({ fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.thucchien.ai/chat/completions');
      assert.equal(options.headers.Authorization, 'Bearer unit-test-key');
      const body = JSON.parse(options.body);
      assert.equal(body.max_tokens, 8000);
      const context = JSON.parse(body.messages[1].content);
      assert.equal(context.requestedDays, days);
      assert.ok(context.dayNumbers.length <= 3);
      assert.equal(context.profile.sessionMinutes, 45);
      assert.deepEqual(context.profile.sports, ['Chạy bộ']);
      assert.equal(context.preferences, planInput.preferences);
      active++; calls++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active--;
      return completion(planFixture(context.dayNumbers));
    } }, async ({ post }) => {
      const result = await post('/api/meal-plan', { ...planInput, days });
      assert.equal(result.status, 200, JSON.stringify(result.data));
      assert.deepEqual(result.data.days.map(day => day.day), Array.from({ length: days }, (_, i) => i + 1));
      assert.equal(result.data.estimated, true);
      assert.deepEqual(result.data.sources, [ALLOWED_SOURCES[0]]);
      assert.ok(result.data.dailyTarget.calories > 0);
      for (const day of result.data.days) for (const m of day.meals) {
        assert.ok(day.meals.length >= 3);
        assert.ok(m.foods.length >= 1);
        assert.match(m.foods[0].portion, /150 g.*ước lượng, chưa kiểm chứng/);
        assert.equal(m.calories, undefined);
        assert.equal(m.label, undefined);
      }
      assert.equal(calls, Math.ceil(days / 3));
      assert.equal(peak, Math.min(3, Math.ceil(days / 3)));
    });
  }
});

test('meal plan rejects invalid16 and incomplete/duplicate days, meals, foods, quantities, macros and bounded texts', async () => {
  await withApi({ fetchImpl: () => { throw new Error('no call'); } }, async ({ post }) => {
    assert.equal((await post('/api/meal-plan', { ...planInput, days: 16 })).status, 400);
  });
  const mutations = [p => p.days.pop(), p => { p.days[1].day = 1; }, p => { p.days[0].meals.pop(); }, p => { p.days[0].meals[0].foods = []; }, p => { p.days[0].meals[0].foods[0].portion = 'một ít'; }, p => { p.days[0].meals[0].calories = 500; }, p => { p.days[0].meals[0].foods[0].name = 'x'.repeat(201); }, p => { delete p.assumptions; }];
  for (const mutate of mutations) {
    const fixture = planFixture([1, 2, 3]); mutate(fixture);
    await withApi({ fetchImpl: async () => completion(fixture) }, async ({ post }) => {
      const result = await post('/api/meal-plan', planInput);
      assert.equal(result.status, 502);
      assert.equal(result.data.error.code, 'GATEWAY_RESPONSE_INVALID');
      assert.equal(result.data.days, undefined);
    });
  }
});

test('meal plan minors, medical, emergency and customGoal safety return no personalized days without AI/key', async () => {
  await withApi({ gatewayKey: '', fetchImpl: () => { throw new Error('No AI'); } }, async ({ post }) => {
    for (const patch of [{ profile: { ...profile, age: 17 } }, { preferences: 'Tôi bị bệnh thận' }, { preferences: 'Tôi đang đau ngực và khó thở' }, { profile: { ...profile, goal: 'custom', customGoal: 'Tôi đang mang thai' } }]) {
      const result = await post('/api/meal-plan', { ...planInput, ...patch });
      assert.equal(result.status, 200);
      assert.deepEqual(result.data.days, []);
      assert.ok(result.data.safetyFlags.length);
      assert.equal(result.data.dailyTarget.calories, null);
      assert.equal(result.data.dailyTarget.proteinMin, null);
      assert.ok(result.data.summary.length);
    }
  });
});

test('meal plan Gateway failures sanitize errors, no key fallback, shared overall deadline aborts all chunks', async () => {
  for (const [opts, status, code] of [
    [{ gatewayKey: '' }, 503, 'GATEWAY_NOT_CONFIGURED'],
    [{ fetchImpl: async () => new Response('secret', { status: 500 }) }, 502, 'GATEWAY_ERROR'],
    [{ fetchImpl: async () => { throw new Error('unit-test-key health'); } }, 502, 'GATEWAY_UNAVAILABLE'],
    [{ fetchImpl: async () => completion({ invalid: true }) }, 502, 'GATEWAY_RESPONSE_INVALID'],
  ]) await withApi(opts, async ({ post }) => {
    const result = await post('/api/meal-plan', planInput);
    assert.equal(result.status, status);
    assert.equal(result.data.error.code, code);
    assert.doesNotMatch(JSON.stringify(result.data), /secret|unit-test-key|health/);
  });
  const signals = [];
  await withApi({ timeoutMs: 25, fetchImpl: (url, options) => { signals.push(options.signal); return new Promise(() => {}); } }, async ({ post }) => {
    const result = await post('/api/meal-plan', { ...planInput, days: 15 });
    assert.equal(result.status, 504);
    assert.equal(result.data.error.code, 'GATEWAY_TIMEOUT');
    assert.equal(signals.length, 3);
    assert.ok(signals.every(signal => signal.aborted));
  });
});
