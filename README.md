# TuVi Engine — Lập lá số & luận giải Tử Vi Đẩu Số

Hệ thống 3 tầng: **Chart Engine** (an sao) → **Classical Retriever** (văn bản cổ học) → **AI Synthesis Agent** (luận giải có cấu trúc).

Mục tiêu: lá số an chính xác, bản luận giải có chiều sâu như tuvi.cohoc.net nhưng **không mâu thuẫn**, có điểm số từng cung, và UI hiện đại (Bento Grid + Tabs theo Tam Hợp).

## Tính năng chính

- **An sao chuẩn Nam phái** bằng `iztro`, chuẩn hoá về `NormalizedChartJSON`: 12 cung, 14 chính tinh, phụ tinh, Tứ Hóa, Thân cư, đại vận/lưu niên và điểm engine 0–100 kèm lý do.
- **Đối chiếu độc lập** với bảng lá số của `tuvi.cohoc.net`, so theo **địa chi cung** (không theo tên cung): 36/36 cung khớp trên 3 lá số mẫu.
- **Luận giải có cấu trúc** 4 phần / 12 cung theo schema Zod: mỗi cung có `headline`, `narrative`, điểm + `scoreDelta`/`scoreReason`, và `evidence` là tên sao **có thật** trong lá số.
- **Vòng kiểm chất lượng 11 tiêu chí** chạy ngay khi model trả lời; rớt tiêu chí nào báo đúng tiêu chí đó (SSE `event: quality` cho UI).
- **Kỹ năng Gemini** xuất `SKILL.md` + 3 file tham khảo (zip 16 KB): bộ luật cài một lần, mỗi lá số chỉ dán dữ liệu (~7k ký tự).
- **Cầu nối chat web**: copy payload → dán vào claude.ai / gemini / grok → dán câu trả lời về, app tự tách 4 khối, validate và cache.
- **Cache hai lớp**: báo cáo theo hash prompt (lượt xem lại = 0 lời gọi) và cache cohoc 30 ngày (1 lá số = 1 request).

## Công nghệ

| Lớp | Thành phần |
|---|---|
| Web | Next.js 15 (App Router) · React 19 · TypeScript `strict` |
| An sao | `iztro` (lang `vi-VN`) + scoring engine tự viết, deterministic |
| Bóc văn bản cổ học | `cheerio` — POST form ASP.NET của cohoc.net, có cache đĩa |
| AI | `ai` SDK (`streamObject`/`streamText`) — mọi provider OpenAI-compatible |
| Kiểm tra | `zod` (schema đầu ra) + validator 11 tiêu chí + script `tsx` chạy offline |

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
│ MODULE 3 — AstrologyAgentService        lib/tuvi/astrology-agent.service.ts
│  prompt-builder → system prompt Đại sư + Zod schema
│  streamObject → SSE (partial / done / error)
└───────────────────────────────────────────────────────────────┘
```

Điểm vào duy nhất cho tầng ngoài: `lib/tuvi/index.ts` và `lib/tuvi/pipeline.ts`.

---

## 2. Chạy

```bash
npm install
cp .env.example .env.local        # điền LLM_API_KEY (xem ma trận provider bên dưới)
npm run dev                       # http://localhost:3000
```

Thời gian thực tế với Claude Sonnet 5.5: lá số ~1s, báo cáo đầy đủ ~7 phút
(4 lần gọi), 61k token output. Với Gemini 3.5 Flash nhanh hơn nhưng quota free
chỉ 20 request/ngày/model.

Kiểm thử từng tầng (không cần API key):

```bash
npm run chart:test      # Module 1: in bảng 12 cung + điểm + assert bất biến
npm run cohoc:test      # Module 2: POST thật lên cohoc.net, in thống kê + cross-check
npm run pipeline:test   # Module 1+2+3 không cần key: đo prompt, chống lệch schema↔skill,
                        #   validator 11 tiêu chí (fixture cố tình làm hỏng), SSE bằng mock
npm run chart:audit     # Chất lượng LÁ SỐ: 144/144 bất biến, đối chiếu bảng sao cohoc
npm run payload:audit   # Chất lượng PAYLOAD đưa model: 12 cung, tứ hoá, đại vận, lưu niên
npm run report:real     # Gọi LLM thật (cần LLM_API_KEY)
npm run prompt:dump     # Xuất demo/prompt-sample.md — prompt THẬT sẽ gửi cho LLM
npm run snapshot        # Xuất demo/snapshot.html — xem giao diện không cần Next/LLM
```

`demo/snapshot.html` render bằng chính component của app (`react-dom/server`), nên nhìn nó là nhìn đúng UI thật. Dữ liệu lá số là thật; phần chữ luận giải là fixture mock (để kiểm tra layout + Zod).

Ba lệnh sinh output (`report:real`, `prompt:dump`, `snapshot`) và cache đều nằm trong
`.gitignore`: repo **không chứa lá số đã sinh ra**, chỉ chứa code. Chạy lại lệnh là có lại
file trên máy mình.

Kết quả đã chạy thực tế (21–22/10/2026):

```
chart:test     ✓ 4 lá số, 12 cung, 12 đại vận, 1 cung Thân, điểm trong [5,98]
cohoc:test     ✓ 3.7s, 484 đoạn thô → 55.225 ký tự, cross-check "Khớp hoàn toàn"
pipeline:test  ✓ payload 6.906 / 36.039 ký tự — ví dụ đầu ra có ở cả 2 đường
               ✓ SKILL.md 9.893/10.000 byte — gói 4 tệp, có §6 chiều sâu + §10 tự kiểm
               ✓ validator 11 tiêu chí bắt được count-12 / evidence-real / score-delta
               ✓ SSE (mock) có event quality sau done, kết thúc 'done', không 'error'
payload-audit  ✓ 0 lỗi dữ liệu — bảng 12 cung, 4 tứ hoá, 12 đại vận, lưu niên khớp engine
```

Biến môi trường:

| Biến | Ý nghĩa |
|---|---|
| `LLM_API_KEY` | Bắt buộc. Bất kỳ provider OpenAI-compatible. |
| `LLM_BASE_URL` | Bỏ trống = OpenAI. DeepSeek: `https://api.deepseek.com/v1`. |
| `LLM_MODEL` | Mặc định `gpt-4o-mini`. |
| `COHOC_ENABLED` | `false` để tắt tầng cổ học (test offline / bị chặn IP). |

`.env.example` liệt kê đủ biến kèm chú thích; **không** đặt key thật vào đó. `.env.local`
nằm trong `.gitignore` và không được đẩy lên.

### Cấu trúc thư mục

```
app/
  page.tsx                  UI: nhập ngày giờ → bảng lá số → báo cáo
  api/chart                 POST sinh lá số
  api/report                POST sinh/đọc báo cáo (SSE: partial / quality / done)
  api/report/export|import  Xuất · nhập + validate báo cáo
  api/skill                 SKILL.md · 3 file tham khảo · zip
components/                 BirthForm, ChartBoard, StarDrawer, ReportView,
                            ChatBridge, CohocPanel
lib/tuvi/                   toàn bộ logic — vào bằng index.ts / pipeline.ts
  chart-generator.service.ts   Module 1 (an sao + scoring)
  cohoc-knowledge.service.ts   Module 2 (cổ học + cross-check)
  astrology-agent.service.ts   Module 3 (gọi LLM)
  prompt-builder.ts · scoring.ts · report-quality.ts · report-cache.ts
  skill-package.ts · chat-bundle.ts · prompts.ts · zip.ts · llm.ts
schemas/report.schema.ts    Zod — hợp đồng đầu ra (4 nhóm × 4 cung)
types/tuvi.ts               NormalizedChartJSON và các kiểu dùng chung
scripts/                    test + audit chạy offline, không cần API key
demo/                       ảnh chụp giao diện + bản xuất SKILL.md
```

### Dữ liệu nào thì không có trong repo

| Thứ | Vì sao không commit |
|---|---|
| `.env.local` | API key |
| `.cache/` | HTML lá số đã bóc từ cohoc.net + báo cáo sinh ra (giữ 30 ngày trên đĩa) |
| `demo/report-real.json`, `demo/prompt-*.md`, `demo/la-so-*.md`, `demo/snapshot.html` | bản lá số/báo cáo đã sinh — chạy lệnh là tạo lại |
| `.tmp/`, `*.log`, `.workbuddy-ai/` | rác dụng cụ phát triển |

Repo giữ lại `demo/SKILL.md` + 3 file tham khảo (tài liệu, không chứa lá số) và ảnh chụp
giao diện để README/đánh giá có hình.

---

## 3. Module 1 — Chart Engine

**Input** (`ChartInput`): giới tính, loại lịch, ngày, giờ, phút, năm xem hạn.

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

**c) Tuần / Triệt** — iztro nhét lẫn trong `adjectiveStars` dưới tên `"Tuần Không"` / `"Triệt Lộ"`. Normalizer bóc ra thành cờ `hasTuan` / `hasTriet`, nếu không scoring sẽ nhiễu.

**d) Không trả raw astrolabe** — mọi field lạ bị loại bỏ. `NormalizedChartJSON` của một lá số ≈ 2.000 token, so với ~6.000 token nếu đẩy raw JSON vào prompt.

### Scoring engine (deterministic)

Chấm điểm từng cung theo đúng hệ trọng số của system prompt, nhưng bằng code:

```
delta  = 0.60 × majorSignal          // chính tinh + độ sáng (Miếu 1.0 … Hãm 0.15)
       + 0.40 × (support + risk)     // Lục cát/Tứ Hóa vs Lục sát/Hóa Kỵ
total  = 50 + 45 × delta × damping   // Tuần/Triệt bóp biên độ về 50
```

- **VCD**: mượn 60% tín hiệu cung xung chiếu, trừ 0.08 vì thiếu chủ lực tại chỗ.
- **VCD + Tuần/Triệt**: damping = 0.9 thay vì 0.55 — đúng cổ pháp "VCD đắc Tuần/Triệt thì vững".
- Xếp hạng: A ≥ 75, B ≥ 58, C ≥ 42, D < 42.

Điểm này đi vào **cả UI và prompt**. LLM bị ràng buộc chỉ được lệch ±8 điểm và phải ghi lý do → UI và bản luận không bao giờ "đá nhau".

---

## 4. Module 2 — Classical Retriever

### Tại sao phải POST, không GET

Trang kết quả của cohoc là ASP.NET WebForms. Form nhập **dương lịch** ở `/lay-la-so-tu-vi-ngay-duong-lich.html` yêu cầu `__VIEWSTATE` + `__EVENTVALIDATION` + cookie session. Sau POST, server 302 sang URL tĩnh:

```
/tong-hop-la-so-tu-vi-nam-canh-ngo-thang-9-ngay-4-gio-ngo-duong-nam-lid-34647.html
```

URL này GET lại được → dùng làm cache key tự nhiên.

Form nhập **âm lịch** ở `/Default.aspx` đã test: POST trả lại form, không render kết quả. Nên service luôn quy về dương lịch trước (iztro cho `solarDate` chính xác), rồi mới gọi.

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

1. **Bỏ data-dump** — block `"Thông tin cung X thiên bàn ở vị trí…"` và các đoạn chỉ liệt kê sao (`- Tọa thủ: …`). Thông tin đó đã có trong JSON, giữ lại chỉ tốn token.
2. **Dedupe** — cohoc lặp cùng một đoạn cho nhiều biến thể địa bàn.
3. **Xếp hạng theo độ liên quan rồi mới cắt ngân sách** — đoạn nào nhắc tới sao đang tọa thủ của lá số được ưu tiên. Nếu giữ theo thứ tự tài liệu, 2.600 ký tự ngân sách bị 2 bài luận "cách cục chung" ăn hết và đoạn luận đúng sao thủ mệnh bị đẩy ra ngoài.

Kết quả: **425.000 → ~55.000 ký tự** (~15.000 token), chia đều 12 cung.

### Cross-check

`parseCohocChartTable()` bóc bảng 12 cung của cohoc, `crossCheckChart()` so với lá số
engine. Lệch → cảnh báo ngay trên UI (thường do giờ sinh hoặc khác phái an sao).

**So theo ĐỊA CHI, không theo tên cung.** Hai bên gọi cung khác nhau — cohoc viết
"SỰ NGHIỆP", "GIAO HỮU", "MỆNH Thân" trong khi engine dùng "Quan Lộc", "Nô Bộc",
"Mệnh" — nên cách so theo tên cũ bỏ qua im lặng 3/12 cung mà vẫn báo "khớp hoàn toàn";
cùng lúc parser không tách được chữ can viết tắt có dấu ("Ấ. Dậu") nên mất neo địa chi.
Cả hai đã sửa và ghim bằng test offline trong `npm run chart:test` (fixture có cung
"GIAO HỮU", chữ can "Ấ.", một cung bị làm sai sao và một cung bị xoá).

Số liệu đo (22/10/2026, `npm run chart:audit`, chạy offline trên cache):

- **144/144 lá số** (2 giới × 9 năm × 8 giờ, dương lịch) thoả bất biến: 12 cung không
  trùng, đúng 14 chính tinh, đúng 1 cung Thân, điểm trong [5,98], đại vận 12 bản
  liên tục mỗi bản 10 năm, xung chiếu/tam hợp đúng vị trí chi.
- **138/138** lá số dựng lại bằng Âm lịch cho CÙNG kết quả như nhập Dương lịch.
- **3/3 lá số trong cache** (1990-10-21, 2004-02-27, 2005-04-10) khớp 100% bảng sao
  cohoc; lá 1990-10-21 chạy lại `npm run cohoc:test` trên trang mới vẫn khớp 12/12.
- Ngũ hành: nạp âm Canh Ngọ = Lộ Thượng Thổ, Cục = Kim Tứ Cục, Thân cư Mệnh, Mệnh tại
  Thìn có Tham Lang — đúng cả 4 mục cohoc ghi ở thẻ `keywords` của trang.
- **0 lỗi dữ liệu ở tầng soạn prompt** (`npm run payload:audit`, 3 lá số × 3 đường dán
  tay): đọc lại NGƯỢC chuỗi payload mà model sẽ nhận rồi so từng trường với JSON của
  engine — 12 dòng cung (chi, can, chính tinh, Tuần/Triệt, điểm, đại hạn), 4 tứ hoá năm
  sinh, 12 bản đại vận, tiểu hạn lưu niên, 12 dòng phụ tinh. Lá số tốt vô nghĩa nếu tầng
  này làm sai trước khi đưa cho model.

### Vận hành có trách nhiệm

- Cache đĩa 30 ngày (`.cache/cohoc/`), 1 lá số = 1 request.
- Serialize request + giãn cách 1,2s.
- Timeout 25s, không retry vòng lặp.
- `robots.txt` của cohoc không chặn `*` (chỉ chặn bot SEO/AI crawler cụ thể) — nhưng vẫn nên giữ cache và tần suất thấp. Dùng `COHOC_ENABLED=false` khi không cần.
- Lỗi mạng **không làm sập pipeline**: trả object rỗng + warning, Module 3 vẫn luận từ JSON với `confidence: "thap"`.

---

## 5. Module 3 — AI Synthesis Agent

### Prompt

`lib/tuvi/prompts.ts` — system prompt "Đại sư Tử Vi" với:
- 3 nguyên tắc bất khả xâm phạm (trung thực dữ liệu sao / khử mâu thuẫn theo trọng số 60-30-Tuần Triệt / văn phong hiện đại, không hù dọa).
- Quy trình suy luận ngầm: Ngũ hành Cục↔Mệnh → Thân cư → thế Tam Hợp + Xung Chiếu.
- Ràng buộc output cho Structured Output: thứ tự 4 cung mỗi nhóm, số lượng insight, không markdown, evidence phải là tên sao cụ thể.

`lib/tuvi/prompt-builder.ts` render lá số thành **bảng markdown nén** thay vì JSON (LLM đọc bảng chính xác hơn, tốn ít token hơn ~40%).

### Structured Output

`schemas/report.schema.ts` — `TuViFullReportSchema`:

```
meta        → nhận dạng + confidence
overview    → PHẦN I: Thiên-Địa-Nhân, cách cục, Thân cư, tính cách
careerGroup → PHẦN II: menh, quan_loc, tai_bach, thien_di
familyGroup → PHẦN III: phuc_duc, phu_the, tu_nu, dien_trach
socialGroup → PHẦN IV: phu_mau, huynh_de, no_boc, tat_ach
actionPlan  → PHẦN V: 3-6 đại vận + đúng 3 kim chỉ nam
editorialNotes → mâu thuẫn đã phân xử
```

Mỗi cung có: `verdict`, `headline`, `strengths[]`, `risks[]`, `strategy[]`, `score` + `scoreDelta` + `scoreReason`.

### Chia 4 lần gọi, không phải 1

Một báo cáo đầy đủ là ~12–15k token JSON. Gọi một phát thì model bị cắt giữa chừng
(`finishReason=length`) và mất trắng; prompt lại phải gánh 33k token văn bản cổ học
của cả 12 cung. Nên service chia:

| Lần | Nội dung | Prompt | Output |
|---|---|---|---|
| 1 | `meta` + `overview` + `actionPlan` | ~3.3k token | ~4k |
| 2 | `careerGroup` (Mệnh–Quan–Tài–Di) | ~5.2k token | ~4k |
| 3 | `familyGroup` (Phúc–Phu–Tử–Điền) | ~5.2k token | ~4k |
| 4 | `socialGroup` (Phụ–Huynh–Nô–Tật) | ~5.2k token | ~4k |

Lợi ích: prompt mỗi lần nhỏ hơn 4–6 lần, lỗi cô lập (retry đúng nhóm hỏng), và UI
nhận Tổng quan sau ~25s thay vì chờ 7 phút.

### Streaming

`POST /api/report` trả SSE thủ công:

```
event: stage     data: {"stage":"career","label":"Đang viết …"}
event: partial   data: {…object ghép dở dang…}   ← sau mỗi lần gọi xong
event: done      data: {…object đầy đủ…}
event: quality   data: {"passed":9,"total":11,"issues":[{"id":"len-spread","detail":"…"}]}
event: usage     data: {"totalTokens":64012,"calls":4,…}
event: error     data: {"message":"…","partial":{…}}
```

UI merge partial vào state → Tổng quan hiện trước, rồi từng nhóm cung.

### Vòng kiểm chất lượng — 11 tiêu chí

Mọi thứ trước đây vẫn phụ thuộc model "tự làm đúng". `lib/tuvi/report-quality.ts`
kiểm bằng máy những gì đo được, ở **cả hai đường** sinh báo cáo — vì đường mất tiền
chính là chỗ không được phép thả lỏng:

| Đường | Chạy ở đâu | Trả về đâu |
|---|---|---|
| LLM — `POST /api/report` | sau `assembleReport`, trước `usage` | SSE event `quality` |
| Nhập tay — `POST /api/report/import` | trước khi lưu cache | field `quality` trong response |

11 tiêu chí: đủ 12 cung · narrative 300–650 · biên độ độ dài ≥150 · evidence truy được
về lá số · điểm lệch engine ≤8 · sao nhắc thuộc cung/tam hợp/xung chiếu · không trùng
câu · không câu đệm · không ngôi cấm · narrative có căn cứ sao · cấu trúc 1–2 đoạn.

**Không chặn**: báo cáo đã sinh xong (đã tốn tiền) nên vẫn lưu và trả, kèm bảng điểm
để người dùng biết đọc lại chỗ nào — hiện ngay trên tab Luận giải, còn 11/11 thì một
dòng chốt. Tiêu chí rớt được gắn nhãn tiếng Việt (`QUALITY_LABEL`) và **có test canh**:
`npm run pipeline:test` làm hỏng fixture có chủ đích rồi kiểm đúng tiêu chí phải rớt,
kèm một lượt SSE bằng `MockLanguageModelV1` để chắc event `quality` thật sự tới UI.

Giới hạn trung thực: tiêu chí văn phong (mật độ thông tin, nhịp câu) khó kiểm bằng
máy hơn nhiều so với độ dài và trùng lặp; `len-spread` chỉ là proxy — 12 cung viết
đều tay vẫn "đậu" tiêu chí này.

### Dữ liệu khai thác từ cohoc.net

Không chỉ lấy văn bản — trang kết quả còn có **3 bảng số liệu** mà parser từng xoá sạch
khi làm sạch HTML:

| Dữ liệu | Nội dung | Dùng để |
|---|---|---|
| **Đẩu Minh** (12 cung × 3 bàn) | Điểm −3..+3 theo ngũ hành can-chi của cung, không theo sao | Hệ quy chiếu thứ hai, đối chiếu với điểm engine |
| **Cung khí + sao hỉ/kị** | "đại cát", "cát hung đan xen"… + sao nào là hỉ/kị thần của cung | Giải thích vì sao cùng một sao tốt mà cung này lại xấu |
| **Tỉ lệ sao tốt** | % sao tốt tại cung và trong tam phương tứ chính | Đo mật độ cát tinh, không chỉ đếm số |
| **Ngũ hành hỉ kị** | Hỉ thần / Kị thần / Nhàn thần / **Dụng thần** | Cải vận: màu sắc, hướng, nghề |
| **Vận năm** (lưu niên) | Bình giải riêng cho 4 năm quanh năm xem hạn | Trước đây bị bỏ với lý do "ta tự tính" |

Hiển thị ở panel "Chấm theo Tử Vi Cổ Học" dưới bàn lá số, và đưa vào prompt để LLM
thấy chỗ nào hai hệ quy chiếu đồng thuận, chỗ nào lệch.

## Chi phí vận hành

### Không dùng được chat web của Claude/Gemini thay cho API

Câu hỏi hợp lý, nhưng câu trả lời là **không**:

- `claude.ai` và `gemini.google.com` **không có API** cho tài khoản chat. Gói Pro/Advanced
  chỉ mở giao diện web, không mở endpoint.
- Điều khoản của cả hai đều **cấm truy cập tự động** vào giao diện web. Tự động hoá trình
  duyệt để "mượn" lượt chat là vi phạm, và tài khoản có thể bị khoá — tiết kiệm vài đô
  nhưng mất tài khoản thì lỗ nặng hơn.
- Về kỹ thuật cũng không ổn định: giao diện đổi liên tục, có captcha, không có
  structured output, không đảm bảo gì về độ trễ.

Nên chi phí phải cắt ở chỗ khác. Bốn cách dưới đây đều hợp lệ và đã đo.

### 0. Đường 0 đồng: cầu nối chat web (thủ công, hợp lệ)

Ranh giới rất rõ:

| Cách | Hợp lệ? | Vì sao |
|---|---|---|
| **Người dùng tự copy-paste** vào chat web | ✅ | Đây chính là cách sản phẩm được thiết kế để dùng |
| Tự động hoá trình duyệt để "mượn" lượt chat | ❌ | Vi phạm điều khoản của cả Anthropic và Google, có thể khoá tài khoản |
| Bot Discord/Telegram của người khác | ❌ | Dùng quota của họ, thường vi phạm, không đảm bảo gì |
| Proxy "free API" | ❌ | Thường là dịch vụ chia sẻ credential / scrape — rủi ro pháp lý và độ ổn định |

### Vì sao nên đóng gói thành kỹ năng thay vì chat thường

Gemini đã bỏ **Gems** (trợ lý có ô Instructions dán văn bản) và chuyển sang **Kỹ năng**
(Skills): gói ZIP có `SKILL.md` ở thư mục chính, tên kỹ năng viết **kebab-case** trong
frontmatter. Không còn chỗ nào để dán một khối văn bản — phải có file để upload.

Vấn đề mà kỹ năng giải quyết: khi dán dữ liệu vào một cuộc chat Gemini bình thường, câu trả
lời bị ảnh hưởng bởi:

- **“Saved info”** của tài khoản (nghề nghiệp, sở thích, quê quán…) — model có thể đan những
  thứ này vào bản luận;
- thói quen trả lời mà model đã hình thành trong các chat khác của tài khoản;
- nội dung các cuộc trò chuyện trước.

Với một lá số, đó là **nhiễu**: bản luận lệch khỏi dữ liệu mà người đọc không biết vì sao.
Kỹ năng có bộ luật cố định, và mỗi lượt gọi là một lượt riêng.

**Kỹ năng không giải quyết được:** “Saved info” ở cấp tài khoản. Bộ luật có điều khoản yêu
cầu bỏ qua, nhưng muốn chắc thì phải tự tắt trong *Cài đặt → Personalization*. App không can
thiệp được chỗ đó, và tôi không muốn nói khống là có.

### Cài kỹ năng — Gemini KHÔNG nhận .zip

Hộp thoại "Tải một kỹ năng lên" của Gemini ghi rõ:

> Kéo hoặc chọn **hình ảnh, tệp hoặc thư mục** để tải tệp **PDF, CSV, PY, TXT và MD** lên

Ba điều suy ra, và bản đầu tôi làm sai cả ba:

| Yêu cầu | Bản đầu (sai) | Nay |
|---|---|---|
| Nhận `.md`, không nhận `.zip` | xuất `tuvi-dau-so.zip` | xuất `SKILL.md` (text/markdown) |
| Nhận **thư mục** | chỉ có file nén | ghi thẳng vào một thư mục thật |
| `SKILL.md` ở **thư mục chính** | đúng, nhưng nằm trong zip | đúng, là tệp gốc của thư mục |

Cách cài:

```
1. Bấm "Chọn thư mục & ghi"  → app ghi SKILL.md + references/ vào thư mục bạn chọn
2. Gemini → tab Kỹ năng → Tải một kỹ năng lên → kéo CẢ THƯ MỤC vào ô đó
3. Cài đặt → Personalization → tắt Saved info (khuyến nghị)
```

Bước 1 dùng File System Access API (`showDirectoryPicker`) nên chỉ chạy trên Chromium và
phải là `localhost` hoặc HTTPS. Trình duyệt khác thì tải riêng từng tệp:

| Tệp | Endpoint | Vai trò |
|---|---|---|
| `SKILL.md` | `/api/skill` | **bắt buộc** — frontmatter + toàn bộ bộ luật (8.036 ký tự / 9.893 byte, trần 10.000) |
| `vi-du-van-phong.md` | `/api/skill?file=vi-du-van-phong` | tuỳ chọn — 3 mẫu câu cổ học + phân tích |
| `vi-du-dau-ra.md` | `/api/skill?file=vi-du-dau-ra` | tuỳ chọn — một cung viết ĐÚNG/SAI + chiều sâu theo điểm |
| `du-lieu-mau.md` | `/api/skill?file=du-lieu-mau` | tuỳ chọn — khối dữ liệu mẫu |

`SKILL.md` **tự đủ**: bỏ cả 3 tệp tham khảo vẫn chạy đúng — checklist tự kiểm, bảng chiều sâu
theo điểm và toàn bộ luật đều nằm trong đó. Các tệp phụ chỉ thêm ví dụ.

Tách `references/` không phải cho gọn: `SKILL.md` nạp **mỗi lượt**, tài liệu tham khảo chỉ nạp
khi cần. Nhét hết vào một file là bắt người dùng trả context cho phần họ không dùng.

Vẫn giữ `/api/skill?format=zip` cho nền tảng **khác** nhận zip (Claude, công cụ agent…).
Đừng đưa zip cho Gemini.

**Trần 10.000 byte là byte, không phải ký tự** — bản 8.036 ký tự nặng 9.893 byte vì tiếng Việt
UTF-8 tốn ~1,23 byte/ký tự, nên cứ thêm nội dung vào `SKILL.md` là phải cắt chỗ khác tương đương.
`pipeline:test` kiểm bằng `Buffer.byteLength`; check theo ký tự sẽ báo "ổn" trong khi upload
bị từ chối. Gói hiện tại: **4 tệp, zip 16,0 KB**.

Hai mục mới trong `SKILL.md` (bắt buộc giữ dưới trần):

- **§6 — Chiều sâu theo ĐIỂM ENGINE:** ≥75 → 2 đoạn · 51–74 → 1–2 đoạn · ≤50 → 1 đoạn.
  Trước đây số đoạn chỉ nằm trong payload dán tay, nên cài skill mà dán dữ liệu là mất quy tắc.
- **§10 — TỰ KIỂM TRƯỚC KHI TRẢ LỜI:** 5 mục đối chiếu thẳng với validator 11 tiêu chí
  (đủ 4 khối/4 cung, evidence là sao thật, |scoreDelta| ≤ 8, không câu đệm, không trùng ý).
  Model tự soát trước khi trả lời thay vì để app bắt lỗi sau khi nhập về.

Gói được **sinh từ code**, không phải file viết tay: dùng chung `SHAPE_PALACE` với
`chat-bundle.ts` và mang `PROMPT_VERSION`. Sửa schema mà quên sửa kỹ năng là mọi báo cáo
nhập về hỏng validate — nên hai bên buộc phải cùng một nguồn.

### Mỗi lá số chỉ cần dán dữ liệu

| Chế độ | Kích thước | Khi nào dùng |
|---|---|---|
| **Gọn** | 6.906 ký tự ≈ 5.755 token | dán nhanh; luận từ lá số, confidence bị hạ |
| **Kèm cổ học** | 36.039 ký tự ≈ 30.033 token | bản đầy đủ, có dẫn chiếu sách cổ |
| Chat thường (không kỹ năng) | 48.856 ký tự ≈ 40.713 token | khi chưa muốn cài kỹ năng |

Chênh lệch 7k ↔ 49k là lý do nên đóng gói: bộ luật chỉ cài **một lần**, không phải mỗi lá số.

Cả hai chế độ đều mang **cùng một ví dụ đầu ra** + bảng *chiều sâu theo điểm engine*
(`buildFewShot` trong `prompt-builder.ts`, +1,5k ký tự) — trước đây chỉ gói kỹ năng có,
nên hai đường cho chất lượng khác nhau mà không ai phát hiện. `pipeline:test` canh điều này.

### Chống lệch giữa kỹ năng và schema

Bộ luật dạy tên field bằng **văn bản**, schema kiểm bằng **Zod**. Lệch một chữ là 100% báo
cáo nhập về hỏng validate, mà triệu chứng lại hiện ở tay người dùng. Nên `scripts/test-pipeline.ts`
kiểm cả hai phía:

```
✓ có "rationale" (tên field đúng)      ✓ frontmatter có name kebab-case
✓ không có "ruleRationale"             ✓ có mô tả cho bộ định tuyến skill
✓ có "palaceKey"                       ✓ chữ ký ZIP hợp lệ
✓ đủ 4 dấu phân cách                   ✓ SKILL.md là tệp đầu tiên (ở gốc gói)
✓ có điều khoản cách ly ngữ cảnh        ✓ có end-of-central-directory
✓ câu trả lời định dạng kỹ năng → 12 cung, 3 goldenRules
✓ ví dụ đầu ra + bảng chiều sâu có ở cả 2 đường dán tay
✓ validator 11 tiêu chí bắt được lỗi bịa (fixture cố tình làm hỏng)
```

Kiểm tra này đã bắt được một lỗi thật (`ruleRationale` thay vì `rationale`) trước khi nó
tới tay người dùng.

Nên app có nút **“Chat 0đ”** trên toolbar, mở ra hai ô:

```
Dán vào chat   [ Copy ]   ← 6.906 (gọn) / 36.039 (kèm cổ học) / 48.856 (chat thường)
Dán câu trả lời về        ← phải có đủ 4 dấu phân cách "=== PHẦN n ==="
```

Bộ luật lấy ở `/api/skill` (file `.zip`), hoặc `/api/skill?format=md` nếu chỉ muốn xem
`SKILL.md` dạng văn bản.

Luồng: bấm Copy → dán vào claude.ai / gemini / grok → copy câu trả lời → dán vào ô 2 →
bấm “Lưu & xem báo cáo”. App tách 4 khối JSON, validate bằng Zod, ghép lại, **lưu cache**.

Từ đó lá số này phục vụ **0 đồng vô hạn** — kể cả sau khi đổi model, vì khoá cache của
bản nhập tay (`mode: 'chat'`, `modelChain: 'chat-manual'`) độc lập với model.

**Vì sao chia 4 khối chứ không 1:** đã đo — JSON 12 cung trong một lần trả lời thì model
hay làm hỏng cấu trúc. Bốn khối nhỏ có dấu phân cách thì parse được, và lỗi cô lập: sai
khối nào báo đúng khối đó, kèm đường dẫn field.

Ba kiểu hỏng được báo rõ thay vì im lặng:

```
Thiếu phần 3, 4.  → "Chat có thể bị cắt giữa chừng — hãy yêu cầu viết tiếp phần còn lại."
Phần 1 sai cấu trúc tại "overview.cachCuc.explanation": ...  (kèm 3 lỗi đầu)
Phần 2 có 3 cung, cần đúng 4.  (kèm danh sách cung đã có)
```

**Biến thể batch:** nếu cần viết trước hàng loạt, chạy nền (script/cron) thay vì bấm tay:
mỗi lượt lấy một lá số trong hàng đợi, sinh báo cáo, ghi vào `.cache/reports/`. App đọc
cache và trả tức thì. Đây là cách dùng gói thuê bao đã trả tiền mà không vi phạm điều khoản
nào — chỉ khác là không real-time.

**Về Grok:** dùng được theo hai cách hợp lệ — (a) dán tay vào chat Grok như trên, 0 đồng;
(b) dùng API chính thức `https://api.x.ai/v1` (trả tiền như mọi API, đã thêm preset vào
`.env.example`, **chưa kiểm chứng** vì không có key). Cái không dùng được là bot Grok của
người khác hoặc proxy “free API”.

### 1. Cache báo cáo — cắt 100% cho lượt xem lại

Đã triển khai: `lib/tuvi/report-cache.ts`.

Phần lớn lượt xem là **xem lại cùng một lá số**: bấm "Viết luận giải" lần hai, F5, mở link
chia sẻ, xem lại sau vài ngày. Sinh lại từ đầu cho những lượt đó là đốt tiền vô nghĩa.

```
lần đầu   : 4 lần gọi · 113.581 token · ~3 phút
lần thứ 2 : 0 lần gọi · 0 token          · 4 ms      ← đo thật
```

Khoá cache = **hash của chính các prompt sẽ gửi đi**, không phải hash ngày sinh. Nghĩa là
sửa prompt, đổi tên đương số, đổi năm xem hạn, hay đổi model đều tự động làm mới khoá —
không cần nhớ tăng version bằng tay (cái bẫy đã gặp ba lần với `PARSER_VERSION`).

Nút **"Viết lại"** trên UI gửi `forceRefresh: true` để bỏ qua cache khi người dùng muốn bản
mới. Tắt hẳn bằng `REPORT_CACHE=false`.

### 2. Tiếng Việt tokenize kém gấp ~3 lần tiếng Anh

Đo trên lá số mẫu: 77.400 ký tự prompt → **63.923 token**, tức **1,21 ký tự/token**.
Tiếng Anh thường ~3,4 ký tự/token. Vì vậy mọi ước lượng "chia 3,4" trước đây báo thấp hơn
hoá đơn thật gần 3 lần — script test đã sửa lại hệ số.

Hệ quả thực tế: prompt tiếng Việt dài 1.000 ký tự tốn gần **830 token**, không phải 290.

### 3. System prompt bị gửi 4 lần = 34% input

| Thành phần | Ký tự | Token | Ghi chú |
|---|---|---|---|
| System prompt | 6.682 | ~5.500 | **× 4 lần gọi = 22.000 token** |
| Prompt tổng quan | 12.120 | ~10.100 | 1 lần |
| 3 prompt nhóm | 12.881 × 3 | ~10.700 × 3 | 3 lần |
| **Tổng input** | **77.400** | **63.923** | |

Đây là chỗ đáng cắt nhất sau cache. Đã thử cách rẻ nhất:

**Gộp về 1 lần gọi (`LLM_CHUNK_MODE=full`)** — input giảm còn ~40.500 token (**−37%**).
Kết quả: **hỏng**, hai kiểu hỏng khác nhau:

```
để response_format nguyên   → "The compiled grammar is too large"
bỏ response_format          → "No object generated: could not parse the response"
```

Kiểu thứ hai là bài học: JSON 12 cung (~15k token) mà không có schema ép thì model trả về
không parse được. `repairJsonText` chỉ cứu được vỏ ```json và câu dẫn, không cứu được JSON
sai cấu trúc. **Nên vẫn giữ 4 lần gọi.**

Cách còn lại để cắt 22.000 token đó là **prompt caching phía provider** (Anthropic
`cache_control`, Gemini implicit caching) — nhưng cả hai đều cần gọi API native, mà key
`sk-ant-usr-...` hiện tại chỉ chạy được qua endpoint compat (native từ chối `x-api-key`).
Đổi sang key API chính thức thì bật được, giảm ~90% chi phí cho phần lặp lại.

### 4. Chọn provider theo mục đích

| Provider | Chi phí | Dùng khi |
|---|---|---|
| **Gemini free tier** (AI Studio) | 0 đồng, ~20 request/ngày/model → **~5 báo cáo/ngày** | phát triển, thử prompt |
| **DeepSeek** | rẻ nhất trong nhóm chất lượng ổn | production, khối lượng lớn |
| **Claude Haiku** | ~1/3 Sonnet | production cần văn tốt |
| **Claude Sonnet** | đắt nhất | bản đặc biệt, khách trả tiền |

Một báo cáo = 4 request, nên khi tính quota free tier phải nhân 4.

### Tóm lại thứ tự ưu tiên

1. Bật cache (mặc định đã bật) — miễn phí, không đánh đổi gì.
2. Lá số nào cần 0 đồng tuyệt đối: cài gói kỹ năng một lần, sau đó mỗi lá số chỉ dán dữ liệu.
3. Phát triển bằng Gemini free tier.
4. Production: DeepSeek hoặc Haiku.
5. Nếu vẫn đắt: xin key API chính thức để bật prompt caching — đó là mức tiết kiệm lớn
   tiếp theo, không phải cắt bớt nội dung luận giải.

### Trang "xếp hàng" của cohoc — lỗi đã gặp và cách xử lý

Ngày 22/10/2026, POST form đột nhiên trả về trang **18KB** tiêu đề `Xử lý nghiệp vụ - <lid>`
thay vì trang kết quả 742KB. Trang đó nói: *"Hệ thống đang thực hiện xử lý nghiệp vụ. Chờ
-- giây…"* và có `var time_redirect = 5526 + random(2000)`.

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

Nhờ vậy khi cohoc chặn IP, hệ thống vẫn trả bản luận đầy đủ từ HTML đã lưu, kèm cảnh báo
*"Dùng bản lưu N giờ trước"* — thay vì luận chay hoặc im lặng.

### `budgetPassages` không bao giờ cắt giữa câu

Bản cũ: `text.slice(0, remain) + '…'`. LLM gặp đoạn cụt thì **bỏ luôn cả đoạn** — đã thấy
thật trong `editorialNotes`: *"đoạn Thất tinh định điểm bị cắt dở nên không dùng được"*.
Tức là vừa mất token vừa mất dữ liệu, tệ hơn là không gửi gì.

Nay: lùi về ranh giới câu cuối cùng còn nằm trong ngân sách; không tìm được ranh giới nào
đủ dài (≥180 ký tự) thì **bỏ hẳn đoạn** và ghi vào `warnings` để biết đang thiếu gì.

### Cửu Thiên Phi Tinh — bóc văn xuôi thành dữ liệu

Ba khối `Thất tinh định điểm`, `Mệnh Ẩn`, `vượng suy` được cohoc in dưới dạng văn xuôi
nhưng bản chất là dữ liệu:

```
Thất tinh định điểm   Thiên (tháng sinh) → cung Sự nghiệp
                      Địa   (ngày sinh, trung gian) → cung Tật ách
                      Nhân  (giờ sinh, quan trọng nhất) → cung Phụ mẫu
                      Liên kết: Sự nghiệp + Phụ mẫu = lấy Tật ách làm trung gian

Mệnh Ẩn tại NGỌ       Tứ Hóa ẩn: Lộc→Giao hữu (Hợi) · Quyền→Sự nghiệp (Tuất)
                                  Khoa→Tài bạch (Dần) · Kỵ→Điền trạch (Dậu)

Tinh đẩu              Tham lang MỘC (độ số 1) · Văn xương KIM (độ số 1)
```

Bóc thành field (`CohocOverviewExtras`) rồi render lại gọn trong prompt: **536 ký tự văn
xuôi → ~150 ký tự có cấu trúc**, và không còn gì để cắt giữa câu.

Một bẫy phải xử lý: hệ này dùng **toạ độ riêng (Ẩn bàn)**, chi của nó không trùng Thiên
bàn. Lần chạy đầu LLM thấy lệch chi, kết luận *"không khớp 12 cung của engine, bỏ qua"* và
vứt cả khối. Nay prompt ghi rõ: *"chỉ dùng TÊN CUNG; đừng coi việc lệch chi là mâu thuẫn"*.

### Tối ưu context đầu vào (đo thật)

Corpus cổ học gốc **205.657 ký tự** cho 12 cung. Sau khi nén: **30.707 ký tự (15%)**.

| Bước | Tác động |
|---|---|
| Bỏ đoạn **Địa bàn / Nhân bàn** | −32% (66.324 ký tự mô tả một lá KHÁC — Mệnh có Thiên Cơ thay vì Tham Lang) |
| Tách câu + khử trùng gần đúng (Jaccard 4-gram) | −40% còn lại, bắt được câu gần trùng chứ không chỉ trùng tuyệt đối |
| Cổng liên quan: câu phải nhắc sao của cung hoặc là câu khẳng định | loại hẳn bài giảng lịch sử cách cục |
| Chart context chỉ in cung liên quan | −3.000 ký tự × 3 lần gọi |
| System prompt bỏ luật chết (thứ tự 4 nhóm cũ) | −400 ký tự × 4 lần gọi |

Kết quả trên 4 lần gọi: **65.4k → 45.9k ký tự (−30%)**, token input thực tế **75.820 → 64.012 (−15,6%)**.

Chế độ `LLM_CHUNK_MODE=full` (1 lần gọi) rẻ hơn nữa nhưng **Claude chặn**: schema 12 cung
vượt giới hạn `strict json_schema` → `compiled grammar is too large`.

### Ma trận tương thích provider (đã kiểm chứng thật)

| Vấn đề | Gemini | Claude (compat) | Cách xử lý trong code |
|---|---|---|---|
| Object generation | trả text → "tool was not called" | `tool_choice` bị chặn | ép `mode: 'json'` |
| `temperature` | OK | **400 deprecated** | tự xoá field khi baseURL là anthropic |
| Schema JSON | chỉ `json_object` | chỉ `json_schema` + strict | `structuredOutputs: true` + sanitize keyword |
| `minItems`/`maxItems`/`minimum` | OK | **400** | `sanitizeJsonSchema()` lọc trên wire, Zod giữ nguyên |
| Schema lớn | OK | **"compiled grammar too large"** | bỏ `response_format`, prompt ép JSON + `repairText` |
| Thinking ăn token | cần `reasoning_effort` | cần `reasoning_effort: none` | `LLM_EXTRA_BODY` |
| Quá tải 503/429 | thường xuyên | có | chuỗi `LLM_MODEL_FALLBACKS` |

Bài học: **đừng đặt `.max()` cứng trong Zod khi schema phải đi qua API** — provider lược
bỏ `maxLength`/`maxItems` nên model không biết trần, vi phạm, rồi Zod chặn oan. Chỉ giữ
`.min()` (sàn chất lượng); trần do `max_tokens` lo.

---

## 6. API

| Endpoint | Mô tả |
|---|---|
| `POST /api/chart` | Trả `NormalizedChartJSON` ngay (~1s, không chờ LLM) + `classicalMeta` + `warnings` |
| `POST /api/report` | SSE stream báo cáo luận giải |

Body chung (`schemas/request.schema.ts`):

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

---

## 7. Tính năng tra cứu & chia sẻ

Học từ các trang huyền học lớn (tuviglobal, cohoc, giaimatuvi): họ chia nội dung theo
miền đời sống và có hạn năm, nhưng **không trang nào có từ điển sao tra cứu được, cũng
không có in/chia sẻ**. Ba khoảng trống đó được lấp ở đây.

| Tính năng | Cách dùng | Vì sao |
|---|---|---|
| **Từ điển sao** | Bấm vào bất kỳ tên sao nào trên bàn lá số | Bàn chỉ hiện "Tham Lang (Miếu)" — người không học tử vi không biết nghĩa. Ngăn kéo cho: bản chất, đắc địa, hãm địa, chủ quản gì, và **sao này nằm ở cung nào trong chính lá đang xem** |
| **Permalink** | `?n=&g=&c=&d=&h=&m=&y=` | F5 hay copy link đều mở lại đúng lá số. Mở từ link **không tự chạy LLM** (tránh đốt token), chỉ nạp lá số rồi chờ bấm "Viết luận giải" |
| **In / PDF** | Nút "In" ở thanh công cụ | `@media print` ẩn form, toolbar, ngăn kéo; bàn lá số và bài luận in gọn, không cắt trang giữa mục |
| **Lá số mẫu** | Nút ở màn hình trống | Người mới không phải tự bịa ngày sinh để thử |

Dữ liệu từ điển: `lib/tuvi/star-dictionary.ts` — 26 sao (14 chính tinh, lục cát, lục sát,
Lộc Tồn, Thiên Mã, Tuần, Triệt). Viết ngắn theo lối sách cổ, không chép nguyên văn nguồn.

## 8. Giới hạn đã biết

1. **Scoring chưa tính "cung khí"** (ngũ hành của can chi cung, Đẩu Minh) như cohoc. Vì vậy có trường hợp cohoc chấm `-0.96` (đại hung) còn engine chấm 79 (Tham Lang Miếu + Văn Xương). Cả hai đúng theo hệ quy chiếu riêng — LLM được lệnh phân xử và ghi vào `editorialNotes`.
2. **Chưa hỗ trợ Trung Châu / địa bàn–nhân bàn.** iztro có `config.algorithm: 'zhongzhou'` và `astroType: 'earth'|'human'` — chỉ cần thêm tham số vào `ChartInput` là dùng được.
3. **Cohoc có thể đổi cấu trúc HTML** bất cứ lúc nào. Parser sẽ trả `warnings` thay vì crash, nhưng cần theo dõi `stats.passageCount` — tụt bất thường là dấu hiệu vỡ parser.
4. **Chi phí LLM** — đo thật 22/10 (claude-haiku, 4 lần gọi): **~67.000 token input + ~47.000 output ≈ 113.000 token/lá số**. Lần xem thứ 2 lấy từ cache (`cached: true`, `calls: 0`) nên 0 token; chi phí bằng tiền phụ thuộc model chọn.
5. **`(VCD)` trong bảng metrics của cohoc không dùng làm chuẩn để đối chiếu.** Trên 36 cung đã đo, metrics ghi "(VCD)" ở 9 cung mà CHÍNH bảng sao của cohoc (và engine) có chính tinh — hai khối dữ liệu do cùng một trang sinh ra còn bất đồng nhau. Đối chiếu bằng bảng sao HTML; metrics chỉ dùng cho Đẩu Minh và cung khí.
6. **Chưa đối chiếu phụ tinh** (cát/sát tinh, Tuần, Triệt) với cohoc: bảng HTML có sẵn `.sao-tot` / `.sao-xau`, nhưng tạp diệu hai bên khác hệ tên — cần bảng ánh xạ trước khi so.
7. **API chưa nhận tháng nhuận.** Engine đã có `ChartInput.isLeapMonth`, nhưng `ChartRequestSchema` không bật trường này ra ngoài nên người dùng không thể sinh lá số tháng nhuận (mất lá số, chứ không sai lá số).
