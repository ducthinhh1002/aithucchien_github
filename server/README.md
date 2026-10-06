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
};

// POST /api/analyze
{ profile: Profile, meal: string, image?: string,
  clarifications?: Array<{question: string, answer: string}> }
// clarifications: tối đa 5; question 1..1000, answer 1..1500, strict.

// POST /api/meal-plan
{ profile: Profile, preferences: string, days: number }
// preferences: 1..1500 ký tự, days: số nguyên 1..15.
// meal: 1..6000 ký tự; ảnh không thay thế yêu cầu có mô tả meal.

// POST /api/chat
{ profile: Profile, question: string, mealContext?: string }
// question: 1..4000 ký tự, mealContext: tối đa 6000 ký tự.
```

Ảnh chỉ nhận `data:image/png;base64,...`, `data:image/jpeg;base64,...` hoặc `data:image/webp;base64,...`. Kiểm tra base64, kích thước giải mã tối đa **4 MiB** và magic bytes khớp MIME. Không nhận URL ảnh từ xa, SVG hoặc HTML. Giới hạn toàn bộ body JSON **6 MiB**. Kiểm tra magic bytes không thay thế một bộ giải mã ảnh đầy đủ; gateway vẫn có thể từ chối tệp hỏng.

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

`calories` có đơn vị kcal; `protein`, `carbs`, `fat`, `proteinMin`, `proteinMax` có đơn vị gram. Mọi số liệu món ăn là **ước lượng, chưa kiểm chứng**, được server gắn trong summary, assumptions và note của từng món. Server luôn ép `estimated: true`; confidence `high` của mô hình được hạ xuống `medium` để không khẳng định chắc chắn dữ liệu chưa kiểm chứng. Giá trị dinh dưỡng thiếu được chuẩn hóa `null`, không giả lập số liệu thay thế.

`dailyTarget` được **server** tính, bỏ mọi giá trị do mô hình tự gửi. Chỉ tính cho người từ 18 tuổi, đủ chiều cao, sex là nam/nữ và không phát hiện thai kỳ, cho con bú, bệnh lý/điều trị hoặc cấp cứu trong văn bản. BMR theo Mifflin–St Jeor; hệ số hoạt động 1.55 / 1.725 / 1.9. Năng lượng là ước lượng **duy trì**, không tự kê mức tăng/giảm theo `goal`. Chất đạm tham khảo 1.4–2.0 g/kg/ngày cho người trưởng thành khỏe mạnh vận động. Người không đủ điều kiện nhận ba số `null` kèm giải thích.

Hồ sơ không có trường bệnh lý/thai kỳ riêng. Guard xét tuổi, `sports.join(' ')`, `customGoal`, `meal`, các question/answer trong `clarifications`, `question`, `mealContext`, `preferences`; người dùng cần tự khai thông tin cần lưu ý trong văn bản. Đó không phải sàng lọc y tế đầy đủ.

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

Đủ chính xác số ngày yêu cầu, ngày tuần tự 1..days, mỗi ngày ít nhất 3 bữa và mỗi bữa ít nhất 1 món. Không có `label`, không macro số theo bữa. Định lượng tường minh như `150 g (chín)` và server gắn nhãn ước lượng/chưa kiểm chứng ở portion/note. Cấu trúc lồng strict, giới hạn độ dài; phản hồi thiếu ngày, thiếu bữa/món, định lượng mơ hồ hoặc completion cắt ngắn bị từ chối 502, không trả thực đơn một phần. Cá nhân hóa trong prompt theo tất cả môn tập, thời lượng, mức vận động, mục tiêu và ẩm thực tự khai; dailyTarget vẫn là mức duy trì tham khảo.

Dưới 18 tuổi, thai kỳ/bệnh lý/điều trị hoặc cấp cứu: **không gọi AI**, trả cùng contract nhưng `days: []`, summary/recommendations giải thích lý do, safetyFlags và dailyTarget null; không định lượng cá nhân.

Tối đa 3 ngày/Gateway request, tối đa 3 request đồng thời; dayNumbers được gửi rõ ràng cho mỗi chunk. Shared AbortController và deadline 55 giây cho **toàn route**, không reset sau mỗi chunk; max_tokens 8000/chunk (đủ khoảng trống cho phản hồi tiếng Việt, tránh bị cắt ngắn). Hợp nhất xong kiểm tra chính xác đủ ngày, canonical hóa sources. Khi một chunk lỗi, abort các chunk còn lại; không fake fallback.

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

Ảnh được gửi theo content parts `[{type:'text',text:...},{type:'image_url',image_url:{url:dataURL}}]`. [Tài liệu gateway](https://docs.thucchien.ai/docs/round-2/api-reference/text-generation) xác nhận Chat Completions và dẫn sang LiteLLM; [tài liệu vision LiteLLM](https://docs.litellm.ai/docs/completion/vision) xác nhận `image_url` nhận URL hoặc base64. Trang gateway không có ví dụ ảnh trực tiếp; khả năng xử lý ảnh thực tế phụ thuộc mô hình/gateway triển khai.

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

Các tùy chọn test/deploy của `createApp`: `gatewayKey`, `model`, `fetchImpl`, `timeoutMs`, `rateLimit`, `trustProxy`, `serveDist`, `distDirectory`. Unit tests dùng gateway mock, không tốn quota hoặc in dữ liệu sức khỏe.
