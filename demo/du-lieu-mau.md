# Dữ liệu đầu vào trông thế nào

Người dùng sẽ dán một khối như dưới đây (do ứng dụng sinh ra). Đây là ví dụ RÚT GỌN —
dữ liệu thật có đủ 12 cung và bảng Đại vận.

```
# DỮ LIỆU LÁ SỐ
PROMPT_VERSION: 1.1.0

## A. DỮ LIỆU LÁ SỐ (engine nội bộ iztro)

- Dương lịch: 1990-10-21 · Âm lịch: ngày 4 tháng 9 năm 1990 · Giờ ngọ
- Năm xem hạn: 2026 · Giới tính: Nam
- Nạp âm: Lộ Thượng Thổ · Cục: Kim Tứ Cục · Mệnh cư Thìn · Thân cư Mệnh

| Cung | Địa chi | Chính tinh | Cát tinh | Sát tinh | Điểm |
|---|---|---|---|---|---|
| Mệnh | Thìn | Tham Lang (Miếu) | Văn Xương (Đắc) | — | 79 |
| ... | ... | ... | ... | ... | ... |

## B. VĂN BẢN CỔ HỌC THÔ (nguồn: tuvi.cohoc.net)
### Cửu Thiên Phi Tinh & vượng suy (nguồn cổ học)
- Thất tinh định điểm: Thiên · tháng sinh → cung Sự nghiệp (quan_loc) · ...
### Chấm theo Đẩu Minh (nguồn cổ học, thang −3..+3)
- Mệnh: Đẩu Minh -0.96 · cung khí đại hung · ...
### Mệnh
[...các đoạn bình giải...]
```

Ghi chú quan trọng:
- Bảng "ĐIỂM ENGINE" là mốc để chấm điểm. Không được bỏ qua.
- Nếu KHÔNG có phần B, vẫn viết đủ 4 phần và ghi `độ tin cậy: thấp`.
- Chi của "Cửu Thiên Phi Tinh" là hệ tọa độ riêng, KHÔNG so sánh với địa chi Thiên bàn.
