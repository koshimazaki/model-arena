// Screenshots the blog demo at a given width and reports horizontal overflow. Local tool, no network.
import puppeteer from "puppeteer-core";
const [url, width, out, action] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage();
await page.setViewport({ width: Number(width), height: 900, deviceScaleFactor: 1 });
page.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
page.on("pageerror", (e) => console.log("pageerror:", e.message));
await page.goto(url, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 800));
if (action) await page.evaluate(action);
await new Promise((r) => setTimeout(r, 800));
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log("horizontal overflow px:", overflow);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
