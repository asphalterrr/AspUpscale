const express = require("express");
const multer = require("multer");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const app = express();

const upload = multer({
  dest: os.tmpdir(),
  limits: {
    fileSize: 500 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowed = [
      "video/mp4",
      "video/quicktime",
      "video/webm"
    ];

    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Unsupported video format."));
    }

    cb(null, true);
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/upscale", upload.single("video"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: "No video uploaded."
    });
  }

  const input = req.file.path;

  const output = path.join(
    os.tmpdir(),
    "ultrascale-" + crypto.randomUUID() + ".mp4"
  );

  const allowedResolutions = {
    "1080": 1080,
    "1440": 1440,
    "2160": 2160
  };

  const allowedQualities = ["16", "18", "23"];

  const resolution = allowedResolutions[req.body.resolution];
  const quality = req.body.quality;

  const cleanup = () => {
    fs.rm(input, { force: true }, () => {});
    fs.rm(output, { force: true }, () => {});
  };

  if (!resolution || !allowedQualities.includes(quality)) {
    cleanup();

    return res.status(400).json({
      error: "Invalid settings."
    });
  }

  const scaleFilter =
    `scale=-2:${resolution}:flags=lanczos,` +
    `setsar=1,` +
    `unsharp=5:5:0.5:5:5:0.0`;

  const args = [
    "-y",
    "-i", input,
    "-vf", scaleFilter,
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", quality,
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    output
  ];

  const ffmpeg = spawn("ffmpeg", args);

  let errorLog = "";

  ffmpeg.stderr.on("data", data => {
    errorLog += data.toString().slice(-2000);

    if (errorLog.length > 4000) {
      errorLog = errorLog.slice(-4000);
    }
  });

  ffmpeg.on("error", () => {
    cleanup();

    if (!res.headersSent) {
      res.status(500).json({
        error: "FFmpeg is not installed on the server."
      });
    }
  });

  ffmpeg.on("close", code => {
    if (code !== 0) {
      cleanup();

      if (!res.headersSent) {
        return res.status(500).json({
          error: "Video processing failed.",
          details: errorLog.slice(-500)
        });
      }

      return;
    }

    res.download(output, "UltraScale_4K.mp4", err => {
      cleanup();

      if (err) {
        console.error("Download error:", err.message);
      }
    });
  });
});

app.use((err, req, res, next) => {
  res.status(400).json({
    error: err.message || "Upload failed."
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`UltraScale 4K running on port ${PORT}`);
});
