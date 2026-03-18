import { MAX_EVIDENCE_INPUT_BYTES, optimizeEvidenceDataUrl } from "../../lib/evidenceImage";

export const MAX_CHAT_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);

export function validateChatAttachment(file) {
  if (!file) return { ok: false, error: "Attachment is required." };
  const mimeType = String(file.type || "").toLowerCase();
  if (!ALLOWED_MIME.has(mimeType)) {
    return { ok: false, error: "Attachment must be PNG, JPEG, WEBP, or PDF." };
  }
  if (Number(file.size || 0) > MAX_CHAT_ATTACHMENT_BYTES) {
    return { ok: false, error: "Attachment is too large. Maximum upload size is 10MB." };
  }
  return { ok: true };
}

export async function normalizeChatAttachment(file) {
  const validation = validateChatAttachment(file);
  if (!validation.ok) {
    const error = new Error(validation.error);
    error.code = "INVALID_ATTACHMENT";
    throw error;
  }

  const mimeType = String(file.type || "").toLowerCase();
  if (!mimeType.startsWith("image/")) return file;

  if (file.size <= MAX_EVIDENCE_INPUT_BYTES) {
    try {
      const dataUrl = await optimizeEvidenceDataUrl(file);
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      return new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), { type: "image/webp" });
    } catch {
      return file;
    }
  }

  return file;
}
