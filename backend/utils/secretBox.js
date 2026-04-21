const crypto = require("crypto");

function requireTokenEncryptionKey() {
  const raw = String(process.env.TOKEN_ENCRYPTION_KEY || "").trim();
  if (!raw) {
    const error = new Error("TOKEN_ENCRYPTION_KEY is not configured.");
    error.statusCode = 503;
    throw error;
  }

  let key;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    const error = new Error("TOKEN_ENCRYPTION_KEY must be base64.");
    error.statusCode = 503;
    throw error;
  }

  if (key.length !== 32) {
    const error = new Error("TOKEN_ENCRYPTION_KEY must decode to 32 bytes.");
    error.statusCode = 503;
    throw error;
  }

  return key;
}

function encryptSecret(plaintext) {
  const key = requireTokenEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext || ""), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

function decryptSecret(payload) {
  const key = requireTokenEncryptionKey();
  const parts = String(payload || "").split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    const error = new Error("Invalid encrypted payload.");
    error.statusCode = 500;
    throw error;
  }

  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const ciphertext = Buffer.from(parts[3], "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

module.exports = { encryptSecret, decryptSecret, sha256Hex };

