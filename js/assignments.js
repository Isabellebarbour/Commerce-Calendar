const ASGN_STORAGE = "comcal-assignments";

const QUEENS_LETTERS = [
  { min: 90, letter: "A+" },
  { min: 85, letter: "A" },
  { min: 80, letter: "A-" },
  { min: 77, letter: "B+" },
  { min: 73, letter: "B" },
  { min: 70, letter: "B-" },
  { min: 67, letter: "C+" },
  { min: 63, letter: "C" },
  { min: 60, letter: "C-" },
  { min: 57, letter: "D+" },
  { min: 53, letter: "D" },
  { min: 50, letter: "D-" },
  { min: 0, letter: "F" },
];

const DEFAULT_COURSES = [
  {
    id: "comm-101",
    code: "COMM 101",
    name: "Introduction to Commerce",
    items: [
      item("Academics 101", "2026-09-22", null, 1.5, 100),
      item("Individual Written Assignment", "2026-10-04", null, 5, 80),
      item("Midterm", "2026-10-07", "2026-10-13", 10, 77),
      item("Team Work Plan", "2026-11-08", null, 5, 100),
      item("Executive Summary", "2026-11-17", null, 2, 85),
      item("Team Case Assignment", "2026-11-17", null, 10, 77),
      item("CAC Badge", "2026-12-01", null, 1.5, 0),
      item("Engagement Activities", null, null, 5, 100),
      item("Final Exam", null, null, 10, 82),
    ],
  },
];

function asgnFilterState() {
  return (window.__comcalAsgnFilters ||= { year: 1, courseId: "all" });
}
let asgnState = (window.__comcalAsgnState ||= loadAssignments());

function assignmentsRoot() {
  return document.getElementById("page-assignments");
}

function item(title, dueStart, dueEnd, weight, score) {
  return {
    id: crypto.randomUUID(),
    title,
    dueStart,
    dueEnd,
    weight,
    score,
    status: score == null ? "upcoming" : "complete",
  };
}

function normalizeCode(code) {
  return String(code || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normalizeCourse(course) {
  if (!course || typeof course !== "object") return null;
  const code = normalizeCode(course.code);
  if (!code) return null;
  return {
    ...course,
    id: course.id || slugCode(code),
    code,
    name: course.name || "",
    items: Array.isArray(course.items) ? course.items : [],
  };
}

function loadAssignments() {
  try {
    const raw = JSON.parse(localStorage.getItem(ASGN_STORAGE) || "null");
    const courses = (raw?.courses || []).map(normalizeCourse).filter(Boolean);
    if (courses.length) return { ...raw, courses };
  } catch {
    /* use defaults */
  }
  return { courses: structuredClone(DEFAULT_COURSES) };
}

function saveAssignments() {
  localStorage.setItem(ASGN_STORAGE, JSON.stringify(asgnState));
  syncAssignmentsToCalendar();
}

function assignmentEventId(itemId) {
  return `asgn-${itemId}`;
}

function dueDateForItem(row) {
  return row.dueEnd || row.dueStart || null;
}

function calendarEventForAssignment(course, row) {
  const due = dueDateForItem(row);
  if (!due) return null;
  const parts = String(due).split("-").map(Number);
  if (parts.length < 3 || parts.some((part) => !Number.isFinite(part))) return null;
  const [year, month, day] = parts;
  const start = new Date(year, month - 1, day);
  const end = new Date(year, month - 1, day + 1);
  const topicId = window.ComCalTopics?.ASSIGNMENTS_ID || "assignments";
  return {
    id: assignmentEventId(row.id),
    uid: assignmentEventId(row.id),
    title: row.title || "Assignment",
    location: course.code || "",
    courseCode: course.code || "",
    description: course.name ? `${course.code} · ${course.name}` : course.code || "",
    allDay: true,
    source: "assignment",
    topicId,
    assignmentItemId: row.id,
    assignmentCourseId: course.id,
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function syncAssignmentsToCalendar() {
  if (!window.ComCalSchedule?.load || !window.ComCalSchedule?.save) return;
  const schedule = (window.ComCalSchedule.load() || []).filter(
    (event) => event.source !== "assignment" && !String(event.id || "").startsWith("asgn-")
  );
  asgnState.courses.forEach((course) => {
    (course.items || []).forEach((row) => {
      const event = calendarEventForAssignment(course, row);
      if (event) schedule.push(event);
    });
  });
  window.ComCalSchedule.save(schedule);
  window.ComCalCalendar?.reload?.();
}

function escapeAsgn(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDueDisplay(start, end) {
  if (!start && !end) return "—";
  const opts = { month: "long", day: "numeric", year: "numeric" };
  const startLabel = start
    ? new Date(`${start}T12:00:00`).toLocaleDateString("en-US", opts)
    : "";
  if (!end || end === start) return startLabel || "—";
  const endLabel = new Date(`${end}T12:00:00`).toLocaleDateString("en-US", opts);
  return `${startLabel} – ${endLabel}`;
}

function letterGrade(percent) {
  if (percent == null || Number.isNaN(percent)) return "—";
  // Queen's: round to 1 decimal, then to a whole percent (half up).
  // e.g. 84.46 → 84.5 → 85 → A; 84.44 → 84.4 → 84 → A-
  const toOneDecimal = Math.round(Number(percent) * 10) / 10;
  const rounded = Math.round(toOneDecimal);
  return QUEENS_LETTERS.find((row) => rounded >= row.min)?.letter || "F";
}

function courseMark(course) {
  let weighted = 0;
  let weightSum = 0;
  let allWeight = 0;
  (course.items || []).forEach((row) => {
    const weight = Number(row.weight) || 0;
    allWeight += weight;
    if (row.score == null || row.score === "") return;
    weighted += (Number(row.score) || 0) * weight;
    weightSum += weight;
  });
  if (!weightSum) {
    return { percent: null, letter: "—", weightSum: 0, allWeight };
  }
  const percent = weighted / weightSum;
  return { percent, letter: letterGrade(percent), weightSum, allWeight };
}

function formatPercent(value) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(2)}%`;
}


function todayISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function inferredStatus(row) {
  if (row.status === "upcoming" || row.status === "overdue") {
    const due = row.dueEnd || row.dueStart;
    if (due && due < todayISO()) return "overdue";
    return "upcoming";
  }
  if (row.status === "complete" || (row.score != null && row.score !== "")) {
    return "complete";
  }
  const due = row.dueEnd || row.dueStart;
  if (due && due < todayISO()) return "overdue";
  return row.status || "upcoming";
}


function slugCode(code) {
  return String(code)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function findCourse(courseId) {
  const id = String(courseId || "");
  return asgnState.courses.find(
    (course) => course.id === id || normalizeCode(course.code) === normalizeCode(id)
  );
}

function findCourseByCode(code) {
  const normalized = normalizeCode(code);
  return asgnState.courses.find((course) => normalizeCode(course.code) === normalized);
}

function findItem(courseId, itemId) {
  return findCourse(courseId)?.items.find((row) => row.id === itemId);
}

function curriculumCoursesForYear(yearNum) {
  return window.ComCalCurriculum?.coursesForYear?.(yearNum) || [];
}

function ensureCourseRecord(code, name) {
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  let course = findCourseByCode(normalized);
  if (course) {
    if (!Array.isArray(course.items)) course.items = [];
    if (name && !course.name) course.name = name;
    return course;
  }
  course = {
    id: slugCode(normalized) || crypto.randomUUID(),
    code: normalized,
    name: name || "",
    items: [],
  };
  asgnState.courses.push(course);
  return course;
}

function ensureYearCourses(yearNum) {
  let added = false;
  curriculumCoursesForYear(yearNum).forEach((entry) => {
    if (!findCourseByCode(entry.code)) {
      ensureCourseRecord(entry.code, entry.name);
      added = true;
    }
  });
  if (added) saveAssignments();
}

function yearCourseCodes(yearNum) {
  return new Set(curriculumCoursesForYear(yearNum).map((entry) => entry.code.toUpperCase()));
}

function coursesForActiveYear(yearNum) {
  const year = Number(yearNum ?? window.__comcalAsgnFilters?.year ?? 1);
  ensureYearCourses(year);
  const curriculumCourses = curriculumCoursesForYear(year);
  const seen = new Set();
  const courses = [];

  curriculumCourses.forEach((entry) => {
    const course = ensureCourseRecord(entry.code, entry.name);
    if (!course) return;
    const key = normalizeCode(course.code);
    if (seen.has(key)) return;
    seen.add(key);
    courses.push(course);
  });

  return courses.sort((a, b) => a.code.localeCompare(b.code));
}

function isCourseTabActive(courseKey) {
  const selected = readCourseKey(asgnFilterState().courseId);
  if (courseKey === "all") return selected === "all";
  return selected !== "all" && selected === normalizeCode(courseKey);
}

function visibleCourses() {
  const yearCourses = coursesForActiveYear();
  const selected = readCourseKey(asgnFilterState().courseId);
  if (selected === "all") return yearCourses;
  return yearCourses.filter((course) => normalizeCode(course.code) === selected);
}

function sortItemsByDue(items) {
  return [...(items || [])].sort((a, b) => {
    const aDue = a.dueEnd || a.dueStart || "9999-12-31";
    const bDue = b.dueEnd || b.dueStart || "9999-12-31";
    return aDue.localeCompare(bDue);
  });
}

function syncFromSchedule(events = window.ComCalSchedule?.load?.() || []) {
  const codes = new Set();
  events.forEach((event) => {
    window.ComCalSchedule
      ?.extractCourseCodes?.(`${event.title || ""} ${event.description || ""}`)
      .forEach((code) => codes.add(code));
  });
  let added = 0;
  codes.forEach((code) => {
    if (findCourseByCode(code)) return;
    const name =
      curriculumCoursesForYear(asgnFilterState().year).find((entry) => entry.code === code)?.name || "";
    ensureCourseRecord(code, name);
    added += 1;
  });
  if (added) saveAssignments();
  return added;
}

function upcomingAssignments(limit = 3) {
  const today = todayISO();
  const rows = [];
  asgnState.courses.forEach((course) => {
    (course.items || []).forEach((entry) => {
      if (inferredStatus(entry) === "complete") return;
      const due = entry.dueEnd || entry.dueStart;
      if (!due || due < today) return;
      rows.push({
        course: course.code,
        title: entry.title,
        dueStart: entry.dueStart,
        dueEnd: entry.dueEnd,
        status: "upcoming",
      });
    });
  });
  rows.sort((a, b) => {
    const aDue = a.dueEnd || a.dueStart || "9999-12-31";
    const bDue = b.dueEnd || b.dueStart || "9999-12-31";
    return aDue.localeCompare(bDue);
  });
  return rows.slice(0, limit);
}

function refreshHome() {
  const body = document.getElementById("home-asgn-body");
  if (!body) return;
  const items = upcomingAssignments(3);
  if (!items.length) {
    body.innerHTML = `
      <p class="home-card-empty-title">No assignments found</p>
      <p class="home-card-empty-copy">You have no upcoming assignments</p>
    `;
    return;
  }
  body.innerHTML = `<ul class="home-event-list">
    ${items
      .map((entry) => {
        const due = formatDueDisplay(entry.dueStart, entry.dueEnd);
        return `<li>
          <strong>${escapeAsgn(entry.title)}</strong>
          <span>${escapeAsgn(entry.course)}${due === "—" ? "" : ` · ${escapeAsgn(due)}`}</span>
        </li>`;
      })
      .join("")}
  </ul>`;
}

function readCourseKey(value) {
  const selected = String(value ?? "").trim();
  return selected === "all" || !selected ? "all" : normalizeCode(selected);
}

function pageEl(selector) {
  return assignmentsRoot()?.querySelector(selector) || document.querySelector(selector);
}

function clickTarget(event) {
  const target = event.target;
  if (target && typeof target.closest === "function") return target;
  return target?.parentElement || null;
}

function selectYear(yearNum) {
  const year = Number(yearNum);
  if (!Number.isFinite(year) || year < 1 || year > 4) return;
  window.__comcalAsgnFilters = {
    year,
    courseId: "all",
  };
  renderAssignments();
}

function selectCourse(courseKey) {
  const prev = window.__comcalAsgnFilters || { year: 1, courseId: "all" };
  window.__comcalAsgnFilters = {
    year: Number(prev.year) || 1,
    courseId: readCourseKey(courseKey),
  };
  renderAssignments();
}

function renderYearTabs(year) {
  const wrap = document.getElementById("asgn-years");
  if (!wrap) return;
  for (const button of wrap.querySelectorAll("button")) {
    const on = Number(button.getAttribute("data-year-filter")) === Number(year);
    button.classList.toggle("is-active", on);
    button.setAttribute("aria-selected", on ? "true" : "false");
  }
}

function renderCourseTabs(year, courseId) {
  const tabs = document.getElementById("asgn-courses");
  if (!tabs) return;
  tabs.removeAttribute("data-asgn-year");
  tabs.removeAttribute("data-year-filter");

  const yearCourses = coursesForActiveYear(year);
  let selectedCourse = readCourseKey(courseId);

  if (
    selectedCourse !== "all" &&
    !yearCourses.some((course) => normalizeCode(course.code) === selectedCourse)
  ) {
    selectedCourse = "all";
    if (window.__comcalAsgnFilters) window.__comcalAsgnFilters.courseId = "all";
  }

  if (!yearCourses.length) {
    tabs.innerHTML = `<span class="asgn-courses-empty">Add courses in Curriculum to track assignments here.</span>`;
    return;
  }

  const buttons = [
    { id: "all", label: "All courses" },
    ...yearCourses.map((course) => ({ id: course.code, label: course.code })),
  ];

  tabs.innerHTML = buttons
    .map((button) => {
      const active =
        button.id === "all" ? selectedCourse === "all" : selectedCourse === normalizeCode(button.id);
      const courseKey = escapeAsgn(button.id);
      return `<button type="button" role="tab" data-course-filter="${courseKey}"${
        active ? ' class="is-active" aria-selected="true"' : ' aria-selected="false"'
      }>${escapeAsgn(button.label)}</button>`;
    })
    .join("");
}

function renderBody(year, courseId) {
  const body = document.getElementById("asgn-body");
  if (!body) return;

  const selected = readCourseKey(courseId);
  const yearCourses = coursesForActiveYear(year);
  const courses =
    selected === "all"
      ? yearCourses
      : yearCourses.filter((course) => normalizeCode(course.code) === selected);
  const yearLabel = window.ComCalCurriculum?.year?.(year)?.label || `Year ${year}`;

  if (!yearCourses.length) {
    body.innerHTML = `
      <div class="asgn-empty">
        <p>No courses in ${escapeAsgn(yearLabel)} yet. Add them in Curriculum first.</p>
      </div>
    `;
    return;
  }

  if (!courses.length) {
    body.innerHTML = `
      <section class="asgn-course">
        <div class="asgn-course-head">
          <div>
            <h2>${escapeAsgn(selected)}</h2>
            <p>No assignments yet. Add one below after this course is set up.</p>
          </div>
        </div>
      </section>
    `;
    return;
  }

  body.innerHTML = courses.map(tableForCourse).join("");
  bindFields(body);
}

function renderAssignments() {
  const state = window.__comcalAsgnFilters || { year: 1, courseId: "all" };
  const year = Number(state.year) || 1;
  const courseId = readCourseKey(state.courseId);
  window.__comcalAsgnFilters = { year, courseId };
  ensureYearCourses(year);
  renderYearTabs(year);
  renderCourseTabs(year, courseId);
  renderBody(year, courseId);
}

function bindAssignmentsPage() {
  if (window.__handleAsgnPageClick) {
    document.removeEventListener("click", window.__handleAsgnPageClick, true);
    window.__handleAsgnPageClick = null;
  }

  const years = document.getElementById("asgn-years");
  if (years) {
    years.onclick = (event) => {
      const target = clickTarget(event);
      const button = target?.closest("#asgn-years button[data-year-filter]");
      if (!button) return;
      years.querySelectorAll("button[data-year-filter]").forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });
      selectYear(button.getAttribute("data-year-filter"));
    };
  }

  const tabs = document.getElementById("asgn-courses");
  if (tabs) {
    tabs.removeAttribute("data-asgn-year");
    tabs.onclick = (event) => {
      const target = clickTarget(event);
      const button = target?.closest("#asgn-courses button[data-course-filter]");
      if (!button) return;
      selectCourse(button.getAttribute("data-course-filter"));
    };
  }

  const body = document.getElementById("asgn-body");
  if (body) {
    body.onclick = (event) => {
      const target = clickTarget(event);
      if (!target) return;
      const checkBtn = target.closest(".asgn-check");
      if (checkBtn) {
        toggleAssignmentCheck(checkBtn.dataset.course, checkBtn.dataset.item);
        return;
      }
      const addBtn = target.closest(".asgn-add-item");
      if (addBtn) {
        addAssignmentItem(addBtn.dataset.course);
        return;
      }
      const deleteBtn = target.closest(".asgn-delete");
      if (deleteBtn) {
        deleteAssignmentItem(deleteBtn.dataset.course, deleteBtn.dataset.item);
      }
    };
  }
}

function asgnStatusCheck(courseId, row) {
  const complete = inferredStatus(row) === "complete";
  return `<button type="button" class="asgn-check${complete ? " is-complete" : ""}" data-course="${escapeAsgn(courseId)}" data-item="${escapeAsgn(row.id)}" aria-pressed="${complete ? "true" : "false"}" aria-label="${complete ? "Mark incomplete" : "Mark complete"}">
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="2.5" y="2.5" width="15" height="15" rx="3.5"/>
      <path d="M5.8 10.4 8.6 13.1 14.2 6.8"/>
    </svg>
  </button>`;
}

function mixWithWhite(hex, amount) {
  const raw = String(hex || "").replace("#", "").trim();
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((part) => part + part)
          .join("")
      : raw;
  const safe = /^[0-9a-fA-F]{6}$/.test(full) ? full : "5B8DEF";
  const r = Number.parseInt(safe.slice(0, 2), 16);
  const g = Number.parseInt(safe.slice(2, 4), 16);
  const b = Number.parseInt(safe.slice(4, 6), 16);
  const mix = (channel) => Math.round(channel + (255 - channel) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function courseRowTheme(code) {
  const color = window.ComCalTopics?.colorForCourse?.(code) || "#5B8DEF";
  return {
    color,
    odd: mixWithWhite(color, 0.7),
    even: mixWithWhite(color, 0.86),
    accent: mixWithWhite(color, 0.52),
  };
}

function tableForCourse(course) {
  if (!Array.isArray(course.items)) course.items = [];
  const mark = courseMark(course);
  const theme = courseRowTheme(course.code);
  const rows = sortItemsByDue(course.items)
    .map(
      (row) => `
      <tr>
        <td class="asgn-status-cell">${asgnStatusCheck(course.id, row)}</td>
        <td>
          <input class="asgn-input asgn-title-input" data-course="${escapeAsgn(course.id)}" data-item="${escapeAsgn(row.id)}" data-field="title" value="${escapeAsgn(row.title)}" aria-label="Assignment name" />
        </td>
        <td class="asgn-due">
          <input class="asgn-input asgn-date-input" type="date" data-course="${escapeAsgn(course.id)}" data-item="${escapeAsgn(row.id)}" data-field="dueStart" value="${escapeAsgn(row.dueStart || "")}" aria-label="Due date" />
        </td>
        <td class="asgn-num">
          <input class="asgn-input asgn-num-input" type="number" min="0" max="100" step="0.1" data-course="${escapeAsgn(course.id)}" data-item="${escapeAsgn(row.id)}" data-field="weight" value="${row.weight ?? ""}" aria-label="Weight" />
          <span>%</span>
        </td>
        <td class="asgn-num">
          <input class="asgn-input asgn-num-input" type="number" min="0" max="100" step="0.01" data-course="${escapeAsgn(course.id)}" data-item="${escapeAsgn(row.id)}" data-field="score" value="${row.score ?? ""}" placeholder="—" aria-label="Score" />
          <span>%</span>
        </td>
        <td class="asgn-grade-cell">${row.score != null && row.score !== "" ? escapeAsgn(letterGrade(Number(row.score))) : ""}</td>
        <td class="asgn-actions">
          <button type="button" class="asgn-delete" data-course="${escapeAsgn(course.id)}" data-item="${escapeAsgn(row.id)}" aria-label="Delete ${escapeAsgn(row.title || "assignment")}">×</button>
        </td>
      </tr>`
    )
    .join("");

  return `
    <section class="asgn-course" style="--asgn-odd:${theme.odd};--asgn-even:${theme.even};--asgn-accent:${theme.accent};--asgn-ink:${theme.color}">
      <div class="asgn-course-head">
        <div>
          <h2>${escapeAsgn(course.code)}</h2>
          <p>${escapeAsgn(course.name || "Course assignments")}</p>
        </div>
        <div class="asgn-mark">
          <span class="asgn-mark-label">Current mark</span>
          <span class="asgn-mark-score">${formatPercent(mark.percent)}</span>
        </div>
      </div>
      <div class="asgn-table-wrap">
        <table class="asgn-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Assignment/Quiz/Exam</th>
              <th>Due Date</th>
              <th>Weight</th>
              <th>Score</th>
              <th>Grade</th>
              <th aria-label="Delete"></th>
            </tr>
          </thead>
          <tbody>
            ${
              rows ||
              `<tr class="asgn-empty-row"><td colspan="7">No assignments yet. Add one below.</td></tr>`
            }
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4"></td>
              <td class="asgn-total-score">${mark.percent != null ? formatPercent(mark.percent) : "—"}</td>
              <td class="asgn-total-grade">${mark.percent != null ? escapeAsgn(mark.letter) : "—"}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <button type="button" class="asgn-add-item" data-course="${escapeAsgn(course.id)}">
        Add assignment
      </button>
    </section>
  `;
}

function bindFields(root) {
  root.querySelectorAll("[data-field]").forEach((field) => {
    field.addEventListener("change", () => {
      const row = findItem(field.dataset.course, field.dataset.item);
      if (!row) return;
      const key = field.dataset.field;
      if (key === "weight") {
        row.weight = field.value === "" ? 0 : Number(field.value);
      } else if (key === "score") {
        row.score = field.value === "" ? null : Number(field.value);
        if (row.score != null) row.status = "complete";
      } else if (key === "dueStart" || key === "dueEnd") {
        row[key] = field.value || null;
      } else if (key !== "status") {
        row[key] = field.value;
      }
      saveAssignments();
      window.ComCalAssignments?.render();
      window.ComCalAssignments?.refreshHome();
    });
  });
}

function toggleAssignmentCheck(courseId, itemId) {
  const row = findItem(courseId, itemId);
  if (!row) return;
  row.status = inferredStatus(row) === "complete" ? "upcoming" : "complete";
  saveAssignments();
  window.ComCalAssignments?.render();
  window.ComCalAssignments?.refreshHome();
}

function addAssignmentItem(courseId) {
  const course = findCourse(courseId);
  if (!course) return;
  course.items.push(item("New assignment", todayISO(), null, 0, null));
  saveAssignments();
  window.ComCalAssignments?.render();
}

function deleteAssignmentItem(courseId, itemId) {
  const course = findCourse(courseId);
  if (!course || !Array.isArray(course.items)) return;
  const next = course.items.filter((row) => row.id !== itemId);
  if (next.length === course.items.length) return;
  course.items = next;
  saveAssignments();
  window.ComCalAssignments?.render();
  window.ComCalAssignments?.refreshHome();
}

function eventElement(event) {
  const target = event.target;
  if (target instanceof Element) return target;
  return target?.parentElement || null;
}

window.ComCalAssignments = {
  render: renderAssignments,
  refreshHome,
  syncFromSchedule,
  upcoming: upcomingAssignments,
  selectYear,
  selectCourse,
  load: () => asgnState,
};
window.selectYear = selectYear;
window.selectCourse = selectCourse;

bindAssignmentsPage();
syncFromSchedule();
renderAssignments();
syncAssignmentsToCalendar();
refreshHome();
