const crypto = require("crypto");
const fs = require("fs");
const prisma = require("../utils/prisma");
const logger = require("../utils/logger");
const { sanitizeText, safeError } = require("../utils/sanitize");
const { generateDailyPromoDraft, generateOnScreenText, generateTtsMp3 } = require("../services/openaiPromoService");
const { generatePromoSceneImages } = require("../services/openaiPromoSceneService");
const { resolvePromoAudioAbsolutePath, resolvePromoVideoAbsolutePath, savePromoAudioMp3, savePromoVideoMp4 } = require("../services/promoStorageService");
const { renderPromoVideoMp4 } = require("../services/ffmpegPromoVideoService");
const { getRandomBrollVideo } = require("../services/stockBrollService");
const path = require("path");

const PLATFORM = "TIKTOK";
const activeVideoRenderJobs = new Set();

function startOfUtcDay(date = new Date()) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function serializeDraft(row) {
  if (!row) return null;
  return {
    id: row.id,
    platform: row.platform,
    scheduledFor: row.scheduledFor,
    status: row.status,
    scriptText: row.scriptText,
    onScreenText: row.onScreenText,
    captionText: row.captionText,
    voiceoverText: row.voiceoverText,
    audioReady: Boolean(row.audioStorageKey),
    videoReady: Boolean(row.videoStorageKey),
    audioStorageKey: null, // never expose storage keys to the browser
    videoStorageKey: null, // never expose storage keys to the browser
    lastError: row.lastError,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
  };
}

function isRangeNotSatisfiable(err) {
  if (!err) return false;
  if (err?.status === 416 || err?.statusCode === 416) return true;
  const code = String(err?.code || "").toLowerCase();
  if (code.includes("range") && code.includes("satisfiable")) return true;
  const msg = String(err?.message || "").toLowerCase();
  if (msg.includes("range") && msg.includes("satisfiable")) return true;
  return false;
}

function isRequestAborted(err) {
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("request aborted") || msg.includes("aborted");
}

function parseSingleRangeHeader(rangeHeader) {
  const raw = String(rangeHeader || "").trim();
  if (!raw.toLowerCase().startsWith("bytes=")) return null;
  const spec = raw.slice("bytes=".length).split(",")[0].trim();
  const match = spec.match(/^(\d*)-(\d*)$/);
  if (!match) return null;
  const startRaw = match[1];
  const endRaw = match[2];
  const start = startRaw === "" ? null : Number(startRaw);
  const end = endRaw === "" ? null : Number(endRaw);
  if ((start !== null && !Number.isFinite(start)) || (end !== null && !Number.isFinite(end))) return null;
  if (start !== null && start < 0) return null;
  if (end !== null && end < 0) return null;
  return { start, end };
}

async function streamFileWithRange(req, res, absolutePath, { contentType, fileName, cacheControl = "no-store" }) {
  const stat = await fs.promises.stat(absolutePath);
  const size = Number(stat.size || 0);
  if (!size) {
    res.status(404).json({ error: "File not found." });
    return;
  }

  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", cacheControl);
  res.setHeader("Accept-Ranges", "bytes");
  if (fileName) res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);

  const range = parseSingleRangeHeader(req.headers.range);
  if (!range) {
    res.setHeader("Content-Length", String(size));
    res.status(200);
    const stream = fs.createReadStream(absolutePath);
    req.on("aborted", () => stream.destroy());
    res.on("close", () => stream.destroy());
    stream.pipe(res);
    return;
  }

  // Suffix range: "-N" means last N bytes.
  let start = range.start;
  let end = range.end;
  if (start === null && end !== null) {
    const length = Math.max(0, end);
    start = Math.max(0, size - length);
    end = size - 1;
  } else {
    start = start === null ? 0 : start;
    end = end === null ? size - 1 : end;
  }

  if (start >= size) {
    res.status(416);
    res.setHeader("Content-Range", `bytes */${size}`);
    res.end();
    return;
  }

  end = Math.min(end, size - 1);
  if (end < start) {
    // Treat invalid ranges as a full response.
    res.setHeader("Content-Length", String(size));
    res.status(200);
    const stream = fs.createReadStream(absolutePath);
    req.on("aborted", () => stream.destroy());
    res.on("close", () => stream.destroy());
    stream.pipe(res);
    return;
  }

  const chunkSize = end - start + 1;
  res.status(206);
  res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
  res.setHeader("Content-Length", String(chunkSize));

  const stream = fs.createReadStream(absolutePath, { start, end });
  req.on("aborted", () => stream.destroy());
  res.on("close", () => stream.destroy());
  stream.pipe(res);
}

async function getLatestPromoDraft(req, res) {
  try {
    const row = await prisma.promoDraft.findFirst({
      where: { platform: PLATFORM },
      orderBy: { scheduledFor: "desc" },
    });
    res.status(200).json({ draft: serializeDraft(row) });
  } catch (error) {
    res.status(500).json({ error: safeError(error, "Could not load promo draft.") });
  }
}

async function generateTodayPromoDraft(req, res) {
  try {
    const scheduledFor = startOfUtcDay(new Date());
    const existing = await prisma.promoDraft.findUnique({
      where: { platform_scheduledFor: { platform: PLATFORM, scheduledFor } },
      select: { scriptText: true },
    });

    const draft = await generateDailyPromoDraft({
      platform: PLATFORM,
      niche: "event organizers and people creating events",
      productName: "Connsura QR Tickets",
      productUrl: "https://qr-tickets.connsura.com",
      avoidScript: String(existing?.scriptText || "").slice(0, 3500),
      variationSeed: crypto.randomBytes(8).toString("hex"),
    });

    const scriptText = sanitizeText(draft.script, 4000);
    const captionText = sanitizeText(draft.caption, 2200);
    const voiceoverText = sanitizeText(draft.voiceover, 4000);

    const now = new Date();
    const row = await prisma.promoDraft.upsert({
      where: { platform_scheduledFor: { platform: PLATFORM, scheduledFor } },
      create: {
        id: crypto.randomUUID(),
        platform: PLATFORM,
        scheduledFor,
        status: "SCRIPT_ONLY",
        scriptText,
        captionText,
        voiceoverText,
        lastError: null,
      },
      update: {
        status: "SCRIPT_ONLY",
        scriptText,
        captionText,
        voiceoverText,
        audioStorageKey: null,
        videoStorageKey: null,
        lastError: null,
        updatedAt: now,
      },
    });

    res.status(200).json({ draft: serializeDraft(row) });
  } catch (error) {
    const message = safeError(error, "Could not generate promo draft.");
    res.status(error.statusCode || 500).json({ error: message });
  }
}

async function updatePromoDraft(req, res) {
  try {
    const draftId = String(req.params?.draftId || "").trim();
    if (!draftId) {
      res.status(400).json({ error: "Missing draftId." });
      return;
    }

    const scriptText = sanitizeText(req.body?.scriptText, 4000);
    const onScreenText = sanitizeText(req.body?.onScreenText, 600);
    const captionText = sanitizeText(req.body?.captionText, 2200);
    const voiceoverText = sanitizeText(req.body?.voiceoverText, 4000);
    const statusRaw = String(req.body?.status || "").trim();
    const status = statusRaw === "READY_TO_UPLOAD" ? "READY_TO_UPLOAD" : "SCRIPT_ONLY";

    const row = await prisma.promoDraft.update({
      where: { id: draftId },
      data: {
        status,
        scriptText: scriptText || " ",
        onScreenText: onScreenText || null,
        captionText: captionText || null,
        voiceoverText: voiceoverText || null,
        audioStorageKey: null,
        videoStorageKey: null,
        lastError: null,
      },
    });

    res.status(200).json({ draft: serializeDraft(row) });
  } catch (error) {
    res.status(500).json({ error: safeError(error, "Could not update promo draft.") });
  }
}

async function generatePromoOnScreenText(req, res) {
  try {
    const draftId = String(req.params?.draftId || "").trim();
    if (!draftId) {
      res.status(400).json({ error: "Missing draftId." });
      return;
    }

    const draft = await prisma.promoDraft.findUnique({ where: { id: draftId } });
    if (!draft) {
      res.status(404).json({ error: "Draft not found." });
      return;
    }

    const lines = await generateOnScreenText({ scriptText: draft.scriptText });
    const onScreenText = sanitizeText(lines.join("\n"), 600);

    const row = await prisma.promoDraft.update({
      where: { id: draftId },
      data: {
        status: "SCRIPT_ONLY",
        onScreenText,
        videoStorageKey: null,
        lastError: null,
      },
    });

    res.status(200).json({ draft: serializeDraft(row) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: safeError(error, "Could not generate on-screen text.") });
  }
}

async function generatePromoAudio(req, res) {
  try {
    const draftId = String(req.params?.draftId || "").trim();
    if (!draftId) {
      res.status(400).json({ error: "Missing draftId." });
      return;
    }

    const draft = await prisma.promoDraft.findUnique({ where: { id: draftId } });
    if (!draft) {
      res.status(404).json({ error: "Draft not found." });
      return;
    }

    const voiceoverText = String(draft.voiceoverText || draft.scriptText || "").trim();
    if (!voiceoverText) {
      res.status(400).json({ error: "Draft has no voiceover text." });
      return;
    }

    const mp3 = await generateTtsMp3({
      input: voiceoverText,
      instructions: "Energetic, confident, friendly. Speak clearly. Avoid sounding robotic.",
    });

    const saved = await savePromoAudioMp3({ draftId, mp3Buffer: mp3 });
    const row = await prisma.promoDraft.update({
      where: { id: draftId },
      data: {
        status: "AUDIO_RENDERED",
        audioStorageKey: saved.storageKey,
        videoStorageKey: null,
        lastError: null,
      },
    });

    res.status(200).json({ draft: serializeDraft(row) });
  } catch (error) {
    logger.error(error);
    res.status(error.statusCode || 500).json({ error: safeError(error, "Could not generate audio.") });
  }
}

function buildRenderFailureMessage(error) {
  const header = safeError({ statusCode: 400, message: error?.message || "Video render failed." }, "Video render failed.");
  const details = typeof error?.details === "string" ? error.details.trim() : "";
  const combined = `${header}${details ? `\n\n${details}` : ""}`.trim();
  return combined.length > 3500 ? combined.slice(-3500) : combined;
}

async function runPromoVideoRenderJob(draftId) {
  const draft = await prisma.promoDraft.findUnique({ where: { id: draftId } });
  if (!draft) {
    const error = new Error("Draft not found.");
    error.statusCode = 404;
    throw error;
  }

  const logoPath = path.resolve(__dirname, "..", "assets", "og_latest_logo.png");
  if (!fs.existsSync(logoPath)) {
    const error = new Error("Logo asset is missing.");
    error.statusCode = 500;
    throw error;
  }

  const audioPath = draft.audioStorageKey ? resolvePromoAudioAbsolutePath(draft.audioStorageKey) : "";
  const sourceRaw = String(process.env.PROMO_SCENE_SOURCE || "auto").trim().toLowerCase();
  const sceneSource = ["ai", "stock", "auto"].includes(sourceRaw) ? sourceRaw : "auto";

  let broll = null;
  let aiScenePaths = [];

  if (sceneSource === "ai" || sceneSource === "auto") {
    try {
      aiScenePaths = await generatePromoSceneImages({
        draftId,
        scriptText: draft.scriptText,
        onScreenText: draft.onScreenText,
      });
      if (aiScenePaths.length) {
        logger.info({ message: "promo_scene_source_selected", source: "ai", sceneCount: aiScenePaths.length, draftId });
      }
    } catch (error) {
      logger.warn({
        message: "promo_ai_scene_generation_failed",
        draftId,
        error: String(error?.message || "unknown"),
      });
      if (sceneSource === "ai") throw error;
    }
  }

  if (!aiScenePaths.length && (sceneSource === "stock" || sceneSource === "auto")) {
    broll = await getRandomBrollVideo({ durationSeconds: 20 });
    if (broll?.path || (Array.isArray(broll?.imagePaths) && broll.imagePaths.length)) {
      logger.info({
        message: "promo_broll_selected",
        provider: broll.provider,
        id: broll.id,
        type: broll.path ? "video" : "images",
        imageCount: Array.isArray(broll.imagePaths) ? broll.imagePaths.length : 0,
      });
    } else {
      logger.info({ message: "promo_broll_missing" });
    }
  }

  const mp4 = await renderPromoVideoMp4({
    durationSeconds: 20,
    scriptText: draft.onScreenText || draft.scriptText,
    logoPngPath: logoPath,
    audioMp3Path: audioPath,
    brollMp4Path: broll?.path || "",
    brollImagePaths: aiScenePaths.length ? aiScenePaths : Array.isArray(broll?.imagePaths) ? broll.imagePaths : [],
  });

  const saved = await savePromoVideoMp4({ draftId, mp4Buffer: mp4 });
  const row = await prisma.promoDraft.update({
    where: { id: draftId },
    data: {
      status: "VIDEO_RENDERED",
      videoStorageKey: saved.storageKey,
      lastError: null,
    },
  });

  return row;
}

async function renderPromoVideo(req, res) {
  const draftId = String(req.params?.draftId || "").trim();
  try {
    const forceRaw = String(req.query?.force ?? req.body?.force ?? "").trim().toLowerCase();
    const forceRender = forceRaw === "1" || forceRaw === "true" || forceRaw === "yes";
    if (!draftId) {
      res.status(400).json({ error: "Missing draftId." });
      return;
    }

    const draft = await prisma.promoDraft.findUnique({
      where: { id: draftId },
      select: { id: true, videoStorageKey: true },
    });
    if (!draft) {
      res.status(404).json({ error: "Draft not found." });
      return;
    }

    if (draft.videoStorageKey && !forceRender) {
      const row = await prisma.promoDraft.findUnique({ where: { id: draftId } });
      res.status(200).json({ draft: serializeDraft(row) });
      return;
    }

    if (activeVideoRenderJobs.has(draftId)) {
      const row = await prisma.promoDraft.findUnique({ where: { id: draftId } });
      res.status(202).json({ draft: serializeDraft(row), rendering: true });
      return;
    }

    activeVideoRenderJobs.add(draftId);
    await prisma.promoDraft
      .update({
        where: { id: draftId },
        data: {
          ...(forceRender ? { videoStorageKey: null } : {}),
          lastError: null,
        },
      })
      .catch(() => null);

    setImmediate(async () => {
      try {
        await runPromoVideoRenderJob(draftId);
      } catch (error) {
        const message = buildRenderFailureMessage(error);
        logger.error({
          message: "promo_video_render_failed",
          draftId,
          error: error?.message,
          code: error?.code,
          details: typeof error?.details === "string" ? error.details.slice(0, 800) : undefined,
        });

        await prisma.promoDraft
          .update({
            where: { id: draftId },
            data: {
              status: "FAILED",
              lastError: message.slice(-4000),
            },
          })
          .catch(() => null);
      } finally {
        activeVideoRenderJobs.delete(draftId);
      }
    });

    const row = await prisma.promoDraft.findUnique({ where: { id: draftId } });
    res.status(202).json({ draft: serializeDraft(row), rendering: true });
  } catch (error) {
    const message = buildRenderFailureMessage(error);

    logger.error({
      message: "promo_video_render_failed",
      draftId,
      error: error?.message,
      code: error?.code,
      details: typeof error?.details === "string" ? error.details.slice(0, 800) : undefined,
    });

    if (draftId) {
      await prisma.promoDraft
        .update({
          where: { id: draftId },
          data: {
            status: "FAILED",
            lastError: message.slice(-4000),
          },
        })
        .catch(() => null);
    }

    res.status(error.statusCode || 500).json({ error: message || "Could not render video." });
  }
}

async function downloadPromoVideo(req, res) {
  try {
    const draftId = String(req.params?.draftId || "").trim();
    if (!draftId) {
      res.status(400).json({ error: "Missing draftId." });
      return;
    }

    const draft = await prisma.promoDraft.findUnique({
      where: { id: draftId },
      select: { id: true, videoStorageKey: true },
    });

    if (!draft?.videoStorageKey) {
      res.status(404).json({ error: "Video not found for this draft." });
      return;
    }

    const absolutePath = resolvePromoVideoAbsolutePath(draft.videoStorageKey);
    if (!absolutePath) {
      res.status(404).json({ error: "Video not found for this draft." });
      return;
    }

    await streamFileWithRange(req, res, absolutePath, {
      contentType: "video/mp4",
      fileName: `promo-video-${draft.id}.mp4`,
    });
  } catch (error) {
    res.status(500).json({ error: safeError(error, "Could not download video.") });
  }
}

async function uploadPromoDraftToTikTok(req, res) {
  res.status(501).json({
    error: "Upload Draft not implemented yet. This will be wired to TikTok Content Posting API once video rendering is enabled.",
  });
}

async function downloadPromoAudio(req, res) {
  try {
    const draftId = String(req.params?.draftId || "").trim();
    if (!draftId) {
      res.status(400).json({ error: "Missing draftId." });
      return;
    }

    const draft = await prisma.promoDraft.findUnique({
      where: { id: draftId },
      select: { id: true, audioStorageKey: true, updatedAt: true },
    });

    if (!draft?.audioStorageKey) {
      res.status(404).json({ error: "Audio not found for this draft." });
      return;
    }

    const absolutePath = resolvePromoAudioAbsolutePath(draft.audioStorageKey);
    if (!absolutePath) {
      res.status(404).json({ error: "Audio not found for this draft." });
      return;
    }

    await streamFileWithRange(req, res, absolutePath, {
      contentType: "audio/mpeg",
      fileName: `promo-voiceover-${draft.id}.mp3`,
    });
  } catch (error) {
    res.status(500).json({ error: safeError(error, "Could not download audio.") });
  }
}

module.exports = {
  getLatestPromoDraft,
  generateTodayPromoDraft,
  updatePromoDraft,
  generatePromoOnScreenText,
  generatePromoAudio,
  renderPromoVideo,
  downloadPromoVideo,
  uploadPromoDraftToTikTok,
  downloadPromoAudio,
};
