# Thành phần kiểm thử của Ngọc Ánh

Thành phần này được tích hợp vào cấu hình Playwright dùng chung của Group 12. Các bài kiểm thử được chia thành ba bộ:

- `tests/attendance.spec.js`: 28 test case Attendance (TC01–TC28).
- `tests/onboarding.spec.js`: 30 test case Onboarding (TC01–TC30).
- `tests/offboarding.spec.js`: 30 test case Offboarding (TC01–TC30).

## Chuẩn bị

1. Mở terminal tại thư mục gốc `Automation Testing Project - Group 12`.
2. Cài dependencies và Chromium theo README của nhóm.
3. Tạo `.env` từ `.env.example`, kiểm tra `BASE_URL`.
4. Chạy `npm run auth:save:anh`, đăng nhập bằng tài khoản kiểm thử phù hợp trong Chromium rồi nhấn Enter tại Terminal. Phiên được lưu tại `anh/playwright/.auth/user.json` và không được commit.
5. Điền các fixture `ATTENDANCE_*`, `ONBOARDING_*`, `OFFBOARDING_*` trong `.env` nếu test cần đối chiếu record cụ thể.

## Chạy test

```bash
npm run test:anh
npm run test:anh:attendance
npm run test:anh:onboarding
npm run test:anh:offboarding
```

## Lưu ý dữ liệu

Các test có khả năng tạo/sửa dữ liệu được bảo vệ bằng `RUN_ATTENDANCE_MUTATIONS`, `RUN_ONBOARDING_MUTATIONS` và `RUN_OFFBOARDING_MUTATIONS`. Mặc định các cờ này là `false`; chỉ bật khi dùng tenant và tài khoản chuyên dành cho kiểm thử. Các thao tác gửi email, xóa dữ liệu, khóa tài khoản và clock action có cờ cho phép riêng. Không bật cờ chỉ để giảm số lượng Skipped. Skipped thường có nghĩa là thiếu fixture, quyền, vai trò hoặc tính năng cần thiết.

Một số test Offboarding chạy với vai trò Employee cần storage state Employee riêng; cấu hình `OFFBOARDING_EMPLOYEE_STORAGE_STATE` trong `.env` bằng đường dẫn tương đối từ thư mục gốc. Không dùng phiên Admin để giả lập vai trò Employee.

## Tài liệu và tham chiếu

- `test-cases/Group12_23130017_DoanNgocAnh.xlsx`: file Excel test case/test design đi kèm bài.
- `references/horilla-assets/`: các tệp JavaScript tham chiếu giao diện Horilla; không được nạp vào Playwright test runner.
