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
  if (max < 140 || min > 246 || max - min < 16) return false;
  if (g > r + 8 && g > b + 6 && g > 155) return true;
  if (b > r + 8 && b >= g - 12 && b > 160 && r > 120) return true;
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
      if (count > 350 && bw > 36 && bh > 24 && bw < width * 0.45 && bh < height * 0.55) {
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

function cropCanvas(source, box, pad = 6) {
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
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const value = gray < 150 ? 0 : 255;
    data[i] = data[i + 1] = data[i + 2] = value;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function templatesFromSolusBlocks(blocks, headerWords) {
  const dayHits = (headerWords || [])
    .map((word) => {
      const bbox = word.bbox || {};
      const raw = String(word.text || "");
      const key = raw.toLowerCase().replace(/[^a-z]/g, "");
      const lookup = { sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4, friday: 5, fri: 5, saturday: 6, sat: 6 };
      const day = lookup[key] ?? lookup[key.slice(0, 3)];
      if (day == null) return null;
      const x = ((bbox.x0 ?? 0) + (bbox.x1 ?? 0)) / 2;
      return { day, x };
    })
    .filter(Boolean)
    .sort((a, b) => a.x - b.x);
  const unique = [];
  dayHits.forEach((hit) => {
    if (!unique.some((item) => item.day === hit.day)) unique.push(hit);
  });
  return { dayHeaders: unique };
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
    let headerText = "";
    let headerWords = [];
    const headerBottom = blocks.length ? Math.min(...blocks.map((block) => block.y0)) : Math.round(image.height * 0.18);
    if (headerBottom > 20) {
      const header = cropCanvas(image, { x0: 0, y0: 0, x1: image.width, y1: headerBottom }, 0);
      const headerResult = await worker.recognize(header);
      headerText = headerResult.data.text || "";
      headerWords = headerResult.data.words || [];
    }

    const { dayHeaders } = templatesFromSolusBlocks(blocks, headerWords);
    const blockTemplates = [];

    for (let index = 0; index < blocks.length; index += 1) {
      onProgress?.(`Reading class ${index + 1} of ${blocks.length}…`);
      const crop = cropCanvas(image, blocks[index], 10);
      const result = await worker.recognize(crop);
      const text = `${result.data.text || ""}`;
      const meetings = window.ComCalSchedule.extractSolusMeetings(text);
      const codes = window.ComCalSchedule.extractCourseCodes(text);
      const times = meetings[0]
        ? { startMinutes: meetings[0].startMinutes, endMinutes: meetings[0].endMinutes }
        : window.ComCalSchedule.parseTimeRange(text);
      const title = meetings[0]?.title || codes[0];
      if (!title || !times) continue;
      const weekday = dayHeaders.length
        ? dayHeaders.reduce((best, header) =>
            Math.abs(header.x - blocks[index].cx) < Math.abs(best.x - blocks[index].cx) ? header : best
          ).day
        : null;
      if (weekday == null) continue;
      blockTemplates.push({
        weekday,
        startMinutes: times.startMinutes,
        endMinutes: times.endMinutes,
        title: meetings[0]?.activity ? `${title} ${meetings[0].activity}` : title,
        location: meetings[0]?.location || window.ComCalSchedule.parseLocation(text),
        description: meetings[0]?.activity || "",
      });
    }

    const full = blocks.length ? { text: headerText, words: headerWords } : await worker.recognize(image).then((result) => result.data);
    return {
      text: `${headerText}\n${full.text || ""}\n${blockTemplates.map((item) => item.title).join("\n")}`,
      words: full.words || headerWords,
      blocks,
      blockTemplates,
    };
  } finally {
    await worker.terminate();
  }
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
    parsed = {
      templates: window.ComCalSchedule.mergeTemplates(
        data.blockTemplates || [],
        fromText.templates,
        fromGrid
      ),
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
