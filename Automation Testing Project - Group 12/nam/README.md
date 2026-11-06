# Bài nộp cá nhân — Đặng Hoài Nam

MSSV: 23130197. Nhóm 12. Website: https://hr.demo.horilla.com.
Ba chức năng: Recruitment Candidates, Assets, Performance Meetings.

## Nội dung bản gọn

- src/: Page Objects, fixtures, cấu hình và utilities của cá nhân.
- tests/: 105 business test cases trong 11 spec và một auth setup riêng.
- test-data/: JSON, catalog và file PDF/PNG mẫu cần để chạy test.
- test-results/: kết quả tổng hợp, JSON nguồn, 105 log và đúng 105 ảnh trong screenshots/.
- scripts/: chỉ 4 helper cần cho fixture, reporter và các lệnh kiểm tra/xem report được giữ lại.
- package.json, package-lock.json, playwright.config.ts, tsconfig.json, .env.example, .gitignore: cấu hình cần để cài đặt và chạy.

Không kèm video, trace, node_modules, .env, phiên đăng nhập, PowerPoint, Excel, tài liệu khảo sát hoặc toàn bộ lịch sử report. PowerPoint là sản phẩm nộp riêng.

## Xem kết quả và ảnh

Mở test-results/index.html. 105 case gồm 100 Passed và 5 Failed, tổng hợp attempt gần nhất từ 5 lượt chạy; không phải một đợt chạy toàn suite.

105 ảnh gồm **5 screenshot Playwright gốc của case Fail** và **100 khung hình trích từ video gốc của case Pass** vì các lượt cũ chỉ chụp ảnh khi Fail. Ảnh trích được ghi rõ nguồn/thời điểm trong screenshot-index.json, không phải ảnh dựng lại hoặc bằng chứng một lần chạy mới. Một ảnh không tự chứng minh mọi assertion của case; xem log và kết quả JSON để đối chiếu.

Mỗi mã case có một ảnh PNG và một log. LOG_EXPORTED_AT là thời điểm xuất log; STARTED_AT là thời điểm chạy thực tế. JSON nguồn giữ nguyên các đường dẫn lịch sử; video/trace tại những đường dẫn đó không nằm trong ZIP này.

## Cài đặt và chạy

Dùng Node.js 22 LTS. Mở terminal tại thư mục chứa package.json:

```powershell
npm ci
Copy-Item .env.example .env
npx playwright install chromium
```

Đặt PLAYWRIGHT_CHANNEL=chromium trong .env và kiểm tra tài khoản demo trước khi chạy. Không cần phiên đăng nhập của người nộp; auth.setup.ts tự đăng nhập mới.

```powershell
npm run typecheck
npm run check:coverage
npm run test:list
npm test
```

Chạy riêng:

```powershell
npm run test:candidates
npm run test:assets
npm run test:meetings
npm test -- --grep "CAN-V2-01"
```

Cấu hình hiện tại vẫn quay video cho mọi test và chụp ảnh cả Pass/Fail trong những lần chạy mới. Các bản ghi đó được tạo mới khi thực thi, không phải video đính kèm bài nộp này. Giữ WORKERS=1. Test @write có tạo/cập nhật dữ liệu demo có marker riêng và thực hiện cleanup.

Sau một lần chạy mới, npm run report mở Playwright HTML Report mới. Để xem kết quả có sẵn trong bản nộp, dùng test-results/index.html.
