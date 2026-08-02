import { chromium } from "playwright";
import { config } from "dotenv";
config({ path: "d:/hifly_0_1/website/.env.local", quiet: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });

await page.goto("http://localhost:3000/login");
await page.getByLabel("E-Mail").fill(process.env.SUPER_ADMIN_EMAIL);
await page.getByLabel("Passwort").fill(process.env.SUPER_ADMIN_PASSWORD);
await page.getByRole("button", { name: "Anmelden", exact: true }).click();
await page.waitForURL("http://localhost:3000/");

await page.goto("http://localhost:3000/images");
await page.getByTestId("images-filter-location").fill("Fernaufnahmen OR Eisenhütte");
await page.waitForTimeout(500);
// reset filter, use broader tags query instead so both show up together
await page.getByTestId("images-filter-location").fill("");
await page.waitForTimeout(1500);

const info = await page.evaluate(() => {
  const cells = Array.from(document.querySelectorAll('[data-testid^="image-thumbnail-"]'));
  return cells.slice(0, 12).map((cell) => {
    const img = cell.querySelector("img");
    const label = cell.querySelector("span")?.textContent ?? null;
    if (!img) return { label, error: "no img" };
    const cellRect = cell.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();
    const imgStyle = getComputedStyle(img);
    return {
      label,
      cellW: Math.round(cellRect.width),
      cellH: Math.round(cellRect.height),
      imgW: Math.round(imgRect.width),
      imgH: Math.round(imgRect.height),
      isPortraitClass: img.className.includes("rounded-md"),
      borderRadius: imgStyle.borderRadius,
      border: imgStyle.border,
      naturalW: img.naturalWidth,
      naturalH: img.naturalHeight,
    };
  });
});
console.log(JSON.stringify(info, null, 2));

await page.screenshot({
  path: "C:/Users/ernst/AppData/Local/Temp/claude/d--hifly-0-1-website/90bc0027-548a-4c7f-b5b6-683311a6bd58/scratchpad/radius-check6.png",
  fullPage: false,
});

await browser.close();
console.log("done");
