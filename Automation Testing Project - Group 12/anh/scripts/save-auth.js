const { chromium } = require("@playwright/test");
const path = require("node:path");
const fs = require("node:fs");
const readline = require("node:readline/promises");
const { stdin, stdout } = require("node:process");
require("dotenv").config({ path: path.resolve(__dirname, "..", "..", ".env") });

(async () => {
  const baseURL = process.env.BASE_URL;
  if (!baseURL) throw new Error("Thiếu BASE_URL trong .env.");

  const output = path.resolve(
    __dirname,
    "..",
    process.env.ANH_STORAGE_STATE || "playwright/.auth/user.json",
  );
  fs.mkdirSync(path.dirname(output), { recursive: true });

  const browser = await chromium.launch({ headless: false });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    const rl = readline.createInterface({ input: stdin, output: stdout });
    await rl.question("\nHãy đăng nhập Horilla bằng tài khoản kiểm thử trong cửa sổ trình duyệt. Khi vào được Dashboard, quay lại Terminal và nhấn Enter để lưu phiên... ");
    rl.close();
    await context.storageState({ path: output });
    console.log(`Đã lưu storageState tại: ${output}`);
    console.log("Không chia sẻ hoặc commit tệp này vì nó chứa thông tin phiên đăng nhập.");
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
