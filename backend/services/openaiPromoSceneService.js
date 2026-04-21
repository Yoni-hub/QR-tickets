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

const SCENE_PROFILES = [
  {
    shot: "wide establishing shot",
    setting: "outside a busy event venue entrance",
    lighting: "golden-hour natural light",
    action: "attendees forming an orderly line while staff prepares to scan tickets",
  },
  {
    shot: "drone-style overhead shot",
    setting: "festival grounds and entry lanes",
    lighting: "late-afternoon sunlight with long shadows",
    action: "crowd flow moving through multiple checkpoints",
  },
  {
    shot: "close-up detail shot",
    setting: "event staff setup table",
    lighting: "clean soft indoor key light",
    action: "hands preparing lanyards, wristbands, and badges before gates open",
  },
  {
    shot: "medium action shot",
    setting: "entry gate checkpoint",
    lighting: "bright clean daylight",
    action: "a staff member scanning a QR ticket on a guest smartphone",
  },
  {
    shot: "dynamic candid shot",
    setting: "security lane and bag-check area",
    lighting: "neutral daylight with soft contrast",
    action: "guests progressing quickly through security with no bottleneck",
  },
  {
    shot: "wide cinematic interior shot",
    setting: "venue lobby with digital signage and wayfinding",
    lighting: "bright architectural lighting",
    action: "attendees entering and splitting into different zones smoothly",
  },
  {
    shot: "close portrait shot",
    setting: "host and guests near gate barrier",
    lighting: "natural skin-tone accurate daylight",
    action: "friendly greeting and welcome moment before entry",
  },
  {
    shot: "high-energy crowd shot",
    setting: "inside a live concert floor",
    lighting: "colored stage lights and haze atmosphere",
    action: "excited crowd enjoying the show after successful check-in",
  },
  {
    shot: "night lifestyle shot",
    setting: "outdoor nightlife event entrance",
    lighting: "neon and LED accents with realistic faces",
    action: "guests approaching a fast-moving entry queue",
  },
  {
    shot: "professional operations shot",
    setting: "event operations corner backstage",
    lighting: "clean practical lighting",
    action: "organizer coordinating staff with clipboard and radio",
  },
  {
    shot: "celebratory lifestyle shot",
    setting: "post check-in event atmosphere",
    lighting: "vibrant evening venue lights",
    action: "happy attendees entering confidently after quick validation",
  },
];

const SCENE_VISUAL_STYLES = [
  "cinematic realism, shallow depth of field, 35mm look",
  "high-energy documentary photo style, motion-rich composition",
  "premium commercial ad photography, polished and clean",
  "urban nightlife realism, rich contrast and vibrant colors",
  "natural daylight editorial style, crisp and authentic",
  "festival atmosphere with subtle film grain and practical lights",
];

function stableOffset(seed, modulo) {
  const value = crypto.createHash("sha256").update(String(seed || "scene-seed")).digest().readUInt32BE(0);
  return modulo > 0 ? value % modulo : 0;
}

function buildSceneConcepts(lines, count) {
  const safeLines = Array.isArray(lines) && lines.length ? lines : ["fast event check-in"];
  const profileOffset = stableOffset(`profiles:${safeLines.join("|")}:${count}`, SCENE_PROFILES.length);
  const styleOffset = stableOffset(`styles:${safeLines.join("|")}:${count}`, SCENE_VISUAL_STYLES.length);
  const concepts = [];
  for (let index = 0; index < count; index += 1) {
    const line = safeLines[index % safeLines.length];
    const profile = SCENE_PROFILES[(profileOffset + index) % SCENE_PROFILES.length];
    const visualStyle = SCENE_VISUAL_STYLES[(styleOffset + index) % SCENE_VISUAL_STYLES.length];
    concepts.push({ line, profile, idx: index, total: count, visualStyle });
  }
  return concepts;
}

function buildScenePrompt({ baseStyle, sceneLine, idx, total, profile, visualStyle }) {
  const style = String(baseStyle || "").trim();
  return [
    "Create a vertical cinematic background image for a short event promo video.",
    "No text, no logos, no UI screenshots, no watermarks, no brand names.",
    "Show people, venues, ticketing, crowd flow, check-in moments, or atmosphere.",
    "Use realistic photography style, not illustration.",
    "This scene must look clearly different from other scenes in camera perspective, location, and subject focus.",
    "Avoid generating a repeated gate-scanning scene unless this prompt explicitly asks for it.",
    "Modern, vibrant, professional, social-media friendly composition.",
    `Shot type: ${profile?.shot || "cinematic event shot"}`,
    `Setting: ${profile?.setting || "event venue entrance"}`,
    `Lighting: ${profile?.lighting || "natural cinematic lighting"}`,
    `Action focus: ${profile?.action || "fast QR ticket check-in"}`,
    `Per-scene visual treatment: ${visualStyle || "cinematic realism"}`,
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

async function generatePromoSceneImages({ draftId, scriptText, onScreenText, sceneCount } = {}) {
  const apiKey = requireOpenAiApiKey();
  const model = String(process.env.OPENAI_IMAGE_MODEL || "gpt-image-1").trim() || "gpt-image-1";
  const requestedCount = Number.isFinite(Number(sceneCount)) ? Number(sceneCount) : Number(process.env.PROMO_SCENE_COUNT || 4);
  const count = Math.max(1, Math.min(5, requestedCount));
  const lines = toSceneLines({ onScreenText, scriptText, maxLines: count });
  const concepts = buildSceneConcepts(lines, count);
  const style = String(process.env.OPENAI_SCENE_STYLE || "dynamic event atmosphere, cinematic lighting, realistic photography").trim();

  ensureSceneRoot();
  const safeDraftId = sanitizeId(draftId);
  const scenePaths = [];

  for (let index = 0; index < concepts.length; index += 1) {
    const concept = concepts[index];
    const prompt = buildScenePrompt({
      baseStyle: style,
      sceneLine: concept.line,
      idx: concept.idx,
      total: concept.total,
      profile: concept.profile,
      visualStyle: concept.visualStyle,
    });
    const pngBuffer = await generateOneScenePng({ apiKey, model, prompt });
    const key = crypto
      .createHash("sha256")
      .update(`${safeDraftId}|${index}|${concept.line}|${concept.profile?.shot || ""}|${concept.profile?.setting || ""}`)
      .digest("hex")
      .slice(0, 12);
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
