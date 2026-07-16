# Kế hoạch triển khai: Chess Exercise Viewer

## 1. Mục tiêu

Web app đọc các ảnh chụp từ sách bài tập cờ vua (mỗi ảnh chứa **6 bài tập/bàn cờ**), tự động:
1. Tách 1 ảnh trang sách thành 6 ảnh bàn cờ riêng lẻ
2. Nhận diện quân cờ trên từng bàn cờ → sinh FEN
3. Hiển thị tất cả bài tập lên web, cho phép click-to-move tự do (không check luật)
4. Chọn bên đi trước (trắng/đen), có nút Reset
5. Cache kết quả để không phải chạy lại AI mỗi lần mở web
6. Đóng gói bằng Docker để mang qua máy khác chạy được

Không cần: upload ảnh qua UI (đọc thẳng từ folder), lưu bài tập vào DB, check luật cờ.

---

## 2. Kiến trúc tổng thể

```
project/
├── exercises_images/          # người dùng thả ảnh trang sách vào đây
│   ├── page01.jpg
│   ├── page02.jpg
│   └── ...
├── backend/
│   ├── main.py                 # FastAPI app
│   ├── board_splitter.py       # tách 1 ảnh trang -> N ảnh bàn cờ
│   ├── recognizer.py           # wrap model ảnh bàn cờ -> FEN
│   ├── cache.py                # cache theo mtime file
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/ExerciseBoard.jsx
│   │   └── ...
│   └── Dockerfile
└── docker-compose.yml
```

Luồng dữ liệu:

```
Ảnh trang sách (1 ảnh, 6 bàn cờ)
        │  board_splitter.py (OpenCV)
        ▼
6 ảnh bàn cờ riêng (crop + deskew)
        │  recognizer.py (model AI)
        ▼
6 FEN string
        │  cache.py (lưu theo mtime)
        ▼
GET /exercises  →  JSON [{id, fen}, ...]
        │
        ▼
Frontend render N bàn cờ, click-to-move độc lập từng bàn
```

---

## 3. Các giai đoạn triển khai

### Giai đoạn 0 — Setup môi trường
- [ ] Cài Python 3.10+, Node.js
- [ ] Tạo cấu trúc thư mục như trên
- [ ] `git init`, `.gitignore` (node_modules, __pycache__, cache.json, venv)
- [ ] Chuẩn bị 1-2 ảnh mẫu thật (đã có) để test xuyên suốt quá trình code

### Giai đoạn 1 — Board Splitter (tách 6 bàn cờ từ 1 ảnh trang sách)
Đây là phần khó nhất và rủi ro nhất vì ảnh chụp sách bị cong, nghiêng, ánh sáng không đều.

Kỹ thuật dùng: **OpenCV**
- [ ] Đọc ảnh, chuyển grayscale, tăng contrast (CLAHE)
- [ ] Tìm đường viền (contours) các hình vuông lớn — mỗi bàn cờ là 1 contour dạng tứ giác
- [ ] Lọc contour theo diện tích + tỷ lệ khung hình (~ vuông) để loại bỏ nhiễu (chữ, số, logo trang sách)
- [ ] Với mỗi contour hợp lệ: `cv2.warpPerspective` để làm thẳng (deskew) vùng bàn cờ bị cong/nghiêng thành hình vuông chuẩn
- [ ] Sắp xếp thứ tự 6 bàn cờ theo vị trí đọc tự nhiên (trái→phải, trên→dưới)
- [ ] Xuất ra 6 ảnh vuông, đã crop sát viền, lưu tạm hoặc giữ trong memory

Test độc lập: viết 1 script CLI chạy riêng `board_splitter.py`, in ra 6 ảnh để mắt thường kiểm tra trước khi nối vào pipeline chính. **Không code chung với backend cho tới khi bước này ổn định.**

Rủi ro cần lường trước:
- Trang sách quá cong → contour method có thể detect sai → cần cho phép **fallback thủ công**: nếu auto-detect ra khác 6 vùng, trả lỗi rõ ràng để người dùng biết ảnh đó cần crop tay thay vì âm thầm sai.
- Ảnh có viền dày/mỏng khác nhau giữa các bàn cờ → threshold lọc contour cần tinh chỉnh qua thử nghiệm thực tế nhiều ảnh mẫu, không chỉ 1 ảnh.

### Giai đoạn 2 — Piece Recognition (ảnh bàn cờ → FEN)
- [ ] Chọn thư viện: bắt đầu với **chessboard-recognizer** hoặc **chessimg2pos** (ưu tiên thư viện có pretrained model sẵn, train một phần trên ảnh sách)
- [ ] Viết `recognizer.py`: nhận 1 ảnh (đã deskew từ bước 1) → gọi model → trả `{fen, confidence}`
- [ ] Test độc lập trên 6 ảnh đã tách ở Giai đoạn 1, so sánh bằng mắt với ảnh gốc, ghi nhận tỷ lệ đúng thực tế
- [ ] Nếu độ chính xác thấp hơn kỳ vọng: thử thêm bước tiền xử lý (grayscale, tăng nét) hoặc đổi sang model khác (Chess_diagram_to_FEN) để so sánh

Lưu ý quan trọng: model chỉ đọc được **vị trí quân**, không đọc được **bên nào đi trước** — phần đó do người dùng chọn trên UI (đã có trong yêu cầu gốc).

### Giai đoạn 3 — Cache
- [ ] `cache.py`: file `cache.json` lưu `{filename: {mtime, boards: [fen, fen, ...]}}`
- [ ] Logic: quét `exercises_images/`, so `mtime` từng file với cache
  - Trùng mtime → lấy kết quả cũ, bỏ qua bước split + recognize
  - Mới/thay đổi → chạy lại toàn bộ pipeline (split + recognize), ghi đè cache
- [ ] Xử lý trường hợp ảnh bị xoá khỏi folder → dọn luôn entry cache tương ứng

### Giai đoạn 4 — Backend API (FastAPI)
- [ ] `GET /exercises` — trả về toàn bộ danh sách bài tập (dùng cache), mỗi bài tập có `id`, `source_image`, `board_index` (1-6), `fen`
- [ ] `GET /exercises/refresh` — bỏ qua cache, quét lại từ đầu (dùng khi thêm ảnh mới)
- [ ] CORS config để frontend (port khác) gọi được
- [ ] Test bằng Swagger UI (`/docs`) trước khi nối frontend

### Giai đoạn 5 — Frontend (React)
- [ ] Gọi `GET /exercises` khi load trang, hiển thị loading state
- [ ] Component `ExerciseBoard`: nhận 1 FEN, render bàn cờ (dùng `react-chessboard` hoặc tự vẽ), giữ state quân cờ riêng (mảng 8x8) độc lập với FEN gốc sau khi load
- [ ] Toggle chọn bên đi trước (trắng/đen) — chỉ để hiển thị, không ảnh hưởng logic khác
- [ ] Click-to-move: click 1 ô có quân → chọn → click ô đích → di chuyển (không validate luật, đơn giản ghi đè state)
- [ ] Nút Reset: khôi phục lại FEN gốc ban đầu cho bàn cờ đó
- [ ] Layout dạng grid hiển thị nhiều bài tập cùng lúc (giống bố cục ảnh sách: nhiều bàn cờ trên 1 trang)

### Giai đoạn 6 — Đóng gói Docker
- [ ] `Dockerfile` backend (Python + OpenCV + model weights)
- [ ] `Dockerfile` frontend (Node build → serve static, hoặc dev server tuỳ nhu cầu)
- [ ] `docker-compose.yml` nối 2 service, mount `exercises_images/` và `cache.json` dạng volume
- [ ] Test: xoá cache, `docker compose up`, kiểm tra pipeline chạy full từ đầu trên máy sạch
- [ ] Test mang `docker-compose.yml` + `exercises_images/` qua thư mục khác (mô phỏng chuyển máy), chạy lại xem có hoạt động không phụ thuộc đường dẫn cũ

---

## 4. Tech stack tóm tắt

| Thành phần | Công nghệ |
|---|---|
| Board splitting | OpenCV (Python) |
| Piece recognition | chessboard-recognizer / chessimg2pos (PyTorch, pretrained) |
| Backend | FastAPI + Uvicorn |
| Cache | file JSON local, key theo mtime |
| Frontend | React (Vite) + react-chessboard |
| Đóng gói | Docker + docker-compose |

---

## 5. Thứ tự ưu tiên nên làm (tránh code lan man)

1. **Giai đoạn 1 (board splitter)** trước tiên, test độc lập bằng script CLI trên ảnh thật — vì đây là phần rủi ro nhất, nếu không tách đúng 6 bàn cờ thì mọi thứ sau vô nghĩa.
2. **Giai đoạn 2 (recognition)** trên kết quả đã tách — đánh giá độ chính xác thực tế trước khi đầu tư tiếp.
3. Chỉ khi 2 bước trên cho kết quả chấp nhận được mới build **backend + frontend + Docker** — tránh xây UI đẹp trên nền pipeline nhận diện chưa đáng tin.

---

## 6. Việc chưa xử lý ở phiên bản đầu (để sau)

- UI sửa tay ô nhận diện sai (đề xuất thêm sau khi thấy tỷ lệ lỗi thực tế)
- Hỗ trợ nhiều bố cục trang sách khác (không phải luôn 6 bàn cờ/trang)
- Xuất PGN / lưu lại thế cờ đã chỉnh sửa
