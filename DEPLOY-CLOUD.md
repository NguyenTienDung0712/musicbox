# Đưa Musicbox POS lên Internet (triển khai một lần)

Sau khi triển khai thành công, nhân viên **không cần mở Rider, VS Code, Terminal hay chạy ứng dụng trên máy của họ**. Mọi thiết bị chỉ mở cùng một địa chỉ HTTPS do Render cấp. Máy chủ cloud chạy Express + Socket.IO liên tục và lưu dữ liệu trên ổ đĩa bền vững.

## Cách triển khai

1. Giải nén `musicbox-pos.zip`.
2. Tạo repository mới trên GitHub (để Private nếu chỉ cửa hàng sử dụng), rồi tải toàn bộ nội dung thư mục dự án lên repository. Phải nhìn thấy `render.yaml` ở thư mục gốc repository, cùng cấp với `server.js` và `package.json`.
3. Tạo tài khoản tại https://render.com và kết nối GitHub.
4. Trên Render chọn **New → Blueprint**, chọn repository vừa tải lên. Ở bước nhập secret `ADMIN_PASSWORD`, hãy tự đặt một mật khẩu Admin mạnh và ghi nhớ.
5. Xác nhận tạo dịch vụ theo `render.yaml`. Blueprint cấu hình Node ở Singapore, một instance, health check và ổ đĩa persistent `/var/data`. Chờ Render báo **Live**.
6. Mở trang dịch vụ trên Render, sao chép URL HTTPS `*.onrender.com`. Đây là địa chỉ dùng trên tất cả máy tính/điện thoại.
7. Đăng nhập bằng `admin` và mật khẩu `ADMIN_PASSWORD` vừa đặt. Tạo các tài khoản riêng cho nhân viên trong mục Quản trị viên.

## Đồng bộ và dữ liệu

- Tất cả thiết bị truy cập cùng URL, cùng một máy chủ và cùng một file dữ liệu.
- Socket.IO phát cập nhật đơn hàng/phòng/bếp ngay đến các thiết bị đang kết nối.
- Khi mất mạng tạm thời, Socket.IO tự kết nối lại; khi kết nối lại, máy chủ gửi trạng thái hiện tại.
- Dữ liệu nằm ở `/var/data/musicbox.json`, không nằm trong thư mục build tạm của Render. Không xóa persistent disk hoặc xóa file này.
- Dịch vụ được giữ ở một instance vì ứng dụng hiện dùng JSON file và Socket.IO trong cùng tiến trình. Không bật scale nhiều instance cho cấu hình này.

## Chi phí và giới hạn quan trọng

Cấu hình dùng compute plan trả phí và persistent disk để dịch vụ không ngủ do nhàn rỗi và dữ liệu còn sau deploy/restart. Render xác định persistent disk chỉ dùng được với web service trả phí; dịch vụ miễn phí có thể ngủ sau 15 phút không hoạt động và filesystem của nó là tạm thời. Kiểm tra mức phí hiện tại ngay trong Render trước khi xác nhận tạo tài nguyên.

## Chạy thử nội bộ (không cần cho nhân viên sau khi đã triển khai)

```bash
npm install
npm start
```

Mở `http://localhost:3000`. Có thể đặt `DATA_DIR` để đổi thư mục dữ liệu.
