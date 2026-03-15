export const MAX_EVIDENCE_INPUT_BYTES = 8 * 1024 * 1024;
export const MAX_EVIDENCE_OUTPUT_BYTES = 900 * 1024;
export const MAX_EVIDENCE_DIMENSION = 1600;

function estimateBase64Bytes(dataUrl) {
  const base64 = String(dataUrl || "").split(",")[1] || "";
  const sanitized = base64.replace(/=+$/, "");
  return Math.floor((sanitized.length * 3) / 4);
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      reject(new Error("Could not decode selected image."));
    };
    image.onload = () => {
      URL.revokeObjectURL(imageUrl);
      resolve(image);
    };
    image.src = imageUrl;
  });
}

export async function optimizeEvidenceDataUrl(file) {
  const image = await loadImageFromFile(file);
  const sourceWidth = Number(image.width || 0);
  const sourceHeight = Number(image.height || 0);
  if (!sourceWidth || !sourceHeight) {
    throw new Error("Could not read image dimensions.");
  }

  const scale = Math.min(1, MAX_EVIDENCE_DIMENSION / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not prepare image optimization.");
  }
  context.drawImage(image, 0, 0, width, height);

  const outputConfigs = [
    { mime: "image/webp", qualities: [0.82, 0.76, 0.7, 0.64] },
    { mime: "image/jpeg", qualities: [0.82, 0.76, 0.7, 0.64] },
  ];

  let bestDataUrl = "";
  let bestBytes = Number.POSITIVE_INFINITY;

  for (const config of outputConfigs) {
    for (const quality of config.qualities) {
      const dataUrl = canvas.toDataURL(config.mime, quality);
      if (!dataUrl.startsWith(`data:${config.mime};base64,`)) continue;
      const bytes = estimateBase64Bytes(dataUrl);
      if (bytes < bestBytes) {
        bestDataUrl = dataUrl;
        bestBytes = bytes;
      }
      if (bytes <= MAX_EVIDENCE_OUTPUT_BYTES) {
        return dataUrl;
      }
    }
  }

  if (!bestDataUrl) {
    throw new Error("Could not optimize selected image.");
  }
  if (bestBytes > MAX_EVIDENCE_OUTPUT_BYTES) {
    throw new Error("Evidence image is too large after optimization. Please use a smaller image.");
  }
  return bestDataUrl;
}
