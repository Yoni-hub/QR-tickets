const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PROMO_STORAGE_ROOT = path.resolve(__dirname, "..", "uploads", "private", "promo");
const PROMO_VIDEO_ROOT = path.join(PROMO_STORAGE_ROOT, "videos");

function ensurePromoStorageRoot() {
  fs.mkdirSync(PROMO_STORAGE_ROOT, { recursive: true });
}

function ensurePromoVideoRoot() {
  fs.mkdirSync(PROMO_VIDEO_ROOT, { recursive: true });
}

function sanitizeKeyPart(value) {
  return String(value || "draft")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80) || "draft";
}

async function savePromoAudioMp3({ draftId, mp3Buffer }) {
  if (!Buffer.isBuffer(mp3Buffer) || !mp3Buffer.length) {
    const error = new Error("Audio payload is invalid.");
    error.statusCode = 400;
    throw error;
  }

  ensurePromoStorageRoot();
  const safeId = sanitizeKeyPart(draftId);
  const basename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const fileName = `${safeId}-${basename}.mp3`;
  const absolutePath = path.join(PROMO_STORAGE_ROOT, fileName);
  await fs.promises.writeFile(absolutePath, mp3Buffer);
  const storageKey = fileName;

  return { storageKey, sizeBytes: mp3Buffer.length };
}

async function savePromoVideoMp4({ draftId, mp4Buffer }) {
  if (!Buffer.isBuffer(mp4Buffer) || !mp4Buffer.length) {
    const error = new Error("Video payload is invalid.");
    error.statusCode = 400;
    throw error;
  }

  ensurePromoVideoRoot();
  const safeId = sanitizeKeyPart(draftId);
  const basename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const fileName = `${safeId}-${basename}.mp4`;
  const absolutePath = path.join(PROMO_VIDEO_ROOT, fileName);
  await fs.promises.writeFile(absolutePath, mp4Buffer);
  const storageKey = `videos/${fileName}`;
  return { storageKey, sizeBytes: mp4Buffer.length };
}

function resolvePromoAudioAbsolutePath(storageKey) {
  const normalized = String(storageKey || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("../")) return "";
  return path.join(PROMO_STORAGE_ROOT, normalized);
}

function resolvePromoVideoAbsolutePath(storageKey) {
  return resolvePromoAudioAbsolutePath(storageKey);
}

module.exports = {
  PROMO_STORAGE_ROOT,
  savePromoAudioMp3,
  savePromoVideoMp4,
  resolvePromoAudioAbsolutePath,
  resolvePromoVideoAbsolutePath,
};
