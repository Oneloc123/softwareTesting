# Automation Testing Project - Group 12

Project kiểm thử tự động website Horilla HRMS, được hợp nhất từ script của các thành viên và chuẩn hóa sang **JavaScript + Playwright**.

## 1. Yêu cầu môi trường

- Node.js 20 trở lên (khuyến nghị Node.js 22 LTS).
- npm đi kèm Node.js.
- Trình duyệt Chromium do Playwright quản lý.
- Tài khoản có quyền truy cập website demo `https://hr.demo.horilla.com`.

## 2. Cài đặt

Mở terminal tại thư mục gốc `Automation Testing Project - Group 12`:

```bash
npm ci
npx playwright install chromium
```

Tạo file cấu hình môi trường:

**Windows PowerShell**

```powershell
Copy-Item .env.example .env
```

**macOS / Linux**

```bash
cp .env.example .env
```

Mở `.env` và cập nhật URL/tài khoản demo nếu thông tin mặc định không còn hợp lệ. Không commit file `.env` hoặc thông tin đăng nhập thật lên Git.

## 3. Cấu trúc project

```text
Automation Testing Project - Group 12/
├── hieu/                         # Test của thành viên Hiếu
├── hoa/                          # Test của thành viên Hòa
├── loc/                          # Test của thành viên Lộc
├── nam/                          # Test, Page Object, fixture và test data của Nam
├── anh/                          # Attendance, Onboarding, Offboarding của Ngọc Ánh
├── scripts/                      # Reporter lưu ảnh/log minh chứng
├── Test Report - Group 12/        # HTML, JSON và JUnit XML sau khi chạy
├── Envidence - Group12/           # Screenshot và log theo từng lần chạy
├── playwright.config.js           # Cấu hình Playwright dùng chung
├── package.json
├── package-lock.json
├── .env.example
└── README.md
```

Bài của Ngọc Ánh cũng được lưu trong `anh/test-cases/` (file Excel test case) và `anh/references/` (tài liệu JavaScript giao diện tham khảo).

Toàn bộ file kiểm thử và cấu hình được sử dụng khi chạy đều là `.js`. Các file `.ts`, `tsconfig.json` và cấu hình Playwright riêng của thư mục thành viên đã được loại bỏ để tránh chạy nhầm cấu hình.

## 4. Chạy kiểm thử

Liệt kê test case để kiểm tra project đã được nhận diện:

```bash
npm run test:list
```

Chạy toàn bộ Test Suite:

```bash
npm test
```

Chạy theo thành viên:

```bash
npm run test:hieu
npm run test:hoa
npm run test:loc
npm run test:nam
npm run test:anh
```

Chạy giao diện Playwright UI hoặc chế độ hiển thị trình duyệt:

```bash
npm run test:ui
npm run test:headed
```

Chạy riêng từng bộ của Ngọc Ánh:

```bash
npm run auth:save:anh
npm run test:anh:attendance
npm run test:anh:onboarding
npm run test:anh:offboarding
```

Lệnh `auth:save:anh` mở Chromium để đăng nhập thủ công và lưu phiên tại `anh/playwright/.auth/user.json`. Cần thực hiện trước khi chạy `npm run test:anh`; không chia sẻ hoặc commit storage state này. Khi chạy toàn bộ `npm test`, cũng cần tạo phiên này trước để các test của Anh có thể được thực thi.

Kiểm tra bộ 105 case Candidates, Assets và Performance Meetings của Nam:

```bash
npm run check:coverage
```

Một số test tạo/cập nhật dữ liệu demo. Những test này cần tài khoản phù hợp và có thể bị bỏ qua khi thiếu tài khoản nhân viên hoặc khi đặt `ALLOW_MUTATIONS=false`. Các bộ Attendance, Onboarding và Offboarding của Ngọc Ánh có các cờ riêng `RUN_ATTENDANCE_MUTATIONS`, `RUN_ONBOARDING_MUTATIONS`, `RUN_OFFBOARDING_MUTATIONS` (mặc định `false`) cùng cờ xác nhận riêng cho thao tác clock, gửi email, xóa và khóa tài khoản. Project cấu hình `WORKERS=1` vì các nhóm test sử dụng tài khoản demo và dữ liệu dùng chung; không tăng số worker nếu chưa tách tài khoản/dữ liệu.

## 5. Test Report

Sau khi `npm test` chạy xong, mở:

```text
Test Report - Group 12/html-report/index.html
```

Các định dạng báo cáo cũng được xuất tự động:

- `Test Report - Group 12/results.json`
- `Test Report - Group 12/junit.xml`

Hoặc dùng lệnh:

```bash
npm run report
```

Lưu ý: thư mục báo cáo trong gói bàn giao ban đầu chỉ có hướng dẫn trạng thái. Báo cáo HTML/JSON/XML thực tế sẽ được tạo sau khi chạy Test Suite trên máy có kết nối tới website và tài khoản hợp lệ.

## 6. Screenshot/log minh chứng

Reporter dùng chung tự động ghi nhận screenshot, video của test lỗi (nếu có), log JSON cho từng test và `summary.json`:

```text
Envidence - Group12/
└── <RUN_ID>/
    ├── RUN_INFO.txt
    ├── summary.json
    ├── screenshots/
    ├── logs/
    └── videos/
```

Mỗi lần chạy tạo một thư mục theo `RUN_ID`. Có thể đặt `RUN_ID` trong `.env`; nếu để trống, hệ thống tự tạo mã theo thời gian. Các screenshot/log là tệp đính kèm do Playwright tạo trong lần chạy thật. ZIP nguồn được cung cấp không kèm minh chứng của lần chạy trước, vì vậy cần chạy `npm test` để sinh bộ minh chứng thực tế.

## 7. Lưu ý khi nộp Git

- Commit toàn bộ source, `package.json`, `package-lock.json`, cấu hình, `.env.example` và README.
- Không commit `node_modules`, `.env`, cookie/session hoặc thông tin đăng nhập.
- Sau khi chạy trên máy thực tế, đưa báo cáo và thư mục `Envidence - Group12/<RUN_ID>/` vào commit nộp nếu giảng viên yêu cầu nộp kèm kết quả thực thi.
