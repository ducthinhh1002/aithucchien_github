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

- Hồ sơ bắt buộc ở cả hai màn: tuổi, cân nặng, chiều cao, giới tính, thể trạng cơ thể (khỏe mạnh/đang chấn thương/đang hồi phục...), ít nhất một môn tập (chọn nhiều môn), thời gian tập mỗi buổi, mức vận động và mục tiêu. Ngoài các mục tiêu mặc định có **Mục tiêu riêng** với ô nhập mô tả bắt buộc khi chọn.
- Màn **Phân tích bữa ăn** (tên mới của Khám phá bữa ăn): nếu mô tả chung chung hoặc AI thiếu tự tin, hiện ô hỏi thêm thay vì đưa số liệu. Trả lời bổ sung rồi phân tích tiếp với cùng ảnh và mô tả gốc, tối đa 5 lượt.
- Màn **Bữa ăn cho bạn**: có hồ sơ, mục tiêu và đồng ý xử lý AI **hoàn toàn độc lập** với màn phân tích. Nhập sở thích, dị ứng và thành phần không muốn ăn (nếu có), chọn phạm vi 1–7 ngày để AI tạo từng bữa cùng định lượng dự kiến; chuyển ngày để xem thực đơn. Không cần vào màn phân tích trước.
- Hồ sơ ban đầu để trống, không lấy số liệu mẫu làm thể trạng của người dùng. Dữ liệu của từng màn được giữ riêng khi chuyển màn và xóa khi tải lại trang.
- Nhập khẩu phần bằng **văn bản bắt buộc**, có mẫu phở bò, cơm nhà và bánh mì để thử nhanh.
- Thêm tối đa **4 ảnh JPG/PNG/WebP** cho các món trong cùng bữa; nén trên trình duyệt, tổng payload được giới hạn để dùng Vercel. Ảnh không thay mô tả bắt buộc về món/khối lượng/dầu/sốt; cùng bộ ảnh được gửi lại nếu Nếp cần hỏi bổ sung.
- AI đa phương thức ước lượng kcal, đạm, bột đường và chất béo theo món; backend đối soát tổng với từng món (thiếu dữ liệu thành phần sẽ báo chưa rõ, không coi là 0). Kết quả so sánh tỷ trọng bữa này với **mốc duy trì ước lượng của cả ngày** và mốc đạm ngày, rồi làm nổi bật **một điều chỉnh sơ bộ**. Không gán mốc cố định cho mọi bữa hoặc nhầm mức duy trì với mục tiêu giảm/tăng cân.
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
| `POST /api/analyze` | Nhận `{profile, meal, images? (tối đa 4), image? (cũ), clarifications?}`; có thể trả `needsClarification: true` để hỏi thêm |
| `POST /api/meal-plan` | Nhận `{profile, preferences, allergies, avoidIngredients, days}` (1–7 ngày); trả món và khẩu phần khi hợp lệ; không bảo đảm tránh nhiễm chéo dị ứng |
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
- Không tính mốc cá nhân cho dưới 18 tuổi, thai kỳ / cho con bú, bệnh lý / đang điều trị hoặc chấn thương / đang hồi phục khi được mô tả trong thể trạng. Màn thực đơn không đưa định lượng cá nhân cho các trường hợp này, mà hướng dẫn trao đổi với chuyên gia. Hồ sơ mới bắt buộc chiều cao và giới tính.
- Thực đơn tối đa 7 ngày được chia thành từng ngày, tối đa 3 yêu cầu AI đồng thời, để tránh phản hồi quá dài; có thời hạn chung 55 giây. Danh sách dị ứng/thành phần tránh ăn được gửi tới AI và kiểm tra tên món/nguyên liệu trả về, nhưng không thể bảo đảm không có dị nguyên ẩn hoặc nhiễm chéo; hãy kiểm tra với người chế biến. Chỉ hiển thị khi nhận đủ ngày/bữa/khẩu phần hợp lệ; lỗi AI không được lấp bằng thực đơn mẫu.
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
4. Deploy **Preview** trước: kiểm tra `/api/health` (JSON), POST `{}` vào ba API trả 400 JSON, `/api/khong-co` trả 404 JSON, JS/CSS tải đúng MIME và màn ứng dụng mở được sau refresh. Tiếp theo thử phân tích chữ/ảnh, thực đơn 1–3–7 ngày có/không dị ứng với Gateway thật. Chỉ lên Production khi mọi gate qua.
5. Ảnh gốc tối đa 8 MB được nén ở trình duyệt; backend giới hạn ảnh giải mã 3 MiB và body 4 MB, chừa chỗ cho JSON dưới giới hạn 4,5 MB của Vercel. Dù vậy cần thử ảnh thật trên Preview. `vercel.json` cấp hàm 60 giây, luồng thực đơn có deadline 55 giây; đo thời gian khi cold start.
6. Khi mở public, limiter trong RAM không giới hạn tổng số lần gọi AI trên nhiều instance; thiết lập quota/giám sát chi phí và rate-limit phân tán hoặc WAF, kiểm tra chính sách IP proxy. Dị ứng phải xác minh trực tiếp với người chế biến.
7. Giữ URL hoạt động ít nhất 4 tuần theo đề bài. Chưa có tài khoản triển khai được kết nối trong phiên làm việc này nên không tự động có URL công khai.

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

- **35/35 unit/API tests** đạt với Gateway giả lập, gồm hồ sơ bắt buộc/thể trạng, nhiều môn tập, mục tiêu riêng, tối đa 4 ảnh và giới hạn dung lượng ảnh, hỏi rõ khẩu phần, đối soát tổng từ từng món, dị ứng/thành phần tránh ăn, thực đơn 1/3/7 ngày, retry có giới hạn khi AI trả sai schema và từ chối thực đơn thiếu ngày/bữa hoặc chứa thành phần bị loại trừ.
- Bản build production thành công.
- Kiểm thử Chromium desktop/mobile đạt: bắt buộc hồ sơ/thể trạng, chọn nhiều môn, thời lượng/mục tiêu riêng, 2 ảnh trong một bữa và giữ bộ ảnh khi hỏi bổ sung, so sánh mốc tham khảo, hai hồ sơ độc lập, đồng ý xử lý riêng, giới hạn 1–7 ngày và gửi thành phần cần tránh, chuyển ngày thực đơn, giữ trạng thái khi chuyển màn, hỏi đáp/lịch sử/nguồn/lỗi API; không có lỗi JavaScript hoặc tràn ngang mobile.
- Gateway thật trả HTTP **200** cho phân tích văn bản, phân tích ảnh minh họa PNG hợp lệ và hỏi đáp tiếng Việt. Ảnh kiểm thử không phải ảnh thực phẩm cân đo; không dùng nó làm bằng chứng về độ chính xác ước lượng món ăn.
- Tình huống đau ngực/khó thở trả cảnh báo cơ sở y tế/115, không cần gọi AI.
- `npm audit --omit=dev`: không phát hiện lỗ hổng tại thời điểm kiểm tra trước thay đổi này.
- **Trạng thái Gateway hiện tại:** lần thử thực đơn 3 ngày có dị ứng/né thành phần đã từng thất bại do `ECONNRESET` rồi phản hồi schema không hợp lệ. Sau khi chuyển sang từng ngày + một lượt sửa định dạng có giới hạn, lần thử 3 ngày **không có hạn chế thành phần** trả 200 đủ 3 ngày. Điều này chưa xác nhận thực đơn 7 ngày hoặc thực đơn có dị ứng hoạt động ổn định; dị ứng tuyệt đối không thể được AI bảo đảm.
- Chưa có Preview/Production Vercel thực tế trong phiên. Cần deploy Preview và thử qua URL thật trước khi nộp; xem checklist dưới đây.

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
