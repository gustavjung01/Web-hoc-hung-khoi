# Payment pending

Thanh toán tự động/SePay chưa làm ở bước này.

Lý do:
- Chưa có domain chính để cấu hình webhook ổn định.

Hiện nút “Mua sản phẩm” chỉ dẫn tới màn checkout preview hoặc liên hệ hỗ trợ.

Sau khi có domain chính mới kết nối, quy trình sẽ gồm:
- tạo đơn hàng
- tạo QR
- nhận webhook SePay
- xác nhận paid
- tạo key
- gửi email Resend
- hiển thị gói trong tài khoản khách hàng.
