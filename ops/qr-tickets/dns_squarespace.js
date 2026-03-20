import { chromium } from "playwright";
import dotenv from "dotenv";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, ".env") });

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function waitForEnter(message) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(message, () => { rl.close(); resolve(); });
  });
}

function hostFromDomain(domain, rootDomain) {
  if (domain === rootDomain) return "@";
  if (!domain.endsWith(rootDomain)) throw new Error(`${domain} does not end with ${rootDomain}`);
  return domain.slice(0, domain.length - rootDomain.length - 1);
}

async function fillFirst(page, selectors, value) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0) { await locator.fill(value); return; }
  }
  throw new Error(`No input found for: ${selectors.join(", ")}`);
}

async function clickFirst(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0) { await locator.click(); return; }
  }
  throw new Error(`No button found for: ${selectors.join(", ")}`);
}

async function recordExists(page, host) {
  const row = page.locator("tr", { hasText: host }).filter({ hasText: "A" });
  if ((await row.count()) > 0) return true;
  const div = page.locator("div", { hasText: host }).filter({ hasText: "A" });
  return (await div.count()) > 0;
}

async function upsertARecord(page, host, ip) {
  if (!(await recordExists(page, host))) {
    const addBtn = page.getByRole("button", { name: /add record/i });
    if ((await addBtn.count()) > 0) await addBtn.first().click();
    else {
      console.log(`\nManual step: Add A record  Host: ${host}  Value: ${ip}`);
      await waitForEnter("Press Enter once saved...");
      return;
    }
  } else {
    const row = page.locator("tr", { hasText: host }).filter({ hasText: "A" });
    if ((await row.count()) > 0) await row.first().click();
  }

  await page.waitForTimeout(500);
  const dialog = page.locator("[role='dialog']").first();
  const container = (await dialog.count()) > 0 ? dialog : page;

  const sel = container.locator("select").first();
  if ((await sel.count()) > 0) await sel.selectOption({ label: "A" }).catch(() => {});

  const hostInput = container.getByLabel(/host|name|subdomain/i).first();
  if ((await hostInput.count()) > 0) await hostInput.fill(host);

  const valInput = container.getByLabel(/value|data|points|ip/i).first();
  if ((await valInput.count()) > 0) await valInput.fill(ip);

  const saveBtn = container.getByRole("button", { name: /save|add|create/i }).first();
  if ((await saveBtn.count()) > 0) await saveBtn.click();

  await page.waitForTimeout(1000);
  console.log(`A record upserted: ${host} -> ${ip}`);
}

async function run() {
  const email    = requireEnv("SS_EMAIL");
  const password = requireEnv("SS_PASSWORD");
  const dnsUrl   = process.env.SS_DNS_URL;
  const domain   = requireEnv("DOMAIN");
  const publicIp = requireEnv("PUBLIC_IP");
  const rootDomain = process.env.ROOT_DOMAIN || domain.split(".").slice(-2).join(".");
  const host = hostFromDomain(domain, rootDomain);

  const browser = await chromium.launch({ headless: false });
  const page = await (await browser.newContext()).newPage();

  await page.goto("https://account.squarespace.com/", { waitUntil: "domcontentloaded" });

  try {
    await fillFirst(page, ["input[type='email']", "input[name='email']"], email);
    await fillFirst(page, ["input[type='password']", "input[name='password']"], password);
    await clickFirst(page, ["button[type='submit']", "button:has-text('Log In')", "button:has-text('Sign In')"]);
  } catch {
    console.log("Auto-login failed. Please log in manually.");
    await waitForEnter("Press Enter after logging in...");
  }

  await page.waitForTimeout(2000);
  const otp = page.locator("input[type='tel'], input[name*='otp'], input[autocomplete='one-time-code']");
  if ((await otp.count()) > 0) {
    console.log("MFA detected. Complete it in the browser.");
    await waitForEnter("Press Enter after completing MFA...");
  }

  if (dnsUrl) {
    await page.goto(dnsUrl, { waitUntil: "domcontentloaded" });
  } else {
    await page.goto("https://account.squarespace.com/domains/managed", { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: new RegExp(rootDomain, "i") }).first().click();
    await page.getByRole("link", { name: /dns settings/i }).first().click();
  }

  console.log(`Upserting A record: ${host} -> ${publicIp}`);
  await upsertARecord(page, host, publicIp);

  console.log("DNS automation complete.");
  await waitForEnter("Press Enter to close browser...");
  await browser.close();
}

run().catch((err) => { console.error("DNS failed:", err.message); process.exit(1); });
