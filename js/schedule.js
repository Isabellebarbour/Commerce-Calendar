const EVENT_STORAGE = "comcal-events";
const COURSE_CODE_PATTERN = "\\b([A-Z]{3,4})\\s*-?\\s*(\\d{3}[A-Z]?)\\b";
const WEEKDAY_INDEX = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_LOOKUP = {
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
  th: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};
const DAY_COMBOS = {
  mwf: [1, 3, 5],
  mw: [1, 3],
  mf: [1, 5],
  wf: [3, 5],
  tth: [2, 4],
  tr: [2, 4],
  tuth: [2, 4],
  mtwhf: [1, 2, 3, 4, 5],
  mtwrf: [1, 2, 3, 4, 5],
};

function loadScheduleEvents() {
  try {
    return JSON.parse(localStorage.getItem(EVENT_STORAGE)) || [];
  } catch {
    return [];
  }
}

function saveScheduleEvents(events) {
  localStorage.setItem(EVENT_STORAGE, JSON.stringify(events));
  window.ComCalCloud?.notifyChanged?.();
}

function unfoldIcs(text) {
  return String(text)
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]/g, "");
}

function unescapeIcs(value) {
  return String(value)
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseIcsDate(raw, params = {}) {
  if (!raw) return null;
  const value = raw.trim();

  if (/^\d{8}$/.test(value) || params.VALUE === "DATE") {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6)) - 1;
    const day = Number(value.slice(6, 8));
    return { date: new Date(year, month, day), allDay: true };
  }

  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] || 0);

  if (match[7] === "Z") {
    return {
      date: new Date(Date.UTC(year, month, day, hour, minute, second)),
      allDay: false,
    };
  }

  return { date: new Date(year, month, day, hour, minute, second), allDay: false };
}

function parseIcsParams(meta) {
  const [name, ...parts] = meta.split(";");
  const params = {};
  parts.forEach((part) => {
    const eq = part.indexOf("=");
    if (eq === -1) return;
    params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  });
  return { name: name.toUpperCase(), params };
}

function parseEventBlock(block) {
  const props = {};
  block.split("\n").forEach((line) => {
    if (!line || line.startsWith("BEGIN:") || line.startsWith("END:")) return;
    const colon = line.indexOf(":");
    if (colon < 0) return;
    const { name, params } = parseIcsParams(line.slice(0, colon));
    props[name] = {
      value: unescapeIcs(line.slice(colon + 1)),
      params,
    };
  });
  return props;
}

function parseRrule(value) {
  const rule = {};
  String(value)
    .split(";")
    .forEach((part) => {
      const [key, val] = part.split("=");
      if (key && val) rule[key.toUpperCase()] = val;
    });
  return rule;
}

function addDaysLocal(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfWeekLocal(date) {
  return addDaysLocal(new Date(date.getFullYear(), date.getMonth(), date.getDate()), -date.getDay());
}

function expandOccurrences(start, end, rruleText, rangeEnd) {
  if (!rruleText) {
    return [{ start, end }];
  }

  const rule = parseRrule(rruleText);
  const freq = rule.FREQ || "WEEKLY";
  const interval = Number(rule.INTERVAL || 1);
  const count = rule.COUNT ? Number(rule.COUNT) : Infinity;
  const until = rule.UNTIL
    ? parseIcsDate(rule.UNTIL)?.date || rangeEnd
    : rangeEnd;
  const duration = Math.max(end.getTime() - start.getTime(), 30 * 60 * 1000);
  const occurrences = [];

  if (freq === "DAILY") {
    let current = new Date(start);
    let n = 0;
    while (current <= until && n < count && occurrences.length < 500) {
      occurrences.push({ start: new Date(current), end: new Date(current.getTime() + duration) });
      current = addDaysLocal(current, interval);
      n += 1;
    }
    return occurrences;
  }

  const bydays = rule.BYDAY
    ? rule.BYDAY.split(",").map((token) => WEEKDAY_INDEX[token.replace(/\d/g, "")]).filter((day) => day != null)
    : [start.getDay()];

  let weekStart = startOfWeekLocal(start);
  let n = 0;
  while (weekStart <= until && n < count && occurrences.length < 500) {
    bydays.forEach((weekday) => {
      if (n >= count) return;
      const instance = addDaysLocal(weekStart, weekday);
      instance.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), 0);
      if (instance < start || instance > until) return;
      occurrences.push({
        start: new Date(instance),
        end: new Date(instance.getTime() + duration),
      });
      n += 1;
    });
    weekStart = addDaysLocal(weekStart, 7 * interval);
  }

  return occurrences;
}

function parseIcs(text) {
  const unfolded = unfoldIcs(text);
  const blocks = unfolded.split("BEGIN:VEVENT").slice(1);
  const rangeEnd = new Date();
  rangeEnd.setFullYear(rangeEnd.getFullYear() + 1);

  const events = [];
  blocks.forEach((chunk, index) => {
    const block = chunk.split("END:VEVENT")[0] || "";
    const props = parseEventBlock(block);
    if (!props.DTSTART) return;

    const startInfo = parseIcsDate(props.DTSTART.value, props.DTSTART.params);
    if (!startInfo) return;

    let endInfo = props.DTEND ? parseIcsDate(props.DTEND.value, props.DTEND.params) : null;
    if (!endInfo) {
      const end = new Date(startInfo.date);
      if (startInfo.allDay) end.setDate(end.getDate() + 1);
      else end.setHours(end.getHours() + 1);
      endInfo = { date: end, allDay: startInfo.allDay };
    }

    const title = props.SUMMARY?.value || "Untitled event";
    const location = props.LOCATION?.value || "";
    const description = props.DESCRIPTION?.value || "";
    const uid = props.UID?.value || `imported-${index}`;
    const rrule = props.RRULE?.value;
    const occurrences = expandOccurrences(startInfo.date, endInfo.date, rrule, rangeEnd);

    occurrences.forEach((occurrence, occIndex) => {
      events.push({
        id: `${uid}-${occIndex}`,
        uid,
        title,
        location,
        description,
        allDay: startInfo.allDay,
        start: occurrence.start.toISOString(),
        end: occurrence.end.toISOString(),
      });
    });
  });

  events.sort((a, b) => new Date(a.start) - new Date(b.start));
  return events;
}

const FAKE_COURSE_SUBJECTS = new Set([
  "HALL",
  "HAL",
  "HAT",
  "ALL",
  "GOO",
  "GOOD",
  "DES",
  "ROOM",
  "BLDG",
  "UNIT",
  "GATE",
  "FLOOR",
  "WING",
  "AREA",
  "WEST",
  "EAST",
  "NORTH",
  "SOUTH",
  "TERM",
  "FALL",
  "DAYS",
  "DATE",
  "TIME",
  "HOUR",
  "WEEK",
  "FROM",
  "THIS",
  "THAT",
  "WITH",
  "YOUR",
  "SHOW",
  "WEEK",
  "SEPT",
  "SEP",
]);

const PREFERRED_SUBJECTS =
  /^(COMM|CISC|MATH|ECON|EMPR|HIST|PHIL|PSYC|BIOL|CHEM|PHYS|DEVS|FILM|MUSC|RELS|POLS|SOCY|GNDS|INTS|ENGL|FREN|SPAN|LLCU|ANAT|PHGY|KNPE|HLTH|NURS|LAW|MBA|ARTS|ASCX|AGHE|BIOM|CANC|CLST|COCA|CWRI|DRAM|EERL|ENSC|EPID|GPHY|GRMN|HLTH|IDIS|IRISH|ITAL|JAPN|LANG|LATN|LING|MARS|MGMT|MUTH|PPEC|PORT|STAT)\b/i;

function extractCourseCodes(text) {
  const codes = new Set();
  const source = normalizeScheduleText(text).toUpperCase().replaceAll("-", " ");
  for (const match of source.matchAll(new RegExp(COURSE_CODE_PATTERN, "g"))) {
    if (FAKE_COURSE_SUBJECTS.has(match[1])) continue;
    codes.add(`${match[1]} ${match[2]}`);
  }
  const preferred = [...codes].filter((code) => PREFERRED_SUBJECTS.test(code));
  return preferred.length ? preferred : [...codes];
}

function normalizeScheduleText(text) {
  return String(text)
    .replace(/\bC0MM\b/gi, "COMM")
    .replace(/\bC0M\b/gi, "COM")
    .replace(/\bconn\b/gi, "COMM")
    .replace(/\b([A-Za-z]{3,4})(\d{3}[A-Za-z]?)\b/g, "$1 $2")
    .replace(/\b([A-Z]{3,4})\s*0(\d{2}[A-Z]?)\b/g, "$1 1$2")
    .replace(/\bWaiting:\s*/gi, "")
    .replace(/[|•·]/g, " ")
    .replace(/\u00a0/g, " ");
}

function toMinutes(hour, minute, meridiem) {
  let hours = Number(hour);
  const mins = Number(minute);
  const suffix = String(meridiem || "").toLowerCase();
  if (suffix.startsWith("p") && hours < 12) hours += 12;
  if (suffix.startsWith("a") && hours === 12) hours = 0;
  return hours * 60 + mins;
}

function buildTimeRange(match) {
  let startMeridiem = match[3];
  let endMeridiem = match[6];
  if (!startMeridiem && endMeridiem) startMeridiem = endMeridiem;
  if (!endMeridiem && startMeridiem) {
    const startHour = Number(match[1]);
    const endHour = Number(match[4]);
    endMeridiem = startHour > endHour ? (startMeridiem.toLowerCase().startsWith("a") ? "PM" : "AM") : startMeridiem;
  }
  if (!startMeridiem && Number(match[1]) <= 7 && Number(match[4]) <= 8) {
    startMeridiem = "PM";
    endMeridiem = "PM";
  }
  const startMinutes = toMinutes(match[1], match[2], startMeridiem);
  let endMinutes = toMinutes(match[4], match[5], endMeridiem);
  if (endMinutes <= startMinutes) endMinutes += 12 * 60;
  return { startMinutes, endMinutes, hasMeridiem: Boolean(match[3] || match[6]) };
}

function parseTimeRange(text) {
  const normalized = String(text || "")
    .replace(/\b([1-9]|1[0-2])([0-5]\d)\s*([AaPp])\.?\s*[Mm]\b/g, "$1:$2$3M")
    .replace(/(\d{1,2})\s*[.:]\s*(\d{2})\s*([AaPp])\s*\.?\s*[Mm]/gi, "$1:$2$3M")
    .replace(/(\d{1,2})\s+(\d{2})\s*([AaPp][Mm])/gi, "$1:$2$3")
    .replace(/(\d{1,2}:\d{2}\s*[AaPp][Mm])\s*[–—−-]+\s*(\d{1,2}:\d{2}\s*[AaPp][Mm])/gi, "$1 - $2");
  const pattern =
    /(\d{1,2})\s*[:.]\s*(\d{2})\s*([AaPp][Mm])?\s*[-–—to]+\s*(\d{1,2})\s*[:.]\s*(\d{2})\s*([AaPp][Mm])?/gi;
  let best = null;
  for (const match of normalized.matchAll(pattern)) {
    const parsed = buildTimeRange(match);
    if (parsed.startMinutes >= 24 * 60 || parsed.endMinutes > 36 * 60) continue;
    if (parsed.hasMeridiem) return parsed;
    if (!best) best = parsed;
  }
  return best;
}

function parseLocation(text) {
  const match = String(text).match(
    /((?:Goodes|Watson|Dunning|Dupuis|Stirling|Etherington|Biosciences|Botterell|Jeffrey|Miller|MacCorry|Theological|Kingston)\s+Hall\s+\d+[A-Z]?)/i
  );
  if (match) return match[1].replace(/\s+/g, " ");
  const hall = String(text).match(/\bHall\s+\d+[A-Z]?\b/i);
  return hall ? hall[0].replace(/\s+/g, " ") : "";
}

function extractSolusMeetings(raw) {
  const text = normalizeScheduleText(raw).replace(/\s+/g, " ");
  const pattern = new RegExp(
    `${COURSE_CODE_PATTERN}(?:\\s*-\\s*(\\d{2,3}))?\\s*(Lecture|Tutorial|Lab|Seminar|Studio)?\\s*` +
      `(\\d{1,2}\\s*[:.]\\s*\\d{2}\\s*[AaPp][Mm]\\s*[-–—to]+\\s*\\d{1,2}\\s*[:.]\\s*\\d{2}\\s*[AaPp][Mm])` +
      `(?:\\s+((?:Goodes|Watson|Dunning|Dupuis|Stirling|Etherington|Biosciences|Botterell|Jeffrey|Miller|MacCorry|Theological|Kingston)\\s+Hall\\s+\\d+[A-Z]?))?`,
    "gi"
  );
  const meetings = [];
  const seen = new Set();
  for (const match of text.matchAll(pattern)) {
    if (FAKE_COURSE_SUBJECTS.has(match[1].toUpperCase())) continue;
    const times = parseTimeRange(match[5]);
    if (!times) continue;
    const title = `${match[1].toUpperCase()} ${match[2].toUpperCase()}`;
    const activity = match[4] || "";
    const before = text.slice(Math.max(0, match.index - 28), match.index);
    const beforeClean = before.replace(
      /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/gi,
      " "
    );
    const after = text.slice(match.index, match.index + match[0].length + 28);
    const key = `${title}|${times.startMinutes}|${times.endMinutes}`;
    if (seen.has(key)) continue;
    seen.add(key);
    meetings.push({
      title,
      section: match[3] || "",
      activity,
      startMinutes: times.startMinutes,
      endMinutes: times.endMinutes,
      location: match[6] ? match[6].replace(/\s+/g, " ") : parseLocation(after),
      weekdays: parseWeekdays(beforeClean),
      index: match.index,
      raw: match[0],
    });
  }

  // OCR often separates title lines from times. Pair each course code with the next time range.
  if (!meetings.length) {
    const codeRe = new RegExp(COURSE_CODE_PATTERN, "gi");
    for (const match of text.matchAll(codeRe)) {
      if (FAKE_COURSE_SUBJECTS.has(match[1].toUpperCase())) continue;
      const title = `${match[1].toUpperCase()} ${match[2].toUpperCase()}`;
      const windowText = text.slice(match.index, match.index + 260);
      const times = parseTimeRange(windowText);
      if (!times) continue;
      const activityMatch = windowText.match(/\b(Lecture|Tutorial|Lab|Seminar|Studio)\b/i);
      const key = `${title}|${times.startMinutes}|${times.endMinutes}`;
      if (seen.has(key)) continue;
      seen.add(key);
      meetings.push({
        title,
        section: "",
        activity: activityMatch ? activityMatch[1] : "",
        startMinutes: times.startMinutes,
        endMinutes: times.endMinutes,
        location: parseLocation(windowText),
        weekdays: [],
        index: match.index,
        raw: windowText.slice(0, 80),
      });
    }
  }
  return meetings;
}

function parseWeekdays(text) {
  const days = new Set();
  const lower = ` ${String(text).toLowerCase().replace(/[./,]/g, " ")} `;
  Object.entries(DAY_COMBOS).forEach(([token, values]) => {
    if (new RegExp(`\\b${token}\\b`).test(lower.replace(/\s+/g, ""))) {
      values.forEach((day) => days.add(day));
    }
  });
  Object.entries(DAY_LOOKUP).forEach(([name, value]) => {
    if (new RegExp(`\\b${name}\\b`).test(lower)) days.add(value);
  });
  return [...days].sort();
}

function looksLikeLocation(line) {
  return /hall|room|bldg|building|goodes|kingston|watson|dunning|dupuis|stirling|ether|biosci|botterell|jeffrey|miller|maccorry|theological|online|zoom|teams|\b[A-Z]{1,3}\s?\d{2,4}\b/i.test(
    line
  );
}

function parseScheduleText(raw) {
  const text = normalizeScheduleText(raw);
  if (/BEGIN:VCALENDAR/i.test(text)) {
    const parsed = parseIcs(text);
    return { templates: templatesFromEvents(parsed), oneOffs: oneOffEvents(parsed), text };
  }

  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const templates = [];
  const seen = new Set();

  const pushTemplate = (title, weekday, startMinutes, endMinutes, location) => {
    const key = `${weekday}|${startMinutes}|${endMinutes}|${title.toUpperCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    templates.push({
      weekday,
      startMinutes,
      endMinutes,
      title,
      location: location || "",
      description: "",
    });
  };

  const solusMeetings = extractSolusMeetings(text);
  solusMeetings.forEach((meeting) => {
    if (!meeting.weekdays.length || meeting.weekdays.length > 2) return;
    meeting.weekdays.forEach((weekday) => {
      pushTemplate(
        meeting.activity ? `${meeting.title} ${meeting.activity}` : meeting.title,
        weekday,
        meeting.startMinutes,
        meeting.endMinutes,
        meeting.location
      );
    });
  });

  if (!templates.length) {
    lines.forEach((line, index) => {
      const codes = extractCourseCodes(line);
      if (!codes.length) return;
      const rest = [];
      for (let i = index + 1; i < lines.length; i += 1) {
        if (extractCourseCodes(lines[i]).length) break;
        if (parseWeekdays(lines[i]).length && lines[i].split(/\s+/).length <= 2) break;
        rest.push(lines[i]);
      }
      const before = lines[index - 1] || "";
      const nearby = [before, line, ...rest].join(" ");
      const times = parseTimeRange(nearby) || parseTimeRange(line);
      const days = parseWeekdays(before).length ? parseWeekdays(before) : parseWeekdays(nearby);
      if (!times || !days.length || days.length > 2) return;
      const locationLine = rest.find((candidate) => looksLikeLocation(candidate));
      days.forEach((weekday) => {
        pushTemplate(line.replace(/\s+/g, " "), weekday, times.startMinutes, times.endMinutes, locationLine || "");
      });
    });
  }

  return { templates, meetings: solusMeetings, oneOffs: [], text };
}

function wordBox(word) {
  const bbox = word.bbox || {};
  const x0 = bbox.x0 ?? word.x0 ?? 0;
  const y0 = bbox.y0 ?? word.y0 ?? 0;
  const x1 = bbox.x1 ?? word.x1 ?? x0 + 8;
  const y1 = bbox.y1 ?? word.y1 ?? y0 + 8;
  return {
    raw: String(word.text || "").trim(),
    x0,
    y0,
    x1,
    y1,
    x: (x0 + x1) / 2,
    y: (y0 + y1) / 2,
    confidence: word.confidence ?? 80,
  };
}

function dayFromText(value) {
  const key = String(value || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return DAY_LOOKUP[key] ?? DAY_LOOKUP[key.slice(0, 3)] ?? null;
}

function parseScheduleWords(words = [], blocks = []) {
  const usable = words.map(wordBox).filter((word) => word.raw && word.confidence >= 30);
  if (!usable.length) return [];

  const dayHits = usable
    .map((word) => {
      const day = dayFromText(word.raw);
      return day == null ? null : { ...word, day };
    })
    .filter(Boolean)
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const headerY = dayHits[0]?.y ?? 0;
  const dayHeadersRaw = [];
  dayHits.forEach((hit) => {
    if (Math.abs(hit.y - headerY) > 36) return;
    if (!dayHeadersRaw.some((item) => item.day === hit.day)) dayHeadersRaw.push(hit);
  });
  dayHeadersRaw.sort((a, b) => a.x - b.x);

  const maxX = Math.max(...usable.map((word) => word.x1), 100);
  let dayHeaders = dayHeadersRaw;
  if (dayHeaders.length < 5) {
    const gutter = dayHeaders.length
      ? Math.max(40, Math.min(...dayHeaders.map((item) => item.x0 ?? item.x)) - 24)
      : Math.max(60, Math.round(maxX * 0.11));
    const width = Math.max(100, maxX - gutter);
    const col = width / 7;
    dayHeaders = Array.from({ length: 7 }, (_, index) => ({
      day: (index + 1) % 7,
      x: gutter + col * (index + 0.5),
      x0: gutter + col * index,
    }));
  }

  const gutterX = dayHeaders.length ? Math.min(...dayHeaders.map((item) => item.x0 ?? item.x)) - 12 : 80;
  const colWidth =
    dayHeaders.length >= 2
      ? Math.abs(dayHeaders[1].x - dayHeaders[0].x)
      : Math.max(...usable.map((word) => word.x1)) / 8;

  function weekdayForX(x) {
    if (!dayHeaders.length) return null;
    return dayHeaders.reduce((best, header) =>
      Math.abs(header.x - x) < Math.abs(best.x - x) ? header : best
    ).day;
  }

  const regions = blocks.length
    ? blocks
    : usable
        .map((word, index) => {
          const next = usable[index + 1];
          const pair = `${word.raw} ${next?.raw || ""}`;
          const codes = extractCourseCodes(normalizeScheduleText(pair.toUpperCase()));
          if (!codes.length || word.x < gutterX) return null;
          return {
            x0: word.x - colWidth * 0.4,
            x1: word.x + colWidth * 0.4,
            y0: word.y - 12,
            y1: word.y + Math.max(70, colWidth * 0.55),
            cx: word.x,
            cy: word.y,
          };
        })
        .filter(Boolean);

  const templates = [];
  const seen = new Set();

  regions.forEach((region) => {
    const inside = usable.filter(
      (word) =>
        word.x >= region.x0 - 6 &&
        word.x <= region.x1 + 6 &&
        word.y >= region.y0 - 6 &&
        word.y <= region.y1 + 6
    );
    const blockText = inside.map((word) => word.raw).join(" ");
    const meetings = extractSolusMeetings(blockText);
    const codes = extractCourseCodes(normalizeScheduleText(blockText));
    const times = meetings[0]
      ? { startMinutes: meetings[0].startMinutes, endMinutes: meetings[0].endMinutes }
      : parseTimeRange(blockText);
    const title = meetings[0]?.title || codes[0];
    const weekday = weekdayForX(region.cx ?? (region.x0 + region.x1) / 2);
    if (!title || !times || weekday == null) return;
    const key = `${weekday}|${times.startMinutes}|${times.endMinutes}|${title}`;
    if (seen.has(key)) return;
    seen.add(key);
    templates.push({
      weekday,
      startMinutes: times.startMinutes,
      endMinutes: times.endMinutes,
      title: meetings[0]?.activity ? `${title} ${meetings[0].activity}` : title,
      location: meetings[0]?.location || parseLocation(blockText),
      description: meetings[0]?.activity || "",
    });
  });

  return templates;
}

function isClassLike(event) {
  if (event.allDay) return false;
  return !/exam|midterm|final|quiz|test|deferral/i.test(`${event.title} ${event.description || ""}`);
}

function oneOffEvents(events) {
  return events.filter((event) => !isClassLike(event));
}

function templatesFromEvents(events) {
  const seen = new Map();
  events.filter(isClassLike).forEach((event) => {
    const start = new Date(event.start);
    const end = new Date(event.end);
    const title = event.title || "Class";
    const key = [
      start.getDay(),
      start.getHours(),
      start.getMinutes(),
      end.getHours(),
      end.getMinutes(),
      (extractCourseCodes(title)[0] || title).toUpperCase(),
    ].join("|");
    if (seen.has(key)) return;
    seen.set(key, {
      weekday: start.getDay(),
      startMinutes: start.getHours() * 60 + start.getMinutes(),
      endMinutes: end.getHours() * 60 + end.getMinutes(),
      title,
      location: event.location || "",
      description: event.description || "",
    });
  });
  return [...seen.values()];
}

function templateQuality(template) {
  const title = String(template?.title || "");
  let score = 0;
  if (/\b(COMM|CISC|MATH|ECON|EMPR|HIST|PHIL|PSYC|BIOL|CHEM|PHYS)\b/i.test(title)) score += 12;
  if (!/^class\b/i.test(title.trim())) score += 4;
  if (/\b(Lecture|Tutorial|Lab|Seminar|Studio)\b/i.test(title)) score += 2;
  if (template?.location) score += 2;
  if (template?.description) score += 1;
  // Prefer typical Queen’s class lengths (80–100 or ~180 min)
  const duration = Number(template?.endMinutes) - Number(template?.startMinutes);
  if (duration >= 70 && duration <= 110) score += 2;
  if (duration >= 160 && duration <= 200) score += 2;
  return score;
}

function templatesOverlap(a, b) {
  if (Number(a.weekday) !== Number(b.weekday)) return false;
  const start = Math.max(a.startMinutes, b.startMinutes);
  const end = Math.min(a.endMinutes, b.endMinutes);
  const overlap = end - start;
  if (overlap <= 0) return false;
  const shorter = Math.min(a.endMinutes - a.startMinutes, b.endMinutes - b.startMinutes);
  return overlap >= Math.max(25, shorter * 0.45);
}

function isGenericClassTitle(title) {
  return /^class\b/i.test(String(title || "").trim());
}

/** Overlap, or a Class stub sitting under a named course (split SOLUS green tiles). */
function templatesShouldMerge(a, b) {
  if (templatesOverlap(a, b)) return true;
  if (Number(a.weekday) !== Number(b.weekday)) return false;
  const aClass = isGenericClassTitle(a.title);
  const bClass = isGenericClassTitle(b.title);
  if (aClass === bClass) return false;
  const named = aClass ? b : a;
  const stub = aClass ? a : b;
  // Location strip is the lower part of the same tile: starts at/near the course block's end.
  const gapAfterNamed = stub.startMinutes - named.endMinutes;
  return gapAfterNamed >= -15 && gapAfterNamed <= 25;
}

function pickBetterTemplate(primary, secondary) {
  const preferPrimary = templateQuality(primary) >= templateQuality(secondary);
  const winner = preferPrimary ? primary : secondary;
  const other = preferPrimary ? secondary : primary;
  const primaryTitle = String(primary.title || "");
  const secondaryTitle = String(secondary.title || "");
  const named =
    /\b(COMM|CISC|MATH|ECON|EMPR)\b/i.test(primaryTitle)
      ? primaryTitle
      : /\b(COMM|CISC|MATH|ECON|EMPR)\b/i.test(secondaryTitle)
        ? secondaryTitle
        : winner.title;
  const involvesClass = isGenericClassTitle(primaryTitle) || isGenericClassTitle(secondaryTitle);
  return {
    ...winner,
    title: named || winner.title,
    location: winner.location || other.location || "",
    description: winner.description || other.description || "",
    // Split location tiles: take the full vertical span. Otherwise keep the stronger slot.
    startMinutes: involvesClass
      ? Math.min(primary.startMinutes, secondary.startMinutes)
      : winner.startMinutes,
    endMinutes: involvesClass
      ? Math.max(primary.endMinutes, secondary.endMinutes)
      : winner.endMinutes,
  };
}

function mergeTemplates(...groups) {
  const normalized = groups.flat().map((template) => ({
    ...template,
    weekday: Number(template.weekday),
    startMinutes: Math.round(Number(template.startMinutes) / 5) * 5,
    endMinutes: Math.round(Number(template.endMinutes) / 5) * 5,
    title: String(template.title || "Class").replace(/\s+/g, " ").trim(),
    location: String(template.location || "").replace(/\s+/g, " ").trim(),
    description: String(template.description || "").trim(),
  }));

  const kept = [];
  normalized.forEach((template) => {
    if (!Number.isFinite(template.weekday) || !Number.isFinite(template.startMinutes)) return;
    if (!(template.endMinutes > template.startMinutes)) return;
    const rivalIndex = kept.findIndex((other) => templatesShouldMerge(other, template));
    if (rivalIndex === -1) {
      kept.push(template);
      return;
    }
    kept[rivalIndex] = pickBetterTemplate(kept[rivalIndex], template);
  });

  // Drop leftover generic "Class" rows that still sit on top of a named course.
  return kept.filter((template, index, list) => {
    if (!isGenericClassTitle(template.title)) return true;
    return !list.some(
      (other, otherIndex) =>
        otherIndex !== index &&
        !isGenericClassTitle(other.title) &&
        templatesShouldMerge(template, other)
    );
  });
}

function sameLocalDayIso(a, b) {
  const left = new Date(a);
  const right = new Date(b);
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function eventsNearOrOverlap(a, b) {
  if (!sameLocalDayIso(a.start, b.start)) return false;
  const aStart = new Date(a.start).getTime();
  const aEnd = new Date(a.end).getTime();
  const bStart = new Date(b.start).getTime();
  const bEnd = new Date(b.end).getTime();
  if (aStart < bEnd && bStart < aEnd) {
    const overlap = Math.min(aEnd, bEnd) - Math.max(aStart, bStart);
    const shorter = Math.min(aEnd - aStart, bEnd - bStart);
    return overlap >= Math.max(5 * 60 * 1000, shorter * 0.35);
  }
  const aClass = isGenericClassTitle(a.title);
  const bClass = isGenericClassTitle(b.title);
  if (aClass === bClass) return false;
  const namedEnd = aClass ? bEnd : aEnd;
  const stubStart = aClass ? aStart : bStart;
  const gapAfterNamed = stubStart - namedEnd;
  return gapAfterNamed >= -15 * 60 * 1000 && gapAfterNamed <= 25 * 60 * 1000;
}

/**
 * Fold generic "Class" + location stubs into the overlapping/adjacent named course event.
 * Fixes already-saved imports where SOLUS tiles split into two calendar blocks.
 */
function coalesceClassLocationStubs(events) {
  if (!Array.isArray(events) || events.length < 2) return events || [];
  const next = events.map((event) => ({ ...event }));
  const drop = new Set();

  for (let i = 0; i < next.length; i += 1) {
    if (drop.has(i)) continue;
    const left = next[i];
    if (
      left.allDay ||
      left.source === "academic" ||
      left.source === "assignment" ||
      left.source === "exam"
    ) {
      continue;
    }

    for (let j = i + 1; j < next.length; j += 1) {
      if (drop.has(j)) continue;
      const right = next[j];
      if (
        right.allDay ||
        right.source === "academic" ||
        right.source === "assignment" ||
        right.source === "exam"
      ) {
        continue;
      }

      const leftGeneric = isGenericClassTitle(left.title);
      const rightGeneric = isGenericClassTitle(right.title);
      if (leftGeneric === rightGeneric) continue;
      if (!eventsNearOrOverlap(left, right)) continue;

      const namedIndex = leftGeneric ? j : i;
      const stubIndex = leftGeneric ? i : j;
      const named = next[namedIndex];
      const stub = next[stubIndex];
      const start = new Date(Math.min(new Date(named.start).getTime(), new Date(stub.start).getTime()));
      const end = new Date(Math.max(new Date(named.end).getTime(), new Date(stub.end).getTime()));

      next[namedIndex] = {
        ...named,
        location: named.location || stub.location || "",
        description: named.description || stub.description || "",
        start: start.toISOString(),
        end: end.toISOString(),
      };
      drop.add(stubIndex);
      if (drop.has(i)) break;
    }
  }

  if (!drop.size) return events;
  return next.filter((_, index) => !drop.has(index));
}

function minutesOnDate(date, minutes) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return next;
}

function expandTemplatesToTerm(templates, term, oneOffs = []) {
  const academic = window.ComCalAcademic;
  const events = [];
  if (!term || !templates.length) return [...oneOffs];

  for (let day = new Date(term.classesBegin); day <= term.classesEnd; day.setDate(day.getDate() + 1)) {
    const date = new Date(day);
    if (academic.isNoClassDay(date)) continue;
    const weekday = academic.effectiveWeekday(date);
    templates.forEach((template, index) => {
      if (template.weekday !== weekday) return;
      if (academic.isComm100MidtermDay(date, template.title)) return;
      if (academic.overlapsBlockedHours(date, template.startMinutes, template.endMinutes)) return;
      const start = minutesOnDate(date, template.startMinutes);
      const end = minutesOnDate(date, template.endMinutes);
      events.push({
        id: `class-${index}-${start.toISOString()}`,
        uid: `class-${index}-${template.weekday}-${template.startMinutes}`,
        title: template.title,
        location: template.location,
        description: template.description,
        allDay: false,
        source: "schedule",
        start: start.toISOString(),
        end: end.toISOString(),
      });
    });
  }

  return [...events, ...oneOffs].sort((a, b) => new Date(a.start) - new Date(b.start));
}

function looksLikeSessionalDates(text) {
  return /Fall Term begins|Application to Graduate|Reading Break|Personal Interest Credit/i.test(text);
}

function formatTemplateSummary(templates) {
  return templates
    .map((template) => {
      const startHour = Math.floor(template.startMinutes / 60);
      const startMin = String(template.startMinutes % 60).padStart(2, "0");
      const suffix = startHour >= 12 ? "PM" : "AM";
      const hour = ((startHour + 11) % 12) + 1;
      return `${extractCourseCodes(template.title)[0] || template.title} ${WEEKDAY_NAMES[template.weekday].slice(0, 3)} ${hour}:${startMin} ${suffix}`;
    })
    .join(" · ");
}

function allEvents() {
  const academic = window.ComCalAcademic?.events || [];
  const stored = loadScheduleEvents();
  const schedule = coalesceClassLocationStubs(stored);
  if (schedule !== stored) saveScheduleEvents(schedule);
  const raw = [...academic, ...schedule].sort((a, b) => new Date(a.start) - new Date(b.start));
  return window.ComCalTopics ? window.ComCalTopics.decorate(raw) : raw;
}

function eventsOnDay(events, date) {
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  return events.filter((event) => {
    const start = new Date(event.start);
    const end = new Date(event.end);
    return start < dayEnd && end > dayStart;
  });
}

function upcomingEvents(events, limit = 3) {
  const now = Date.now();
  return events
    .filter((event) => new Date(event.end).getTime() >= now)
    .slice(0, limit);
}

function isExamEvent(event) {
  if (event?.source === "exam") return true;
  return /exam|midterm|final/i.test(`${event.title || ""} ${event.description || ""}`);
}

window.ComCalSchedule = {
  load: loadScheduleEvents,
  save: saveScheduleEvents,
  allEvents,
  parseIcs,
  parseScheduleText,
  parseScheduleWords,
  extractSolusMeetings,
  parseTimeRange,
  parseLocation,
  templatesFromEvents,
  oneOffEvents,
  mergeTemplates,
  coalesceClassLocationStubs,
  expandTemplatesToTerm,
  looksLikeSessionalDates,
  formatTemplateSummary,
  eventsOnDay,
  upcomingEvents,
  isExamEvent,
  extractCourseCodes,
};
