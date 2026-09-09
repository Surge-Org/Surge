import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:3000/";
const output = process.argv[3] ?? "visual-check.png";
const width = Number(process.argv[4] ?? 1440);
const height = Number(process.argv[5] ?? 1000);

// Playwright's managed Chromium by default; CHROME_PATH overrides it.
const browser = await chromium.launch({
  headless: true,
  args: ["--disable-extensions", "--no-first-run"],
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
});

const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});

const response = await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
await page.screenshot({ path: output, fullPage: true });

const result = {
  url: page.url(),
  status: response?.status() ?? null,
  title: await page.title(),
  bodyTextLength: (await page.locator("body").innerText()).length,
  viewport: { width, height },
  horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
  errors,
  screenshot: output,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
await browser.close();

if (errors.length > 0) process.exitCode = 1;
