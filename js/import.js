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

function isClassFill(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 120 || min > 252) return false;
  // SOLUS mint/green tiles (allow JPEG washout)
  if (g >= r && g >= b - 8 && g > 130 && g - Math.min(r, b) >= 8) return true;
  if (g > r + 4 && g > b + 2 && g > 125) return true;
  if (b > r + 8 && b >= g - 12 && b > 150 && r > 100) return true;
  return false;
}

function findClassBlocks(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const { data } = ctx.getImageData(0, 0, width, height);
  const visited = new Uint8Array(width * height);
  const boxes = [];

  const at = (x, y) => {
    const i = (y * width + x) * 4;
    return isClassFill(data[i], data[i + 1], data[i + 2]);
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (visited[start] || !at(x, y)) continue;
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
        const neighbors = [p + 1, p - 1, p + width, p - width];
        neighbors.forEach((next) => {
          if (next < 0 || next >= visited.length || visited[next]) return;
          const nx = next % width;
          const ny = (next / width) | 0;
          if (Math.abs(nx - px) + Math.abs(ny - py) !== 1) return;
          if (at(nx, ny)) {
            visited[next] = 1;
            stack.push(next);
          } else {
            visited[next] = 1;
          }
        });
      }
      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      if (count > 220 && bw > 28 && bh > 18 && bw < width * 0.5 && bh < height * 0.6) {
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
  return boxes;
}

function cropCanvas(source, box, pad = 6, { binarize = false } = {}) {
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
  if (!binarize) return canvas;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const value = gray < 165 ? 0 : 255;
    data[i] = data[i + 1] = data[i + 2] = value;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

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
 * Prefer OCR day labels when they look like a full week row; otherwise fall back to
 * fixed Mon–Sun columns (SOLUS layout). Partial OCR (e.g. only Saturday) was snapping
 * every class onto Saturday.
 */
function resolveSolusDayHeaders(imageWidth, headerWords) {
  const fromOcr = dayHeadersFromWords(headerWords);
  const gutter = estimateSolusGutter(imageWidth, fromOcr);
  const synthesized = synthesizeSolusDayHeaders(imageWidth, gutter);

  if (fromOcr.length >= 5) {
    const xs = fromOcr.map((item) => item.x);
    const span = Math.max(...xs) - Math.min(...xs);
    if (span > imageWidth * 0.45) return fromOcr;
  }

  // If OCR found Mon near the left, keep synthesized Mon–Sun (more reliable than sparse OCR).
  return synthesized;
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
  const rawBlocks = findClassBlocks(preview);
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
    const fullText = fullResult.data.text || "";
    const fullWords = fullResult.data.words || [];

    let headerText = "";
    let headerWords = [];
    const headerBottom = blocks.length
      ? Math.min(...blocks.map((block) => block.y0))
      : Math.round(image.height * 0.2);
    if (headerBottom > 20) {
      const header = cropCanvas(image, { x0: 0, y0: 0, x1: image.width, y1: headerBottom }, 0);
      const headerResult = await worker.recognize(header);
      headerText = headerResult.data.text || "";
      headerWords = headerResult.data.words || [];
    }

    const dayHeaders = resolveSolusDayHeaders(image.width, headerWords.length ? headerWords : fullWords);
    const blockTemplates = [];

    for (let index = 0; index < blocks.length; index += 1) {
      onProgress?.(`Reading class ${index + 1} of ${blocks.length}…`);
      const soft = cropCanvas(image, blocks[index], 12, { binarize: false });
      const hard = cropCanvas(image, blocks[index], 12, { binarize: true });
      let text = "";
      for (const crop of [soft, hard]) {
        const result = await worker.recognize(crop);
        text = `${result.data.text || ""}`;
        const meetings = window.ComCalSchedule.extractSolusMeetings(text);
        const codes = window.ComCalSchedule.extractCourseCodes(text);
        const times = meetings[0]
          ? { startMinutes: meetings[0].startMinutes, endMinutes: meetings[0].endMinutes }
          : window.ComCalSchedule.parseTimeRange(text);
        const title = cleanImportedTitle(meetings[0]?.title || codes[0] || "");
        if (!title || !times) continue;
        const weekday = weekdayForSolusX(blocks[index].cx, dayHeaders);
        if (weekday == null) continue;
        blockTemplates.push({
          weekday,
          startMinutes: times.startMinutes,
          endMinutes: times.endMinutes,
          title: meetings[0]?.activity ? `${title} ${meetings[0].activity}` : title,
          location: meetings[0]?.location || window.ComCalSchedule.parseLocation(text),
          description: meetings[0]?.activity || "",
          professor: "",
        });
        break;
      }
    }

    const pageTemplates = templatesFromPageWords(fullWords, dayHeaders);

    return {
      text: `${headerText}\n${fullText}\n${blockTemplates.map((item) => item.title).join("\n")}`,
      words: fullWords,
      blocks,
      blockTemplates,
      pageTemplates,
      dayHeaders,
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
    .filter((word) => word.confidence >= 25);

  const templates = [];
  const seen = new Set();

  for (let i = 0; i < boxes.length; i += 1) {
    const a = boxes[i];
    const b = boxes[i + 1];
    const pair = `${a.raw} ${b?.raw || ""}`;
    const codes = window.ComCalSchedule.extractCourseCodes(pair.toUpperCase());
    if (!codes.length) continue;

    // Gather nearby words in the same class tile (similar x column, below/near code)
    const neighbors = boxes.filter(
      (word) =>
        Math.abs(word.x - a.x) < 90 &&
        word.y >= a.y - 20 &&
        word.y <= a.y + 140
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
    const weekday = weekdayForSolusX(a.x, dayHeaders);
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
    throw new Error(
      "Couldn't find class times in that file. Try a clearer screenshot of one week in SOLUS/onQ, or an .ics export."
    );
  }

  const sampleDates = oneOffs
    .concat(parsed.events || [])
    .map((event) => event.start)
    .filter(Boolean);
  const term = window.ComCalAcademic.termForDates(sampleDates);
  const events = window.ComCalSchedule.expandTemplatesToTerm(templates, term, oneOffs);
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
    const templates = window.ComCalSchedule.mergeTemplates(
      data.blockTemplates || [],
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
