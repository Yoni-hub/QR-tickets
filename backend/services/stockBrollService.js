const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");
const logger = require("../utils/logger");

const DEFAULT_QUERIES = [
  "event entrance",
  "concert entrance",
  "ticket scanning",
  "qr code scan",
  "people scanning qr code",
  "crowd at event",
  "busy check in",
  "smartphone qr code",
];

const CACHE_DIR = path.resolve(__dirname, "..", "storage", "private", "broll-cache");

let warnedAlias = false;

async function ensureCacheDir() {
  await fs.promises.mkdir(CACHE_DIR, { recursive: true }).catch(() => null);
}

function getEnvWithAliases(primaryName, aliasNames = []) {
  const candidates = [primaryName, ...aliasNames];
  for (const name of candidates) {
    const value = String(process.env[name] || "").trim();
    if (value) {
      if (name !== primaryName && !warnedAlias) {
        warnedAlias = true;
        logger.warn({
          message: "env_alias_used",
          primary: primaryName,
          alias: name,
        });
      }
      return value;
    }
  }
  return "";
}

function parseListEnv(name, fallbackList) {
  const raw = String(process.env[name] || "").trim();
  if (!raw) return fallbackList;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function pickRandom(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function safeBasename(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(0, 180);
}

async function downloadToFile({ url, destPath, maxBytes = 70 * 1024 * 1024, headers = {} }) {
  const response = await axios.get(url, {
    responseType: "stream",
    timeout: 30000,
    headers,
    maxRedirects: 3,
    validateStatus: () => true,
  });

  if (response.status < 200 || response.status >= 300) {
    const error = new Error(`Stock video download failed (${response.status}).`);
    error.statusCode = 502;
    throw error;
  }

  const tmpPath = `${destPath}.tmp-${crypto.randomBytes(4).toString("hex")}`;
  const writer = fs.createWriteStream(tmpPath);
  let downloaded = 0;

  await new Promise((resolve, reject) => {
    response.data.on("data", (chunk) => {
      downloaded += chunk.length;
      if (downloaded > maxBytes) {
        reject(new Error("Stock video is too large to download."));
        response.data.destroy();
        writer.destroy();
      }
    });
    response.data.on("error", reject);
    writer.on("error", reject);
    writer.on("finish", resolve);
    response.data.pipe(writer);
  });

  await fs.promises.rename(tmpPath, destPath);
  return destPath;
}

function chooseBestPexelsFile(videoFiles = []) {
  const files = Array.isArray(videoFiles) ? videoFiles : [];
  const mp4 = files.filter((f) => String(f?.file_type || "").toLowerCase().includes("mp4") && f?.link);
  if (!mp4.length) return null;

  const portrait = mp4.filter((f) => Number(f?.height || 0) >= Number(f?.width || 0));
  const candidates = portrait.length ? portrait : mp4;

  candidates.sort((a, b) => {
    const ah = Number(a?.height || 0);
    const bh = Number(b?.height || 0);
    const aw = Number(a?.width || 0);
    const bw = Number(b?.width || 0);
    if (bh !== ah) return bh - ah;
    return bw - aw;
  });

  return candidates[0] || null;
}

async function tryPexelsBroll({ durationSeconds }) {
  const apiKey = getEnvWithAliases("PEXELS_API_KEY", ["PIXELS_API_KEY", "PEXELS_KEY", "PEXELS_APIKEY"]);
  if (!apiKey) return null;

  const queries = parseListEnv("PROMO_BROLL_QUERIES", DEFAULT_QUERIES);
  const query = pickRandom(queries);
  if (!query) return null;

  const debug = String(process.env.PROMO_BROLL_DEBUG || "").trim() === "1";
  if (debug) logger.info({ message: "broll_pexels_search", query });

  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=30`;
  const response = await axios.get(url, {
    timeout: 20000,
    headers: { Authorization: apiKey },
    validateStatus: () => true,
  });

  if (response.status < 200 || response.status >= 300) {
    logger.warn({ message: "pexels_broll_search_failed", status: response.status });
    return null;
  }

  const videos = Array.isArray(response.data?.videos) ? response.data.videos : [];
  const longEnough = videos.filter((v) => Number(v?.duration || 0) >= Math.max(6, Number(durationSeconds || 0) - 2));
  const pool = longEnough.length ? longEnough : videos;
  const selected = pickRandom(pool);
  if (!selected) return null;

  const bestFile = chooseBestPexelsFile(selected.video_files);
  if (!bestFile?.link) return null;

  await ensureCacheDir();
  const fileName = safeBasename(`pexels-${selected.id}-${bestFile.height || "h"}.mp4`);
  const destPath = path.join(CACHE_DIR, fileName);

  if (fs.existsSync(destPath)) return { path: destPath, provider: "pexels", id: String(selected.id) };

  const maxMb = Number(process.env.PROMO_BROLL_MAX_MB || 70);
  await downloadToFile({
    url: bestFile.link,
    destPath,
    maxBytes: Math.max(10, maxMb) * 1024 * 1024,
    headers: { Authorization: apiKey },
  });

  if (debug) logger.info({ message: "broll_pexels_downloaded", id: String(selected.id), file: fileName });
  return { path: destPath, provider: "pexels", id: String(selected.id) };
}

async function tryPixabayBroll({ durationSeconds }) {
  const apiKey = getEnvWithAliases("PIXABAY_API_KEY", ["PIXABAY_KEY", "PIXABAY_APIKEY"]);
  if (!apiKey) return null;

  const queries = parseListEnv("PROMO_BROLL_QUERIES", DEFAULT_QUERIES);
  const query = pickRandom(queries);
  if (!query) return null;

  const debug = String(process.env.PROMO_BROLL_DEBUG || "").trim() === "1";
  if (debug) logger.info({ message: "broll_pixabay_search", query });

  const url = `https://pixabay.com/api/videos/?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(
    query,
  )}&orientation=vertical&per_page=30&safesearch=true`;

  const response = await axios.get(url, { timeout: 20000, validateStatus: () => true });
  if (response.status < 200 || response.status >= 300) {
    logger.warn({ message: "pixabay_broll_search_failed", status: response.status });
    return null;
  }

  const hits = Array.isArray(response.data?.hits) ? response.data.hits : [];
  const longEnough = hits.filter((v) => Number(v?.duration || 0) >= Math.max(6, Number(durationSeconds || 0) - 2));
  const pool = longEnough.length ? longEnough : hits;
  const selected = pickRandom(pool);
  if (!selected) return null;

  const videos = selected.videos || {};
  const candidates = [videos.large, videos.medium, videos.small, videos.tiny]
    .filter(Boolean)
    .filter((v) => v?.url);
  if (!candidates.length) return null;

  candidates.sort((a, b) => Number(b?.height || 0) - Number(a?.height || 0));
  const best = candidates[0];
  if (!best?.url) return null;

  await ensureCacheDir();
  const fileName = safeBasename(`pixabay-${selected.id}-${best.height || "h"}.mp4`);
  const destPath = path.join(CACHE_DIR, fileName);
  if (fs.existsSync(destPath)) return { path: destPath, provider: "pixabay", id: String(selected.id) };

  const maxMb = Number(process.env.PROMO_BROLL_MAX_MB || 70);
  await downloadToFile({
    url: best.url,
    destPath,
    maxBytes: Math.max(10, maxMb) * 1024 * 1024,
  });

  if (debug) logger.info({ message: "broll_pixabay_downloaded", id: String(selected.id), file: fileName });
  return { path: destPath, provider: "pixabay", id: String(selected.id) };
}

async function getRandomBrollVideo({ durationSeconds = 20 } = {}) {
  const orderRaw = String(process.env.PROMO_BROLL_PROVIDERS || "pexels,pixabay").trim();
  const providers = orderRaw
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  for (const provider of providers) {
    try {
      if (provider === "pexels") {
        const result = await tryPexelsBroll({ durationSeconds });
        if (result?.path) return result;
      }
      if (provider === "pixabay") {
        const result = await tryPixabayBroll({ durationSeconds });
        if (result?.path) return result;
      }
    } catch (error) {
      const code = String(error?.code || "").trim();
      const base = String(error?.message || "").trim();
      const msg = `${code ? `${code} ` : ""}${base || "Unknown error"}`.trim();
      // Some logger formats only print `message`, so include details directly there too.
      logger.warn({
        message: `broll_provider_failed:${provider}:${msg}`,
        provider,
        error: msg,
      });
    }
  }

  return null;
}

module.exports = {
  getRandomBrollVideo,
};
