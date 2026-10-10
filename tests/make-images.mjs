// Renders the raster brand images (icons, Open Graph image, PNG logo) from the SVG sources.
// Run once after changing the logo:  cd tests && npm run images
// Output goes to static/assets/icons/ and static/favicon.ico and is committed to the repository.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const img = (name) => readFileSync(join(root, "static/assets/img", name), "utf8");
const dataUri = (svg) => "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
const out = join(root, "static/assets/icons");
mkdirSync(out, { recursive: true });

const NAVY = "#203a4b";
const markWhite = img("mark.svg").replace(/<style>.*?<\/style>/, "<style>g{color:#ffffff}</style>");
const markNavy = img("mark.svg").replace(/<style>.*?<\/style>/, `<style>g{color:${NAVY}}</style>`);
const logoWhite = img("logo-white.svg");
const logoNavy = img("logo-navy.svg");

const launchOptions = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const browser = await chromium.launch(launchOptions);

async function render(file, width, height, html, transparent = false) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><head><style>
    html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;${transparent ? "background:transparent" : ""}}
    body{display:grid;place-items:center}
    img{display:block}
  </style></head><body>${html}</body></html>`);
  await page.screenshot({ path: join(out, file), omitBackground: transparent });
  await page.close();
}

const square = (size, pad, radius) => `
  <div style="width:${size}px;height:${size}px;border-radius:${radius}px;background:${NAVY};display:grid;place-items:center">
    <img src="${dataUri(markWhite)}" style="width:${size - 2 * pad}px;height:${size - 2 * pad}px">
  </div>`;

await render("favicon-32.png", 32, 32, `<img src="${dataUri(markNavy)}" style="width:30px;height:30px">`, true);
await render("favicon-16.png", 16, 16, `<img src="${dataUri(markNavy)}" style="width:16px;height:16px">`, true);
await render("apple-touch-icon.png", 180, 180, square(180, 36, 0));
await render("icon-192.png", 192, 192, square(192, 38, 40));
await render("icon-512.png", 512, 512, square(512, 100, 104));
await render("icon-maskable-512.png", 512, 512, square(512, 140, 0));
await render("logo-600.png", 600, 197, `<img src="${dataUri(logoNavy)}" style="width:600px">`, true);

await render("og-image.png", 1200, 630, `
  <div style="width:1200px;height:630px;box-sizing:border-box;padding:84px 96px;display:flex;flex-direction:column;justify-content:space-between;
              background:radial-gradient(110% 120% at 100% 0%, rgba(154,74,128,.55), transparent 55%), ${NAVY};
              font-family:Montserrat, Inter, system-ui, sans-serif;color:#fff">
    <img src="${dataUri(logoWhite)}" style="width:430px">
    <div>
      <div style="font-size:60px;font-weight:700;line-height:1.1;letter-spacing:-1px;max-width:900px">Custom software, automation &amp; resale tools</div>
      <div style="margin-top:28px;font-size:28px;color:#c9d6e1">zeroneinternational.com · New York · 15 languages</div>
    </div>
  </div>`);

await browser.close();

// favicon.ico (PNG-in-ICO with 16px and 32px images)
const pngs = ["favicon-16.png", "favicon-32.png"].map((f) => readFileSync(join(out, f)));
const header = Buffer.alloc(6 + 16 * pngs.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(pngs.length, 4);
let offset = header.length;
pngs.forEach((png, i) => {
  const size = i === 0 ? 16 : 32;
  const base = 6 + 16 * i;
  header.writeUInt8(size, base);
  header.writeUInt8(size, base + 1);
  header.writeUInt8(0, base + 2);
  header.writeUInt8(0, base + 3);
  header.writeUInt16LE(1, base + 4);
  header.writeUInt16LE(32, base + 6);
  header.writeUInt32LE(png.length, base + 8);
  header.writeUInt32LE(offset, base + 12);
  offset += png.length;
});
writeFileSync(join(root, "static/favicon.ico"), Buffer.concat([header, ...pngs]));
console.log("Brand images written to static/assets/icons and static/favicon.ico");
