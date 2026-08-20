function academicRange(id, title, year, month, startDay, endDay = startDay, description = "") {
  const start = new Date(year, month - 1, startDay);
  const end = new Date(year, month - 1, endDay + 1);
  return {
    id: `academic-${id}`,
    uid: `academic-${id}`,
    title,
    location: "",
    description: description || title,
    allDay: true,
    source: "academic",
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function academicTimed(id, title, year, month, day, startHour, startMin, endHour, endMin) {
  return {
    id: `academic-${id}`,
    uid: `academic-${id}`,
    title,
    location: "",
    description: title,
    allDay: false,
    source: "academic",
    start: new Date(year, month - 1, day, startHour, startMin).toISOString(),
    end: new Date(year, month - 1, day, endHour, endMin).toISOString(),
  };
}

const ACADEMIC_EVENTS = [
  academicRange("fall-begins", "Fall Term begins", 2026, 9, 1),
  academicRange("summer-exam-deferral", "Summer Term final exam deferral dates", 2026, 9, 2, 5),
  academicRange("fall-classes-begin", "Fall Term classes begin", 2026, 9, 8),
  academicRange("fall-add-deadline", "Last date to add Fall Term and multi-term classes", 2026, 9, 21),
  academicRange(
    "fall-drop-full",
    "Last date to drop Fall Term and multi-term classes with full tuition fee credit",
    2026,
    9,
    21
  ),
  academicRange("fall-pic-begins", "Time period to select Personal Interest Credit for Fall Term begins", 2026, 9, 22),
  academicRange(
    "truth-reconciliation",
    "National Day for Truth and Reconciliation (all academic activity suspended)",
    2026,
    9,
    30
  ),

  academicRange("a2g-fall-closes", "Application to Graduate (A2G) for Fall closes", 2026, 10, 1),
  academicRange("fall-drop-50", "Last date to drop Fall Term classes for 50% refund", 2026, 10, 5),
  academicRange("fall-reading-break", "Fall Term Reading Break", 2026, 10, 12, 16),
  academicRange(
    "fall-ocr-blackout",
    "No OCR / CAC interviews for Commerce students",
    2026,
    10,
    19,
    30,
    "Commerce students will not be scheduled for on-campus recruitment (OCR) activities or interviews via Smith Career Advancement Centre (CAC) during this time. Partners are highly discouraged from off-campus recruitment as well."
  ),
  academicRange(
    "fall-midterm-week",
    "Fall Core Course Mid-Term Week (100-level COMM classes cancelled)",
    2026,
    10,
    24,
    30
  ),

  academicRange("fall-confer", "Fall degree confer date", 2026, 11, 1),
  academicRange(
    "fall-drop-25",
    "Last date to drop Fall Term classes for 25% refund",
    2026,
    11,
    2
  ),
  academicRange(
    "fall-drop-transcript",
    "Last date to drop Fall Term classes for removal from the transcript",
    2026,
    11,
    2
  ),
  academicRange(
    "fall-pic-deadline",
    "Last date to select or cancel Personal Interest Credit for Fall Term classes",
    2026,
    11,
    2
  ),
  academicRange(
    "fall-midterm-deferral",
    "Fall midterm deferral & alternate assessment date for core Commerce midterms",
    2026,
    11,
    8
  ),
  academicTimed(
    "remembrance-day",
    "Remembrance Day observance (classes cancelled 10:30–11:30 am)",
    2026,
    11,
    11,
    10,
    30,
    11,
    30
  ),

  academicRange("a2g-spring-opens", "Application to Graduate (A2G) for Spring opens", 2026, 12, 1),
  academicRange(
    "dec6-remembrance",
    "Day of Remembrance and Action on Violence Against Women (all academic activity suspended)",
    2026,
    12,
    6
  ),
  academicRange(
    "fall-drop-permission",
    "Last date to drop Fall Term classes without Faculty/School permission",
    2026,
    12,
    8
  ),
  academicRange("fall-day-change", "Teaching Day Change — Wednesday programming", 2026, 12, 8),
  academicRange("fall-classes-end", "Fall Term classes end", 2026, 12, 8),
  academicRange("fall-study-day", "Fall Term pre-examination study period", 2026, 12, 9),
  academicRange("fall-exams", "Fall Term final examinations", 2026, 12, 10, 23),
  academicRange("fall-ends", "Fall Term ends", 2026, 12, 31),

  academicRange("winter-begins", "Winter Term begins", 2027, 1, 1),
  academicRange("winter-classes-begin", "Winter Term classes begin", 2027, 1, 4),
  academicRange("winter-add-deadline", "Last date to add Winter Term classes", 2027, 1, 15),
  academicRange(
    "winter-drop-full",
    "Last date to drop Winter Term classes with full tuition fee credit",
    2027,
    1,
    15
  ),
  academicRange(
    "winter-pic-begins",
    "Time period to select Personal Interest Credit for Winter Term and multi-term classes begins",
    2027,
    1,
    16
  ),
  academicRange("winter-drop-50", "Last date to drop Winter Term classes for 50% refund", 2027, 1, 29),

  academicRange(
    "winter-ocr-blackout",
    "No OCR / CAC interviews for Commerce students",
    2027,
    2,
    1,
    12,
    "Commerce students will not be scheduled for on-campus recruitment (OCR) activities or interviews via Smith Career Advancement Centre (CAC) during this time. Partners are highly discouraged from off-campus recruitment as well."
  ),
  academicRange(
    "winter-midterm-week",
    "Winter Core Course Mid-Term Week (100-level COMM classes cancelled)",
    2027,
    2,
    6,
    12
  ),
  academicRange("winter-reading-break", "Winter Term Reading Break", 2027, 2, 15, 19),
  academicRange(
    "winter-midterm-deferral",
    "Winter midterm deferral & alternate assessment date for core Commerce midterms",
    2027,
    2,
    21
  ),
  academicRange("winter-drop-25", "Last date to drop Winter Term classes for 25% refund", 2027, 2, 26),
  academicRange(
    "winter-drop-transcript",
    "Last date to drop Winter Term classes for removal from the transcript",
    2027,
    2,
    26
  ),
  academicRange(
    "winter-pic-deadline",
    "Last date to select or cancel Personal Interest Credit for Winter Term and multi-term classes",
    2027,
    2,
    26
  ),

  academicRange("good-friday", "Good Friday (all academic activity cancelled)", 2027, 3, 26),

  academicRange(
    "winter-drop-permission",
    "Last date to drop Winter Term and multi-term classes without Faculty/School permission",
    2027,
    4,
    5
  ),
  academicRange("winter-day-change", "Teaching Day Change — Friday programming", 2027, 4, 5),
  academicRange("winter-classes-end", "Winter Term classes end", 2027, 4, 5),
  academicRange("winter-study", "Winter Term pre-examination study period", 2027, 4, 6, 8),
  academicRange("winter-exams", "Winter Term final examinations", 2027, 4, 9, 23),
  academicRange("a2g-spring-closes", "Application to Graduate (A2G) for Spring closes", 2027, 4, 15),
  academicRange("winter-ends", "Winter Term ends", 2027, 4, 30),

  academicRange("summer-begins", "Summer Term begins", 2027, 5, 1),
  academicRange("summer-classes-begin", "Summer Term 6W1 and 12W classes begin", 2027, 5, 10),
  academicRange("summer-add", "Last date to add Summer Term 6W1 and 12W classes", 2027, 5, 14),
  academicRange(
    "summer-6w1-drop-full",
    "Last date to drop Summer Term 6W1 classes with full tuition fee credit",
    2027,
    5,
    14
  ),
  academicRange(
    "summer-6w1-pic",
    "Time period to select Personal Interest Credit for Summer Term 6W1 classes begins",
    2027,
    5,
    15
  ),
  academicRange(
    "summer-12w-drop-full",
    "Last date to drop Summer Term 12W classes with full tuition fee credit",
    2027,
    5,
    15
  ),
  academicRange(
    "summer-12w-pic",
    "Time period to select Personal Interest Credit for Summer Term 12W begins",
    2027,
    5,
    16
  ),
  academicRange(
    "summer-12w-drop-full-2",
    "Last date to drop Summer Term 12W classes with full tuition fee credit",
    2027,
    5,
    21
  ),
  academicRange(
    "summer-12w-pic-2",
    "Time period to select Personal Interest Credit for Summer Term 12W begins",
    2027,
    5,
    22
  ),
  academicRange("victoria-day", "Victoria Day (classes will not be held)", 2027, 5, 24),
  academicRange("summer-6w1-drop-50", "Last date to drop Summer Term 6W1 classes for 50% refund", 2027, 5, 28),
];

function localDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addLocalDays(date, amount) {
  const next = localDate(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function sameLocalDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function eventCoversDay(event, date) {
  const dayStart = localDate(date);
  const dayEnd = addLocalDays(dayStart, 1);
  return new Date(event.start) < dayEnd && new Date(event.end) > dayStart;
}

function findAcademic(id) {
  return ACADEMIC_EVENTS.find((event) => event.id === `academic-${id}`);
}

function inclusiveRange(id) {
  const event = findAcademic(id);
  return {
    start: localDate(event.start),
    end: addLocalDays(localDate(event.end), -1),
  };
}

const TERMS = [
  {
    id: "fall-2026",
    name: "Fall Term",
    classesBegin: localDate(findAcademic("fall-classes-begin").start),
    classesEnd: localDate(findAcademic("fall-classes-end").start),
    teachingChangeDate: localDate(findAcademic("fall-day-change").start),
    teachingWeekday: 3,
    midterm: inclusiveRange("fall-midterm-week"),
  },
  {
    id: "winter-2027",
    name: "Winter Term",
    classesBegin: localDate(findAcademic("winter-classes-begin").start),
    classesEnd: localDate(findAcademic("winter-classes-end").start),
    teachingChangeDate: localDate(findAcademic("winter-day-change").start),
    teachingWeekday: 5,
    midterm: inclusiveRange("winter-midterm-week"),
  },
  {
    id: "summer-2027",
    name: "Summer Term",
    classesBegin: localDate(findAcademic("summer-classes-begin").start),
    classesEnd: new Date(2027, 6, 30),
    teachingChangeDate: null,
    teachingWeekday: null,
    midterm: null,
  },
];

function termContaining(date) {
  const day = localDate(date);
  return TERMS.find((term) => day >= term.classesBegin && day <= term.classesEnd) || null;
}

function currentOrNextTerm(date = new Date()) {
  const day = localDate(date);
  return (
    TERMS.find((term) => day <= term.classesEnd && day >= addLocalDays(term.classesBegin, -21)) ||
    TERMS.find((term) => day < term.classesBegin) ||
    TERMS[TERMS.length - 1]
  );
}

function termForDates(dates) {
  const valid = dates.map(localDate).filter((date) => !Number.isNaN(date.getTime()));
  if (!valid.length) return currentOrNextTerm();
  const hit = valid.map(termContaining).find(Boolean);
  if (hit) return hit;
  return currentOrNextTerm(valid[0]);
}

function isNoClassDay(date) {
  return ACADEMIC_EVENTS.some((event) => {
    if (!eventCoversDay(event, date)) return false;
    const title = event.title;
    if (/100-level COMM/i.test(title)) return false;
    if (/observance \(classes cancelled 10:30/i.test(title)) return false;
    return /activity suspended|activity cancelled|classes will not be held|Reading Break/i.test(title);
  });
}

function isComm100MidtermDay(date, title) {
  const term = termContaining(date);
  if (!term?.midterm) return false;
  const day = localDate(date);
  if (day < term.midterm.start || day > term.midterm.end) return false;
  return /\bCOMM\s+1\d{2}/i.test(title);
}

function effectiveWeekday(date) {
  const day = localDate(date);
  const term = TERMS.find((item) => item.teachingChangeDate && sameLocalDay(day, item.teachingChangeDate));
  if (term) return term.teachingWeekday;
  return day.getDay();
}

function blockedHours(date) {
  return ACADEMIC_EVENTS.filter((event) => {
    if (event.allDay || !eventCoversDay(event, date)) return false;
    return /classes cancelled/i.test(event.title);
  }).map((event) => ({
    start: new Date(event.start),
    end: new Date(event.end),
  }));
}

function overlapsBlockedHours(date, startMinutes, endMinutes) {
  const day = localDate(date);
  const start = new Date(day);
  start.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
  const end = new Date(day);
  end.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);
  return blockedHours(day).some((block) => start < block.end && end > block.start);
}

window.ComCalAcademic = {
  events: ACADEMIC_EVENTS,
  terms: TERMS,
  termContaining,
  currentOrNextTerm,
  termForDates,
  isNoClassDay,
  isComm100MidtermDay,
  effectiveWeekday,
  overlapsBlockedHours,
};
