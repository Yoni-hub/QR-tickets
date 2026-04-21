const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

function runFfmpeg(args, { timeoutMs = 180000 } = {}) {
  return new Promise((resolve, reject) => {
    let ffmpegBin = String(process.env.FFMPEG_PATH || "").trim();
    if (
      (ffmpegBin.startsWith('"') && ffmpegBin.endsWith('"')) ||
      (ffmpegBin.startsWith("'") && ffmpegBin.endsWith("'"))
    ) {
      ffmpegBin = ffmpegBin.slice(1, -1);
    }
    ffmpegBin = ffmpegBin || "ffmpeg";
    const ffmpeg = spawn(ffmpegBin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      ffmpeg.kill("SIGKILL");
      const error = new Error("FFmpeg timed out.");
      error.statusCode = 504;
      reject(error);
    }, timeoutMs);

    ffmpeg.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    ffmpeg.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    ffmpeg.on("error", (err) => {
      clearTimeout(timer);
      const error = new Error("FFmpeg is not available on this system. Install ffmpeg and ensure it is on PATH.");
      error.statusCode = 503;
      error.cause = err;
      reject(error);
    });

    ffmpeg.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const error = new Error("FFmpeg failed to render video.");
      error.statusCode = 500;
      error.details = stderr.slice(-4000);
      reject(error);
    });
  });
}

function resolveFontForDrawText() {
  const candidates =
    process.platform === "win32"
      ? [
          "C:/Windows/Fonts/arialbd.ttf",
          "C:/Windows/Fonts/Arial.ttf",
          "C:/Windows/Fonts/segoeuib.ttf",
          "C:/Windows/Fonts/segoeui.ttf",
        ]
      : [
          "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
          "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ];

  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) return filePath;
    } catch {
      // ignore
    }
  }
  return "";
}

function escapeFilterOptionValue(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\\\:");
}

function chunkLines(text, maxLen = 34, maxLines = 3) {
  const raw = String(text || "").trim();
  const preLines = raw.includes("\n")
    ? raw
        .split(/\r?\n/)
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter(Boolean)
    : [];

  if (preLines.length) {
    return preLines.map((line) => (line.length > maxLen ? line.slice(0, maxLen) : line)).slice(0, maxLines);
  }

  const words = raw.replace(/\s+/g, " ").split(" ").filter(Boolean);

  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxLen) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length >= maxLines) break;
  }
  if (lines.length < maxLines && current) lines.push(current);
  return lines.slice(0, maxLines);
}

async function writeOneLineTextFile(dir, name, text) {
  const safe = String(text || "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const filePath = path.join(dir, name);
  await fs.promises.writeFile(filePath, safe || " ", "utf8");
  return filePath;
}

async function renderPromoVideoMp4({
  durationSeconds = 20,
  scriptText,
  logoPngPath,
  audioMp3Path = "",
  brollMp4Path = "",
  brollImagePaths = [],
}) {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "qr-promo-"));
  const outPath = path.join(tmpDir, "promo.mp4");

  const lines = chunkLines(scriptText, 34, 5);
  const line1 = lines[0] || "Tickets in seconds.";
  const line2 = lines[1] || "No apps. Just QR.";
  const line3 = lines[2] || "Try Connsura QR Tickets.";
  const line4 = lines[3] || "";
  const line5 = lines[4] || "";

  const templateRaw = String(process.env.PROMO_VIDEO_TEMPLATE || "auto").trim().toLowerCase();
  const wantsBroll = templateRaw === "broll" || templateRaw === "auto";
  const hasBroll = Boolean(brollMp4Path && fs.existsSync(brollMp4Path));
  const existingImagePaths = (Array.isArray(brollImagePaths) ? brollImagePaths : []).filter((item) => item && fs.existsSync(item));
  const hasBrollImages = existingImagePaths.length > 0;
  const useBrollImages = wantsBroll && !hasBroll && hasBrollImages;
  const useBroll = wantsBroll && hasBroll;

  const inputArgs = ["-y", "-hide_banner", "-loglevel", "error", "-nostdin"];

  // Inputs:
  // - B-roll video template:
  //   0: background mp4 (looped)
  //   1: brand tint overlay (lavfi)
  //   2: logo png
  //   3: optional audio mp3
  // - B-roll image scenes template:
  //   0..n-1: background images (looped)
  //   n: brand tint overlay (lavfi)
  //   n+1: logo png
  //   n+2: optional audio mp3
  // - Motion template:
  //   0: base color (lavfi)
  //   1-3: blobs (lavfi)
  //   4: logo png
  //   5: optional audio mp3
  if (useBroll) {
    inputArgs.push("-stream_loop", "-1", "-i", brollMp4Path);
    inputArgs.push("-f", "lavfi", "-i", `color=c=#4f46e5@0.22:s=1080x1920:r=30:d=${durationSeconds}`);
    inputArgs.push("-i", logoPngPath);
    if (audioMp3Path) inputArgs.push("-i", audioMp3Path);
  } else if (useBrollImages) {
    const sceneSeconds = Math.max(2, Number(durationSeconds || 20) / existingImagePaths.length);
    for (const imagePath of existingImagePaths) {
      inputArgs.push("-loop", "1", "-t", String(sceneSeconds), "-i", imagePath);
    }
    inputArgs.push("-f", "lavfi", "-i", `color=c=#4f46e5@0.22:s=1080x1920:r=30:d=${durationSeconds}`);
    inputArgs.push("-i", logoPngPath);
    if (audioMp3Path) inputArgs.push("-i", audioMp3Path);
  } else {
    inputArgs.push("-f", "lavfi", "-i", `color=c=#0b1021:s=1080x1920:r=30:d=${durationSeconds}`);
    inputArgs.push("-f", "lavfi", "-i", `color=c=#4f46e5@0.28:s=520x520:r=30:d=${durationSeconds}`);
    inputArgs.push("-f", "lavfi", "-i", `color=c=#0ea5e9@0.22:s=460x460:r=30:d=${durationSeconds}`);
    inputArgs.push("-f", "lavfi", "-i", `color=c=#312e81@0.22:s=600x600:r=30:d=${durationSeconds}`);
    inputArgs.push("-i", logoPngPath);
    if (audioMp3Path) inputArgs.push("-i", audioMp3Path);
  }

  const fontFile = resolveFontForDrawText();
  const fontClause = fontFile ? `fontfile=${escapeFilterOptionValue(fontFile.replace(/\\/g, "/"))}` : "font=Arial";
  const drawCommon = `${fontClause}:fontsize=60:fontcolor=white@0.95:shadowcolor=black@0.35:shadowx=2:shadowy=2`;

  const t1 = await writeOneLineTextFile(tmpDir, "l1.txt", line1);
  const t2 = await writeOneLineTextFile(tmpDir, "l2.txt", line2);
  const t3 = await writeOneLineTextFile(tmpDir, "l3.txt", line3);
  const t4 = await writeOneLineTextFile(tmpDir, "l4.txt", line4);
  const t5 = await writeOneLineTextFile(tmpDir, "l5.txt", line5);

  const textFileClause = (filePath) => `textfile=${escapeFilterOptionValue(String(filePath).replace(/\\/g, "/"))}:reload=0`;

  const imageSceneFilter = (() => {
    if (!useBrollImages) return "";
    const imageCount = existingImagePaths.length;
    const sceneSeconds = Number(durationSeconds || 20) / imageCount;
    const sceneFilters = [];
    for (let index = 0; index < imageCount; index += 1) {
      sceneFilters.push(
        `[${index}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(1.18,1+0.0008*on)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30,trim=duration=${sceneSeconds.toFixed(3)},setpts=PTS-STARTPTS[s${index}];`,
      );
    }

    let sceneOut = "[s0]";
    for (let index = 1; index < imageCount; index += 1) {
      const prev = sceneOut;
      const current = `[s${index}]`;
      const offset = Math.max(0, index * sceneSeconds - 0.45);
      const next = `[x${index}]`;
      sceneFilters.push(`${prev}${current}xfade=transition=fade:duration=0.45:offset=${offset.toFixed(3)}${next};`);
      sceneOut = next;
    }

    const tintIndex = imageCount;
    const logoIndex = imageCount + 1;
    sceneFilters.push(`[${tintIndex}:v]format=rgba[tint];`);
    sceneFilters.push(`${sceneOut}[tint]overlay=0:0:format=auto,vignette=PI/6[bg];`);
    sceneFilters.push(`[${logoIndex}:v]scale=170:-1[logo];`);
    sceneFilters.push("[bg][logo]overlay=44:44:format=auto[base];");
    return sceneFilters.join("");
  })();

  const filter = useBroll
    ? [
        // B-roll background (scaled/cropped to 9:16), then brand tint + vignette for readability.
        "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,format=rgba,eq=contrast=1.05:saturation=1.08[bg0];",
        "[1:v]format=rgba[tint];",
        "[bg0][tint]overlay=0:0:format=auto,vignette=PI/6[bg];",

        // Scale logo and overlay.
        "[2:v]scale=170:-1[logo];",
        "[bg][logo]overlay=44:44:format=auto[base];",

        // Animate text in (enable by time, y shifts slightly).
        `[base]drawtext=${textFileClause(t1)}:x=80:y=560-16*sin(2*PI*t/3):alpha='if(lt(t,0.5),0, if(lt(t,1.0),(t-0.5)/0.5,1))':${drawCommon}[t1a];`,
        `[t1a]drawtext=${textFileClause(t2)}:x=80:y=680-16*sin(2*PI*(t-0.4)/3):alpha='if(lt(t,0.8),0, if(lt(t,1.3),(t-0.8)/0.5,1))':${drawCommon}[t2a];`,
        `[t2a]drawtext=${textFileClause(t3)}:x=80:y=800-16*sin(2*PI*(t-0.8)/3):alpha='if(lt(t,1.1),0, if(lt(t,1.6),(t-1.1)/0.5,1))':${drawCommon}[t3a];`,
        `[t3a]drawtext=${textFileClause(t4)}:x=80:y=920-16*sin(2*PI*(t-1.2)/3):alpha='if(lt(t,1.4),0, if(lt(t,1.9),(t-1.4)/0.5,1))':${drawCommon}[t4a];`,
        `[t4a]drawtext=${textFileClause(t5)}:x=80:y=1040-16*sin(2*PI*(t-1.6)/3):alpha='if(lt(t,1.7),0, if(lt(t,2.2),(t-1.7)/0.5,1))':${drawCommon}[vout]`,
      ].join("")
    : useBrollImages
      ? [
          imageSceneFilter,
          `[base]drawtext=${textFileClause(t1)}:x=80:y=560-16*sin(2*PI*t/3):alpha='if(lt(t,0.5),0, if(lt(t,1.0),(t-0.5)/0.5,1))':${drawCommon}[t1a];`,
          `[t1a]drawtext=${textFileClause(t2)}:x=80:y=680-16*sin(2*PI*(t-0.4)/3):alpha='if(lt(t,0.8),0, if(lt(t,1.3),(t-0.8)/0.5,1))':${drawCommon}[t2a];`,
          `[t2a]drawtext=${textFileClause(t3)}:x=80:y=800-16*sin(2*PI*(t-0.8)/3):alpha='if(lt(t,1.1),0, if(lt(t,1.6),(t-1.1)/0.5,1))':${drawCommon}[t3a];`,
          `[t3a]drawtext=${textFileClause(t4)}:x=80:y=920-16*sin(2*PI*(t-1.2)/3):alpha='if(lt(t,1.4),0, if(lt(t,1.9),(t-1.4)/0.5,1))':${drawCommon}[t4a];`,
          `[t4a]drawtext=${textFileClause(t5)}:x=80:y=1040-16*sin(2*PI*(t-1.6)/3):alpha='if(lt(t,1.7),0, if(lt(t,2.2),(t-1.7)/0.5,1))':${drawCommon}[vout]`,
        ].join("")
    : [
        // Base + vignette for readability.
        "[0:v]format=rgba,vignette=PI/5[grad];",

        // Moving blurred shapes (separate inputs) + animated positioning via overlay expressions.
        "[1:v]format=rgba,gblur=sigma=60:steps=2[blob1];",
        "[2:v]format=rgba,gblur=sigma=55:steps=2[blob2];",
        "[3:v]format=rgba,gblur=sigma=65:steps=2[blob3];",
        "[grad][blob1]overlay=x='main_w*0.10+sin(t*0.70)*120':y='main_h*0.16+cos(t*0.55)*90':format=auto[tmp1];",
        "[tmp1][blob2]overlay=x='main_w*0.62+cos(t*0.60)*140':y='main_h*0.10+sin(t*0.45)*85':format=auto[tmp2];",
        "[tmp2][blob3]overlay=x='main_w*0.18+sin(t*0.52)*110':y='main_h*0.66+cos(t*0.72)*110':format=auto[bg];",

        // Scale logo and overlay.
        "[4:v]scale=170:-1[logo];",
        "[bg][logo]overlay=44:44:format=auto[base];",

        // Animate text in (enable by time, y shifts slightly).
        `[base]drawtext=${textFileClause(t1)}:x=80:y=560-16*sin(2*PI*t/3):alpha='if(lt(t,0.5),0, if(lt(t,1.0),(t-0.5)/0.5,1))':${drawCommon}[t1a];`,
        `[t1a]drawtext=${textFileClause(t2)}:x=80:y=680-16*sin(2*PI*(t-0.4)/3):alpha='if(lt(t,0.8),0, if(lt(t,1.3),(t-0.8)/0.5,1))':${drawCommon}[t2a];`,
        `[t2a]drawtext=${textFileClause(t3)}:x=80:y=800-16*sin(2*PI*(t-0.8)/3):alpha='if(lt(t,1.1),0, if(lt(t,1.6),(t-1.1)/0.5,1))':${drawCommon}[t3a];`,
        `[t3a]drawtext=${textFileClause(t4)}:x=80:y=920-16*sin(2*PI*(t-1.2)/3):alpha='if(lt(t,1.4),0, if(lt(t,1.9),(t-1.4)/0.5,1))':${drawCommon}[t4a];`,
        `[t4a]drawtext=${textFileClause(t5)}:x=80:y=1040-16*sin(2*PI*(t-1.6)/3):alpha='if(lt(t,1.7),0, if(lt(t,2.2),(t-1.7)/0.5,1))':${drawCommon}[vout]`,
      ].join("");

  const outputArgs = [
    "-filter_complex",
    filter,
    "-map",
    "[vout]",
  ];

  const audioInputIndex = audioMp3Path ? (useBroll ? 3 : useBrollImages ? existingImagePaths.length + 2 : 5) : -1;
  if (audioInputIndex >= 0) {
    outputArgs.push(
      "-map",
      `${audioInputIndex}:a`,
      "-shortest",
      "-af",
      "loudnorm=I=-16:TP=-1.5:LRA=11",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
    );
  }

  outputArgs.push(
    "-t",
    String(durationSeconds),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-profile:v",
    "high",
    "-level",
    "4.1",
    "-r",
    "30",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-movflags",
    "+faststart",
    outPath,
  );

  await runFfmpeg([...inputArgs, ...outputArgs], { timeoutMs: 240000 });
  const mp4 = await fs.promises.readFile(outPath);

  // Best-effort cleanup.
  await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => null);

  return mp4;
}

module.exports = {
  renderPromoVideoMp4,
};
