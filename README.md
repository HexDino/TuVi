# TuVi Engine — Lập lá số & luận giải bằng Gemini

Ứng dụng tự động an lá số và gom văn bản cổ học; phần luận giải do **người dùng chạy trong Gemini**
— hoặc bằng gói kỹ năng cài một lần, hoặc dán thẳng bản "không cần cài" — và đọc kết quả ngay trong
Gemini. Server **không gọi mô hình nào** và không cần API key.

Hai tầng tự động:

1. **Chart Engine** — an sao bằng `iztro`, chuẩn hoá về `NormalizedChartJSON`, chấm điểm từng cung.
2. **Classical Retriever** — lấy văn bản cổ học từ tuvi.cohoc.net và đối chiếu bảng lá số.

Một bước thủ công, có kiểm tra:

3. **Gemini** — ứng dụng soạn nội dung để sao chép sang Gemini (một lượt hoặc 4 lượt, có/không kèm
   bộ luật). Gemini trả lời bằng **Markdown** để đọc ngay trong chat và **hỏi tiếp ngay tại đó**.

Mục tiêu: lá số an chính xác, bản luận giải có chiều sâu như tuvi.cohoc.net nhưng **không mâu
thuẫn** với dữ liệu lá số, có điểm số từng cung, và UI hiện đại (Bento Grid + Tabs theo Tam Hợp).

## Tính năng chính

- **An sao chuẩn Nam phái** bằng `iztro` (`vi-VN`), chuẩn hoá về `NormalizedChartJSON`: 12 cung,
  14 chính tinh, phụ tinh, Tứ Hóa, Thân cư, đại vận/lưu niên và điểm engine 0–100 kèm lý do.
- **Đối chiếu độc lập** với bảng lá số của `tuvi.cohoc.net`, so theo **địa chi cung** (không theo
  tên cung): 36/36 cung khớp trên 3 lá số mẫu.
- **Kỹ năng Gemini** xuất `SKILL.md` + 3 tệp tham khảo (zip 16,2 KB): bộ luật cài một lần, mỗi lá
  số chỉ dán dữ liệu (7,1–15,4k ký tự mỗi phần, ~36,5k cho bản một lượt kèm cổ học).
- **Chế độ không cần cài** cho điện thoại: ứng dụng Gemini mobile không có nút tải kỹ năng, nên mỗi
  phần mang theo bộ luật (~17,5–21,1k ký tự) — dán thẳng vào chat là chạy.
- **Chia 4 lượt** theo Tam Hợp: mỗi lượt 4 cung, dán lần lượt vào **cùng một chat**; đầu ra là
  Markdown (tiêu đề cung, dòng chốt, 2 đoạn ngắn, nhãn Mạnh/Rủi ro/Nên làm) nên đọc được trên
  điện thoại.
- **Hỏi tiếp trong chat**: xong phần 4 là hỏi thêm bất cứ điều gì — mô hình trả lời theo đúng
  sao/cung/đại vận đã dán, không phải sao chép lại dữ liệu.
- **Cầu nối Gemini**: sao chép (có icon, kèm đường dự phòng cho HTTP nội bộ) → dán vào Gemini →
  đọc kết quả ngay trong Gemini.
- **Cache cổ học 30 ngày**: 1 lá số = 1 request lên cohoc.net; các lần sau đọc từ đĩa.
- **Bàn lá số theo bề rộng màn hình**: lưới 4×4 truyền thống giữ nguyên ở mọi kích thước; dưới
  640px cả bàn được thu nhỏ cho vừa màn hình (zoom theo bề ngang) để vẫn thấy đủ 12 cung đúng vị
  trí, kèm nút **Xem lớn** mở toàn màn hình ở cỡ desktop, cuộn được hai chiều khi cần đọc kỹ.

## Công nghệ

| Lớp | Thành phần |
|---|---|
| Web | Next.js 15 (App Router) · React 19 · TypeScript `strict` |
| An sao | `iztro` (lang `vi-VN`) + scoring engine tự viết, deterministic |
| Bóc văn bản cổ học | `cheerio` — POST form ASP.NET của cohoc.net, có cache đĩa |
| Luận giải | Gói kỹ năng Gemini, người dùng chạy thủ công — không gọi API từ server |
| Kiểm tra | Script `tsx` chạy offline (`chart:test`, `pipeline:test`, `payload:audit`, `ui:test`) |

---

## 1. Kiến trúc

```
Người dùng nhập ngày giờ sinh
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│ MODULE 1 — ChartGeneratorService        lib/tuvi/chart-generator.service.ts
│  iztro (lang='vi-VN') → chuẩn hoá → NormalizedChartJSON
│  + scoring engine (deterministic)      lib/tuvi/scoring.ts
└───────────────────────────────────────────────────────────────┘
        │ NormalizedChartJSON          │ buildHints()
        ▼                              ▼
┌───────────────────────────────────────────────────────────────┐
│ MODULE 2 — CohocKnowledgeService        lib/tuvi/cohoc-knowledge.service.ts
│  POST form ASP.NET → redirect → HTML  → parser cheerio
│  → RawClassicalTexts (đã dedupe, cắt ngân sách, xếp hạng)      │
│  + cross-check bảng lá số cohoc vs engine                     │
└───────────────────────────────────────────────────────────────┘
        │ RawClassicalTexts
        ▼
┌───────────────────────────────────────────────────────────────┐
│ PAYLOAD BUILDER                         lib/tuvi/skill-package.ts
│  buildSkillPayload() | buildSkillPartPayloads()
│  → một lượt hoặc 4 phần dữ liệu — kèm bộ luật nếu chọn "không cần cài"
└───────────────────────────────────────────────────────────────┘
        │ người dùng sao chép và dán
        ▼
┌───────────────────────────────────────────────────────────────┐
│ GEMINI — ngoài ứng dụng                                        │
│  đã cài kỹ năng: SKILL.md giữ bộ luật, phần dán chỉ có dữ liệu │
│  chưa cài: mỗi phần mang theo bộ luật, dán thẳng là chạy        │
│  câu trả lời hiển thị ngay trong Gemini — không nhận lại       │
└───────────────────────────────────────────────────────────────┘
```

Điểm vào duy nhất cho tầng ngoài: `lib/tuvi/index.ts` và `lib/tuvi/pipeline.ts`.

---

## 2. Chạy

```bash
npm install
npm run dev                       # http://localhost:3000
```

Không cần biến môi trường. `.env.example` chỉ còn `COHOC_ENABLED` — đặt `false` để tắt tầng cổ
học khi test offline hoặc khi cohoc.net chặn IP.

Kiểm thử từng tầng:

```bash
npm run chart:test      # Module 1: in bảng 12 cung + điểm + assert bất biến
npm run cohoc:test      # Module 2: POST thật lên cohoc.net, in thống kê + cross-check
npm run pipeline:test   # offline: prompt/payload, hợp đồng đầu ra Markdown, tệp kỹ năng, ZIP
npm run chart:audit     # Chất lượng LÁ SỐ: 144/144 bất biến, đối chiếu bảng sao cohoc
npm run payload:audit   # Chất lượng PAYLOAD đưa mô hình: 12 cung, tứ hóa, đại vận, lưu niên
```

Cache cổ học nằm trong `.gitignore`: repo **không chứa lá số đã sinh ra**, chỉ chứa code.

Kết quả đã chạy thực tế (21–22/10/2026):

```
chart:test     ✓ 5 lá số (gồm tháng nhuận 1995 + fixLeap), 12 cung, 12 đại vận,
                 1 cung Thân, điểm trong [5,98]; ngày không tồn tại bị chặn
cohoc:test     ✓ 3.7s, 484 đoạn thô → 55.225 ký tự, cross-check "Khớp hoàn toàn"
pipeline:test  ✓ gói 4 tệp, hợp đồng Markdown, 4 phần đúng bộ cung, mỗi phần < 30k ký tự
payload-audit  ✓ 0 lỗi dữ liệu — bảng 12 cung, 4 tứ hóa, 12 đại vận, lưu niên khớp engine
```

Biến môi trường:

| Biến | Ý nghĩa |
|---|---|
| `COHOC_ENABLED` | `false` để tắt tầng cổ học (test offline / bị chặn IP). Mặc định bật. |

Không có `LLM_API_KEY`: mọi lượt gọi mô hình đều diễn ra trong tài khoản Gemini của người dùng,
không qua server này.

### Deploy lên Cloudflare Worker

Worker tên `tuvi`, chạy cô lập với các worker khác trong tài khoản: không dùng chung code,
không dùng chung tên miền, không dùng chung secret. Chỉ có một binding ra ngoài là KV namespace
`COHOC_CACHE` (id khai trong `wrangler.jsonc`) chứa bản cache cohoc.net.

```bash
npm run cf:build      # next build + gói OpenNext → .open-next/worker.js
npm run cf:preview    # build + wrangler dev → http://127.0.0.1:8787
npm run cf:deploy     # build + đẩy lên https://tuvi.<subdomain>.workers.dev
```

`cf:build` gọi `next build` bên trong, nên **dừng `npm run dev` trước khi chạy** — hai tiến trình
ghi chồng lên nhau là hỏng cache chunk.

Hai thứ bắt buộc phải có mà machine thông thường không cần:

| Tệp | Vì sao |
|---|---|
| `open-next.config.ts` | Không có là `opennextjs-cloudflare build` abort ngay. |
| `compatibility_flags` trong `wrangler.jsonc` | `nodejs_compat` cho iztro/cheerio (CJS cần `path`, `crypto`, `Buffer`); `global_fetch_strictly_public` để `fetch` sang cohoc.net thật sự ra internet công khai thay vì quẩn trong hệ thống Cloudflare. |

Cache cổ học trên Worker đi qua KV chứ không qua đĩa. Lý do đã đo thật: `node:fs` của workerd chỉ là
bộ nhớ trong isolate, tắt isolate là mất; nếu cứ dùng FileStore thì mỗi lần tỉnh dậy là tải lại
cohoc.net, trái nguyên tắc "một lá số một request". `lib/tuvi/cohoc-store.ts` vì thế chọn store theo
**binding có thật lúc chạy** (có `env.COHOC_CACHE` → KV, không có → đĩa), chứ không đoán runtime:
workerd đời 2026 đã bỏ `process.versions.webworker` nên kiểu đoán nào cũng dễ sai, mà sai thì cache
lỗ âm thầm.

### Cấu trúc thư mục

```
app/
  page.tsx                  UI: nhập ngày giờ → bảng lá số → luận giải
  api/chart                 POST sinh lá số
  api/report/export         POST soạn dữ liệu dán vào Gemini
  api/skill                 SKILL.md · 3 tệp tham khảo · zip
components/                 BirthForm, ChartBoard, StarDrawer,
                            ChatBridge, CohocPanel
lib/tuvi/                   toàn bộ logic — vào bằng index.ts / pipeline.ts
  chart-generator.service.ts   Module 1 (an sao + scoring)
  cohoc-knowledge.service.ts   Module 2 (cổ học + cross-check)
  cohoc-parser.ts              bóc HTML cohoc
  cohoc-store.ts               cache cổ học: đĩa (local) / KV (Worker)
  prompt-builder.ts            dựng bảng lá số và văn bản cổ học cho payload
  scoring.ts                   điểm engine 0–100
  skill-package.ts             SKILL.md + payload + zip
  prompts.ts · zip.ts · constants.ts · star-dictionary.ts
types/tuvi.ts               NormalizedChartJSON và các kiểu dùng chung
scripts/                    test + audit chạy offline, không cần API key
demo/                       ảnh chụp giao diện + bản xuất SKILL.md
```

### Dữ liệu nào thì không có trong repo

| Thứ | Vì sao không commit |
|---|---|
| `.env.local` | cấu hình cục bộ, không chứa khoá |
| `.cache/` | HTML lá số đã bóc từ cohoc.net (giữ 30 ngày trên đĩa) |
| `.tmp/`, `*.log`, `.workbuddy-ai/` | rác dụng cụ phát triển |

Repo giữ lại `demo/SKILL.md` + 3 tệp tham khảo (tài liệu, không chứa lá số) và ảnh chụp giao
diện để README/đánh giá có hình.

---

## 3. Module 1 — Chart Engine

**Input** (`ChartInput`): giới tính, loại lịch, ngày, giờ, phút, năm xem hạn, tháng nhuận và
`fixLeap`.

**Output** (`NormalizedChartJSON`): 12 cung đã chuẩn hoá + thiên bàn + đại vận + lưu niên + điểm.

### Quyết định kỹ thuật quan trọng

**a) `timeIndex` của iztro** — 0 = 00:00–00:59 (Tý sớm), 1 = Sửu … 11 = Hợi, 12 = 23:00–23:59 (Tý muộn).

```ts
hourToTimeIndex(23) === 12   // Tý muộn
hourToTimeIndex(0)  === 0    // Tý sớm
hourToTimeIndex(12) === 6    // Ngọ
```

Sinh giờ Tý muộn sẽ có cảnh báo, vì nhiều phái an sang ngày hôm sau.

**b) Thứ tự cung** — `palaces[0]` của iztro nằm tại **Dần**, tăng dần theo địa chi:
`branch = BRANCHES[(index + 2) % 12]`.

**c) Tuần / Triệt** — iztro nhét lẫn trong `adjectiveStars` dưới tên `"Tuần Không"` / `"Triệt Lộ"`.
Normalizer bóc ra thành cờ `hasTuan` / `hasTriet`, nếu không scoring sẽ nhiễu.

**d) Không trả raw astrolabe** — mọi field lạ bị loại bỏ. `NormalizedChartJSON` của một lá số
≈ 2.000 token, so với ~6.000 token nếu đẩy raw JSON vào payload.

**e) Tháng nhuận** — form có ô "Tháng nhuận" và tuỳ chọn `fixLeap`. iztro xử lý ngày/tháng theo
`fixLeap`; tầng cổ học bị bỏ qua cho lá số tháng nhuận vì cohoc.net không có tuỳ chọn tương ứng.

### Scoring engine (deterministic)

Chấm điểm từng cung theo đúng hệ trọng số của bộ luật, nhưng bằng code:

```
delta  = 0.60 × majorSignal          // chính tinh + độ sáng (Miếu 1.0 … Hãm 0.15)
       + 0.40 × (support + risk)     // Lục cát/Tứ Hóa vs Lục sát/Hóa Kỵ
total  = 50 + 45 × delta × damping   // Tuần/Triệt bóp biên độ về 50
```

- **VCD**: mượn 60% tín hiệu cung xung chiếu, trừ 0.08 vì thiếu chủ lực tại chỗ.
- **VCD + Tuần/Triệt**: damping = 0.9 thay vì 0.55 — đúng cổ pháp "VCD đắc Tuần/Triệt thì vững".
- Xếp hạng: A ≥ 75, B ≥ 58, C ≥ 42, D < 42.

Điểm này đi vào **cả UI và payload**. Bộ luật ràng buộc mô hình chỉ được lệch ±8 điểm và phải ghi
lý do → UI và bản luận không bao giờ "đá nhau".

---

## 4. Module 2 — Classical Retriever

### Tại sao phải POST, không GET

Trang kết quả của cohoc là ASP.NET WebForms. Form nhập **dương lịch** ở
`/lay-la-so-tu-vi-ngay-duong-lich.html` yêu cầu `__VIEWSTATE` + `__EVENTVALIDATION` + cookie
session. Sau POST, server 302 sang URL tĩnh:

```
/tong-hop-la-so-tu-vi-nam-canh-ngo-thang-9-ngay-4-gio-ngo-duong-nam-lid-34647.html
```

URL này GET lại được → dùng làm cache key tự nhiên.

Form nhập **âm lịch** ở `/Default.aspx` đã test: POST trả lại form, không render kết quả. Nên
service luôn quy về dương lịch trước (iztro cho `solarDate` chính xác), rồi mới gọi.

### Parser

Cấu trúc trang:

```html
<div class='noi-dung'>
  <h3 class='giaidoan-cung'><a name='menh'>CUNG MỆNH</a></h3>
  <div class='giaidoan'>
    <h4 class='nguyennhan'>Cung Mệnh an tại Thìn có Tham lang</h4>
    <p class='ketqua'>… prose …</p>
    <em class='thamkhao'>Phù Cừ - Tử Vi Cổ Học</em>
  </div>
  …
```

Văn bản thô cực lớn — **425.000 ký tự** cho một lá số. Parser xử lý 3 bước:

1. **Bỏ data-dump** — block `"Thông tin cung X thiên bàn ở vị trí…"` và các đoạn chỉ liệt kê sao
   (`- Tọa thủ: …`). Thông tin đó đã có trong JSON, giữ lại chỉ tốn token.
2. **Dedupe** — cohoc lặp cùng một đoạn cho nhiều biến thể địa bàn.
3. **Xếp hạng theo độ liên quan rồi mới cắt ngân sách** — đoạn nào nhắc tới sao đang tọa thủ của
   lá số được ưu tiên. Nếu giữ theo thứ tự tài liệu, 2.600 ký tự ngân sách bị 2 bài luận "cách
   cục chung" ăn hết và đoạn luận đúng sao thủ mệnh bị đẩy ra ngoài.

Kết quả: **425.000 → ~55.000 ký tự** (~15.000 token), chia đều 12 cung.

### Cross-check

`parseCohocChartTable()` bóc bảng 12 cung của cohoc, `crossCheckChart()` so với lá số engine.
Chạy khi cần đối chiếu bằng `npm run chart:audit`; pipeline không đẩy kết quả này thành cảnh báo
trên UI nữa — lá số trình bày và luận giải luôn theo engine.

**So theo ĐỊA CHI, không theo tên cung.** Hai bên gọi cung khác nhau — cohoc viết "SỰ NGHIỆP",
"GIAO HỮU", "MỆNH Thân" trong khi engine dùng "Quan Lộc", "Nô Bộc", "Mệnh" — nên cách so theo tên
cũ bỏ qua im lặng 3/12 cung mà vẫn báo "khớp hoàn toàn"; cùng lúc parser không tách được chữ can
viết tắt có dấu ("Ấ. Dậu") nên mất neo địa chi. Cả hai đã sửa và ghim bằng test offline trong
`npm run chart:test` (fixture có cung "GIAO HỮU", chữ can "Ấ.", một cung bị làm sai sao và một
cung bị xóa).

Số liệu đo (22/10/2026, `npm run chart:audit`, chạy offline trên cache):

- **144/144 lá số** (2 giới × 9 năm × 8 giờ, dương lịch) thỏa bất biến: 12 cung không trùng, đúng
  14 chính tinh, đúng 1 cung Thân, điểm trong [5,98], đại vận 12 bản liên tục mỗi bản 10 năm,
  xung chiếu/tam hợp đúng vị trí chi.
- **138/138** lá số dựng lại bằng Âm lịch cho CÙNG kết quả như nhập Dương lịch.
- **3/3 lá số trong cache** (1990-10-21, 2004-02-27, 2005-04-10) khớp 100% bảng sao cohoc; lá
  1990-10-21 chạy lại `npm run cohoc:test` trên trang mới vẫn khớp 12/12.
- Ngũ hành: nạp âm Canh Ngọ = Lộ Thượng Thổ, Cục = Kim Tứ Cục, Thân cư Mệnh, Mệnh tại Thìn có
  Tham Lang — đúng cả 4 mục cohoc ghi ở thẻ `keywords` của trang.
- **0 lỗi dữ liệu ở tầng soạn payload** (`npm run payload:audit`): đọc lại NGƯỢC chuỗi payload mà
  mô hình sẽ nhận rồi so từng trường với JSON của engine — 12 dòng cung (chi, can, chính tinh,
  Tuần/Triệt, điểm, đại hạn), 4 tứ hóa năm sinh, 12 bản đại vận, tiểu hạn lưu niên, 12 dòng phụ
  tinh. Lá số tốt vô nghĩa nếu tầng này làm sai trước khi đưa cho mô hình.

### Vận hành có trách nhiệm

- Cache 30 ngày — đĩa (`.cache/cohoc/`) khi chạy local, KV `COHOC_CACHE` khi chạy Worker;
  1 lá số = 1 request.
- Serialize request + giãn cách 1,2s.
- Timeout 25s mỗi lần; nếu cohoc trả trang xếp hàng thì chờ đúng thời gian server báo, tối đa 3 lần.
- `robots.txt` của cohoc không chặn `*` (chỉ chặn bot SEO/AI crawler cụ thể) — nhưng vẫn nên giữ
  cache và tần suất thấp. Dùng `COHOC_ENABLED=false` khi không cần.
- Lỗi mạng **không làm sập pipeline**: trả object rỗng + warning; payload vẫn soạn từ JSON lá số
  và ghi rõ thiếu văn bản cổ học để mô hình hạ độ tin cậy.

### Trang "xếp hàng" của cohoc — lỗi đã gặp và cách xử lý

Ngày 22/10/2026, POST form đột nhiên trả về trang **18KB** tiêu đề `Xử lý nghiệp vụ - <lid>` thay
vì trang kết quả 742KB. Trang đó nói: *"Hệ thống đang thực hiện xử lý nghiệp vụ. Chờ -- giây…"*
và có `var time_redirect = 5526 + random(2000)`.

Ba lỗi nối tiếp, cả ba đều đã sửa:

| Lỗi | Hậu quả | Sửa |
|---|---|---|
| Guard cũ kiểm tra `html.includes('noi-dung')` | Trang xếp hàng **cũng chứa** `noi-dung` (class CSS của template 404) → lọt qua | đổi sang `giaidoan-cung` + độ dài > 100KB |
| Parse ra 0 cung vẫn được **ghi cache 30 ngày** | Mọi lần sau đọc cache và tưởng cohoc không có dữ liệu | không cache kết quả 0 cung; `readCache` cũng từ chối cache rỗng |
| Retry mù | Mỗi POST sinh một job mới (lid khác) → đập server đang bận | đọc `time_redirect`, chờ đúng thời gian, tối đa 3 lần; sau thất bại **backoff 10 phút** |

Kèm theo: **hai loại cache, hai loại key**.

| Cache | Key | Vì sao |
|---|---|---|
| JSON đã parse | có `PARSER_VERSION` | đổi cách bóc thì phải bóc lại |
| HTML thô | **không** có version | HTML không phụ thuộc parser → khi mạng hỏng vẫn đọc bản cũ, parse bằng code **mới nhất** |

Nhờ vậy khi cohoc chặn IP, hệ thống vẫn trả bản luận đầy đủ từ HTML đã lưu, kèm cảnh báo *"Dùng
bản lưu N giờ trước"* — thay vì luận chay hoặc im lặng.

### `budgetPassages` không bao giờ cắt giữa câu

Bản cũ: `text.slice(0, remain) + '…'`. Mô hình gặp đoạn cụt thì **bỏ luôn cả đoạn** — đã thấy thật
trong `editorialNotes`: *"đoạn Thất tinh định điểm bị cắt dở nên không dùng được"*. Tức là vừa mất
token vừa mất dữ liệu, tệ hơn là không gửi gì.

Nay: lùi về ranh giới câu cuối cùng còn nằm trong ngân sách; không tìm được ranh giới nào đủ dài
(≥180 ký tự) thì **bỏ hẳn đoạn** và ghi vào `warnings` để biết đang thiếu gì.

### Cửu Thiên Phi Tinh — bóc văn xuôi thành dữ liệu

Ba khối `Thất tinh định điểm`, `Mệnh Ẩn`, `vượng suy` được cohoc in dưới dạng văn xuôi nhưng bản
chất là dữ liệu:

```
Thất tinh định điểm   Thiên (tháng sinh) → cung Sự nghiệp
                      Địa   (ngày sinh, trung gian) → cung Tật ách
                      Nhân  (giờ sinh, quan trọng nhất) → cung Phụ mẫu
                      Liên kết: Sự nghiệp + Phụ mẫu = lấy Tật ách làm trung gian

Mệnh Ẩn tại NGỌ       Tứ Hóa ẩn: Lộc→Giao hữu (Hợi) · Quyền→Sự nghiệp (Tuất)
                                  Khoa→Tài bạch (Dần) · Kỵ→Điền trạch (Dậu)

Tinh đẩu              Tham lang MỘC (độ số 1) · Văn xương KIM (độ số 1)
```

Bóc thành field (`CohocOverviewExtras`) rồi render lại gọn trong payload: **536 ký tự văn xuôi →
~150 ký tự có cấu trúc**, và không còn gì để cắt giữa câu.

Một bẫy phải xử lý: hệ này dùng **tọa độ riêng (Ẩn bàn)**, chi của nó không trùng Thiên bàn. Lần
chạy đầu mô hình thấy lệch chi, kết luận *"không khớp 12 cung của engine, bỏ qua"* và vứt cả khối.
Nay payload ghi rõ: *"chỉ dùng TÊN CUNG; đừng coi việc lệch chi là mâu thuẫn"*.

### Tối ưu ngữ cảnh đưa vào payload (đo thật)

Corpus cổ học gốc **205.657 ký tự** cho 12 cung. Sau khi nén: **30.707 ký tự (15%)**.

| Bước | Tác động |
|---|---|
| Bỏ đoạn **Địa bàn / Nhân bàn** | −32% (66.324 ký tự mô tả một lá KHÁC — Mệnh có Thiên Cơ thay vì Tham Lang) |
| Tách câu + khử trùng gần đúng (Jaccard 4-gram) | −40% còn lại, bắt được câu gần trùng chứ không chỉ trùng tuyệt đối |
| Cổng liên quan: câu phải nhắc sao của cung hoặc là câu khẳng định | loại hẳn bài giảng lịch sử cách cục |
| Chart context chỉ in cung liên quan | −3.000 ký tự mỗi lượt |
| Bỏ luật chết trong bộ luật | −400 ký tự |

Mỗi lượt trong chế độ 4 lượt chỉ mang văn bản cổ học của đúng nhóm cung của mình, thay vì cả 12
cung.

### Dữ liệu khai thác từ cohoc.net

Không chỉ lấy văn bản — trang kết quả còn có **3 bảng số liệu** mà parser từng xóa sạch khi làm
sạch HTML:

| Dữ liệu | Nội dung | Dùng để |
|---|---|---|
| **Đẩu Minh** (12 cung × 3 bàn) | Điểm −3..+3 theo ngũ hành can-chi của cung, không theo sao | Hệ quy chiếu thứ hai, đối chiếu với điểm engine |
| **Cung khí + sao hỉ/kị** | "đại cát", "cát hung đan xen"… + sao nào là hỉ/kị thần của cung | Giải thích vì sao cùng một sao tốt mà cung này lại xấu |
| **Tỉ lệ sao tốt** | % sao tốt tại cung và trong tam phương tứ chính | Đo mật độ cát tinh, không chỉ đếm số |
| **Ngũ hành hỉ kị** | Hỉ thần / Kị thần / Nhàn thần / **Dụng thần** | Cải vận: màu sắc, hướng, nghề |
| **Vận năm** (lưu niên) | Bình giải riêng cho 4 năm quanh năm xem hạn | Trước đây bị bỏ với lý do "ta tự tính" |

Hiển thị ở panel "Chấm theo Tử Vi Cổ Học" dưới bàn lá số, và đưa vào payload để mô hình thấy chỗ
nào hai hệ quy chiếu đồng thuận, chỗ nào lệch.

---

## 5. Luận giải trong Gemini

### Hai cách chạy — chọn bằng mục "Cách chạy"

| Cách chạy | Bộ luật nằm ở đâu | Kích thước mỗi phần | Dùng được ở đâu |
|---|---|---|---|
| **Không cần cài** (mặc định) | nhúng đầu mỗi prompt | 12,9k (gọn) – 21,1k (kèm cổ học) | mọi nơi, gồm **ứng dụng điện thoại** |
| **Đã cài kỹ năng** | `SKILL.md` cài một lần | 7,1k (gọn) – 15,4k (kèm cổ học) | chỉ bản web — Gemini mobile **không có nút tải kỹ năng** |

Vì sao vẫn giữ bản "không cần cài" dù prompt dài hơn (khoảng 1,4 lần ở bản kèm cổ học, gấp ba ở
bản gọn): ứng dụng Gemini trên điện thoại không
cho tải tệp, nên đường duy nhất để luận giải bằng điện thoại là mỗi phần tự mang theo bộ luật
(`buildInlineRulebook` trong `lib/tuvi/skill-package.ts`). Bản này bỏ mục KÍCH HOẠT và phần dặn
viết đủ 4 phần — mỗi lượt chỉ có một phần — nhưng giữ nguyên các điều khoản quyết định chất lượng:
cách ly ngữ cảnh, trọng số 60/30/10, lệch điểm ±8, luật văn phong/độ dài, checklist tự kiểm.
`pipeline:test` canh đúng danh sách đó để hai bản không lệch luật.

### Vì sao đóng gói thành kỹ năng

Gemini đang chuyển từ **Gems** (trợ lý có ô Instructions dán văn bản) sang **Kỹ năng** (Skills):
gói có `SKILL.md` ở thư mục chính, tên kỹ năng viết **kebab-case** trong frontmatter.

Vấn đề mà kỹ năng giải quyết: khi dán dữ liệu vào một cuộc chat Gemini bình thường, câu trả lời bị
ảnh hưởng bởi:

- **“Saved info”** của tài khoản (nghề nghiệp, sở thích, quê quán…) — mô hình có thể đan những thứ
  này vào bản luận;
- thói quen trả lời mà mô hình đã hình thành trong các chat khác của tài khoản;
- nội dung các cuộc trò chuyện trước.

Với một lá số, đó là **nhiễu**: bản luận lệch khỏi dữ liệu mà người đọc không biết vì sao. Kỹ
năng có bộ luật cố định, dùng lại được qua các chat; mỗi chat vẫn có ngữ cảnh riêng.

**Kỹ năng không giải quyết được:** “Saved info”/Memory ở cấp tài khoản. Bộ luật có điều khoản yêu
cầu bỏ qua, nhưng muốn chắc thì phải tự xóa trong *Saved info* hoặc tắt *Memory* trong
*Cài đặt → Personal Intelligence*. Đừng tắt Keep Activity — Skills cần mục này.

### Cài kỹ năng — chỉ làm được trên máy tính

Gemini nhận `SKILL.md`, một thư mục, hoặc tệp `.zip` có `SKILL.md` ở thư mục gốc (màn
*Skills → Create → Upload*; tổng dung lượng ≤ 100 MB). **Ứng dụng Gemini trên điện thoại chưa có
nút tải tệp cho kỹ năng** — ở điện thoại hãy dùng cách chạy "Không cần cài". Cách cài:

```
1. Bật Keep Activity: Cài đặt & trợ giúp → Hoạt động → Giữ hoạt động (Keep Activity)
2. Bấm "Tải gói .zip" trong tab Luận giải  (hoặc /api/skill?format=zip)
3. Gemini → Tùy chỉnh (Customize) → Kỹ năng (Skills) → Tạo (Create) → Tải lên (Upload)
   → chọn tệp .zip. Không thấy Customize thì bấm More (Thêm).
4. Trong chat, gõ / (hoặc @) và chọn tuvi-dau-so trước khi dán prompt.
```

Muốn để dạng thư mục: bấm "Chọn thư mục & ghi" — ứng dụng ghi `SKILL.md` + `references/` vào thư mục
bạn chọn; sau đó kéo **cả thư mục** vào ô Upload. Nút này dùng File System Access API
(`showDirectoryPicker`) nên chỉ chạy trên Chromium và phải là `localhost` hoặc HTTPS.

Tải lẻ từng tệp (nếu không dùng được .zip):

| Tệp | Endpoint | Vai trò |
|---|---|---|
| `SKILL.md` | `/api/skill` | **bắt buộc** — frontmatter + toàn bộ bộ luật (9.891 byte, trần nội bộ 10.000) |
| `vi-du-van-phong.md` | `/api/skill?file=vi-du-van-phong` | tuỳ chọn — 3 mẫu câu cổ học + phân tích |
| `vi-du-dau-ra.md` | `/api/skill?file=vi-du-dau-ra` | tuỳ chọn — một cung viết ĐÚNG/SAI + chiều sâu theo điểm |
| `du-lieu-mau.md` | `/api/skill?file=du-lieu-mau` | tuỳ chọn — khối dữ liệu mẫu |

`SKILL.md` **tự đủ**: bỏ cả 3 tệp tham khảo vẫn chạy đúng — checklist tự kiểm, bảng chiều sâu theo
điểm và toàn bộ luật đều nằm trong đó. Các tệp phụ chỉ thêm ví dụ.

Tách `references/` không phải cho gọn: `SKILL.md` nạp **mỗi lượt**, tài liệu tham khảo chỉ nạp khi
cần. Nhét hết vào một file là bắt người dùng trả context cho phần họ không dùng.

`/api/skill?format=zip` là gói đầy đủ (SKILL.md + references/) — đường chính cho Gemini. Vẫn dùng
được cho nền tảng khác nhận zip (Claude, công cụ agent…).

**Trần nội bộ 10.000 byte là byte, không phải ký tự** — tiếng Việt UTF-8 tốn ~1,23 byte/ký tự, nên
cứ thêm nội dung vào `SKILL.md` là phải cắt chỗ khác tương đương. `pipeline:test` kiểm bằng
`Buffer.byteLength`; check theo ký tự dễ báo "ổn" trong khi thực tế vượt trần. Gói hiện tại:
**4 tệp, zip 16.543 byte (16,2 KB)**, `SKILL.md` 7.370 ký tự = 9.570 byte.

Hai mục bắt buộc giữ dưới trần:

- **§6 — Độ dài:** mỗi cung 2 đoạn ngắn (3–4 câu/đoạn) + 3 nhãn; cung ≥75 và cung ≤50 viết khác khuôn.
- **TỰ KIỂM TRƯỚC KHI TRẢ LỜI:** 5 mục — đúng phần, đúng 4 cung, câu truy được về sao, lệch điểm
  ≤8, không JSON/bảng/code fence.

### Bộ luật và dữ liệu tách rời

Khi bộ luật đã nằm trong kỹ năng, mỗi lá số chỉ cần dán **dữ liệu**:

| Chế độ | Kích thước (một lượt) | Khi nào dùng |
|---|---|---|
| **Gọn** | ~7.400 ký tự ≈ 6.100 token | dán nhanh; luận từ lá số, ghi `độ tin cậy: thấp` |
| **Kèm cổ học** | ~36.500 ký tự ≈ 30.400 token | bản đầy đủ, có dẫn chiếu sách cổ |

Chọn cách chạy "Không cần cài" thì mỗi phần cộng thêm ~5k ký tự bộ luật: bản kèm cổ học thành
17,5k–21,1k mỗi phần, bản gọn 11,8k–12,9k. Vẫn dưới ngưỡng 30k ký tự mà `pipeline:test` canh.

Số thực tế thay đổi theo lượng văn bản cổ học tải được: khi cohoc.net không trả dữ liệu (hoặc lá
số rơi vào tháng nhuận), bản "kèm cổ học" chỉ còn ~7.000 ký tự và payload tự ghi
`độ tin cậy: thấp`.

Payload mang **cùng một ví dụ đầu ra** + bảng *chiều sâu theo điểm engine* (`buildFewShot` trong
`prompt-builder.ts`, +1,5k ký tự). `pipeline:test` canh điều này.

### Chia 4 lượt, cùng một chat

Một câu trả lời chứa cả 12 cung dễ bị cắt hoặc bị mô hình "viết cho xong". Nên ứng dụng chia:

| Lượt | Nội dung | Bộ cung |
|---|---|---|
| 1 | Tổng quan: cách cục, ba trụ, 10 năm tới, việc làm ngay | — |
| 2 | Tam Hợp Sự nghiệp | menh, quan_loc, tai_bach, thien_di |
| 3 | Tam Hợp Gia đạo | phuc_duc, phu_the, tu_nu, dien_trach |
| 4 | Quan hệ xã hội & sức khỏe, kết bằng khối "Hỏi tiếp" | phu_mau, huynh_de, no_boc, tat_ach |

Bốn phần được dán **lần lượt vào cùng một chat**: phần sau nối tiếp ngữ cảnh phần trước, và sau
phần 4 mô hình đã có toàn bộ lá số nên **hỏi tiếp ngay trong chat** — không phải sao chép lại dữ
liệu, không phải mở chat mới. Mỗi phần vẫn tự mang dữ liệu của mình nên mở chat mới vẫn chạy, chỉ
mất khả năng hỏi tiếp liền mạch.

Luồng trên UI:

```
Cách chạy:  [ Không cần cài ]  [ Đã cài kỹ năng ]        (chỉ bản "đã cài" có mục "Cách trả lời")

P1 · Tổng quan          → Sao chép / Chia sẻ → dán vào chat Gemini
P2 · Sự nghiệp          → Sao chép / Chia sẻ → dán tiếp vào CHÍNH chat đó
P3 · Gia đạo            → Sao chép / Chia sẻ → dán tiếp
P4 · Xã hội & sức khỏe  → Sao chép / Chia sẻ → dán tiếp → hỏi tiếp thoải mái trong chat
```

- **Bốn lượt** là chế độ khuyến nghị, và là chế độ duy nhất của bản "không cần cài" — một lượt mà
  mang cả luật lẫn 12 cung thì vượt ngưỡng dán nổi trên điện thoại.
- **Một lượt** (chỉ khi đã cài kỹ năng) dùng khi muốn sao chép ít lần; mô hình viết liền 4 phần
  Markdown, nếu bị cắt giữa chừng thì gõ "tiếp".
- Nút **Chia sẻ** chỉ hiện khi trình duyệt có Web Share API (`navigator.share`); chia sẻ thất bại
  thì tự rơi về sao chép. Ở HTTP trong mạng nội bộ, Clipboard API bị chặn nên có đường
  `execCommand('copy')` dự phòng trong `components/ChatBridge.tsx`.

Bộ luật lấy ở `/api/skill` (`SKILL.md`), hoặc `/api/skill?inline=1` nếu muốn xem trước dạng văn
bản. `/api/skill?format=zip` vẫn có cho nền tảng khác nhận zip.

### Gói kỹ năng được canh bằng test

Gói được **sinh từ code**, không phải file viết tay: SKILL.md, bộ luật nhúng và mục "NHIỆM VỤ"
của từng lượt cùng lấy mẫu từ các hằng `SKELETON_*` trong `skill-package.ts`, và mang
`PROMPT_VERSION`. Sửa mẫu một chỗ là cả ba đường đổi theo. `scripts/test-pipeline.ts` canh:

```
✓ hợp đồng Markdown: tiêu đề phần, mẫu cung, 3 nhãn, luật hỏi tiếp
✓ mỗi phần đúng bộ 4 cung; phần 2–4 không kèm Đại vận; chỉ phần 4 mời hỏi tiếp
✓ bản nhúng (điện thoại) mang đủ điều khoản gốc và < 30k ký tự
✓ SKILL.md < 10.000 byte; ZIP có SKILL.md ở gốc + end-of-central-directory
✓ tháng nhuận: engine đủ 12 cung, có cờ `classicalSkip`, không cảnh báo trùng
```

---

## 6. API

| Endpoint | Mô tả |
|---|---|
| `POST /api/chart` | Trả `NormalizedChartJSON` (~0,1s khi có cache cổ học; lần đầu có thể 15–20s nếu cohoc xếp hàng) + `classicalMeta` + `classicalSkip` + `warnings` |
| `POST /api/report/export` | Soạn dữ liệu dán vào Gemini: 4 phần (`skillDelivery: 'parts'`) hoặc một lượt, kèm bộ luật khi `skillInstall: 'inline'` |
| `GET /api/skill` | `SKILL.md` (mặc định), `?file=…` (3 tệp tham khảo), `?inline=1`, `?format=zip` |

Nội dung chung (`schemas/request.schema.ts`):

```json
{
  "name": "Nguyễn Văn A",
  "gender": "nam",
  "calendarType": "solar",
  "date": "1990-10-21",
  "hour": 12,
  "minute": 0,
  "viewingYear": 2026,
  "viewMode": "tong-hop",
  "skipClassical": false
}
```

`/api/report/export` nhận thêm:

```json
{
  "skillMode": "full",
  "skillDelivery": "parts",
  "skillInstall": "inline"
}
```

`skillInstall: 'inline'` = mỗi phần mang theo bộ luật (cách chạy "Không cần cài") và luôn trả về 4
phần; `'installed'` (mặc định) = chỉ dữ liệu, luật lấy từ kỹ năng đã cài.

---

## 7. Tính năng tra cứu & chia sẻ

Học từ các trang huyền học lớn (tuviglobal, cohoc, giaimatuvi): họ chia nội dung theo miền đời
sống và có hạn năm, nhưng **không trang nào có từ điển sao tra cứu được, cũng không có in/chia
sẻ**. Ba khoảng trống đó được lấp ở đây.

| Tính năng | Cách dùng | Vì sao |
|---|---|---|
| **Từ điển sao** | Bấm vào bất kỳ tên sao nào trên bàn lá số | Bàn chỉ hiện "Tham Lang (Miếu)" — người không học tử vi không biết nghĩa. Ngăn kéo cho: bản chất, đắc địa, hãm địa, chủ quản gì, và **sao này nằm ở cung nào trong chính lá đang xem** |
| **Permalink** | `?n=&g=&c=&d=&h=&m=&y=` | F5 hay sao chép liên kết đều mở lại đúng lá số. Mở từ link **không tự gọi mô hình**, chỉ nạp lá số |
| **In / PDF** | Nút "In" ở thanh công cụ | `@media print` ẩn form, toolbar, ngăn kéo; bàn lá số và bài luận in gọn, không cắt trang giữa mục |
| **Lá số mẫu** | Nút ở màn hình trống | Người mới không phải tự bịa ngày sinh để thử |

Dữ liệu từ điển: `lib/tuvi/star-dictionary.ts` — 26 sao (14 chính tinh, lục cát, lục sát, Lộc
Tồn, Thiên Mã, Tuần, Triệt). Viết ngắn theo lối sách cổ, không chép nguyên văn nguồn.

---

## 8. Giới hạn đã biết

1. **Scoring chưa tính "cung khí"** (ngũ hành của can chi cung, Đẩu Minh) như cohoc. Vì vậy có
   trường hợp cohoc chấm `-0.96` (đại hung) còn engine chấm 79 (Tham Lang Miếu + Văn Xương). Cả
   hai đúng theo hệ quy chiếu riêng — bộ luật yêu cầu mô hình phân xử và ghi vào `editorialNotes`.
2. **Chưa hỗ trợ Trung Châu / địa bàn–nhân bàn.** iztro có `config.algorithm: 'zhongzhou'` và
   `astroType: 'earth'|'human'` — chỉ cần thêm tham số vào `ChartInput` là dùng được.
3. **Cohoc có thể đổi cấu trúc HTML** bất cứ lúc nào. Parser sẽ trả `warnings` thay vì crash, nhưng
   cần theo dõi `stats.passageCount` — tụt bất thường là dấu hiệu vỡ parser.
4. **Chất lượng luận giải phụ thuộc mô hình Gemini và việc kỹ năng có thực sự được nạp.** Ứng dụng kiểm
   được cấu trúc, độ dài, căn cứ sao và tính nhất quán với lá số; không kiểm được luận đoán đúng
   hay sai. Nếu mô hình cắt giữa chừng hoặc không gọi kỹ năng, phải yêu cầu viết tiếp; công cụ
   kiểm thử báo đúng khối hỏng.
5. **`(VCD)` trong bảng metrics của cohoc không dùng làm chuẩn để đối chiếu.** Trên 36 cung đã đo,
   metrics ghi "(VCD)" ở 9 cung mà CHÍNH bảng sao của cohoc (và engine) có chính tinh — hai khối
   dữ liệu do cùng một trang sinh ra còn bất đồng nhau. Đối chiếu bằng bảng sao HTML; metrics chỉ
   dùng cho Đẩu Minh và cung khí.
6. **Chưa đối chiếu phụ tinh** (cát/sát tinh, Tuần, Triệt) với cohoc: bảng HTML có sẵn `.sao-tot` /
   `.sao-xau`, nhưng tạp diệu hai bên khác hệ tên — cần bảng ánh xạ trước khi so.
7. **Chưa có giờ mặt trời thật / chọn múi giờ.** Giờ sinh vẫn được hiểu là giờ đồng hồ tại nơi sinh.
   Với người sinh ở múi giờ khác Việt Nam hoặc sát ranh giới 2 giờ, sai lệch có thể đổi cả lá số —
   engine chỉ cảnh báo, không tự quy đổi.
8. **Tháng nhuận đã nhập được, nhưng tầng cổ học bị bỏ qua.** Form có ô "Tháng nhuận" và tuỳ chọn
   `fixLeap`; engine dựng đúng lá số. cohoc.net không có tuỳ chọn tháng nhuận nên văn bản cổ học sẽ
   thuộc một lá số khác — pipeline chủ động bỏ tầng này, trả cờ `classicalSkip: 'leap-month'`;
   bản luận khi đó chỉ dựa trên lá số engine. Giao diện không hiện thông báo kỹ thuật nào.
9. **`quote-real` chỉ mạnh bằng nguồn đã tải.** Validator đối chiếu câu phú với văn bản cổ học hiện
   có; nếu tầng cổ học bị tắt hoặc không tải được, mọi câu phú đều bị đánh rớt (không có gì để đối
   chiếu). Đây là hành vi cố ý: thà báo "chưa kiểm chứng được" còn hơn cho qua một câu phú bịa.
