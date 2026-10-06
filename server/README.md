# Hợp đồng API thực tế

## Khởi chạy và cấu hình

Từ thư mục ứng dụng:

```sh
node server/index.js
node --test tests/api.test.js
```

Cổng mặc định `3001`, tùy chỉnh bằng `PORT`. Điểm khởi chạy phục vụ bản dựng `dist` và fallback SPA cho các đường GET ngoài `/api`. Các đường API không tồn tại luôn trả JSON 404, không trả HTML. `createApp()` được export named/default để unit test và wrapper Vercel; đặt `serveDist: false` khi nền tảng tự phục vụ frontend.

Dotenv đọc `.env` trong thư mục ứng dụng trước, rồi `../../.env`; không ghi đè biến môi trường đã có. Khóa: ưu tiên `GATEWAY_KEY`, hỗ trợ alias `GATEWAY_key`. Mô hình: `GATEWAY_MODEL`, mặc định `gemini-2.5-flash`. Không ghi hồ sơ, bữa ăn, ảnh, câu hỏi hay khóa vào log hoặc bộ nhớ lưu trữ lâu dài.

## Request

Tất cả POST nhận `Content-Type: application/json`. Không ép kiểu chuỗi sang số. Các thuộc tính ngoài schema bị từ chối.

```ts
type Profile = {
  age: number;          // số nguyên 10..100, tuổi
  weight: number;       // 25..300, kg
  height: number;       // bắt buộc 100..250, cm
  sex: 'male'|'female';
  goal: 'maintain'|'gain'|'lose'|'custom';
  customGoal?: string;  // tối đa 500 ký tự; bắt buộc không trắng nếu goal=custom
  activity: 'moderate'|'high'|'very-high';
  sports: Array<'Tập thể hình'|'Chạy bộ'|'Đạp xe'|'Bơi lội'|'Thể thao đồng đội'|'Yoga / Pilates'|'Võ thuật'|'Môn khác'>; // 1..8, duy nhất
  sessionMinutes: number; // số nguyên 10..300
  bodyCondition: string; // bắt buộc, mô tả tình trạng cơ thể bằng tiếng Việt, trim 1..250 ký tự
};

// POST /api/analyze
{ profile: Profile, meal: string, images?: string[], image?: string,
  clarifications?: Array<{question: string, answer: string}> } // image: legacy; tối đa 4 ảnh tính cả image
// clarifications: tối đa 5; question 1..1000, answer 1..1500, strict.

// POST /api/meal-plan
{ profile: Profile, preferences: string, days: number, allergies: string, avoidIngredients: string }
// preferences: 1..1500 ký tự, days: số nguyên 1..7.
// allergies và avoidIngredients: bắt buộc có mặt, chuỗi được trim, tối đa 500 ký tự mỗi trường; cho phép chuỗi rỗng khi không có hạn chế.
// meal: 1..6000 ký tự; ảnh không thay thế yêu cầu có mô tả meal.

// POST /api/chat
{ profile: Profile, question: string, mealContext?: string }
// question: 1..4000 ký tự, mealContext: tối đa 6000 ký tự.
```

`images` nhận **1..4** data URL ảnh; `image` đơn lẻ vẫn dùng được cho client cũ, hoặc kết hợp với `images` nếu tổng không quá 4 (không nhận mảng rỗng). Mỗi ảnh chỉ nhận `data:image/png;base64,...`, `data:image/jpeg;base64,...` hoặc `data:image/webp;base64,...`; base64 hợp lệ, tối đa **1 MiB giải mã mỗi ảnh**, tổng tối đa **2.700.000 byte giải mã**. Kiểm tra magic bytes khớp MIME; không nhận URL từ xa, SVG hay HTML. Giới hạn toàn bộ JSON body **4 MB** (`express.json` dùng `4mb`). Client nên giữ tổng base64 ≤3.600.000 ký tự và ≤1.380.000 ký tự/ảnh, gồm tối đa 4 ảnh. Tất cả ảnh được gửi trong cùng một gateway request và phải giữ nguyên khi gửi clarifications. Kiểm tra magic bytes không thay thế bộ giải mã ảnh đầy đủ; gateway vẫn có thể từ chối tệp hỏng.

## Response thành công

`GET /api/health` trả `200 {configured: boolean}`. Đây là kiểm tra có cấu hình khóa, **không phải** kiểm tra khả năng kết nối hoặc tính hợp lệ của khóa.

`POST /api/analyze` trả 200:

```ts
{
  title: string,
  summary: string,
  confidence: 'low'|'medium'|'high',
  needsClarification: boolean,
  totals: { calories: number|null, protein: number|null,
            carbs: number|null, fat: number|null },
  items: Array<{ name: string, portion: string, calories: number|null,
                 protein: number|null, carbs: number|null, fat: number|null,
                 note: string }>,
  assumptions: string[],
  recommendations: string[],
  questions: string[],
  safetyFlags: string[],
  sources: Array<{ title: string, url: string, note: string }>,
  dailyTarget: { calories: number|null, proteinMin: number|null,
                 proteinMax: number|null, note: string },
  estimated: true
}
```

`calories` có đơn vị kcal; `protein`, `carbs`, `fat`, `proteinMin`, `proteinMax` có đơn vị gram. Mọi số liệu món ăn là **ước lượng, chưa kiểm chứng**, được server gắn trong summary, assumptions và note của từng món. Server luôn ép `estimated: true`; confidence `high` của mô hình được hạ xuống `medium` để không khẳng định chắc chắn dữ liệu chưa kiểm chứng. Giá trị dinh dưỡng thiếu được chuẩn hóa `null`, không giả lập số liệu thay thế. Tổng từng chất được tính lại từ **toàn bộ** items nếu tất cả item có số của chất đó; nếu bất kỳ item nào null hoặc items rỗng, tổng chất đó null (dù mô hình tự báo số). Tổng mô hình lệch tổng items được giải thích trong assumptions. Nếu kcal mâu thuẫn nghiêm trọng với khoảng tham khảo 4 kcal/g protein, 4 kcal/g carbs, 9 kcal/g fat, không ép khớp số: trả confidence low, needsClarification và hỏi thêm. Recommendation đầu tiên được nhắc cụ thể gắn với món ăn trong prompt; nếu AI không đề xuất nhưng có item, server dùng đề xuất nhỏ có điều kiện, không kê đơn.

`dailyTarget` được **server** tính, bỏ mọi giá trị do mô hình tự gửi. Chỉ tính cho người từ 18 tuổi, đủ chiều cao, sex là nam/nữ và không phát hiện thai kỳ, cho con bú, bệnh lý/điều trị, chấn thương/đang hồi phục hoặc cấp cứu trong văn bản (kể cả `profile.bodyCondition`). BMR theo Mifflin–St Jeor; hệ số hoạt động 1.55 / 1.725 / 1.9. Năng lượng là ước lượng **duy trì**, không tự kê mức tăng/giảm theo `goal`. Chất đạm tham khảo 1.4–2.0 g/kg/ngày cho người trưởng thành khỏe mạnh vận động. Người không đủ điều kiện nhận ba số `null` kèm giải thích.

Guard xét tuổi, `bodyCondition`, `sports.join(' ')`, `customGoal`, `meal`, các question/answer trong `clarifications`, `question`, `mealContext`, `preferences`; người dùng cần tự khai tình trạng cơ thể bằng tiếng Việt. Mô tả khỏe mạnh không kích hoạt medical; mô tả chấn thương/đang hồi phục có kích hoạt dù tuổi trên 18. Đó không phải sàng lọc y tế đầy đủ.

`needsClarification` được ép `true` nếu không có chỉ báo khẩu phần ở bất kỳ vị trí nào trong meal/câu trả lời bổ sung, hoặc model confidence low/null, hoặc model yêu cầu hỏi lại. Câu hỏi bổ sung không được tính là cung cấp khẩu phần. `1 suất phở` cần hỏi; `1 bát`, gram/ml, size nhỏ/vừa/to/half là chỉ báo. Có chỉ báo không đảm bảo AI đủ tự tin: model vẫn có thể hỏi lại. Khi cần hỏi, totals và mọi nutrient item đều null, bỏ giả định số liệu thiếu căn cứ và đưa hướng dẫn bổ sung; questions không rỗng. Emergency không bị ép hỏi khẩu phần. Các lần bổ sung tiếp tục gửi nguyên image nếu có.

`POST /api/chat` trả 200:

```ts
{ answer: string, safetyFlags: string[] }
```

Câu trả lời bình thường được gắn ghi chú ước lượng/chưa kiểm chứng; cảnh báo deterministic được gắn trước câu trả lời và hợp nhất với cờ của mô hình. Prompt hạn chế chẩn đoán, kê thuốc, tính mục tiêu cho nhóm không đủ điều kiện và các gợi ý giảm cân cực đoan. Nội dung AI vẫn có giới hạn, không thay thế nhân viên y tế.

`POST /api/meal-plan` trả 200:

```ts
{
  title: string, summary: string,
  days: Array<{day: number, meals: Array<{
    name: string, time?: string,
    foods: Array<{name: string, portion: string}>, note: string
  }> }>,
  assumptions: string[], recommendations: string[], safetyFlags: string[],
  sources: Array<{title: string, url: string, note: string}>,
  dailyTarget: {calories: number|null, proteinMin: number|null,
                proteinMax: number|null, note: string}, estimated: true
}
```

Đủ chính xác số ngày yêu cầu, ngày tuần tự 1..days, mỗi ngày ít nhất 3 bữa và mỗi bữa ít nhất 1 món. Không có `label`, không macro số theo bữa. Định lượng tường minh như `150 g (chín)` và server gắn nhãn ước lượng/chưa kiểm chứng ở portion/note. Cấu trúc lồng strict, giới hạn độ dài; phản hồi thiếu ngày, thiếu bữa/món, định lượng mơ hồ hoặc completion cắt ngắn bị từ chối 502, không trả thực đơn một phần. Các danh sách assumptions/recommendations/safetyFlags/sources, note của bữa và metadata title/summary có thể thiếu: server dùng mặc định chung và ghi chú an toàn ngắn; tuyệt đối không tự tạo bữa, món hoặc phần ăn. Mọi ngày/chunk phải tôn trọng allergies và avoidIngredients. Cá nhân hóa trong prompt theo tất cả môn tập, thời lượng, mức vận động, mục tiêu và ẩm thực tự khai; dailyTarget vẫn là mức duy trì tham khảo.

Dưới 18 tuổi, thai kỳ/bệnh lý/điều trị hoặc cấp cứu: **không gọi AI**, trả cùng contract nhưng `days: []`, summary/recommendations giải thích lý do, safetyFlags và dailyTarget null; không định lượng cá nhân.

Mỗi Gateway request chỉ lập **một ngày**, tối đa 3 request đồng thời (tối đa 3 đợt cho 7 ngày); từng chunk đều nhận allergies, avoidIngredients và dayNumbers trong JSON data riêng, không chèn văn bản người dùng vào system prompt. Shared AbortController và deadline 55 giây cho **toàn route**, không reset sau mỗi chunk; max_tokens 3500/chunk. Hợp nhất xong kiểm tra chính xác đủ ngày, canonical hóa sources. Nếu một chunk sai schema/JSON (bao gồm thiếu bữa, thiếu định lượng hoặc sai ngày) hoặc gặp `ECONNRESET`, server **thử sửa đúng một lần cho riêng ngày đó** trong deadline chung, bằng prompt bổ sung ngắn ghi **chỉ đường dẫn field lỗi** (không ghi profile/bữa/khóa), yêu cầu ba bữa với định lượng. Lỗi HTTP, network khác và timeout không retry; không tự chế món hay định lượng. Khi retry vẫn không hợp lệ, trả 502 `GATEWAY_RESPONSE_INVALID` và lời nhắc thân thiện thử ít ngày hơn; abort chunk còn lại, không fake fallback. Tổng tối đa hai request/ngày nếu phát sinh lỗi có thể thử lại; 1 ngày thành công không bảo đảm provider tạo được đủ ngày còn lại.

Dị ứng và nguyên liệu tránh: prompt yêu cầu không sử dụng ở **bất kỳ** món, khẩu phần, tên bữa hoặc note nào, tránh tiếp xúc chéo; server kiểm tra hậu nghiệm các cụm nguyên liệu người dùng khai trong tên món, khẩu phần, tên bữa và note (so khớp từ/cụm nguyên vẹn, không phân biệt hoa/thường và dấu tiếng Việt). Nếu phát hiện trùng, **502** không trả kết quả giả/không an toàn. Khi có dị ứng, `safetyFlags` luôn nhắc nguy cơ tiếp xúc chéo, kiểm tra thành phần và hỏi người nấu; AI **không thể bảo đảm** không có chất gây dị ứng. Dị ứng nặng: không dựa vào thực đơn AI để quyết định an toàn ăn uống. Kiểm tra tên rõ ràng không phát hiện được chất ẩn, tên đồng nghĩa khác hoặc tiếp xúc chéo; cần xác minh trực tiếp trước khi ăn.

## Safety deterministic

Cả ba POST endpoint xét các cụm đau/tức ngực, khó thở, ngất, bất tỉnh, co giật, đột quỵ, tím tái, hôn mê, nôn ra máu và một số cụm tương ứng tiếng Anh. Loại một số từ dễ nhầm, thành ngữ và phủ định rõ ràng đơn giản. Đây là kiểm tra từ khóa thận trọng, không hiểu đầy đủ ngữ cảnh và không chẩn đoán.

Khi thấy dấu hiệu cấp cứu, server **không gọi gateway**, trả 200 khuyến cáo dừng tập, liên hệ cơ sở y tế/115 ngay. Analyze trả `items: []`, totals và dailyTarget đều `null`, `estimated: true`; chat trả answer và safetyFlags cảnh báo. Short-circuit an toàn này vẫn hoạt động khi chưa có khóa. Đây không phải fallback dữ liệu dinh dưỡng khi gateway lỗi.

## Nguồn tham khảo

Server bỏ nguồn ngoài allowlist, không tin title/note từ mô hình. Các URL Viện Dinh dưỡng hợp lệ được quy về trang gốc, tránh giữ đường bài viết do mô hình bịa. DOI/FAO phải khớp chính xác. Title/note được thay bằng metadata tiếng Việt của server, nhấn mạnh tham khảo chung chứ không kiểm chứng món ăn:

- [Viện Dinh dưỡng Quốc gia](https://viendinhduong.vn)
- [Tuyên bố ISSN về chất đạm và vận động](https://doi.org/10.1186/s12970-017-0177-8)
- [Mifflin–St Jeor về năng lượng tiêu hao lúc nghỉ](https://doi.org/10.1093/ajcn/51.2.241)
- [FAO về nhu cầu năng lượng](https://www.fao.org/4/y5686e/y5686e00.htm)

Không cam kết đã thực hiện tra cứu trực tuyến hoặc kiểm chứng số dinh dưỡng từ các nguồn trên.

## Gateway, lỗi và giới hạn

Gateway gọi `POST https://api.thucchien.ai/chat/completions`, `Authorization: Bearer ...`, dùng native fetch. Chỉ đọc JSON hoàn chỉnh; JSON sai, schema sai, response quá lớn hoặc completion bị cắt ngắn đều lỗi, không tạo fake fallback. Timeout **55 giây**, abort cả fetch/body; response gateway tối đa **256 KiB**.

Ảnh được gửi theo content parts `[{type:'text',text:...},...images.map(url => ({type:'image_url',image_url:{url}}))]`. [Tài liệu gateway](https://docs.thucchien.ai/docs/round-2/api-reference/text-generation) xác nhận Chat Completions và dẫn sang LiteLLM; [tài liệu vision LiteLLM](https://docs.litellm.ai/docs/completion/vision) xác nhận `image_url` nhận URL hoặc base64. Trang gateway không có ví dụ ảnh trực tiếp; khả năng xử lý ảnh thực tế phụ thuộc mô hình/gateway triển khai.

Mọi lỗi API có dạng:

```ts
{ error: { code: string, message: string,
           fields?: Array<{path: string, message: string}> } }
```

| HTTP | Code chính | Ý nghĩa |
|---|---|---|
| 400 | `VALIDATION_ERROR`, `INVALID_JSON` | Dữ liệu hoặc JSON không hợp lệ |
| 404 | `NOT_FOUND` | API không tồn tại |
| 413 | `BODY_TOO_LARGE` | Toàn bộ JSON body quá lớn |
| 429 | `RATE_LIMITED` | Vượt giới hạn; có `Retry-After` |
| 503 | `GATEWAY_NOT_CONFIGURED` | Không có khóa |
| 504 | `GATEWAY_TIMEOUT` | Quá thời gian chờ |
| 502 | `GATEWAY_ERROR`, `GATEWAY_UNAVAILABLE`, `GATEWAY_RESPONSE_INVALID` | Provider lỗi/kết nối/phản hồi sai |
| 500 | `INTERNAL_ERROR` | Lỗi máy chủ chung |

Không chuyển tiếp nội dung lỗi/headers của provider, khóa, profile hoặc body vào thông báo lỗi. Mọi response API có `Cache-Control: no-store`.

Rate limit trong bộ nhớ: **20 yêu cầu/phút/IP**, tối đa **2000** IP đang hoạt động; bảng đầy sẽ từ chối thay vì evict counter đang dùng. Entry hết hạn được xóa khi có request mới; không tạo timer dài hạn, không lưu hồ sơ. Health nằm ngoài limiter.

`trust proxy` mặc định `false` nhằm không tin `X-Forwarded-For` giả. Wrapper Vercel cần cấu hình proxy đáng tin theo môi trường triển khai, ví dụ `createApp({serveDist:false, trustProxy: vettedPolicy})`; không bật tin toàn bộ header một cách vô điều kiện. Nếu giữ mặc định sau reverse proxy, nhiều người dùng có thể cùng bucket IP. Limiter chỉ có hiệu lực trên từng instance/process và reset khi cold start, **không phải** giới hạn phân tán toàn dịch vụ.

Các tùy chọn test/deploy của `createApp`: `gatewayKey`, `model`, `fetchImpl`, `timeoutMs`, `rateLimit`, `trustProxy`, `serveDist`, `distDirectory`, và hook chẩn đoán tùy chọn `onPlanValidationFailure({day,attempt,code,fieldPaths})`. Hook chỉ nhận số ngày, số lần thử, mã tĩnh `SCHEMA_INVALID`/`ECONNRESET` và **đường dẫn field schema** đã lọc, tuyệt đối không có profile, tên món, nội dung provider, lỗi raw hay khóa; mặc định không ghi log. Unit tests dùng gateway mock, không tốn quota hoặc in dữ liệu sức khỏe. `tests/gateway-diagnostic.mjs` chỉ nên chạy thủ công khi được phép gọi gateway thật; ghi metadata mã/đường dẫn lỗi, không ghi dữ liệu sức khỏe.
