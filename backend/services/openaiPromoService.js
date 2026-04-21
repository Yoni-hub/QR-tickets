const axios = require("axios");
const logger = require("../utils/logger");

function requireOpenAiApiKey() {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  if (!key) {
    const error = new Error("OPENAI_API_KEY is not configured.");
    error.statusCode = 503;
    throw error;
  }
  return key;
}

function pickModels() {
  return {
    textModel: String(process.env.OPENAI_TEXT_MODEL || "gpt-5.2").trim() || "gpt-5.2",
    textTemperature: Number(process.env.OPENAI_TEXT_TEMPERATURE || 1.0),
    ttsModel: String(process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts").trim() || "gpt-4o-mini-tts",
    ttsVoice: String(process.env.OPENAI_TTS_VOICE || "marin").trim() || "marin",
  };
}

function extractResponseText(responseJson) {
  if (!responseJson) return "";
  if (typeof responseJson.output_text === "string" && responseJson.output_text.trim()) return responseJson.output_text.trim();

  const output = Array.isArray(responseJson.output) ? responseJson.output : [];
  for (const item of output) {
    if (item?.type !== "message") continue;
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (part?.type === "output_text" && typeof part.text === "string" && part.text.trim()) {
        return part.text.trim();
      }
    }
  }
  return "";
}

async function generateDailyPromoDraft({ platform = "TIKTOK", niche, productName, productUrl, avoidScript = "", variationSeed = "" }) {
  const apiKey = requireOpenAiApiKey();
  const { textModel, textTemperature } = pickModels();

  const prompt = [
    "You write short vertical-video promo scripts.",
    "Return ONLY valid JSON (no markdown) with keys: hook, script, voiceover, caption, hashtags.",
    "Constraints:",
    "- platform is TikTok",
    "- total voiceover length ~15-25 seconds",
    "- target audience: event organizers / people creating events",
    "- friendly, confident, non-cringy",
    "- avoid unverifiable claims; no spammy language",
    "- include a clear CTA to try the product",
    "",
    `Product: ${productName || "Connsura QR Tickets"}`,
    `URL: ${productUrl || "https://qr-tickets.connsura.com"}`,
    `Niche: ${niche || "event organizers"}`,
    variationSeed ? `Variation seed: ${variationSeed}` : "",
    avoidScript ? "Previous draft to avoid (must be materially different in angle/phrasing):\n" + avoidScript : "",
    "",
    "Output JSON example:",
    '{"hook":"...","script":"...","voiceover":"...","caption":"...","hashtags":["#...","#..."]}',
  ].join("\n");

  const response = await axios.post(
    "https://api.openai.com/v1/responses",
    {
      model: textModel,
      input: prompt,
      temperature: Number.isFinite(textTemperature) ? textTemperature : 1.0,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
      validateStatus: () => true,
    },
  );

  if (response.status < 200 || response.status >= 300) {
    const error = new Error("OpenAI text generation failed.");
    error.statusCode = 502;
    logger.error({
      message: "openai_promo_text_failed",
      status: response.status,
      error: response.data?.error?.message || response.data?.error,
    });
    throw error;
  }

  const text = extractResponseText(response.data);
  if (!text) {
    const error = new Error("OpenAI returned empty promo text.");
    error.statusCode = 502;
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const error = new Error("OpenAI returned non-JSON output.");
    error.statusCode = 502;
    logger.error({ message: "openai_promo_text_non_json", sample: text.slice(0, 200) });
    throw error;
  }

  const hook = String(parsed?.hook || "").trim();
  const script = String(parsed?.script || "").trim();
  const voiceover = String(parsed?.voiceover || "").trim() || script;
  const caption = String(parsed?.caption || "").trim();
  const hashtags = Array.isArray(parsed?.hashtags) ? parsed.hashtags.map((h) => String(h || "").trim()).filter(Boolean) : [];

  if (!script) {
    const error = new Error("OpenAI promo draft missing script.");
    error.statusCode = 502;
    throw error;
  }

  const combinedCaption = caption
    ? `${caption}${hashtags.length ? `\n\n${hashtags.join(" ")}` : ""}`
    : hashtags.length
      ? hashtags.join(" ")
      : "";

  return {
    platform,
    hook,
    script,
    voiceover,
    caption: combinedCaption,
  };
}

async function generateOnScreenText({ scriptText }) {
  const apiKey = requireOpenAiApiKey();
  const { textModel, textTemperature } = pickModels();

  const prompt = [
    "You rewrite promo scripts into short on-screen text for a 20-second TikTok-style motion-graphics video.",
    "Return ONLY valid JSON (no markdown) with key: lines (array of 4 to 6 strings).",
    "Rules:",
    "- No timestamps like [0:00–0:03]",
    "- No shot directions like 'Clip:' or 'Screen recording:'",
    "- Keep each line <= 34 characters",
    "- Clear value prop + CTA",
    "",
    "Input script:",
    scriptText || "",
    "",
    "Output JSON example:",
    '{"lines":["Scan tickets fast","Live check-in count","No apps needed","Try Connsura QR Tickets"]}',
  ].join("\n");

  const response = await axios.post(
    "https://api.openai.com/v1/responses",
    {
      model: textModel,
      input: prompt,
      temperature: Number.isFinite(textTemperature) ? Math.min(1.2, Math.max(0.4, textTemperature)) : 0.8,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
      validateStatus: () => true,
    },
  );

  if (response.status < 200 || response.status >= 300) {
    const error = new Error("OpenAI on-screen text generation failed.");
    error.statusCode = 502;
    logger.error({ message: "openai_onscreen_failed", status: response.status });
    throw error;
  }

  const text = extractResponseText(response.data);
  if (!text) {
    const error = new Error("OpenAI returned empty on-screen output.");
    error.statusCode = 502;
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const error = new Error("OpenAI returned non-JSON on-screen output.");
    error.statusCode = 502;
    throw error;
  }

  const lines = Array.isArray(parsed?.lines) ? parsed.lines : [];
  const cleaned = lines
    .map((line) => String(line || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((line) => (line.length > 34 ? line.slice(0, 34) : line));

  if (cleaned.length < 3) {
    const error = new Error("OpenAI on-screen text output was invalid.");
    error.statusCode = 502;
    throw error;
  }

  return cleaned;
}

async function generateTtsMp3({ input, instructions }) {
  const apiKey = requireOpenAiApiKey();
  const { ttsModel, ttsVoice } = pickModels();

  const response = await axios.post(
    "https://api.openai.com/v1/audio/speech",
    {
      model: ttsModel,
      voice: ttsVoice,
      input: String(input || ""),
      instructions: String(instructions || "Speak clearly, energetic, and professional."),
    },
    {
      responseType: "arraybuffer",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 60000,
      validateStatus: () => true,
    },
  );

  if (response.status < 200 || response.status >= 300) {
    const error = new Error("OpenAI TTS failed.");
    error.statusCode = 502;
    logger.error({
      message: "openai_tts_failed",
      status: response.status,
    });
    throw error;
  }

  return Buffer.from(response.data);
}

module.exports = {
  generateDailyPromoDraft,
  generateOnScreenText,
  generateTtsMp3,
};
