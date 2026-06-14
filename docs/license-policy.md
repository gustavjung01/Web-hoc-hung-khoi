# Chuẩn key / licensing cho Học Tập Thông Minh

Tài liệu này là chuẩn dùng chung cho web chủ và các app lớp sau: Lớp 6, Lớp 7, Lớp 8...

## Nguyên tắc chính

Một key khách hàng có thể dùng đồng thời:

- 1 Desktop app gắn với 1 máy / device ID
- 1 Web session đang hoạt động

## Desktop app

- Mỗi key chỉ kích hoạt cho 1 device ID.
- Khi kích hoạt desktop, hệ thống lưu:
  - productId
  - licenseKey
  - userEmail
  - deviceId
  - activatedAt
  - expiresAt
  - status
- Nếu khách đổi máy, admin cần có chức năng reset hoặc chuyển device ID.
- Không cho 1 key kích hoạt nhiều desktop device cùng lúc.
- Desktop binding phải dùng machine/device ID ổn định, không dùng random ID trong localStorage.

## Web app

- Web kích hoạt bằng:
  - email đã mua sản phẩm
  - tài khoản đã đăng ký
  - license key
- Khách có thể đăng nhập trên nhiều thiết bị.
- Nhưng tại một thời điểm chỉ cho 1 web session hoạt động.
- Web session không được gắn chết vĩnh viễn vào một browser localStorage. Nếu khách mất browser cũ, admin phải reset được slot thiết bị.
- Nếu đăng nhập ở thiết bị mới, hệ thống có thể:
  - chặn thiết bị mới và báo đang có phiên hoạt động
  - hoặc cho thiết bị mới vào và đá phiên cũ ra
- Quyết định UX sẽ chốt sau, nhưng nguyên tắc là 1 key chỉ có 1 web session active.

## Quyền dùng đồng thời

Một key hợp lệ được phép dùng cùng lúc:

- 1 desktop device
- 1 web session

Ví dụ:
- Khách đã kích hoạt desktop trên máy A.
- Khách vẫn có thể dùng web trên điện thoại hoặc laptop.
- Nhưng web chỉ được 1 phiên hoạt động tại một thời điểm.

## Email sau thanh toán

Sau khi khách mua thành công, hệ thống gửi email bằng Resend gồm:

- Tên sản phẩm/gói
- Email khách hàng
- License key / mã kích hoạt
- Ngày bắt đầu
- Ngày hết hạn
- Link vào WebApp
- Hướng dẫn tải Desktop nếu có
- Số hỗ trợ: 0902964685

## Tài khoản khách hàng

Trong tài khoản khách hàng cần hiển thị:

- Sản phẩm/gói đã mua
- License key
- Trạng thái còn hạn / hết hạn
- Ngày hết hạn
- Nút vào WebApp
- Nút tải Desktop nếu có
- Nút gia hạn
- Lịch sử thanh toán

## Admin sau này cần quản lý

- Sản phẩm
- Giá gốc
- Giá giảm
- Mã giảm giá
- License key
- Gán key cho email khách hàng
- Gia hạn key
- Reset/chuyển device ID desktop
- Quản lý web session active
- Khách hàng đã mua gói nào

## Triển khai đợt 1

- Default license mới: `deviceLimit = 1` cho cả auto-paid và admin tạo tay.
- Backend vẫn chặn theo active device slots, nhưng admin phải có endpoint reset thiết bị bị kẹt.
- Admin UI cần hiển thị số thiết bị đang active và nút reset thiết bị cho từng license.
- Desktop fingerprint ổn định xử lý ở đợt sau, không trộn vào đợt 1.

## Lưu ý bảo mật

- Không lưu API key thật, secret key, Clerk secret, Resend key, payment secret trong tài liệu này.
- License key khách hàng là dữ liệu nghiệp vụ, không phải API secret hệ thống.
- Việc tạo key, reset device, kiểm tra session phải làm ở server/backend, không làm ở frontend.
