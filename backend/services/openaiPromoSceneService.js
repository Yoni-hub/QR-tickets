const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");
const logger = require("../utils/logger");

const SCENE_ROOT = path.resolve(__dirname, "..", "uploads", "private", "promo", "ai-scenes");

function requireOpenAiApiKey() {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  if (!key) {
    const error = new Error("OPENAI_API_KEY is not configured.");
    error.statusCode = 503;
    throw error;
  }
  return key;
}

function sanitizeId(value) {
  return String(value || "draft")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 100) || "draft";
}

function ensureSceneRoot() {
  fs.mkdirSync(SCENE_ROOT, { recursive: true });
}

function toSceneLines({ onScreenText, scriptText, maxLines = 5 }) {
  const source = String(onScreenText || scriptText || "")
    .split(/\r?\n/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (!source.length) {
    return ["Fast event check-in", "QR tickets in seconds", "No app needed", "Smooth event entry"];
  }
  return source.slice(0, Math.max(1, maxLines));
}

function buildScenePrompt({ baseStyle, sceneLine, idx, total }) {
  const style = String(baseStyle || "").trim();
  return [
    "Create a vertical cinematic background image for a short event promo video.",
    "No text, no logos, no UI screenshots, no watermarks, no brand names.",
    "Show people, venues, ticketing, crowd flow, check-in moments, or atmosphere.",
    "Modern, vibrant, professional, social-media friendly composition.",
    `Scene ${idx + 1} of ${total}: ${sceneLine}`,
    style ? `Visual style: ${style}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function generateOneScenePng({ apiKey, model, prompt }) {
  const response = await axios.post(
    "https://api.openai.com/v1/images/generations",
    {
      model,
      prompt,
      size: String(process.env.OPENAI_SCENE_SIZE || "1024x1536"),
      quality: String(process.env.OPENAI_SCENE_QUALITY || "medium"),
      n: 1,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 60000,
      validateStatus: () => true,
    },
  );

  if (response.status < 200 || response.status >= 300) {
    const error = new Error("OpenAI image generation failed.");
    error.statusCode = 502;
    error.details = `status=${response.status}`;
    throw error;
  }

  const first = Array.isArray(response.data?.data) ? response.data.data[0] : null;
  const b64 = String(first?.b64_json || "").trim();
  const url = String(first?.url || "").trim();
  if (b64) {
    return Buffer.from(b64, "base64");
  }
  if (url) {
    const img = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 30000,
      validateStatus: () => true,
    });
    if (img.status >= 200 && img.status < 300) return Buffer.from(img.data);
  }
  const error = new Error("OpenAI image generation returned no image.");
  error.statusCode = 502;
  throw error;
}

async function generatePromoSceneImages({ draftId, scriptText, onScreenText }) {
  const apiKey = requireOpenAiApiKey();
  const model = String(process.env.OPENAI_IMAGE_MODEL || "gpt-image-1").trim() || "gpt-image-1";
  const count = Math.max(1, Math.min(5, Number(process.env.PROMO_SCENE_COUNT || 4)));
  const lines = toSceneLines({ onScreenText, scriptText, maxLines: count });
  const style = String(process.env.OPENAI_SCENE_STYLE || "dynamic event atmosphere, cinematic lighting, realistic photography").trim();

  ensureSceneRoot();
  const safeDraftId = sanitizeId(draftId);
  const scenePaths = [];

  for (let index = 0; index < lines.length; index += 1) {
    const prompt = buildScenePrompt({
      baseStyle: style,
      sceneLine: lines[index],
      idx: index,
      total: lines.length,
    });
    const pngBuffer = await generateOneScenePng({ apiKey, model, prompt });
    const key = crypto.createHash("sha256").update(`${safeDraftId}|${index}|${lines[index]}`).digest("hex").slice(0, 12);
    const fileName = `${safeDraftId}-scene-${String(index + 1).padStart(2, "0")}-${key}.png`;
    const absolutePath = path.join(SCENE_ROOT, fileName);
    await fs.promises.writeFile(absolutePath, pngBuffer);
    scenePaths.push(absolutePath);
  }

  logger.info({
    message: "promo_ai_scenes_generated",
    draftId: safeDraftId,
    sceneCount: scenePaths.length,
    model,
  });

  return scenePaths;
}

module.exports = {
  generatePromoSceneImages,
};

