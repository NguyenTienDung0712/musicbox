# MUSICBOX POS — bản truy cập Internet

Ứng dụng POS Musicbox dùng Node.js, Express, Socket.IO và dữ liệu JSON. Bản này đã có cấu hình cloud để sau khi triển khai một lần, chủ cửa hàng và nhân viên chỉ cần mở một địa chỉ HTTPS trên điện thoại/máy tính. Không cần chạy Rider/VS Code ở cửa hàng.

## Đưa lên Internet

Xem hướng dẫn từng bước tại **[DEPLOY-CLOUD.md](DEPLOY-CLOUD.md)**. Tệp `render.yaml` cấu hình máy chủ ở Singapore và ổ đĩa lưu dữ liệu bền vững.

## Đăng nhập lần đầu

- Tài khoản: `admin`
- Khi chạy nội bộ: mật khẩu mặc định `123456`.
- Khi triển khai Render: dùng mật khẩu `ADMIN_PASSWORD` bạn tự nhập trong bước tạo Blueprint.

**Quan trọng:** không dùng mật khẩu mặc định trên Internet; tạo tài khoản riêng cho nhân viên.

## Chạy nội bộ (không bắt buộc khi đã có URL cloud)

```bash
npm install
npm start
```

Truy cập `http://localhost:3000`.

## Dữ liệu

- Mặc định lưu tại `data/musicbox.json`.
- Có thể chuyển sang thư mục khác bằng biến môi trường `DATA_DIR`.
- Khi khởi tạo trên cloud, dữ liệu mẫu được chép vào volume lần đầu; các lần khởi động sau không ghi đè dữ liệu đang dùng.
- Không xóa volume `/var/data` trên Render.
