function isImageFile(file) {
  if (file.type.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|heic|heif|bmp|tiff?)$/i.test(file.name);
}

function isIcsFile(file) {
  return file.type === "text/calendar" || /\.ics$/i.test(file.name);
}

function isPdfFile(file) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing && existing.dataset.loaded === "true") {
      resolve();
      return;
    }
    const script = existing || document.createElement("script");
    script.src = src;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error("Could not load the file reader."));
    if (!existing) document.head.appendChild(script);
  });
}

async function loadTesseract() {
  if (window.Tesseract) return window.Tesseract;
  await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js");
  return window.Tesseract;
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not open that image. Try a PNG or JPG screenshot."));
    };
    image.src = url;
  });
}

function upscaleImage(image) {
  const scale = image.width < 1600 ? 3 : image.width < 2200 ? 2 : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const contrast = 1.25;
    data[i] = Math.min(255, Math.max(0, (data[i] - 128) * contrast + 128));
    data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - 128) * contrast + 128));
    data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - 128) * contrast + 128));
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function isClassFill(r, g, b, loose = false) {
  // Prefer SOLUS sage tiles (~187,208,153). Loose greens merge adjacent columns.
  if (r >= 150 && r <= 220 && g >= 175 && g <= 240 && b >= 110 && b <= 195 && g >= r + 6 && g >= b + 10) {
    return true;
  }
  if (g > r + 8 && g > b + 6 && g > 140 && g < 235 && r > 120 && b > 100) return true;
  if (loose) {
    if (g >= r && g >= b - 8 && g > 130 && g - Math.min(r, b) >= 8) return true;
    if (g > r + 4 && g > b + 2 && g > 125) return true;
  }
  return false;
}

function erodeMask(mask, width, height, rounds = 2) {
  let current = mask;
  for (let round = 0; round < rounds; round += 1) {
    const next = new Uint8Array(current.length);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const i = y * width + x;
        if (
          current[i] &&
          current[i - 1] &&
          current[i + 1] &&
          current[i - width] &&
          current[i + width]
        ) {
          next[i] = 1;
        }
      }
    }
    current = next;
  }
  return current;
}

function findClassBlocks(canvas, { loose = false } = {}) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const { data } = ctx.getImageData(0, 0, width, height);
  const raw = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    raw[p] = isClassFill(data[i], data[i + 1], data[i + 2], loose) ? 1 : 0;
  }
  // Erode so touching day-column tiles don't flood into one blob.
  const mask = erodeMask(raw, width, height, 3);
  const visited = new Uint8Array(width * height);
  const boxes = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (visited[start] || !mask[start]) continue;
      const stack = [start];
      visited[start] = 1;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let count = 0;
      while (stack.length) {
        const p = stack.pop();
        const px = p % width;
        const py = (p / width) | 0;
        count += 1;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        [p + 1, p - 1, p + width, p - width].forEach((next) => {
          if (next < 0 || next >= visited.length || visited[next] || !mask[next]) return;
          const nx = next % width;
          const ny = (next / width) | 0;
          if (Math.abs(nx - px) + Math.abs(ny - py) !== 1) return;
          visited[next] = 1;
          stack.push(next);
        });
      }
      // Expand back the erosion margin so text near edges stays in the crop.
      minX = Math.max(0, minX - 3);
      minY = Math.max(0, minY - 3);
      maxX = Math.min(width - 1, maxX + 3);
      maxY = Math.min(height - 1, maxY + 3);
      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      if (count > 80 && bw > 20 && bh > 14 && bw < width * 0.28 && bh < height * 0.45) {
        boxes.push({
          x0: minX,
          y0: minY,
          x1: maxX,
          y1: maxY,
          cx: (minX + maxX) / 2,
          cy: (minY + maxY) / 2,
        });
      }
    }
  }

  // Split blobs that still span two day columns.
  const widths = boxes.map((box) => box.x1 - box.x0 + 1).sort((a, b) => a - b);
  const typical = widths[Math.floor(widths.length / 2)] || width / 8;
  const split = [];
  boxes.forEach((box) => {
    const bw = box.x1 - box.x0 + 1;
    if (bw > typical * 1.55) {
      const mid = Math.round((box.x0 + box.x1) / 2);
      split.push(
        {
          x0: box.x0,
          y0: box.y0,
          x1: mid - 1,
          y1: box.y1,
          cx: (box.x0 + mid - 1) / 2,
          cy: box.cy,
        },
        {
          x0: mid,
          y0: box.y0,
          x1: box.x1,
          y1: box.y1,
          cx: (mid + box.x1) / 2,
          cy: box.cy,
        }
      );
    } else {
      split.push(box);
    }
  });
  return split.filter((box) => box.x1 - box.x0 >= 18 && box.y1 - box.y0 >= 12);
}

function contrastCanvas(source) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const contrast = 1.8;
    data[i] = Math.min(255, Math.max(0, (data[i] - 128) * contrast + 128));
    data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - 128) * contrast + 128));
    data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - 128) * contrast + 128));
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function binarizeCanvas(source, threshold = 155) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const value = gray < threshold ? 0 : 255;
    data[i] = data[i + 1] = data[i + 2] = value;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function cropCanvas(source, box, pad = 6, { binarize = false, contrast = false } = {}) {
  const x0 = Math.max(0, Math.floor(box.x0 - pad));
  const y0 = Math.max(0, Math.floor(box.y0 - pad));
  const x1 = Math.min(source.width, Math.ceil(box.x1 + pad));
  const y1 = Math.min(source.height, Math.ceil(box.y1 + pad));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, x1 - x0);
  canvas.height = Math.max(1, y1 - y0);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, x0, y0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  if (contrast) return contrastCanvas(canvas);
  if (binarize) return binarizeCanvas(contrastCanvas(canvas), 155);
  return canvas;
}

/** Map a Y position in the SOLUS week grid to minutes past midnight (8:00–22:00). */
function minutesFromSolusY(y, gridTop, gridBottom, startMinutes = 8 * 60, endMinutes = 22 * 60) {
  if (!(gridBottom > gridTop)) return null;
  const t = Math.max(0, Math.min(1, (y - gridTop) / (gridBottom - gridTop)));
  const minutes = startMinutes + t * (endMinutes - startMinutes);
  return Math.round(minutes / 5) * 5;
}

/**
 * Build a Y→minutes scale from the left-hand time labels (8:00AM, 9:00AM, …).
 * This is more reliable than reading times inside green tiles.
 */
function buildGutterTimeScale(words, imageWidth, fallbackTop, fallbackBottom) {
  const leftMax = Math.max(70, imageWidth * 0.2);
  const marks = [];
  (words || []).forEach((word) => {
    const bbox = word.bbox || {};
    const x0 = bbox.x0 ?? word.x0 ?? 0;
    const x1 = bbox.x1 ?? word.x1 ?? x0;
    const y0 = bbox.y0 ?? word.y0 ?? 0;
    const y1 = bbox.y1 ?? word.y1 ?? y0;
    const x = (x0 + x1) / 2;
    if (x > leftMax) return;
    const raw = String(word.text || word.raw || "").replace(/\s+/g, "");
    let hour;
    let minute = 0;
    let meridiem = "";
    let match = raw.match(/^(\d{1,2})[:.](\d{2})([AaPp])[Mm]?$/i);
    if (match) {
      hour = Number(match[1]);
      minute = Number(match[2]);
      meridiem = match[3];
    } else {
      match = raw.match(/^(\d{1,2})([AaPp])[Mm]?$/i);
      if (!match) return;
      hour = Number(match[1]);
      meridiem = match[2];
    }
    if (meridiem.toLowerCase().startsWith("p") && hour < 12) hour += 12;
    if (meridiem.toLowerCase().startsWith("a") && hour === 12) hour = 0;
    if (hour > 23 || minute > 59) return;
    marks.push({ y: (y0 + y1) / 2, minutes: hour * 60 + minute });
  });
  marks.sort((a, b) => a.y - b.y);
  // Deduplicate similar Y marks
  const unique = [];
  marks.forEach((mark) => {
    const last = unique[unique.length - 1];
    if (last && Math.abs(last.y - mark.y) < 8) {
      last.minutes = mark.minutes;
      last.y = (last.y + mark.y) / 2;
    } else {
      unique.push({ ...mark });
    }
  });

  if (unique.length >= 2) {
    return {
      source: "gutter",
      marks: unique,
      minutesAt(y) {
        if (y <= unique[0].y) return unique[0].minutes;
        if (y >= unique[unique.length - 1].y) return unique[unique.length - 1].minutes;
        for (let i = 1; i < unique.length; i += 1) {
          if (y <= unique[i].y) {
            const span = unique[i].y - unique[i - 1].y || 1;
            const t = (y - unique[i - 1].y) / span;
            const minutes =
              unique[i - 1].minutes + t * (unique[i].minutes - unique[i - 1].minutes);
            return Math.round(minutes / 5) * 5;
          }
        }
        return unique[unique.length - 1].minutes;
      },
    };
  }

  return {
    source: "fallback",
    marks: [],
    minutesAt(y) {
      return minutesFromSolusY(y, fallbackTop, fallbackBottom);
    },
  };
}

function pickCourseTitle(text, codes, meetings) {
  if (meetings?.[0]?.title && PREFERRED_SUBJECT_RE.test(meetings[0].title)) {
    return cleanImportedTitle(meetings[0].title);
  }
  const list = codes || [];
  const preferred = list.find((code) => PREFERRED_SUBJECT_RE.test(code));
  if (preferred) return preferred;
  if (meetings?.[0]?.title) return cleanImportedTitle(meetings[0].title);
  if (list[0]) return list[0];
  return "";
}

const PREFERRED_SUBJECT_RE =
  /^(COMM|CISC|MATH|ECON|EMPR|HIST|PHIL|PSYC|BIOL|CHEM|PHYS|DEVS|FILM|MUSC|RELS|POLS|SOCY|GNDS|INTS|ENGL|FREN|SPAN|LLCU|ANAT|PHGY|KNPE|HLTH|NURS|LAW|MBA)\b/i;

function dayNameLookup(raw) {
  const key = String(raw || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  const lookup = {
    sunday: 0,
    sun: 0,
    monday: 1,
    mon: 1,
    tuesday: 2,
    tue: 2,
    tues: 2,
    wednesday: 3,
    wed: 3,
    thursday: 4,
    thu: 4,
    thur: 4,
    thurs: 4,
    friday: 5,
    fri: 5,
    saturday: 6,
    sat: 6,
  };
  return lookup[key] ?? lookup[key.slice(0, 3)] ?? null;
}

/** SOLUS week grid is always Mon → Sun left-to-right. */
function solusColumnWeekday(columnIndex) {
  return (Number(columnIndex) + 1) % 7;
}

function estimateSolusGutter(imageWidth, dayHeaders) {
  if (dayHeaders.length >= 2) {
    const leftmost = Math.min(...dayHeaders.map((item) => item.x));
    return Math.max(40, Math.min(imageWidth * 0.22, leftmost - 24));
  }
  return Math.max(60, Math.round(imageWidth * 0.11));
}

function synthesizeSolusDayHeaders(imageWidth, gutter) {
  const left = Math.max(0, gutter);
  const width = Math.max(100, imageWidth - left);
  const col = width / 7;
  return Array.from({ length: 7 }, (_, index) => ({
    day: solusColumnWeekday(index),
    x: left + col * (index + 0.5),
  }));
}

function dayHeadersFromWords(headerWords) {
  const dayHits = (headerWords || [])
    .map((word) => {
      const bbox = word.bbox || {};
      const day = dayNameLookup(word.text || word.raw || "");
      if (day == null) return null;
      const x = ((bbox.x0 ?? word.x0 ?? 0) + (bbox.x1 ?? word.x1 ?? 0)) / 2;
      return { day, x };
    })
    .filter(Boolean)
    .sort((a, b) => a.x - b.x);

  const unique = [];
  dayHits.forEach((hit) => {
    if (!unique.some((item) => item.day === hit.day)) unique.push(hit);
  });
  return unique;
}

/**
 * Prefer OCR day labels when they include Monday and span the week; otherwise use a
 * Mon–Sun grid. Incomplete OCR (e.g. only Saturday, or missing Monday) mis-assigns columns.
 */
function resolveSolusDayHeaders(imageWidth, headerWords, blocks = []) {
  const fromOcr = dayHeadersFromWords(headerWords);
  const hasMonday = fromOcr.some((item) => item.day === 1);
  if (fromOcr.length >= 5 && hasMonday) {
    const xs = fromOcr.map((item) => item.x);
    const span = Math.max(...xs) - Math.min(...xs);
    if (span > imageWidth * 0.4) return fromOcr;
  }

  // Fit Mon–Sun from known day headers and/or class-tile centers (empty Monday is common).
  const anchors = fromOcr.map((item) => ({ day: item.day, x: item.x }));
  if (blocks.length) {
    const centers = [...blocks]
      .map((block) => block.cx)
      .sort((a, b) => a - b);
    const clusters = [];
    centers.forEach((x) => {
      const last = clusters[clusters.length - 1];
      if (!last || x - last.x > imageWidth * 0.045) clusters.push({ x, n: 1 });
      else {
        last.x = (last.x * last.n + x) / (last.n + 1);
        last.n += 1;
      }
    });
    if (clusters.length >= 2) {
      const gaps = [];
      for (let i = 1; i < clusters.length; i += 1) gaps.push(clusters[i].x - clusters[i - 1].x);
      gaps.sort((a, b) => a - b);
      const col = gaps[Math.floor(gaps.length / 2)] || imageWidth / 8;
      // First occupied cluster is usually Tuesday when Monday is empty.
      const first = clusters[0].x;
      let mondayX = first - col;
      if (fromOcr.some((item) => item.day === 2)) {
        const tue = fromOcr.find((item) => item.day === 2);
        mondayX = tue.x - col;
      } else if (anchors.length >= 2) {
        const ordered = [...anchors].sort((a, b) => a.x - b.x);
        const sampleGaps = [];
        for (let i = 1; i < ordered.length; i += 1) {
          const dayGap = ordered[i].day - ordered[i - 1].day;
          if (dayGap > 0) sampleGaps.push((ordered[i].x - ordered[i - 1].x) / dayGap);
        }
        if (sampleGaps.length) {
          sampleGaps.sort((a, b) => a - b);
          const dayCol = sampleGaps[Math.floor(sampleGaps.length / 2)];
          const any = ordered[0];
          mondayX = any.x - (any.day - 1) * dayCol;
          return Array.from({ length: 7 }, (_, index) => ({
            day: solusColumnWeekday(index),
            x: mondayX + index * dayCol,
          }));
        }
      }
      return Array.from({ length: 7 }, (_, index) => ({
        day: solusColumnWeekday(index),
        x: mondayX + index * col,
      }));
    }
  }

  if (anchors.length >= 2) {
    const ordered = [...anchors].sort((a, b) => a.x - b.x);
    const sampleGaps = [];
    for (let i = 1; i < ordered.length; i += 1) {
      const dayGap = ordered[i].day - ordered[i - 1].day;
      if (dayGap > 0) sampleGaps.push((ordered[i].x - ordered[i - 1].x) / dayGap);
    }
    if (sampleGaps.length) {
      sampleGaps.sort((a, b) => a - b);
      const dayCol = sampleGaps[Math.floor(sampleGaps.length / 2)];
      const any = ordered[0];
      const mondayX = any.x - (any.day - 1) * dayCol;
      return Array.from({ length: 7 }, (_, index) => ({
        day: solusColumnWeekday(index),
        x: mondayX + index * dayCol,
      }));
    }
  }

  const gutter = estimateSolusGutter(imageWidth, fromOcr);
  return synthesizeSolusDayHeaders(imageWidth, gutter);
}

function weekdayForSolusX(x, dayHeaders) {
  if (!dayHeaders?.length) return null;
  return dayHeaders.reduce((best, header) =>
    Math.abs(header.x - x) < Math.abs(best.x - x) ? header : best
  ).day;
}

function cleanImportedTitle(title) {
  return String(title || "")
    .replace(/^\s*Waiting:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function imageToCanvas(image, scale = 1) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function recognizeImage(file, onProgress) {
  const Tesseract = await loadTesseract();
  const source = await fileToImage(file);
  const preview = imageToCanvas(source, 1);
  let rawBlocks = findClassBlocks(preview);
  if (rawBlocks.length < 2) {
    rawBlocks = findClassBlocks(preview, { loose: true });
  }
  const image = upscaleImage(source);
  const scale = image.width / preview.width;
  const blocks = rawBlocks.map((block) => ({
    x0: block.x0 * scale,
    y0: block.y0 * scale,
    x1: block.x1 * scale,
    y1: block.y1 * scale,
    cx: block.cx * scale,
    cy: block.cy * scale,
  }));
  onProgress?.("Reading screenshot…");

  const worker = await Tesseract.createWorker("eng");
  try {
    // Always OCR the full week grid so we can recover if color-block crops fail.
    const fullResult = await worker.recognize(image);
    let fullText = fullResult.data.text || "";
    let fullWords = fullResult.data.words || [];

    // Dedicated pass on the left time column — these labels are the source of truth for times.
    const gutterBox = {
      x0: 0,
      y0: Math.round(image.height * 0.08),
      x1: Math.round(image.width * 0.16),
      y1: Math.round(image.height * 0.88),
    };
    const gutterCrop = cropCanvas(image, gutterBox, 0, { contrast: true });
    const gutterResult = await worker.recognize(gutterCrop);
    const gutterWords = (gutterResult.data.words || []).map((word) => {
      const bbox = word.bbox || {};
      return {
        ...word,
        bbox: {
          x0: (bbox.x0 || 0) + gutterBox.x0,
          y0: (bbox.y0 || 0) + gutterBox.y0,
          x1: (bbox.x1 || 0) + gutterBox.x0,
          y1: (bbox.y1 || 0) + gutterBox.y0,
        },
      };
    });
    fullWords = [...gutterWords, ...fullWords];
    fullText = `${gutterResult.data.text || ""}\n${fullText}`;

    const gridTopGuess = blocks.length ? Math.min(...blocks.map((b) => b.y0)) - 30 : Math.round(image.height * 0.08);
    const gridBottomGuess = blocks.length
      ? Math.max(...blocks.map((b) => b.y1)) + 40
      : Math.round(image.height * 0.82);
    const gridBox = {
      x0: 0,
      y0: Math.max(0, gridTopGuess - Math.round(image.height * 0.06)),
      x1: image.width,
      y1: Math.min(image.height, Math.max(gridBottomGuess, Math.round(image.height * 0.55))),
    };
    const gridBw = cropCanvas(image, gridBox, 0, { binarize: true });
    const bwResult = await worker.recognize(gridBw);
    const bwText = bwResult.data.text || "";
    if ((bwText.match(/COMM|Lecture|Goodes|\d{1,2}:\d{2}\s*[AaPp][Mm]/gi) || []).length >
      (fullText.match(/COMM|Lecture|Goodes|\d{1,2}:\d{2}\s*[AaPp][Mm]/gi) || []).length) {
      fullText = `${fullText}\n${bwText}`;
      fullWords = [...fullWords, ...(bwResult.data.words || [])];
    } else {
      fullText = `${fullText}\n${bwText}`;
    }

    let headerText = "";
    let headerWords = [];
    const headerBottom = blocks.length
      ? Math.min(...blocks.map((block) => block.y0))
      : Math.round(image.height * 0.18);
    if (headerBottom > 20) {
      const header = cropCanvas(image, { x0: 0, y0: 0, x1: image.width, y1: headerBottom }, 0, {
        contrast: true,
      });
      const headerResult = await worker.recognize(header);
      headerText = headerResult.data.text || "";
      headerWords = headerResult.data.words || [];
    }

    const dayHeaders = resolveSolusDayHeaders(
      image.width,
      headerWords.length ? headerWords : fullWords,
      blocks
    );
    const gridTop = blocks.length ? Math.min(...blocks.map((b) => b.y0)) : Math.round(image.height * 0.15);
    const gridBottom = blocks.length
      ? Math.max(...blocks.map((b) => b.y1))
      : Math.round(image.height * 0.8);
    // Prefer a stable 8am–10pm span when the screenshot includes Display Options below.
    const solusTop = Math.min(gridTop, Math.round(image.height * 0.12));
    const solusBottom = Math.max(gridBottom, Math.min(image.height * 0.85, gridBottom + 40));
    const timeScale = buildGutterTimeScale(
      [...headerWords, ...fullWords],
      image.width,
      solusTop,
      solusBottom
    );
    onProgress?.(
      timeScale.source === "gutter"
        ? `Using ${timeScale.marks.length} time labels from the left column…`
        : "Reading class blocks…"
    );

    // Keep real tiles only (drop green noise / chrome).
    const minBlockHeight = Math.max(18, Math.round(image.height * 0.025));
    const classBlocks = blocks.filter(
      (block) =>
        block.y1 - block.y0 >= minBlockHeight &&
        block.x1 - block.x0 >= 18 &&
        block.cy > solusTop - 10
    );

    const blockTemplates = [];

    for (let index = 0; index < classBlocks.length; index += 1) {
      onProgress?.(`Reading class ${index + 1} of ${classBlocks.length}…`);
      const block = classBlocks[index];
      const hard = cropCanvas(image, block, 10, { binarize: true });
      const soft = cropCanvas(image, block, 10, { contrast: true });
      let text = "";
      let bestScore = -1;
      for (const crop of [hard, soft]) {
        const result = await worker.recognize(crop);
        const candidate = `${result.data.text || ""}`;
        const score =
          (candidate.match(/COMM|CISC|MATH|ECON|EMPR|Lecture|Goodes|\d{1,2}:\d{2}/gi) || []).length;
        if (score > bestScore) {
          bestScore = score;
          text = candidate;
        }
        if (score >= 2) break;
      }

      const meetings = window.ComCalSchedule.extractSolusMeetings(text);
      const codes = window.ComCalSchedule.extractCourseCodes(text);
      const weekday = weekdayForSolusX(block.cx, dayHeaders);
      if (weekday == null) continue;

      const startMinutes = timeScale.minutesAt(block.y0);
      const endMinutes = timeScale.minutesAt(block.y1);
      const geoTimes =
        startMinutes != null && endMinutes != null && endMinutes > startMinutes + 20
          ? { startMinutes, endMinutes }
          : null;

      const pushOne = (title, times, location, activity) => {
        const clean = cleanImportedTitle(title) || "Class";
        if (!times) return;
        blockTemplates.push({
          weekday,
          startMinutes: times.startMinutes,
          endMinutes: times.endMinutes,
          title: activity ? `${clean} ${activity}` : clean,
          location: location || "",
          description: activity || "",
          professor: "",
        });
      };

      // Prefer times from the left gutter / block position; OCR times inside tiles are optional.
      if (meetings.length) {
        meetings.forEach((meeting) => {
          pushOne(
            meeting.title,
            geoTimes || {
              startMinutes: meeting.startMinutes,
              endMinutes: meeting.endMinutes,
            },
            meeting.location,
            meeting.activity
          );
        });
        continue;
      }

      const title = pickCourseTitle(text, codes, meetings);
      const times = geoTimes || window.ComCalSchedule.parseTimeRange(text);
      const looksReal =
        Boolean(title) ||
        bestScore >= 1 ||
        /Lecture|Tutorial|Lab|Goodes|Waiting|Instructor/i.test(text);
      if (times && looksReal) {
        pushOne(title || "Class", times, window.ComCalSchedule.parseLocation(text), "");
      }
    }

    const pageTemplates = templatesFromPageWords(fullWords, dayHeaders);

    return {
      text: `${headerText}\n${fullText}\n${blockTemplates.map((item) => item.title).join("\n")}`,
      words: fullWords,
      blocks: classBlocks,
      blockTemplates,
      pageTemplates,
      dayHeaders,
      timeScale: timeScale.source,
    };
  } finally {
    await worker.terminate();
  }
}

/**
 * Build class templates from full-page OCR words by placing each COMM code
 * into the Mon–Sun column under its x position.
 */
function templatesFromPageWords(words, dayHeaders) {
  if (!words?.length || !dayHeaders?.length) return [];
  const boxes = words
    .map((word) => {
      const bbox = word.bbox || {};
      const raw = String(word.text || "").trim();
      if (!raw) return null;
      const x0 = bbox.x0 ?? 0;
      const y0 = bbox.y0 ?? 0;
      const x1 = bbox.x1 ?? x0 + 8;
      const y1 = bbox.y1 ?? y0 + 8;
      return {
        raw,
        x: (x0 + x1) / 2,
        y: (y0 + y1) / 2,
        x0,
        y0,
        x1,
        y1,
        confidence: word.confidence ?? 80,
      };
    })
    .filter(Boolean)
    .filter((word) => word.confidence >= 20);

  const templates = [];
  const seen = new Set();

  for (let i = 0; i < boxes.length; i += 1) {
    const prev = boxes[i - 1];
    const a = boxes[i];
    const b = boxes[i + 1];
    const trio = `${prev?.raw || ""} ${a.raw} ${b?.raw || ""}`;
    const codes = window.ComCalSchedule.extractCourseCodes(trio.toUpperCase());
    if (!codes.length) continue;
    // Anchor on the subject token when possible so column x is stable
    const anchor = /^(COMM|CISC|MATH|ECON|HIST|PHIL|PSYC|BIOL|CHEM|PHYS|DEVS|FILM|MUSC|RELS|POLS|SOCY|GNDS|INTS|ENGL|FREN|SPAN|LLCU|ANAT|PHGY|KNPE|HLTH|NURS|LAW|MBA)$/i.test(
      a.raw
    )
      ? a
      : prev && codes[0].startsWith(prev.raw.toUpperCase())
        ? prev
        : a;

    const neighbors = boxes.filter(
      (word) =>
        Math.abs(word.x - anchor.x) < 110 &&
        word.y >= anchor.y - 24 &&
        word.y <= anchor.y + 160
    );
    const blob = neighbors
      .sort((left, right) => left.y - right.y || left.x - right.x)
      .map((word) => word.raw)
      .join(" ");
    const meetings = window.ComCalSchedule.extractSolusMeetings(blob);
    const times = meetings[0]
      ? { startMinutes: meetings[0].startMinutes, endMinutes: meetings[0].endMinutes }
      : window.ComCalSchedule.parseTimeRange(blob);
    const title = cleanImportedTitle(meetings[0]?.title || codes[0]);
    if (!title || !times) continue;
    const weekday = weekdayForSolusX(anchor.x, dayHeaders);
    if (weekday == null) continue;
    const key = `${weekday}|${times.startMinutes}|${times.endMinutes}|${title.toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    templates.push({
      weekday,
      startMinutes: times.startMinutes,
      endMinutes: times.endMinutes,
      title: meetings[0]?.activity ? `${title} ${meetings[0].activity}` : title,
      location: meetings[0]?.location || window.ComCalSchedule.parseLocation(blob),
      description: meetings[0]?.activity || "",
    });
  }

  return templates;
}

async function readPdfText(file, onProgress) {
  onProgress?.("Reading PDF…");
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
  const pdfjsLib = window.pdfjsLib;
  if (!pdfjsLib) throw new Error("Could not read that PDF. Upload a screenshot or .ics file instead.");
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];
  for (let pageNum = 1; pageNum <= Math.min(pdf.numPages, 4); pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(" "));
  }
  return pages.join("\n");
}

function buildImportedSchedule(parsed) {
  const templates = window.ComCalSchedule.mergeTemplates(parsed.templates || []);
  const oneOffs = parsed.oneOffs || [];
  if (!templates.length && !oneOffs.length) {
    const found = (parsed.meetings || [])
      .map((meeting) => meeting.title)
      .filter(Boolean)
      .slice(0, 6);
    if (found.length) {
      throw new Error(
        `Found ${found.join(", ")} but not the days they meet. Capture the Mon–Sun headers at the top of the SOLUS week view.`
      );
    }
    if (parsed.text && window.ComCalSchedule.looksLikeSessionalDates(parsed.text)) {
      throw new Error(
        "That looks like sessional dates, which are already on the calendar. Upload one week of your class schedule instead."
      );
    }
    const snippet = String(parsed.text || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 140);
    throw new Error(
      snippet
        ? `Couldn't find class times in that screenshot (OCR read: “${snippet}…”). Try PNG/JPG of the full Mon–Sun week, or an .ics export.`
        : "Couldn't find class times in that file. Try a PNG/JPG screenshot of one full SOLUS week, or an .ics export."
    );
  }

  const sampleDates = oneOffs
    .concat(parsed.events || [])
    .map((event) => event.start)
    .filter(Boolean);
  const term =
    window.ComCalAcademic.termForDates(sampleDates) || window.ComCalAcademic.currentOrNextTerm();
  const events = window.ComCalSchedule.coalesceClassLocationStubs(
    window.ComCalSchedule.expandTemplatesToTerm(templates, term, oneOffs)
  );
  if (!events.length) {
    throw new Error("Found classes, but none could be placed in the current term.");
  }
  return { events, templates, term };
}

async function importScheduleFile(file, onProgress) {
  onProgress?.("Importing…");
  let parsed;

  if (isIcsFile(file) || file.type === "text/plain" || /\.(txt|csv)$/i.test(file.name)) {
    const text = await file.text();
    if (/BEGIN:VCALENDAR/i.test(text)) {
      const events = window.ComCalSchedule.parseIcs(text);
      parsed = {
        templates: window.ComCalSchedule.templatesFromEvents(events),
        oneOffs: window.ComCalSchedule.oneOffEvents(events),
        events,
        text,
      };
    } else {
      parsed = window.ComCalSchedule.parseScheduleText(text);
    }
  } else if (isPdfFile(file)) {
    const text = await readPdfText(file, onProgress);
    parsed = window.ComCalSchedule.parseScheduleText(text);
  } else if (isImageFile(file) || !file.type) {
    const data = await recognizeImage(file, onProgress);
    const fromText = window.ComCalSchedule.parseScheduleText(data.text || "");
    const fromGrid = window.ComCalSchedule.parseScheduleWords(data.words || [], data.blocks || []);
    // Prefer color-block reads, then full-page word→column mapping, then text/grid fallbacks.
    // Never let header-day OCR alone invent Saturday-only schedules.
    const blockTemplates = data.blockTemplates || [];
    const namedBlocks = blockTemplates.filter((row) =>
      /\b(COMM|CISC|MATH|ECON|EMPR|HIST|PHIL|PSYC|BIOL|CHEM|PHYS)\b/i.test(row.title || "")
    );
    // When green-tile OCR found real course codes, trust those first and only
    // fill gaps from page/text parses — avoids stacked Class + COMM duplicates.
    const templates =
      namedBlocks.length >= 2
        ? window.ComCalSchedule.mergeTemplates(blockTemplates, data.pageTemplates || [])
        : window.ComCalSchedule.mergeTemplates(
            blockTemplates,
            data.pageTemplates || [],
            fromGrid || [],
            (fromText.templates || []).filter((row) => Number.isFinite(row.weekday))
          );
    parsed = {
      templates,
      meetings: fromText.meetings || [],
      oneOffs: fromText.oneOffs,
      text: data.text || "",
    };
  } else {
    const text = await file.text();
    parsed = window.ComCalSchedule.parseScheduleText(text);
  }

  return buildImportedSchedule(parsed);
}

function toExamEvent(event, index = 0) {
  const topicId = window.ComCalTopics?.EXAMS_ID || "exams";
  const baseId = String(event.id || event.uid || `exam-${index}`);
  return {
    ...event,
    id: baseId.startsWith("exam-") ? baseId : `exam-${baseId}`,
    uid: event.uid ? (String(event.uid).startsWith("exam-") ? event.uid : `exam-${event.uid}`) : `exam-${baseId}`,
    source: "exam",
    topicId,
  };
}

async function parseExamCandidates(file, onProgress) {
  if (isIcsFile(file) || file.type === "text/plain" || /\.(txt|csv)$/i.test(file.name)) {
    const text = await file.text();
    if (/BEGIN:VCALENDAR/i.test(text)) {
      return window.ComCalSchedule.parseIcs(text);
    }
    const parsed = window.ComCalSchedule.parseScheduleText(text);
    return [...(parsed.oneOffs || []), ...(parsed.events || [])].filter(Boolean);
  }

  if (isPdfFile(file)) {
    const text = await readPdfText(file, onProgress);
    const parsed = window.ComCalSchedule.parseScheduleText(text);
    const candidates = [...(parsed.oneOffs || []), ...(parsed.events || [])].filter(Boolean);
    if (candidates.length) return candidates;
    // Fall back: treat any exam-like meetings found in text as empty — caller errors
    return [];
  }

  if (isImageFile(file) || !file.type) {
    onProgress?.("Scanning exam schedule…");
    const data = await recognizeImage(file, onProgress);
    const fromText = window.ComCalSchedule.parseScheduleText(data.text || "");
    return [...(fromText.oneOffs || []), ...(fromText.events || [])].filter(Boolean);
  }

  const text = await file.text();
  if (/BEGIN:VCALENDAR/i.test(text)) {
    return window.ComCalSchedule.parseIcs(text);
  }
  const parsed = window.ComCalSchedule.parseScheduleText(text);
  return [...(parsed.oneOffs || []), ...(parsed.events || [])].filter(Boolean);
}

async function importExamFile(file, onProgress) {
  onProgress?.("Importing exam schedule…");
  let events = await parseExamCandidates(file, onProgress);

  // Prefer explicit exam/midterm/final rows when mixed content is present
  const examLike = events.filter((event) =>
    /exam|midterm|final|test|deferral/i.test(`${event.title || ""} ${event.description || ""}`)
  );
  if (examLike.length) events = examLike;

  if (!events.length) {
    throw new Error(
      "Couldn't find exam times in that file. Try a SOLUS exam schedule .ics export, or a clearer PDF/screenshot of your exam timetable."
    );
  }

  return events.map((event, index) => toExamEvent(event, index));
}

window.ComCalImport = {
  importScheduleFile,
  importExamFile,
};
