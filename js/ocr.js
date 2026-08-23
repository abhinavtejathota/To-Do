const LIST_PREFIX = /^[\s•·▪▫◦‣⁃\-–—*+>□☐☑☒✓✔✗✘○●◯◉✕×]+[\s.)]*|^(\d+[\.\):\-]|[a-zA-Z][\.\):]|\([0-9]+\))[\s]*/;

export function parseLinesToTasks(rawText) {
  if (!rawText?.trim()) return [];

  const lines = rawText.split(/\r?\n/);
  const tasks = [];
  const seen = new Set();

  for (let line of lines) {
    line = line.trim();
    if (!line || line.length < 2) continue;

    line = line.replace(LIST_PREFIX, "").trim();
    line = line.replace(/^\[[ xX]\]\s*/, "").trim();
    line = line.replace(/^todo\s*[:-]\s*/i, "").trim();

    if (line.length < 2) continue;
    if (/^(page|date|time|total|subtotal|note|notes)\s*:/i.test(line)) continue;

    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    tasks.push(line);
  }

  return tasks;
}

export async function scanImage(imageSource, onProgress) {
  if (!window.Tesseract) {
    throw new Error("OCR engine not loaded. Check your internet connection.");
  }

  const worker = await Tesseract.createWorker("eng", 1, {
    logger: (m) => {
      if (m.status === "recognizing text" && onProgress) {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });

  try {
    if (Tesseract.PSM) {
      await worker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.AUTO,
      });
    }

    const { data } = await worker.recognize(imageSource);
    return {
      rawText: data.text,
      tasks: parseLinesToTasks(data.text),
      confidence: data.confidence,
    };
  } finally {
    await worker.terminate();
  }
}

export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function preprocessImageForOCR(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const maxDim = 2000;
      let { width, height } = img;

      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const boosted = gray < 128 ? gray * 0.7 : Math.min(255, gray * 1.2);
        data[i] = data[i + 1] = data[i + 2] = boosted;
      }
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.src = dataUrl;
  });
}
