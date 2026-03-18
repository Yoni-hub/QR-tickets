const multer = require("multer");

const MAX_CHAT_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_CHAT_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_CHAT_ATTACHMENT_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const mimeType = String(file?.mimetype || "").toLowerCase();
    if (!ALLOWED_CHAT_MIME.has(mimeType)) {
      cb(new Error("Attachment must be PNG, JPEG, WEBP, or PDF."));
      return;
    }
    cb(null, true);
  },
});

function chatAttachmentUpload(req, res, next) {
  const handler = upload.single("attachment");
  handler(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ error: "Attachment is too large. Maximum upload size is 10MB." });
      return;
    }

    res.status(400).json({ error: error.message || "Invalid attachment upload." });
  });
}

module.exports = {
  chatAttachmentUpload,
  MAX_CHAT_ATTACHMENT_BYTES,
  ALLOWED_CHAT_MIME,
};
