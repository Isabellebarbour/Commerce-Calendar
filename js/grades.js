const GRADES_STORAGE = "comcal-grades";

const GRADE_POINTS = {
  "A+": 4.3,
  A: 4.0,
  "A-": 3.7,
  "B+": 3.3,
  B: 3.0,
  "B-": 2.7,
  "C+": 2.3,
  C: 2.0,
  "C-": 1.7,
  "D+": 1.3,
  D: 1.0,
  "D-": 0.7,
  F: 0.0,
  CR: null,
  Pass: null,
  NG: null,
  ND: null,
  IN: null,
  AG: null,
};

const VALID_GRADE_RE = /^(A\+|A-|A|B\+|B-|B|C\+|C-|C|D\+|D-|D|F|NG|CR|PASS|P|ND|IN|AG)$/i;
/** Letter grades. Do NOT wrap with trailing \b — that makes A-/B- fail and match as A/B. */
const LETTER_GRADE_CAPTURE =
  "([ABCDF](?:\\+|[\\-−–—])?|NG|CR|PASS|P|ND|IN|AG)";
const COURSE_CODE_RE = /\b([A-Z]{2,5})\s+(\d{3}[A-Z]?)\b/g;
const POINTS_BY_GPA = [
  [4.3, "A+"],
  [4.0, "A"],
  [3.7, "A-"],
  [3.3, "B+"],
  [3.0, "B"],
  [2.7, "B-"],
  [2.3, "C+"],
  [2.0, "C"],
  [1.7, "C-"],
  [1.3, "D+"],
  [1.0, "D"],
  [0.7, "D-"],
  [0.0, "F"],
];
const JUNK_LINE_RE =
  /term\s*gpa|term\s*totals|career\s*totals|undergraduate\s+career|course\s+description|units\s+grade\s+points|gpa\s+units\s+points|session\s+totals|academic\s+standing|queen'?s\s+university|student\s+number|page\s+\d+|continued|official\s+transcript|unofficial\s+transcript|beginning\s+of|end\s+of\s+transcript/i;

const gradesFilters = (window.__comcalGradesFilters ||= { year: "all" });
let gradesState = (window.__comcalGradesState ||= loadGrades());
let transcriptFile = null;
let pendingImportCourses = null;
let pendingImportCareer = null;
let pendingImportRawText = "";
let editDraftCourses = null;

const LETTER_CHOICES = [
  "A+",
  "A",
  "A-",
  "B+",
  "B",
  "B-",
  "C+",
  "C",
  "C-",
  "D+",
  "D",
  "D-",
  "F",
  "CR",
  "Pass",
  "NG",
  "ND",
  "IN",
  "AG",
];

function loadGrades() {
  try {
    const raw = JSON.parse(localStorage.getItem(GRADES_STORAGE) || "null");
    if (raw?.courses && Array.isArray(raw.courses)) {
      return {
        courses: raw.courses,
        career: raw.career || null,
      };
    }
  } catch {
    /* defaults */
  }
  return { courses: [], career: null };
}

function saveGrades() {
  localStorage.setItem(GRADES_STORAGE, JSON.stringify(gradesState));
  window.ComCalCloud?.notifyChanged?.();
}

function escapeGrades(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeLetter(letter) {
  let cleaned = String(letter || "")
    .trim()
    .toUpperCase()
    .replace(/[−–—‐‑‒﹣－]/g, "-")
    .replace(/\u00AD/g, "-") // soft hyphen
    .replace(/\s+/g, "");

  // OCR often turns A- into A. / A_ / A~ / A=
  if (/^[ABCDF][\._~\=]$/i.test(cleaned)) {
    cleaned = `${cleaned[0]}-`;
  }

  if (cleaned === "PASS" || cleaned === "P") return "Pass";
  if (cleaned === "NG") return "NG";
  if (GRADE_POINTS[cleaned] !== undefined) return cleaned;
  if (["CR", "ND", "IN", "AG"].includes(cleaned)) return cleaned;
  return "";
}

/** Infer letter from transcript quality points ÷ units (Queen's scale). */
function letterFromQualityPoints(units, qualityPoints) {
  const u = Number(units);
  const q = Number(qualityPoints);
  if (!Number.isFinite(u) || u <= 0 || !Number.isFinite(q)) return "";
  const gpa = q / u;
  let best = "";
  let bestDiff = Infinity;
  POINTS_BY_GPA.forEach(([pts, letter]) => {
    const diff = Math.abs(gpa - pts);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = letter;
    }
  });
  return bestDiff <= 0.08 ? best : "";
}

/**
 * Only use quality points to restore a missing +/- on a bare letter
 * (OCR drops “-” so A- → A). Never override an explicit A-/A+.
 */
function reconcileLetterWithPoints(letter, units, qualityPoints) {
  const inferred = letterFromQualityPoints(units, qualityPoints);
  if (!inferred || !letter) return letter;
  const hasMod = /[+-]$/.test(letter);
  if (hasMod) return letter;
  if (letter[0] === inferred[0] && /[+-]$/.test(inferred)) return inferred;
  if (letter === inferred) return letter;
  // Bare letter vs different bare from points: prefer points when very close
  if (!/[+-]$/.test(inferred) && Math.abs((qualityPoints / units) - (GRADE_POINTS[inferred] ?? 99)) <= 0.08) {
    return inferred;
  }
  return letter;
}

function letterSelectHtml(selected, attrs = "") {
  const current = normalizeLetter(selected) || selected || "";
  const placeholder = !current ? `<option value="" selected disabled hidden>Grade</option>` : "";
  const options = LETTER_CHOICES.map((letter) => {
    const active = letter === current ? " selected" : "";
    return `<option value="${escapeGrades(letter)}"${active}>${escapeGrades(letter)}</option>`;
  }).join("");
  const extra =
    current && !LETTER_CHOICES.includes(current)
      ? `<option value="${escapeGrades(current)}" selected>${escapeGrades(current)}</option>`
      : "";
  return `<select class="grades-letter-select" ${attrs}>${placeholder}${extra}${options}</select>`;
}

function pointsForLetter(letter) {
  const key = normalizeLetter(letter);
  if (!key || GRADE_POINTS[key] == null) return null;
  return GRADE_POINTS[key];
}

function curriculumYearForCode(code) {
  const normalized = String(code || "").trim().toUpperCase();
  for (let year = 1; year <= 4; year += 1) {
    const courses = window.ComCalCurriculum?.coursesForYear?.(year) || [];
    if (courses.some((course) => course.code.toUpperCase() === normalized)) {
      return year;
    }
  }
  // COMM 101A / COMM 101B map to COMM 101
  const base = normalized.replace(/[A-Z]$/, "");
  if (base !== normalized) {
    for (let year = 1; year <= 4; year += 1) {
      const courses = window.ComCalCurriculum?.coursesForYear?.(year) || [];
      if (courses.some((course) => course.code.toUpperCase() === base)) {
        return year;
      }
    }
  }
  return null;
}

/** e.g. "Spring 2028" → 2028 */
function graduationCalendarYear() {
  const raw = window.ComCalAuth?.getSession?.()?.graduationDate || "";
  const match = String(raw).match(/(20\d{2})/);
  return match ? Number(match[1]) : null;
}

/**
 * Commerce program year runs Summer → Spring.
 * Summer/Fall 2026 and Winter/Spring 2027 share the same program year.
 */
function academicStartYearFromTerm(term) {
  const match = String(term || "").match(/\b(Fall|Winter|Summer|Spring)\s+(20\d{2})\b/i);
  if (!match) return null;
  const season = match[1].toLowerCase();
  const calendarYear = Number(match[2]);
  if (season === "winter" || season === "spring") return calendarYear - 1;
  return calendarYear;
}

/**
 * Grad Spring 2028 → Year 1 is Summer 2024–Spring 2025, so Summer 2026 is Year 3.
 * Grad Spring 2030 → Year 1 is Summer 2026–Spring 2027.
 */
function programYearForTerm(term) {
  const gradYear = graduationCalendarYear();
  const startYear = academicStartYearFromTerm(term);
  if (!gradYear || !startYear) return null;
  const year = startYear - gradYear + 5;
  if (year < 1 || year > 4) return null;
  return year;
}

function yearForCourse(code, term) {
  return programYearForTerm(term) || curriculumYearForCode(code) || null;
}

function refreshCourseYears() {
  let changed = false;
  gradesState.courses = gradesState.courses.map((course) => {
    const year = yearForCourse(course.code, course.term);
    if (year === course.year) return course;
    changed = true;
    return { ...course, year };
  });
  if (changed) saveGrades();
}

function gpaSummary(courses) {
  let quality = 0;
  let units = 0;
  courses.forEach((course) => {
    const pts = pointsForLetter(course.letter);
    const courseUnits = Number(course.units);
    if (pts == null || !courseUnits) return;
    quality += pts * courseUnits;
    units += courseUnits;
  });
  return {
    gpa: units ? quality / units : null,
    units,
    count: courses.length,
  };
}

function formatGpa(value) {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(2);
}

function visibleCourses() {
  if (gradesFilters.year === "all") return [...gradesState.courses];
  const year = Number(gradesFilters.year);
  return gradesState.courses.filter((course) => Number(course.year) === year);
}

function loadScriptOnce(src) {
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

async function loadPdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  await loadScriptOnce("https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js");
  const pdfjs = window.pdfjsLib;
  if (!pdfjs) throw new Error("Could not load the PDF reader.");
  pdfjs.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  return pdfjs;
}

async function loadTesseract() {
  if (window.Tesseract) return window.Tesseract;
  await loadScriptOnce("https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js");
  return window.Tesseract;
}

function isPdfFile(file) {
  if (!file) return false;
  const type = String(file.type || "").toLowerCase();
  if (type === "application/pdf" || type === "application/x-pdf") return true;
  // macOS / Finder drops sometimes have an empty MIME type
  return /\.pdf$/i.test(file.name || "");
}

function isImageFile(file) {
  if (!file) return false;
  if (String(file.type || "").toLowerCase().startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|heic|heif|bmp|tiff?)$/i.test(file.name || "");
}

async function extractTextFromPdf(file) {
  const pdfjs = await loadPdfJs();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const pages = [];

  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Prefer PDF.js line breaks — y-bucketing scrambles SOLUS columns and
    // attaches the wrong term header to courses (e.g. Fall 2026 on Winter 2025).
    const eolLines = [];
    let eolBuf = "";
    let sawEol = false;
    content.items.forEach((item) => {
      eolBuf += String(item.str || "");
      if (item.hasEOL) {
        sawEol = true;
        const line = eolBuf.replace(/\s+/g, " ").trim();
        if (line) eolLines.push(line);
        eolBuf = "";
      } else if (item.str === "" && item.hasEOL !== false) {
        /* keep going */
      }
    });
    if (eolBuf.trim()) eolLines.push(eolBuf.replace(/\s+/g, " ").trim());

    if (sawEol && eolLines.length >= 3) {
      pages.push(eolLines.join("\n"));
      continue;
    }

    // Fallback: reconstruct rows by vertical position
    const rows = new Map();
    content.items.forEach((item) => {
      const text = String(item.str || "");
      if (!text.trim()) return;
      const x = Number(item.transform?.[4] ?? 0);
      const y = Math.round(Number(item.transform?.[5] ?? 0));
      const key = y;
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push({ x, text });
    });
    const lines = [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, parts]) =>
        parts
          .sort((a, b) => a.x - b.x)
          .map((part) => part.text)
          .join("")
          .replace(/\s+/g, " ")
          .trim()
      )
      .filter(Boolean);
    pages.push(lines.join("\n"));
  }

  return pages.join("\n");
}

async function extractTextFromImage(file) {
  const Tesseract = await loadTesseract();
  const result = await Tesseract.recognize(file, "eng", {
    logger: () => {},
    tessedit_char_whitelist:
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-.,'’/() ",
  });
  return preprocessOcrText(result?.data?.text || "");
}

function cleanTitle(title) {
  const gradeStrip = new RegExp(`\\b${LETTER_GRADE_CAPTURE}(?!\\w)`, "gi");
  return String(title || "")
    .replace(/\b\d+\.\d{2}\b/g, " ")
    .replace(gradeStrip, " ")
    .replace(/\b(Units|Grade|Points|GPA|Totals?)\b/gi, " ")
    .replace(/[~|•]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isJunkTitle(title) {
  const value = String(title || "").trim();
  if (!value || value.length < 3) return true;
  if (!/[A-Za-z]{3,}/.test(value)) return true;
  if (JUNK_LINE_RE.test(value)) return true;
  if (/^(units|grade|points|gpa|term|totals?|description)$/i.test(value)) return true;
  return false;
}

function isJunkLine(line) {
  if (!line) return true;
  if (JUNK_LINE_RE.test(line)) return true;
  if (/^units?\b/i.test(line) && /grade/i.test(line)) return true;
  return false;
}

function findTermInText(text) {
  const value = String(text || "");
  const match =
    value.match(/\b(Fall|Winter|Summer|Spring)(?:\s+Term)?\s+(20\d{2})\b/i) ||
    value.match(/\b(20\d{2})\s+(Fall|Winter|Summer|Spring)(?:\s+Term)?\b/i);
  if (!match) return "";
  const season = (match[1].match(/20\d{2}/) ? match[2] : match[1]).toLowerCase();
  const year = match[1].match(/20\d{2}/) ? match[1] : match[2];
  return `${season[0].toUpperCase()}${season.slice(1)} ${year}`;
}

/** True only for term banner lines, not course rows that mention a term. */
function isTermHeaderLine(line) {
  const value = String(line || "").trim();
  if (!value || value.length > 48) return false;
  if (new RegExp(COURSE_CODE_RE.source, "i").test(value)) return false;
  if (/term\s*gpa|term\s*totals|career\s*totals|units|points|grade/i.test(value) && !/^(Fall|Winter|Summer|Spring)/i.test(value)) {
    return false;
  }
  const term = findTermInText(value);
  if (!term) return false;
  // Header is basically just the term (optional "Term" word)
  const stripped = value
    .replace(/\b(Fall|Winter|Summer|Spring)(?:\s+Term)?\s+20\d{2}\b/gi, "")
    .replace(/\b20\d{2}\s+(Fall|Winter|Summer|Spring)(?:\s+Term)?\b/gi, "")
    .replace(/\bTerm\b/gi, "")
    .replace(/[^\w]/g, "")
    .trim();
  return stripped.length === 0;
}

function termSortKey(term) {
  const match = String(term || "").match(/\b(Fall|Winter|Summer|Spring)\s+(20\d{2})\b/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const season = { Winter: 1, Spring: 2, Summer: 3, Fall: 4 }[match[1][0].toUpperCase() + match[1].slice(1).toLowerCase()] || 9;
  return Number(match[2]) * 10 + season;
}

function parseCareerTotals(text) {
  const source = String(text || "");
  const careerMatch = source.match(
    /(?:undergraduate\s+)?career\s+totals[\s\S]{0,160}?(\d+\.\d{2})\s+(\d+\.\d{2})\s+(\d+\.\d{1,2})/i
  );
  if (careerMatch) {
    const units = Number(careerMatch[1]);
    const gpaUnits = Number(careerMatch[2]);
    const gpaPoints = Number(careerMatch[3]);
    if (gpaUnits > 0 && gpaPoints >= 0 && gpaPoints <= gpaUnits * 4.35 + 1) {
      return { units, gpaUnits, gpaPoints, gpa: gpaPoints / gpaUnits };
    }
  }

  // Fallback: largest Units / GPA Units / Points triple (avoids grabbing a Term Totals row)
  let best = null;
  for (const match of source.matchAll(/\b(\d+\.\d{2})\s+(\d+\.\d{2})\s+(\d+\.\d{1,2})\b/g)) {
    const units = Number(match[1]);
    const gpaUnits = Number(match[2]);
    const gpaPoints = Number(match[3]);
    if (gpaUnits < 30) continue;
    if (units < gpaUnits) continue;
    if (gpaPoints > gpaUnits * 4.35 + 1) continue;
    if (!best || gpaUnits > best.gpaUnits) {
      best = { units, gpaUnits, gpaPoints, gpa: gpaPoints / gpaUnits };
    }
  }
  return best;
}

function termInputHtml(selected, attrs = "") {
  const value = String(selected || "");
  return `<input class="grades-term-input" type="text" value="${escapeGrades(value)}" placeholder="Winter 2025" ${attrs} />`;
}

function splitByCourseCodes(line) {
  const matches = [...String(line).matchAll(new RegExp(COURSE_CODE_RE.source, "g"))];
  if (!matches.length) return [];
  if (matches.length === 1) return [line.slice(matches[0].index).trim()];
  const chunks = [];
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : line.length;
    chunks.push(line.slice(start, end).trim());
  }
  return chunks.filter(Boolean);
}

function parseCourseChunk(chunk, currentTerm) {
  const text = preprocessOcrText(String(chunk || ""))
    .replace(/\s+/g, " ")
    .trim();
  if (!text || isJunkLine(text)) return null;

  // Queen's row shape:
  // COMM 111 Introduction To Financial Accounting 3.00 A- 11.10
  const strict = new RegExp(
    `^([A-Z]{2,5})\\s+(\\d{3}[A-Z]?)\\s+(.+?)\\s+(\\d+\\.\\d{2})\\s+${LETTER_GRADE_CAPTURE}(?:\\s+(\\d+\\.\\d{1,2}))?\\s*$`,
    "i"
  ).exec(text);

  let subject;
  let number;
  let title;
  let units;
  let letter;
  let qualityPoints = null;

  if (strict) {
    subject = strict[1].toUpperCase();
    number = strict[2].toUpperCase();
    title = strict[3].trim();
    units = Number(strict[4]);
    letter = normalizeLetter(strict[5]);
    if (strict[6] != null) qualityPoints = Number(strict[6]);
  } else {
    // Fallback: code + title + units + grade somewhere in the chunk
    const codeMatch = text.match(/^([A-Z]{2,5})\s+(\d{3}[A-Z]?)\b/i);
    if (!codeMatch) return null;
    subject = codeMatch[1].toUpperCase();
    number = codeMatch[2].toUpperCase();
    const rest = text.slice(codeMatch[0].length).trim();

    const gradeMatch = rest.match(new RegExp(`\\b${LETTER_GRADE_CAPTURE}(?!\\w)`, "i"));
    if (!gradeMatch) return null;
    letter = normalizeLetter(gradeMatch[1]);
    if (!letter) return null;

    const beforeGrade = rest.slice(0, gradeMatch.index).trim();
    const afterGrade = rest.slice(gradeMatch.index + gradeMatch[0].length).trim();
    const unitsMatch = beforeGrade.match(/(\d+\.\d{2})\s*$/);
    if (!unitsMatch) return null;
    units = Number(unitsMatch[1]);
    title = beforeGrade.slice(0, unitsMatch.index).trim();
    const qpMatch = afterGrade.match(/^(\d+\.\d{1,2})\b/);
    if (qpMatch) qualityPoints = Number(qpMatch[1]);
  }

  // Prefer letter inferred from quality points when OCR drops +/- (e.g. A vs A-)
  if (qualityPoints != null && Number.isFinite(qualityPoints)) {
    letter = reconcileLetterWithPoints(letter, units, qualityPoints);
  } else {
    // Screenshot OCR often puts units / grade / points on separate tokens —
    // pick a second xx.xx that looks like quality points for this row.
    const nums = [...text.matchAll(/\b(\d+\.\d{2})\b/g)].map((m) => Number(m[1]));
    const candidates = nums.filter(
      (n) => n !== units && n >= 0 && n <= units * 4.35 + 0.05
    );
    if (candidates.length) {
      // Prefer the value closest to units * parsed letter GPA, else largest plausible
      const expected = pointsForLetter(letter);
      let pick = candidates[candidates.length - 1];
      if (expected != null) {
        let bestDiff = Infinity;
        candidates.forEach((n) => {
          const diff = Math.abs(n - expected * units);
          if (diff < bestDiff) {
            bestDiff = diff;
            pick = n;
          }
        });
      }
      letter = reconcileLetterWithPoints(letter, units, pick);
    }
  }

  if (!VALID_GRADE_RE.test(letter) && letter !== "Pass" && letter !== "NG") return null;
  if (!Number.isFinite(units) || units < 0 || units > 12) return null;

  title = cleanTitle(title);
  if (isJunkTitle(title)) return null;

  // Reject titles that still contain another course code
  if (new RegExp(COURSE_CODE_RE.source, "i").test(title)) return null;

  const code = `${subject} ${number}`;
  // Term comes only from transcript section headers — never from scrambled
  // leftover text inside the course row (that caused Fall 2026 on Winter courses).
  const term = currentTerm || "";
  const year = yearForCourse(code, term);

  return {
    id: crypto.randomUUID(),
    code,
    name: title,
    units,
    letter,
    term,
    year,
  };
}

function preprocessOcrText(text) {
  return String(text || "")
    .replace(/[−–—‐‑‒﹣－]/g, "-")
    .replace(/\u00AD/g, "-")
    // "A -" / "A  -" → "A-"
    .replace(/\b([ABCDF])\s+([+-])(?=\s|$|\d)/gi, "$1$2")
    // lone minus on its own line after a letter grade line is handled in coalesce
    .replace(/\b([ABCDF])[\._~\=](?=\s|$|\d)/gi, "$1-");
}

/**
 * Screenshot OCR often emits one field per line:
 *   COMM 101
 *   Introduction to Commerce
 *   6.00
 *   A-
 *   22.20
 * Join those into a single parseable row.
 */
function coalesceTranscriptLines(lines) {
  const out = [];
  let buffer = "";

  const flush = () => {
    if (buffer) {
      out.push(buffer.trim());
      buffer = "";
    }
  };

  const hasCourseCode = (line) => {
    const re = new RegExp(COURSE_CODE_RE.source, "i");
    return re.test(line);
  };

  lines.forEach((rawLine, index) => {
    let line = String(rawLine || "").trim();
    if (!line) return;

    // Attach a lone "-" / "+" to previous buffer ending in bare A–F
    if (/^[+\-−–—]$/.test(line) && buffer) {
      buffer = buffer.replace(/\b([ABCDF])\s*$/i, `$1${line === "+" ? "+" : "-"}`);
      return;
    }

    const term = findTermInText(line);
    const code = hasCourseCode(line);

    if (isTermHeaderLine(line) || (term && !code && line.length < 48)) {
      flush();
      out.push(line);
      return;
    }

    if (isJunkLine(line) && !code) {
      flush();
      out.push(line);
      return;
    }

    if (code) {
      flush();
      buffer = line;
      return;
    }

    if (buffer) {
      buffer = `${buffer} ${line}`;
      // Stop buffering once we likely have units + grade (+ optional points)
      const gradeRe = new RegExp(`\\b${LETTER_GRADE_CAPTURE}(?!\\w)`, "i");
      const nums = buffer.match(/\b\d+\.\d{2}\b/g) || [];
      if (gradeRe.test(buffer) && nums.length >= 1) {
        // Keep going if next line looks like quality points only
        const next = String(lines[index + 1] || "").trim();
        if (/^\d+\.\d{1,2}$/.test(next)) return;
        flush();
      }
      return;
    }

    out.push(line);
  });

  flush();
  return out;
}

function parseTranscriptDocument(text) {
  const prepared = preprocessOcrText(text);
  const career = parseCareerTotals(prepared);
  const rawLines = prepared
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const lines = coalesceTranscriptLines(rawLines);
  const courses = [];
  let currentTerm = "";

  lines.forEach((line) => {
    if (isTermHeaderLine(line)) {
      currentTerm = findTermInText(line);
      return;
    }

    // Course line that begins with a term banner — adopt it, then parse courses.
    const leadingTerm = findTermInText(line);
    if (
      leadingTerm &&
      new RegExp(COURSE_CODE_RE.source, "i").test(line) &&
      /^(Fall|Winter|Summer|Spring|20\d{2})\b/i.test(line)
    ) {
      currentTerm = leadingTerm;
    }

    if (/career\s+totals|undergraduate\s+career/i.test(line)) {
      currentTerm = "";
      return;
    }

    if (isJunkLine(line) && !new RegExp(COURSE_CODE_RE.source, "i").test(line)) return;

    const chunks = splitByCourseCodes(line);
    chunks.forEach((chunk) => {
      const course = parseCourseChunk(chunk, currentTerm);
      if (course) courses.push(course);
    });
  });

  const deduped = [];
  const seen = new Set();
  courses.forEach((course) => {
    const key = `${course.code}|${course.term}|${course.letter}|${course.units}|${course.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(course);
  });

  return { courses: deduped, career };
}

function parseTranscriptText(text) {
  return parseTranscriptDocument(text).courses;
}

function normalizeCourseCode(raw) {
  const cleaned = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
  const match = cleaned.match(/^([A-Z]{2,5})\s+(\d{3}[A-Z]?)$/);
  if (!match) return "";
  return `${match[1]} ${match[2]}`;
}

function emptyCourse() {
  return {
    id: crypto.randomUUID(),
    code: "",
    name: "",
    units: "",
    letter: "",
    term: "",
    year: null,
  };
}

function sortCourses(courses) {
  return [...courses].sort((a, b) => {
    const termCmp = termSortKey(a.term) - termSortKey(b.term);
    if (termCmp) return termCmp;
    const yearA = a.year || 99;
    const yearB = b.year || 99;
    if (yearA !== yearB) return yearA - yearB;
    return String(a.code).localeCompare(String(b.code));
  });
}

function mergeImportedCourses(incoming, career = null) {
  gradesState.courses = sortCourses(incoming);
  gradesState.career = career || null;
  saveGrades();
}

function renderYearTabs() {
  document.querySelectorAll("[data-grades-year]").forEach((button) => {
    const active = button.dataset.gradesYear === String(gradesFilters.year);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function summaryHtml(courses) {
  const summary = gpaSummary(courses);
  const career = gradesState.career;
  const useOfficial =
    gradesFilters.year === "all" &&
    career &&
    Number.isFinite(career.gpa) &&
    Number.isFinite(career.gpaUnits);

  const label =
    gradesFilters.year === "all"
      ? useOfficial
        ? "Official cumulative"
        : "Cumulative"
      : `Year ${gradesFilters.year}`;
  const gpa = useOfficial ? career.gpa : summary.gpa;
  const meta = useOfficial
    ? `<span>${career.units.toFixed(2)} units</span>
        <span>${career.gpaUnits.toFixed(2)} GPA units</span>
        <span>${Number(career.gpaPoints).toFixed(1)} GPA points</span>`
    : `<span>${summary.count} course${summary.count === 1 ? "" : "s"}</span>
        <span>${summary.units || 0} GPA units</span>`;

  return `
    <div class="grades-summary-card">
      <div>
        <span class="grades-summary-label">${escapeGrades(label)} GPA</span>
        <strong class="grades-summary-gpa">${formatGpa(gpa)}</strong>
      </div>
      <div class="grades-summary-meta">
        ${meta}
      </div>
    </div>
  `;
}

function tableForCourses(courses, heading) {
  if (!courses.length) {
    return `
      <div class="grades-empty">
        <p>No grades yet${heading ? ` for ${escapeGrades(heading)}` : ""}. Import a transcript or use Edit Grades to add courses.</p>
      </div>
    `;
  }

  const rows = courses
    .map(
      (course) => `<tr data-grade-id="${escapeGrades(course.id)}">
        <td>${escapeGrades(course.term || "—")}</td>
        <td class="grades-code">${escapeGrades(course.code)}</td>
        <td>${escapeGrades(course.name || "")}</td>
        <td>${escapeGrades(course.units ?? "—")}</td>
        <td class="grades-letter">${escapeGrades(course.letter || "—")}</td>
      </tr>`
    )
    .join("");

  const summary = gpaSummary(courses);

  return `
    <section class="grades-section">
      ${heading ? `<h2 class="grades-section-title">${escapeGrades(heading)}</h2>` : ""}
      <div class="grades-table-wrap">
        <table class="grades-table">
          <thead>
            <tr>
              <th>Term</th>
              <th>Course</th>
              <th>Title</th>
              <th>Units</th>
              <th>Grade</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <td colspan="3"></td>
              <td class="grades-total-units">${summary.units || "—"}</td>
              <td class="grades-total-gpa">GPA ${formatGpa(summary.gpa)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  `;
}

function render() {
  const body = document.getElementById("grades-body");
  const summary = document.getElementById("grades-summary");
  const subtitle = document.getElementById("grades-subtitle");
  if (!body) return;

  refreshCourseYears();
  renderYearTabs();
  const courses = visibleCourses();

  if (subtitle) {
    subtitle.textContent = gradesState.courses.length
      ? "Track course grades and GPA. Import a transcript or edit grades manually."
      : "Import your Queen’s transcript or add courses manually to track grades and GPA.";
  }

  if (summary) {
    summary.innerHTML = gradesState.courses.length ? summaryHtml(courses) : "";
  }

  if (gradesFilters.year === "all" && courses.length) {
    const groups = [1, 2, 3, 4]
      .map((year) => ({
        year,
        courses: courses.filter((course) => Number(course.year) === year),
      }))
      .filter((group) => group.courses.length);
    const unassigned = courses.filter((course) => !course.year);
    body.innerHTML = [
      ...groups.map((group) => tableForCourses(group.courses, `Year ${group.year}`)),
      unassigned.length ? tableForCourses(unassigned, "Other / Unassigned") : "",
    ].join("");
  } else {
    const heading =
      gradesFilters.year === "all" ? "" : `Year ${gradesFilters.year}`;
    body.innerHTML = tableForCourses(courses, heading);
  }
}

function setStatus(message, isError = false) {
  const status = document.getElementById("transcript-status");
  if (!status) return;
  status.hidden = !message;
  status.textContent = message || "";
  status.classList.toggle("is-error", !!isError);
}

function setImportMode(mode) {
  const submit = document.getElementById("transcript-submit");
  const confirmBtn = document.getElementById("transcript-confirm");
  const review = document.getElementById("transcript-review");
  const drop = document.getElementById("transcript-drop");
  if (mode === "review") {
    if (submit) submit.hidden = true;
    if (confirmBtn) confirmBtn.hidden = false;
    if (review) review.hidden = false;
    if (drop) drop.hidden = true;
  } else {
    if (submit) submit.hidden = false;
    if (confirmBtn) confirmBtn.hidden = true;
    if (review) review.hidden = true;
    if (drop) drop.hidden = false;
    pendingImportCourses = null;
    pendingImportCareer = null;
    pendingImportRawText = "";
  }
}

function renderReviewTable(courses) {
  const root = document.getElementById("transcript-review-table");
  const raw = document.getElementById("transcript-raw-text");
  if (raw) raw.textContent = pendingImportRawText || "";
  if (!root) return;
  const careerNote = pendingImportCareer
    ? `<p class="transcript-review-copy">Official career totals detected: ${pendingImportCareer.units.toFixed(2)} units · ${pendingImportCareer.gpaUnits.toFixed(2)} GPA units · ${Number(pendingImportCareer.gpaPoints).toFixed(1)} points · GPA ${formatGpa(pendingImportCareer.gpa)}</p>`
    : `<p class="transcript-review-copy">Couldn’t find career totals in the file — GPA will be calculated from course rows. Fix any wrong terms below (e.g. Winter 2025).</p>`;
  root.innerHTML = `
    ${careerNote}
    <table class="transcript-review-table">
      <thead>
        <tr>
          <th>Term</th>
          <th>Course</th>
          <th>Title</th>
          <th>Units</th>
          <th>Grade</th>
        </tr>
      </thead>
      <tbody>
        ${courses
          .map(
            (course, index) => `<tr>
              <td>${termInputHtml(course.term, `data-review-term="${index}"`)}</td>
              <td class="grades-code">${escapeGrades(course.code)}</td>
              <td>${escapeGrades(course.name || "")}</td>
              <td>${escapeGrades(course.units ?? "—")}</td>
              <td>${letterSelectHtml(course.letter, `data-review-letter="${index}"`)}</td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function openTranscriptModal() {
  const modal = document.getElementById("transcript-modal");
  if (!modal) return;
  setImportMode("pick");
  modal.hidden = false;
  setStatus("");
}

function closeTranscriptModal() {
  const modal = document.getElementById("transcript-modal");
  if (!modal) return;
  modal.hidden = true;
  setImportMode("pick");
}

function clearTranscriptSelection() {
  transcriptFile = null;
  const input = document.getElementById("transcript-file");
  const name = document.getElementById("transcript-file-name");
  const preview = document.getElementById("transcript-preview");
  const previewImg = document.getElementById("transcript-preview-img");
  const drop = document.getElementById("transcript-drop");
  if (input) input.value = "";
  if (name) name.textContent = "";
  if (preview) preview.hidden = true;
  if (previewImg) previewImg.removeAttribute("src");
  drop?.classList.remove("is-dragover");
  setImportMode("pick");
}

function selectTranscriptFile(file) {
  if (!file) {
    clearTranscriptSelection();
    setStatus("");
    return false;
  }

  if (!isPdfFile(file) && !isImageFile(file)) {
    setStatus("Please drop a PDF or image (PNG, JPG, HEIC, etc.).", true);
    return false;
  }

  transcriptFile = file;
  const input = document.getElementById("transcript-file");
  const name = document.getElementById("transcript-file-name");
  const preview = document.getElementById("transcript-preview");
  const previewImg = document.getElementById("transcript-preview-img");
  const drop = document.getElementById("transcript-drop");

  // Keep the <input> in sync when the browser allows it (helps some UIs).
  if (input) {
    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
    } catch {
      /* DataTransfer assignment not supported — transcriptFile is enough */
    }
  }

  if (name) name.textContent = file.name;
  drop?.classList.remove("is-dragover");
  setImportMode("pick");

  if (isImageFile(file) && preview && previewImg) {
    preview.hidden = false;
    previewImg.src = URL.createObjectURL(file);
  } else if (preview) {
    preview.hidden = true;
    if (previewImg) previewImg.removeAttribute("src");
  }

  setStatus(
    isPdfFile(file)
      ? `Selected PDF: ${file.name}. Click Import.`
      : `Selected image: ${file.name}. Click Import.`
  );
  return true;
}

function bindTranscriptDropZone() {
  const drop = document.getElementById("transcript-drop");
  if (!drop || drop.dataset.dndBound === "true") return;
  drop.dataset.dndBound = "true";

  const stop = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  ["dragenter", "dragover"].forEach((type) => {
    drop.addEventListener(type, (event) => {
      stop(event);
      drop.classList.add("is-dragover");
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    });
  });

  drop.addEventListener("dragleave", (event) => {
    stop(event);
    // Only clear highlight when leaving the drop zone itself
    if (!drop.contains(event.relatedTarget)) {
      drop.classList.remove("is-dragover");
    }
  });

  drop.addEventListener("drop", (event) => {
    stop(event);
    drop.classList.remove("is-dragover");
    const file = event.dataTransfer?.files?.[0];
    if (!file) {
      setStatus("No file found in that drop. Try again or click to browse.", true);
      return;
    }
    selectTranscriptFile(file);
  });
}

async function importTranscript() {
  if (!transcriptFile) {
    setStatus("Choose a transcript PDF or screenshot first.", true);
    return;
  }

  const submit = document.getElementById("transcript-submit");
  if (submit) submit.disabled = true;
  setStatus("Reading transcript…");

  try {
    let text = "";
    if (isPdfFile(transcriptFile)) {
      setStatus("Extracting text from PDF…");
      text = await extractTextFromPdf(transcriptFile);
    } else if (isImageFile(transcriptFile)) {
      setStatus("Scanning transcript image… this can take a moment.");
      text = await extractTextFromImage(transcriptFile);
    } else {
      throw new Error("Please upload a PDF or image of your transcript.");
    }

    const parsed = parseTranscriptDocument(text);
    if (!parsed.courses.length) {
      throw new Error(
        "Couldn’t find course grades in that file. Try a clearer PDF or screenshot of the grade list."
      );
    }

    pendingImportCourses = parsed.courses;
    pendingImportCareer = parsed.career;
    pendingImportRawText = text;
    renderReviewTable(parsed.courses);
    setImportMode("review");
    const careerBit = parsed.career
      ? ` Official GPA ${formatGpa(parsed.career.gpa)} (${parsed.career.gpaUnits.toFixed(2)} GPA units).`
      : "";
    setStatus(
      `Found ${parsed.courses.length} course${parsed.courses.length === 1 ? "" : "s"}.${careerBit} Review terms & letters, then Save.`
    );
  } catch (error) {
    setStatus(error.message || "Import failed.", true);
  } finally {
    if (submit) submit.disabled = false;
  }
}

function confirmTranscriptImport() {
  if (!pendingImportCourses?.length) {
    setStatus("Nothing to save. Import a transcript first.", true);
    return;
  }

  // Pull any term/letter edits from the review table
  pendingImportCourses = pendingImportCourses.map((course, index) => {
    const letterSelect = document.querySelector(`[data-review-letter="${index}"]`);
    const termInput = document.querySelector(`[data-review-term="${index}"]`);
    const letter = normalizeLetter(letterSelect?.value || course.letter) || course.letter;
    const termRaw = String(termInput?.value || course.term || "").trim();
    const term = findTermInText(termRaw) || termRaw;
    return { ...course, letter, term, year: yearForCourse(course.code, term) };
  });

  mergeImportedCourses(pendingImportCourses, pendingImportCareer);
  const count = pendingImportCourses.length;
  setStatus(`Saved ${count} course${count === 1 ? "" : "s"}.`);
  render();
  setTimeout(() => {
    closeTranscriptModal();
    clearTranscriptSelection();
    setStatus("");
  }, 500);
}

function updateCourseLetter(courseId, letter) {
  const course = gradesState.courses.find((row) => row.id === courseId);
  if (!course) return;
  const next = normalizeLetter(letter);
  if (!next) return;
  course.letter = next;
  saveGrades();
  render();
}

function updateCourseTerm(courseId, termValue) {
  const course = gradesState.courses.find((row) => row.id === courseId);
  if (!course) return;
  const raw = String(termValue || "").trim();
  course.term = findTermInText(raw) || raw;
  course.year = yearForCourse(course.code, course.term);
  saveGrades();
  render();
}

function clearAllGrades() {
  if (!gradesState.courses.length && !gradesState.career) {
    setStatus("No grades to clear.");
    return;
  }
  if (!confirm("Clear all imported grades?")) return;
  gradesState.courses = [];
  gradesState.career = null;
  saveGrades();
  render();
  setStatus("Grades cleared.");
}

function setEditStatus(message, isError = false) {
  const status = document.getElementById("grades-edit-status");
  if (!status) return;
  status.hidden = !message;
  status.textContent = message || "";
  status.classList.toggle("is-error", !!isError);
}

function renderEditTable(courses) {
  const root = document.getElementById("grades-edit-table");
  if (!root) return;

  if (!courses.length) {
    root.innerHTML = `<p class="grades-edit-empty">No courses yet. Click “Add course” below.</p>`;
    return;
  }

  root.innerHTML = `
    <table class="grades-edit-table">
      <thead>
        <tr>
          <th>Term</th>
          <th>Course</th>
          <th>Title</th>
          <th>Units</th>
          <th>Grade</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${courses
          .map(
            (course, index) => `<tr data-edit-index="${index}">
              <td>${termInputHtml(course.term, `data-field="term"`)}</td>
              <td><input class="grades-code-input" type="text" data-field="code" value="${escapeGrades(course.code || "")}" placeholder="COMM 101" /></td>
              <td><input class="grades-title-input" type="text" data-field="name" value="${escapeGrades(course.name || "")}" placeholder="Course title" /></td>
              <td><input class="grades-units-input" type="number" step="0.01" min="0" max="12" data-field="units" value="${course.units === "" || course.units == null ? "" : escapeGrades(course.units)}" placeholder="3.00" /></td>
              <td>${letterSelectHtml(course.letter, `data-field="letter"`)}</td>
              <td><button type="button" class="grades-edit-remove" data-edit-remove="${index}">Remove</button></td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function openEditModal() {
  const modal = document.getElementById("grades-edit-modal");
  if (!modal) return;
  editDraftCourses = gradesState.courses.map((course) => ({ ...course }));
  if (!editDraftCourses.length) editDraftCourses = [emptyCourse()];
  renderEditTable(editDraftCourses);
  setEditStatus("");
  modal.hidden = false;
}

function closeEditModal() {
  const modal = document.getElementById("grades-edit-modal");
  if (!modal) return;
  modal.hidden = true;
  editDraftCourses = null;
  setEditStatus("");
}

function readEditDraftFromDom() {
  const rows = document.querySelectorAll("#grades-edit-table tbody tr[data-edit-index]");
  return [...rows].map((row) => {
    const index = Number(row.dataset.editIndex);
    const existing = editDraftCourses?.[index];
    const term = row.querySelector('[data-field="term"]')?.value || "";
    const code = row.querySelector('[data-field="code"]')?.value || "";
    const name = row.querySelector('[data-field="name"]')?.value || "";
    const unitsRaw = row.querySelector('[data-field="units"]')?.value ?? "";
    const letter = row.querySelector('[data-field="letter"]')?.value || "";
    return {
      id: existing?.id || crypto.randomUUID(),
      term: String(term).trim(),
      code: String(code).trim(),
      name: String(name).trim(),
      units: unitsRaw === "" ? null : Number(unitsRaw),
      letter: String(letter).trim(),
      year: null,
    };
  });
}

function saveEditGrades() {
  const rows = readEditDraftFromDom();
  const courses = [];
  const errors = [];

  rows.forEach((row, index) => {
    const isEmpty = !row.code && !row.name && row.units == null && !row.letter && !row.term;
    if (isEmpty) return;

    const code = normalizeCourseCode(row.code);
    if (!code) {
      errors.push(`Row ${index + 1}: enter a course code like COMM 101.`);
      return;
    }
    if (row.units == null || !Number.isFinite(row.units) || row.units < 0 || row.units > 12) {
      errors.push(`Row ${index + 1}: enter units between 0 and 12.`);
      return;
    }
    const letter = normalizeLetter(row.letter);
    if (!letter) {
      errors.push(`Row ${index + 1}: choose a letter grade.`);
      return;
    }

    const term = findTermInText(row.term) || row.term;
    courses.push({
      id: row.id,
      code,
      name: row.name,
      units: row.units,
      letter,
      term,
      year: yearForCourse(code, term),
    });
  });

  if (errors.length) {
    setEditStatus(errors[0], true);
    return;
  }

  gradesState.courses = sortCourses(courses);
  gradesState.career = null;
  saveGrades();
  render();
  closeEditModal();
}

function bindGradesPage() {
  if (window.__handleGradesPageClick) {
    document.removeEventListener("click", window.__handleGradesPageClick);
  }
  if (window.__handleGradesPageChange) {
    document.removeEventListener("change", window.__handleGradesPageChange);
    window.__handleGradesPageChange = null;
  }

  window.__handleGradesPageClick = (event) => {
    const yearBtn = event.target.closest("[data-grades-year]");
    if (yearBtn && document.getElementById("page-grades")?.contains(yearBtn)) {
      gradesFilters.year = yearBtn.dataset.gradesYear;
      window.ComCalGrades?.render();
      return;
    }
    if (event.target.closest("#grades-import-open")) {
      openTranscriptModal();
      return;
    }
    if (event.target.closest("#grades-edit-open")) {
      openEditModal();
      return;
    }
    const removeBtn = event.target.closest("[data-edit-remove]");
    if (removeBtn && document.getElementById("grades-edit-modal")?.contains(removeBtn)) {
      const index = Number(removeBtn.dataset.editRemove);
      if (!Number.isFinite(index) || !editDraftCourses) return;
      editDraftCourses.splice(index, 1);
      renderEditTable(editDraftCourses);
    }
  };
  document.addEventListener("click", window.__handleGradesPageClick);

  document.getElementById("grades-edit-cancel")?.addEventListener("click", closeEditModal);
  document.getElementById("grades-edit-save")?.addEventListener("click", saveEditGrades);
  document.getElementById("grades-edit-add")?.addEventListener("click", () => {
    if (!editDraftCourses) editDraftCourses = [];
    editDraftCourses.push(emptyCourse());
    renderEditTable(editDraftCourses);
  });
  document.getElementById("grades-edit-modal")?.addEventListener("click", (event) => {
    if (event.target.id === "grades-edit-modal") {
      closeEditModal();
    }
  });

  document.getElementById("transcript-cancel")?.addEventListener("click", () => {
    closeTranscriptModal();
    clearTranscriptSelection();
    setStatus("");
  });
  document.getElementById("transcript-clear")?.addEventListener("click", clearAllGrades);
  document.getElementById("transcript-submit")?.addEventListener("click", importTranscript);
  document.getElementById("transcript-confirm")?.addEventListener("click", confirmTranscriptImport);
  document.getElementById("transcript-modal")?.addEventListener("click", (event) => {
    if (event.target.id === "transcript-modal") {
      closeTranscriptModal();
    }
  });

  bindTranscriptDropZone();

  const fileInput = document.getElementById("transcript-file");
  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0] || null;
    if (file) selectTranscriptFile(file);
    else {
      transcriptFile = null;
      setStatus("");
    }
  });
}

bindGradesPage();

window.ComCalGrades = {
  render,
  load: () => gradesState,
  parseTranscriptText,
  parseTranscriptDocument,
  reloadFromStorage() {
    gradesState = loadGrades();
    window.__comcalGradesState = gradesState;
    render();
  },
};

render();
