# Nếp · Ăn hiểu mình, tập hết sức

Web app trợ lý dinh dưỡng AI tiếng Việt cho người tập luyện nhiều tại Việt Nam. Thiết kế và nội dung riêng, ưu tiên những bữa ăn Việt quen thuộc.

## Chạy trên máy

Yêu cầu Node.js 20 trở lên và npm.

```powershell
cd E:\Code\aithucchien\aitc2026-team-913-cross-regional-intelligence\chung-khao\thinhnd
npm.cmd install
npm.cmd run dev
```

Mở **http://localhost:5173**. Vite chuyển `/api` tới máy chủ Node ở cổng 3001. Trên Windows dùng `npm.cmd` nếu PowerShell chặn `npm.ps1`. Trên macOS/Linux dùng `npm` bình thường.

Backend tự đọc `.env` tại thư mục ứng dụng, rồi `.env` tại gốc repo (`../../.env`). Ưu tiên biến môi trường có sẵn. Hỗ trợ `GATEWAY_KEY` và tên hiện có `GATEWAY_key`; không cần chép khóa ra frontend.

```dotenv
GATEWAY_KEY=khóa_của_bạn
GATEWAY_MODEL=gemini-2.5-flash
PORT=3001
```

Có thể sao chép `.env.example` thành `.env` để cấu hình riêng. Không commit `.env`, không dùng tiền tố `VITE_` cho khóa API.

## Chạy bản build

```powershell
npm.cmd test
npm.cmd run build
npm.cmd start
```

Máy chủ phục vụ bản build tại **http://localhost:3001**. `PORT` do nền tảng triển khai cấp cũng được hỗ trợ.

## Những gì sản phẩm có

- Hồ sơ bắt buộc: tuổi, cân nặng, chiều cao, giới tính sinh học, ít nhất một môn tập (chọn nhiều môn), thời gian tập mỗi buổi, mức vận động và mục tiêu. Ngoài các mục tiêu mặc định có **Mục tiêu riêng** với ô nhập mô tả bắt buộc khi chọn.
- Màn **Phân tích bữa ăn** (tên mới của Khám phá bữa ăn): nếu mô tả chung chung hoặc AI thiếu tự tin, hiện ô hỏi thêm thay vì đưa số liệu. Trả lời bổ sung rồi phân tích tiếp với cùng ảnh và mô tả gốc, tối đa 5 lượt.
- Màn **Bữa ăn cho bạn**: có hồ sơ, mục tiêu và đồng ý xử lý AI **hoàn toàn độc lập** với màn phân tích. Nhập sở thích ăn uống và phạm vi 1–15 ngày để AI tạo từng bữa cùng định lượng dự kiến; chuyển ngày để xem thực đơn. Không cần vào màn phân tích trước.
- Hồ sơ ban đầu để trống, không lấy số liệu mẫu làm thể trạng của người dùng. Dữ liệu của từng màn được giữ riêng khi chuyển màn và xóa khi tải lại trang.
- Nhập khẩu phần bằng **văn bản bắt buộc**, có mẫu phở bò, cơm nhà và bánh mì để thử nhanh.
- Thêm ảnh JPG/PNG/WebP tùy chọn; thu nhỏ trên trình duyệt trước khi gửi. Ảnh không thay thế mô tả khối lượng hoặc thông tin dầu/sốt.
- AI đa phương thức ước lượng kcal, đạm, tinh bột, chất béo theo món và tổng bữa; nêu giả định, câu hỏi cần bổ sung và gợi ý điều chỉnh theo hồ sơ.
- Hỏi Nếp về dinh dưỡng và tập luyện qua AI, có ngữ cảnh bữa vừa xem. Mỗi câu hỏi độc lập, không gửi toàn bộ lịch sử trò chuyện.
- Bữa đã xem chỉ nằm trong bộ nhớ phiên, tối đa 10 bữa. Có nút xóa từng bữa / tất cả; tải lại trang là mất. Không lưu ảnh trong lịch sử.
- Góc kiến thức với liên kết nguồn công khai và giải thích giới hạn dữ liệu.
- Giao diện responsive, thao tác bàn phím, trạng thái tải / lỗi rõ ràng, không trả số liệu giả khi Gateway lỗi.

## API AI Ban tổ chức

Thực hiện trên **máy chủ**:

- `POST https://api.thucchien.ai/chat/completions`
- `Authorization: Bearer <GATEWAY_KEY>`
- Mặc định `gemini-2.5-flash`; thay bằng biến `GATEWAY_MODEL` nếu khóa được cấp quyền model khác. Model phải hỗ trợ ảnh nếu dùng nhận diện món ăn.
- Ảnh gửi theo OpenAI-compatible content part `image_url` chứa data URL; phản hồi JSON được kiểm tra schema bằng Zod.

Tài liệu: [Hướng dẫn Gateway](https://docs.thucchien.ai/docs/user-guide), [Sinh văn bản](https://docs.thucchien.ai/docs/round-2/user-guide/text-generation), [Tham chiếu API](https://docs.thucchien.ai/docs/round-2/api-reference/text-generation).

API ứng dụng:

| Endpoint | Mục đích |
| --- | --- |
| `GET /api/health` | Chỉ trả `configured`, không trả khóa |
| `POST /api/analyze` | Nhận `{profile, meal, image?, clarifications?}`; có thể trả `needsClarification: true` để hỏi thêm |
| `POST /api/meal-plan` | Nhận `{profile, preferences, days}`; trả đúng số ngày với món và khẩu phần mỗi bữa |
| `POST /api/chat` | Nhận `{profile, question, mealContext?}` và trả `{answer, safetyFlags}` |

Giới hạn body, ảnh, thời gian gọi và tần suất yêu cầu được áp dụng. Lỗi nhà cung cấp không được chuyển nguyên văn ra trình duyệt.

## Minh bạch & an toàn

**Ứng dụng không thay bác sĩ / chuyên gia dinh dưỡng, không chẩn đoán, không kê đơn, không khuyên tự ý bỏ thuốc.** Dấu hiệu nguy hiểm như đau ngực, khó thở hoặc ngất được kiểm tra trước khi gọi AI; người dùng được hướng dẫn liên hệ cơ sở y tế / gọi 115 nếu cấp cứu.

- Tất cả số liệu món ăn là **ước lượng / chưa kiểm chứng**. Có nguồn tài liệu nền không có nghĩa là đã đối chiếu từng con số món ăn.
- Không cài đặt một “bảng thực phẩm Việt Nam” giả hoặc tuyên bố tra trực tiếp bảng khi chưa có dữ liệu được cấp phép / kiểm tra.
- Nguồn trả về bị giới hạn ở danh sách tài liệu công khai đã định nghĩa, loại bỏ URL không được phép.
- Nếp hỏi thêm hoặc trả `null` (“Chưa rõ”) khi thiếu căn cứ; độ tin cậy không nâng lên thành số liệu đã kiểm chứng.
- Mốc năng lượng tham khảo được máy chủ tính theo Mifflin–St Jeor, với hệ số hoạt động **giả định** 1,55 / 1,725 / 1,9. Chỉ là năng lượng duy trì, không tự áp thâm hụt hay thặng dư giảm/tăng cân.
- Khoảng đạm tham khảo 1,4–2,0 g/kg/ngày theo ISSN 2017 cho người trưởng thành khỏe mạnh tập luyện.
- Không tính mốc cá nhân cho dưới 18 tuổi, thai kỳ / cho con bú, bệnh lý / đang điều trị khi được mô tả. Màn thực đơn không đưa định lượng cá nhân cho các trường hợp này, mà hướng dẫn trao đổi với chuyên gia. Hồ sơ mới bắt buộc chiều cao và giới tính sinh học.
- Thực đơn dài được chia thành nhóm tối đa 3 ngày, gọi tối đa 3 nhóm song song và có thời hạn chung 55 giây. Chỉ hiển thị khi nhận đủ ngày/bữa/khẩu phần hợp lệ; lỗi AI không được lấp bằng thực đơn mẫu.
- Không có cơ sở dữ liệu, localStorage, tài khoản hay nhật ký request chứa thông tin sức khỏe. Thông tin nhập vẫn được gửi cho dịch vụ AI bên ngoài để xử lý sau khi người dùng đồng ý; không hứa rằng nhà cung cấp hoàn toàn không lưu dữ liệu.

Nguồn:

1. [Viện Dinh dưỡng Quốc gia](https://viendinhduong.vn/) — Bảng thành phần thực phẩm Việt Nam (2007), NXB Y học.
2. [ISSN: protein và vận động](https://doi.org/10.1186/s12970-017-0177-8) — Jäger và cộng sự (2017).
3. [Mifflin–St Jeor](https://doi.org/10.1093/ajcn/51.2.241) — phương trình năng lượng nền (1990).
4. [FAO / WHO / UNU: Human energy requirements](https://www.fao.org/4/y5686e/y5686e00.htm).

## Triển khai Live URL

### Vercel

1. Import repo, đặt **Root Directory** là `chung-khao/thinhnd`.
2. Cấu hình biến môi trường `GATEWAY_KEY` (bắt buộc), `GATEWAY_MODEL` (tùy chọn).
3. Dự án đã có `vercel.json` và serverless handler `api/index.js`; dùng build `npm run build`, output `dist`.
4. Sau khi deploy, kiểm tra `/api/health`, phân tích văn bản và ảnh trên URL thật. Cấu hình thời gian thực thi hàm phù hợp gói dịch vụ.
5. Giữ URL hoạt động ít nhất 4 tuần theo đề bài. Chưa có tài khoản triển khai được kết nối trong phiên làm việc này nên không tự động có URL công khai.

### Render / Railway

- Root Directory: `chung-khao/thinhnd`.
- Build command: `npm ci && npm run build`.
- Start command: `npm start`.
- Cấp biến `GATEWAY_KEY`, tùy chọn `GATEWAY_MODEL`; giữ secret ở cấu hình nền tảng.

Lưu ý vận hành: bộ giới hạn tần suất trong bộ nhớ chỉ bảo vệ từng tiến trình. Khi mở public / chạy nhiều instance, nên bổ sung WAF hoặc rate-limit dùng kho chia sẻ. Kiểm tra quota Gateway, HTTPS và chính sách dữ liệu trước khi dùng thực tế.

## Kiểm thử

```powershell
npm.cmd test
npm.cmd run build
```

Kết quả đã xác minh trên máy:

- **26/26 unit/API tests** đạt, gồm hồ sơ bắt buộc, nhiều môn tập, mục tiêu riêng, hỏi rõ khẩu phần, an toàn, thực đơn 1/3/15 ngày và từ chối thực đơn thiếu ngày/bữa.
- Bản build production thành công.
- Kiểm thử Chromium desktop/mobile đạt: bắt buộc hồ sơ, chọn nhiều môn, thời lượng/mục tiêu riêng, hỏi bổ sung và giữ ảnh gốc, hai hồ sơ độc lập, đồng ý xử lý riêng, giới hạn 1–15 ngày, chuyển ngày thực đơn, giữ trạng thái khi chuyển màn, hỏi đáp/lịch sử/nguồn/lỗi API; không có lỗi JavaScript hoặc tràn ngang mobile.
- Gateway thật trả HTTP **200** cho phân tích văn bản, phân tích ảnh minh họa PNG hợp lệ và hỏi đáp tiếng Việt. Ảnh kiểm thử không phải ảnh thực phẩm cân đo; không dùng nó làm bằng chứng về độ chính xác ước lượng món ăn.
- Tình huống đau ngực/khó thở trả cảnh báo cơ sở y tế/115, không cần gọi AI.
- `npm audit --omit=dev`: không phát hiện lỗ hổng tại thời điểm kiểm tra.

Unit/API tests dùng gateway mock, không mất quota. Script `tests/browser-check.mjs` kiểm tra giao diện desktop/mobile bằng Playwright với phản hồi phân tích giả lập **chỉ trong kiểm thử**, không phải chế độ demo của sản phẩm. Chạy khi máy chủ ở cổng 3001 đã có bản build:

```powershell
node tests/browser-check.mjs
```

Nếu máy chưa có Chromium của Playwright: `npx.cmd playwright install chromium`.

## Cấu trúc

```text
src/main.jsx          Phân tích, hỏi rõ khẩu phần, hỏi đáp và điều hướng
src/profile.jsx       Hồ sơ bắt buộc, nhiều môn tập, mục tiêu riêng
src/MealPlan.jsx      Màn thực đơn AI với trạng thái hoàn toàn độc lập
src/styles.css        Thiết kế riêng, responsive
public/               Minh họa món ăn SVG tự tạo và biểu tượng
server/app.js         API, Gateway, giới hạn và xử lý lỗi
server/nutrition.js   Schema, prompt, kiểm tra an toàn, mốc tham khảo
server/index.js       Máy chủ chạy local / production
api/index.js          Adapter Vercel
 tests/               Kiểm thử API và giao diện
```

Giới hạn: AI có thể nhận diện sai món/khẩu phần; ứng dụng không đo lượng thực phẩm, không đánh giá lâm sàng và không có kế hoạch điều trị. Dùng các ước lượng để tìm hiểu, không ra quyết định y tế.
