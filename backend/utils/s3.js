const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { randomBytes } = require("crypto");

function isS3Configured() {
  return !!(
    process.env.AWS_REGION &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.S3_BUCKET_NAME
  );
}

function getS3Client() {
  return new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

// Upload a buffer to S3. Returns the S3 key.
async function uploadToS3({ buffer, mimeType, prefix = "evidence" }) {
  const bucket = process.env.S3_BUCKET_NAME;
  const ext = mimeType === "image/webp" ? "webp" : mimeType === "image/jpeg" ? "jpg" : "png";
  const key = `${prefix}/${randomBytes(16).toString("hex")}.${ext}`;
  await getS3Client().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
  }));
  return key;
}

// Generate a presigned GET URL (1-hour expiry). Returns null on failure.
async function getPresignedUrl(key, expiresIn = 3600) {
  if (!key) return null;
  try {
    return await getSignedUrl(
      getS3Client(),
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET_NAME, Key: key }),
      { expiresIn },
    );
  } catch {
    return null;
  }
}

// Convert a base64 data URL to a Buffer + mimeType
function dataUrlToBuffer(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) return null;
  return { buffer: Buffer.from(match[2], "base64"), mimeType: match[1] };
}

// Upload a data URL to S3 and return the S3 key. Returns null if S3 not configured.
async function uploadDataUrlToS3(dataUrl, prefix = "evidence") {
  if (!isS3Configured() || !dataUrl) return null;
  const parsed = dataUrlToBuffer(dataUrl);
  if (!parsed) return null;
  return uploadToS3({ buffer: parsed.buffer, mimeType: parsed.mimeType, prefix });
}

// Resolve a display URL: presigned S3 URL if key exists, else fall back to data URL.
async function resolveImageUrl(s3Key, dataUrl) {
  if (s3Key) return getPresignedUrl(s3Key);
  return dataUrl || null;
}

module.exports = { isS3Configured, uploadToS3, getPresignedUrl, uploadDataUrlToS3, resolveImageUrl };
