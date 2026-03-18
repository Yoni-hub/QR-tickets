const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const CHAT_STORAGE_ROOT = path.resolve(__dirname, "..", "storage", "private", "chat");

const MIME_TO_EXTENSION = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

function getAttachmentKindFromMime(mimeTypeRaw) {
  const mimeType = String(mimeTypeRaw || "").toLowerCase();
  if (mimeType === "application/pdf") return "PDF";
  return "IMAGE";
}

function sanitizeFileName(value) {
  return String(value || "attachment")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 140) || "attachment";
}

function ensureChatStorageRoot() {
  fs.mkdirSync(CHAT_STORAGE_ROOT, { recursive: true });
}

async function saveChatAttachment({ conversationId, file }) {
  const mimeType = String(file?.mimetype || "").toLowerCase();
  const extension = MIME_TO_EXTENSION[mimeType];
  if (!extension) {
    const error = new Error("Attachment must be PNG, JPEG, WEBP, or PDF.");
    error.statusCode = 400;
    throw error;
  }

  if (!Buffer.isBuffer(file?.buffer) || !file.buffer.length) {
    const error = new Error("Attachment payload is invalid.");
    error.statusCode = 400;
    throw error;
  }

  ensureChatStorageRoot();
  const safeConversationId = sanitizeFileName(conversationId || "conversation");
  const folder = path.join(CHAT_STORAGE_ROOT, safeConversationId);
  await fs.promises.mkdir(folder, { recursive: true });

  const basename = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
  const fileName = `${basename}.${extension}`;
  const absolutePath = path.join(folder, fileName);
  await fs.promises.writeFile(absolutePath, file.buffer);

  const relativePath = path.relative(CHAT_STORAGE_ROOT, absolutePath).replace(/\\/g, "/");

  return {
    storageKey: relativePath,
    kind: getAttachmentKindFromMime(mimeType),
    mimeType,
    originalName: sanitizeFileName(file.originalname || `attachment.${extension}`),
    sizeBytes: Number(file.size || file.buffer.length || 0),
  };
}

function resolveAttachmentAbsolutePath(storageKey) {
  const normalized = String(storageKey || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("../")) return "";
  return path.join(CHAT_STORAGE_ROOT, normalized);
}

module.exports = {
  CHAT_STORAGE_ROOT,
  getAttachmentKindFromMime,
  saveChatAttachment,
  resolveAttachmentAbsolutePath,
};
