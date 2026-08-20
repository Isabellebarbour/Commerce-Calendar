const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const calTitle = document.getElementById("cal-title");
const calBody = document.getElementById("cal-body");
const viewButtons = document.querySelectorAll("[data-cal-view]");
const TOPICS_COLLAPSE_KEY = "comcal-cal-topics-collapsed";

const HOUR_HEIGHT = 56;

const calState = {
  view: "week",
  cursor: startOfDay(new Date()),
  miniMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  events: window.ComCalSchedule.allEvents(),
  topicsCollapsed: localStorage.getItem(TOPICS_COLLAPSE_KEY) === "1",
};

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfWeek(date) {
  return addDays(startOfDay(date), -date.getDay());
}

function monthGrid(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatHour(hour) {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

function nowOffset() {
  const now = new Date();
  return ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_HEIGHT;
}

function escapeCal(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatEventTime(iso) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatHourCompact(date) {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const hour12 = hours % 12 || 12;
  const suffix = hours < 12 ? "AM" : "PM";
  if (!minutes) return { clock: String(hour12), suffix };
  return {
    clock: `${hour12}:${String(minutes).padStart(2, "0")}`,
    suffix,
  };
}

function formatEventRange(event) {
  if (event.allDay) return "All day";
  const start = new Date(event.start);
  const end = new Date(event.end);
  const a = formatHourCompact(start);
  const b = formatHourCompact(end);
  if (a.suffix === b.suffix) return `${a.clock} – ${b.clock} ${b.suffix}`;
  return `${a.clock} ${a.suffix} – ${b.clock} ${b.suffix}`;
}

function hexToRgb(hex) {
  const raw = String(hex || "").replace("#", "").trim();
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((part) => part + part)
          .join("")
      : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return { r: 7, g: 30, b: 73 };
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

function pastelize(hex, amount = 0.84) {
  const { r, g, b } = hexToRgb(hex);
  const mix = (channel) => Math.round(channel + (255 - channel) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function eventStyleVars(event) {
  const color = event.color || "#071e49";
  return `--event:${color};--event-bg:${pastelize(color)}`;
}

function eventStripeClass(event) {
  if (event.source === "academic" || event.allDay) return " is-striped";
  return "";
}

function eventChipLabel(event) {
  if (event.source === "assignment") return event.title;
  const codes = window.ComCalSchedule.extractCourseCodes(event.title);
  return codes[0] || event.title;
}

function visibleCalendarEvents() {
  return window.ComCalTopics.visibleEvents(calState.events);
}

function monthEventsHtml(day) {
  const items = window.ComCalSchedule.eventsOnDay(visibleCalendarEvents(), day);
  if (!items.length) return "";
  const visible = items.slice(0, 3);
  const extra = items.length - visible.length;
  return `<div class="cal-cell-events">
    ${visible
      .map(
        (event) =>
          `<button type="button" class="cal-chip${eventStripeClass(event)}" data-event-id="${escapeCal(event.id)}" style="${eventStyleVars(event)}" title="${escapeCal(event.description || event.title)}">${escapeCal(eventChipLabel(event))}</button>`
      )
      .join("")}
    ${extra > 0 ? `<span class="cal-chip is-more">+${extra}</span>` : ""}
  </div>`;
}

function timedEventHtml(event) {
  const start = new Date(event.start);
  const end = new Date(event.end);
  const startMin = event.allDay ? 0 : start.getHours() * 60 + start.getMinutes();
  const endMin = event.allDay ? 40 : end.getHours() * 60 + end.getMinutes();
  const top = (startMin / 60) * HOUR_HEIGHT;
  const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 22);
  const title = event.source === "assignment" ? event.title : eventChipLabel(event);
  const subtitle =
    event.source === "assignment"
      ? event.location || event.courseCode || ""
      : event.location || (event.allDay ? "All day" : "");
  return `<button type="button" class="cal-event${eventStripeClass(event)}" data-event-id="${escapeCal(event.id)}" style="top:${top}px;height:${height}px;${eventStyleVars(event)}" title="${escapeCal(event.description || event.title)}">
    <strong>${escapeCal(title)}</strong>
    ${subtitle ? `<span>${escapeCal(subtitle)}</span>` : ""}
  </button>`;
}

function renderTitle() {
  const { view, cursor } = calState;

  if (view === "month") {
    calTitle.textContent = `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
    return;
  }

  if (view === "day") {
    calTitle.textContent = cursor.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    return;
  }

  const start = startOfWeek(cursor);
  const end = addDays(start, 6);
  if (start.getMonth() === end.getMonth()) {
    calTitle.textContent = `${MONTHS[start.getMonth()]} ${start.getFullYear()}`;
  } else if (start.getFullYear() === end.getFullYear()) {
    calTitle.textContent = `${MONTHS[start.getMonth()]} – ${MONTHS[end.getMonth()]} ${start.getFullYear()}`;
  } else {
    calTitle.textContent = `${MONTHS[start.getMonth()]} ${start.getFullYear()} – ${MONTHS[end.getMonth()]} ${end.getFullYear()}`;
  }
}

function renderMonth() {
  const today = startOfDay(new Date());
  const days = monthGrid(calState.cursor);
  const cells = days
    .map((day) => {
      const outside = day.getMonth() !== calState.cursor.getMonth();
      const todayClass = isSameDay(day, today) ? " is-today" : "";
      const outsideClass = outside ? " is-outside" : "";
      const firstOfMonth = day.getDate() === 1;
      const label =
        firstOfMonth && outside
          ? `${MONTHS[day.getMonth()]} ${day.getDate()}`
          : String(day.getDate());

      return `<div class="cal-cell${outsideClass}${todayClass}" data-date="${toDateKey(day)}" role="button" tabindex="0" aria-label="${day.toDateString()}">
        <span class="cal-date">${label}</span>
        ${monthEventsHtml(day)}
      </div>`;
    })
    .join("");

  calBody.innerHTML = `
    <div class="cal-month">
      ${WEEKDAYS.map((name) => `<div class="cal-dow">${name}</div>`).join("")}
      ${cells}
    </div>
  `;
}

function hourLabels() {
  return Array.from(
    { length: 24 },
    (_, hour) => `<div class="cal-hour"><span>${formatHour(hour)}</span></div>`
  ).join("");
}

function dayColumn(day, today) {
  const slots = Array.from({ length: 24 }, () => `<div class="cal-slot"></div>`).join("");
  const now = new Date();
  const nowLine = isSameDay(day, today)
    ? `<div class="cal-now" style="top: ${nowOffset()}px"><span class="cal-now-label">${escapeCal(
        now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      )}</span></div>`
    : "";
  const events = window.ComCalSchedule
    .eventsOnDay(visibleCalendarEvents(), day)
    .map(timedEventHtml)
    .join("");

  return `<div class="cal-col">${slots}${events}${nowLine}</div>`;
}

function headDay(day, today) {
  const todayClass = isSameDay(day, today) ? " is-today" : "";
  return `<div class="cal-head-day${todayClass}">
    <span class="cal-head-dow">${WEEKDAYS[day.getDay()]}</span>
    <span class="cal-head-num">${day.getDate()}</span>
  </div>`;
}

function scrollToNow() {
  const scroller = calBody.querySelector(".cal-scroll");
  if (!scroller) return;
  scroller.scrollTop = Math.max(0, nowOffset() - 120);
}

function renderWeek() {
  const today = startOfDay(new Date());
  const start = startOfWeek(calState.cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  calBody.innerHTML = `
    <div class="cal-week">
      <div class="cal-week-head">
        <div class="cal-head-gutter"></div>
        ${days.map((day) => headDay(day, today)).join("")}
      </div>
      <div class="cal-scroll">
        <div class="cal-time-grid">
          <div class="cal-hours">${hourLabels()}</div>
          <div class="cal-cols">
            ${days.map((day) => dayColumn(day, today)).join("")}
          </div>
        </div>
      </div>
    </div>
  `;

  scrollToNow();
}

function renderDay() {
  const today = startOfDay(new Date());
  const day = calState.cursor;

  calBody.innerHTML = `
    <div class="cal-day">
      <div class="cal-day-head">
        <div class="cal-head-gutter"></div>
        ${headDay(day, today)}
      </div>
      <div class="cal-scroll">
        <div class="cal-time-grid">
          <div class="cal-hours">${hourLabels()}</div>
          <div class="cal-cols">
            ${dayColumn(day, today)}
          </div>
        </div>
      </div>
    </div>
  `;

  scrollToNow();
}

function renderCalendar() {
  renderTitle();
  if (calState.view === "month") renderMonth();
  else if (calState.view === "week") renderWeek();
  else renderDay();
}

function syncMiniMonth() {
  calState.miniMonth = new Date(calState.cursor.getFullYear(), calState.cursor.getMonth(), 1);
}

function setView(view) {
  calState.view = view;
  viewButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.calView === view);
  });
  renderTopics();
  renderCalendar();
}

function shiftCursor(step) {
  const { view, cursor } = calState;
  if (view === "month") {
    calState.cursor = new Date(cursor.getFullYear(), cursor.getMonth() + step, 1);
  } else if (view === "week") {
    calState.cursor = addDays(cursor, step * 7);
  } else {
    calState.cursor = addDays(cursor, step);
  }
  syncMiniMonth();
  renderTopics();
  renderCalendar();
}

viewButtons.forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.calView));
});

document.getElementById("cal-prev").addEventListener("click", () => shiftCursor(-1));
document.getElementById("cal-next").addEventListener("click", () => shiftCursor(1));
document.getElementById("cal-today").addEventListener("click", () => {
  calState.cursor = startOfDay(new Date());
  syncMiniMonth();
  renderTopics();
  renderCalendar();
});

function setImportStatus(message, isError = false) {
  const status = document.getElementById("import-status");
  status.hidden = !message;
  status.textContent = message;
  status.classList.toggle("is-error", isError);
}

function refreshHomeCards() {
  const calBodyCard = document.getElementById("home-cal-body");
  const examBody = document.getElementById("home-exam-body");
  if (!calBodyCard || !examBody) return;

  // Dashboard My Calendar: class schedule + Commerce sessional dates only.
  // Assignments and imported exams have their own home cards.
  const calendarOnly = visibleCalendarEvents().filter(
    (event) =>
      event.source !== "assignment" &&
      event.source !== "exam" &&
      !String(event.id || "").startsWith("asgn-") &&
      !String(event.id || "").startsWith("exam-")
  );
  const upcoming = window.ComCalSchedule.upcomingEvents(calendarOnly, 3);
  const examEvents = visibleCalendarEvents().filter(
    (event) =>
      event.source !== "assignment" &&
      !String(event.id || "").startsWith("asgn-") &&
      window.ComCalSchedule.isExamEvent(event)
  );
  const exams = window.ComCalSchedule.upcomingEvents(examEvents, 3);

  const listHtml = (items, emptyTitle, emptyCopy) => {
    if (!items.length) {
      return `<p class="home-card-empty-title">${emptyTitle}</p>
        <p class="home-card-empty-copy">${emptyCopy}</p>`;
    }
    return `<ul class="home-event-list">
      ${items
        .map((event) => {
          const start = new Date(event.start);
          const when = start.toLocaleString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: event.allDay ? undefined : "numeric",
            minute: event.allDay ? undefined : "2-digit",
          });
          return `<li>
            <strong>${escapeCal(event.title)}</strong>
            <span>${escapeCal(when)}</span>
          </li>`;
        })
        .join("")}
    </ul>`;
  };

  calBodyCard.innerHTML = listHtml(
    upcoming,
    "No events found",
    "You have no upcoming calendar events"
  );
  examBody.innerHTML = listHtml(exams, "No exams found", "You have no upcoming exams");
  window.ComCalAssignments?.refreshHome();
}

function reloadEvents() {
  calState.events = window.ComCalSchedule.allEvents();
  renderTopics();
  renderCalendar();
  refreshHomeCards();
}

function applyImportedEvents(events, templates, term, sourceLabel) {
  const kept = (window.ComCalSchedule.load() || []).filter(
    (event) => event.source === "assignment" || event.source === "exam"
  );
  window.ComCalSchedule.save([...events, ...kept]);
  window.ComCalTopics.syncCourseTopics(events);
  window.ComCalAssignments?.syncFromSchedule(events);
  const result = window.ComCalCurriculum?.markFromSchedule(events) || { planned: 0 };
  const begin = term.classesBegin.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const end = term.classesEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  reloadEvents();
  setImportStatus(
    `Placed ${templates.length} weekly class${templates.length === 1 ? "" : "es"} on the ${term.name} calendar (${begin} – ${end}) from ${sourceLabel}. Marked ${result.planned} curriculum course${result.planned === 1 ? "" : "s"} as Planned.`
  );
}

function closeImportModal() {
  const modal = document.getElementById("import-modal");
  if (modal) modal.hidden = true;
  const fileInput = document.getElementById("import-file");
  if (fileInput) fileInput.value = "";
  showSelectedFile(null);
  setImportStatus("");
}

function showSelectedFile(file) {
  const name = document.getElementById("import-file-name");
  const preview = document.getElementById("import-preview");
  const image = document.getElementById("import-preview-img");
  name.textContent = file ? file.name : "";
  if (file && file.type.startsWith("image/")) {
    image.src = URL.createObjectURL(file);
    preview.hidden = false;
  } else {
    image.removeAttribute("src");
    preview.hidden = true;
  }
}

async function handleImport() {
  const file = document.getElementById("import-file").files[0];
  if (!file) {
    setImportStatus("Choose a screenshot or schedule file first.", true);
    return;
  }
  const submit = document.getElementById("import-submit");
  if (submit) submit.disabled = true;
  setImportStatus("Importing…");

  try {
    const result = await window.ComCalImport.importScheduleFile(file, setImportStatus);
    applyImportedEvents(result.events, result.templates, result.term, file.name);
    closeImportModal();
  } catch (error) {
    setImportStatus(error.message || "Import failed.", true);
  } finally {
    if (submit) submit.disabled = false;
  }
}

const importModal = document.getElementById("import-modal");
const importDrop = document.getElementById("import-drop");
const importFile = document.getElementById("import-file");

document.getElementById("cal-import-open").addEventListener("click", () => {
  importModal.hidden = false;
  setImportStatus("");
});
document.getElementById("import-cancel").addEventListener("click", () => {
  closeImportModal();
});
importModal.addEventListener("click", (event) => {
  if (event.target === importModal) closeImportModal();
});
document.getElementById("import-submit").addEventListener("click", handleImport);
document.getElementById("import-clear").addEventListener("click", () => {
  const kept = (window.ComCalSchedule.load() || []).filter(
    (event) => event.source === "assignment" || event.source === "exam"
  );
  window.ComCalSchedule.save(kept);
  window.ComCalTopics.removeCourseTopics();
  reloadEvents();
  setImportStatus("Imported schedule cleared.");
});
importFile.addEventListener("change", () => {
  showSelectedFile(importFile.files[0]);
});
["dragenter", "dragover"].forEach((type) => {
  importDrop.addEventListener(type, (event) => {
    event.preventDefault();
    importDrop.classList.add("is-dragover");
  });
});
["dragleave", "drop"].forEach((type) => {
  importDrop.addEventListener(type, (event) => {
    event.preventDefault();
    importDrop.classList.remove("is-dragover");
  });
});
importDrop.addEventListener("drop", (event) => {
  const file = event.dataTransfer.files[0];
  if (!file) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  importFile.files = transfer.files;
  showSelectedFile(file);
});

let examImportFile = null;
let examEditorSelectedColor = window.ComCalTopics?.EXAMS_COLOR || "#E85D4C";

function setExamImportStatus(message, isError = false) {
  const status = document.getElementById("exam-import-status");
  if (!status) return;
  status.hidden = !message;
  status.textContent = message || "";
  status.classList.toggle("is-error", !!isError);
}

function setExamColorPanelOpen(open) {
  const panel = document.getElementById("exam-color-panel");
  const trigger = document.getElementById("exam-color-trigger");
  if (!panel || !trigger) return;
  panel.hidden = !open;
  trigger.setAttribute("aria-expanded", open ? "true" : "false");
}

function setExamEditorColor(color, { customOpen = false } = {}) {
  examEditorSelectedColor = normalizeHexColor(color) || examEditorSelectedColor;
  const input = document.getElementById("exam-edit-color");
  const dot = document.getElementById("exam-color-dot");
  const grid = document.getElementById("exam-color-grid");
  const custom = document.getElementById("exam-color-custom");
  if (input) input.value = examEditorSelectedColor;
  if (dot) dot.style.background = examEditorSelectedColor;
  grid?.querySelectorAll("[data-exam-color]").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.examColor.toLowerCase() === examEditorSelectedColor.toLowerCase());
  });
  if (custom) custom.hidden = !customOpen;
}

function fillExamColorGrid(selected) {
  const grid = document.getElementById("exam-color-grid");
  if (!grid) return;
  const presets = [
    "#E85D4C",
    "#E8A838",
    "#5B8DEF",
    "#6BCB77",
    "#A78BFA",
    "#F472B6",
    "#FB923C",
    "#38BDF8",
    "#F87171",
    "#071e49",
  ];
  grid.innerHTML = presets
    .map(
      (color) =>
        `<button type="button" class="topic-color-swatch${
          color.toLowerCase() === String(selected || "").toLowerCase() ? " is-selected" : ""
        }" data-exam-color="${color}" style="--topic:${color}" aria-label="${color}"></button>`
    )
    .join("");
}

function showExamSelectedFile(file) {
  examImportFile = file || null;
  const name = document.getElementById("exam-import-file-name");
  const preview = document.getElementById("exam-import-preview");
  const image = document.getElementById("exam-import-preview-img");
  if (name) name.textContent = file ? file.name : "";
  if (file && String(file.type || "").startsWith("image/") && preview && image) {
    image.src = URL.createObjectURL(file);
    preview.hidden = false;
  } else {
    image?.removeAttribute("src");
    if (preview) preview.hidden = true;
  }
}

function openExamImportModal() {
  const modal = document.getElementById("exam-import-modal");
  if (!modal) return;
  const topic = window.ComCalTopics.topicById(window.ComCalTopics.EXAMS_ID);
  const color = topic?.color || window.ComCalTopics.EXAMS_COLOR || "#E85D4C";
  fillExamColorGrid(color);
  setExamEditorColor(color, { customOpen: false });
  setExamColorPanelOpen(false);
  setExamImportStatus("");
  showExamSelectedFile(null);
  const fileInput = document.getElementById("exam-import-file");
  if (fileInput) fileInput.value = "";
  modal.hidden = false;
}

function closeExamImportModal() {
  const modal = document.getElementById("exam-import-modal");
  if (!modal) return;
  modal.hidden = true;
  setExamColorPanelOpen(false);
  examImportFile = null;
  setExamImportStatus("");
}

async function handleExamImport() {
  window.ComCalTopics.setTopicColor(window.ComCalTopics.EXAMS_ID, examEditorSelectedColor);
  renderTopics();
  renderCalendar();

  const file = examImportFile || document.getElementById("exam-import-file")?.files?.[0];
  if (!file) {
    closeExamImportModal();
    return;
  }
  const submit = document.getElementById("exam-import-submit");
  if (submit) submit.disabled = true;
  setExamImportStatus("Importing…");
  try {
    const events = await window.ComCalImport.importExamFile(file, setExamImportStatus);
    const kept = (window.ComCalSchedule.load() || []).filter((event) => event.source !== "exam");
    window.ComCalSchedule.save([...kept, ...events]);
    reloadEvents();
    setExamImportStatus(`Added ${events.length} exam${events.length === 1 ? "" : "s"} to your calendar.`);
    setTimeout(() => closeExamImportModal(), 600);
  } catch (error) {
    setExamImportStatus(error.message || "Import failed.", true);
  } finally {
    if (submit) submit.disabled = false;
  }
}

const examImportModal = document.getElementById("exam-import-modal");
const examImportDrop = document.getElementById("exam-import-drop");
const examImportFileInput = document.getElementById("exam-import-file");

document.getElementById("exam-import-cancel")?.addEventListener("click", closeExamImportModal);
examImportModal?.addEventListener("click", (event) => {
  if (event.target === examImportModal) closeExamImportModal();
});
document.getElementById("exam-import-submit")?.addEventListener("click", handleExamImport);
document.getElementById("exam-import-clear")?.addEventListener("click", () => {
  const kept = (window.ComCalSchedule.load() || []).filter((event) => event.source !== "exam");
  window.ComCalSchedule.save(kept);
  reloadEvents();
  setExamImportStatus("Exam schedule cleared.");
});
examImportFileInput?.addEventListener("change", () => {
  showExamSelectedFile(examImportFileInput.files?.[0] || null);
});
["dragenter", "dragover"].forEach((type) => {
  examImportDrop?.addEventListener(type, (event) => {
    event.preventDefault();
    examImportDrop.classList.add("is-dragover");
  });
});
["dragleave", "drop"].forEach((type) => {
  examImportDrop?.addEventListener(type, (event) => {
    event.preventDefault();
    examImportDrop.classList.remove("is-dragover");
  });
});
examImportDrop?.addEventListener("drop", (event) => {
  const file = event.dataTransfer.files[0];
  if (!file) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  if (examImportFileInput) examImportFileInput.files = transfer.files;
  showExamSelectedFile(file);
});

document.getElementById("exam-color-trigger")?.addEventListener("click", (event) => {
  event.preventDefault();
  const panel = document.getElementById("exam-color-panel");
  setExamColorPanelOpen(panel.hidden);
});
document.getElementById("exam-color-grid")?.addEventListener("click", (event) => {
  const swatch = event.target.closest("[data-exam-color]");
  if (!swatch) return;
  setExamEditorColor(swatch.dataset.examColor, { customOpen: false });
  window.ComCalTopics.setTopicColor(window.ComCalTopics.EXAMS_ID, examEditorSelectedColor);
  renderTopics();
  renderCalendar();
});
document.getElementById("exam-color-custom-btn")?.addEventListener("click", () => {
  const custom = document.getElementById("exam-color-custom");
  if (custom) custom.hidden = false;
  const input = document.getElementById("exam-edit-color");
  input?.focus();
  input?.click();
});
document.getElementById("exam-edit-color")?.addEventListener("input", (event) => {
  setExamEditorColor(event.target.value, { customOpen: true });
});
document.getElementById("exam-edit-color")?.addEventListener("change", () => {
  window.ComCalTopics.setTopicColor(window.ComCalTopics.EXAMS_ID, examEditorSelectedColor);
  renderTopics();
  renderCalendar();
});

function pad(value) {
  return String(value).padStart(2, "0");
}

function toInputDate(iso) {
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toInputTime(iso) {
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDateAndTime(dateValue, timeValue) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = (timeValue || "00:00").split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function miniMonthHtml() {
  const today = startOfDay(new Date());
  const selected = startOfDay(calState.cursor);
  const monthStart = new Date(calState.miniMonth.getFullYear(), calState.miniMonth.getMonth(), 1);
  const days = monthGrid(monthStart);
  const weekStart = startOfWeek(selected);
  const weekEnd = addDays(weekStart, 6);
  const weeks = [];
  for (let i = 0; i < 6; i += 1) weeks.push(days.slice(i * 7, i * 7 + 7));

  const weekRows = weeks
    .map((week) => {
      const currentWeek = week[0] <= weekEnd && week[6] >= weekStart;
      return `<div class="mini-week${currentWeek ? " is-current" : ""}">
        ${week
          .map((day) => {
            const outside = day.getMonth() !== monthStart.getMonth();
            const isToday = isSameDay(day, today);
            const isSelected = isSameDay(day, selected);
            const classes = [
              "mini-day",
              outside ? "is-outside" : "",
              isToday ? "is-today" : "",
              isSelected && !isToday ? "is-selected" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return `<button class="${classes}" type="button" data-mini-date="${toDateKey(day)}" aria-label="${day.toDateString()}">${day.getDate()}</button>`;
          })
          .join("")}
      </div>`;
    })
    .join("");

  return `<div class="mini-cal">
    <div class="mini-cal-head">
      <p class="mini-cal-label">${MONTHS[monthStart.getMonth()]} ${monthStart.getFullYear()}</p>
      <div class="mini-cal-nav">
        <button type="button" id="mini-prev" aria-label="Previous month">
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 8.2 6 4.2 9 8.2"/></svg>
        </button>
        <button type="button" id="mini-next" aria-label="Next month">
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3.8 6 7.8 9 3.8"/></svg>
        </button>
      </div>
    </div>
    <div class="mini-dows">${["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((name) => `<span>${name}</span>`).join("")}</div>
    <div class="mini-grid">${weekRows}</div>
  </div>`;
}

function topicItemHtml(topic) {
  const canEdit = topic.type !== "sessional";
  return `<li class="cal-topic${topic.visible === false ? " is-off" : ""}">
    <button type="button" class="cal-topic-swatch-btn" data-topic-toggle="${escapeCal(topic.id)}" aria-pressed="${topic.visible !== false}" aria-label="Toggle ${escapeCal(topic.name)}" style="--topic:${topic.color}">
      <span class="cal-topic-swatch"></span>
    </button>
    <button type="button" class="cal-topic-name-btn" data-topic-edit="${escapeCal(topic.id)}" ${canEdit ? "" : "disabled"}>
      <span class="cal-topic-name">${escapeCal(topic.name)}</span>
    </button>
    ${
      topic.type === "custom"
        ? `<button type="button" class="cal-topic-remove" data-topic-remove="${escapeCal(topic.id)}" aria-label="Remove ${escapeCal(topic.name)}">×</button>`
        : ""
    }
  </li>`;
}

function renderTopics() {
  const root = document.getElementById("cal-topics");
  if (!root) return;
  const topics = window.ComCalTopics.getTopics();
  const sessional = topics.filter((topic) => topic.type === "sessional");
  const assignments = topics.filter((topic) => topic.type === "assignments");
  const exams = topics.filter((topic) => topic.type === "exams");
  const courses = topics.filter((topic) => topic.type === "course");
  const custom = topics.filter((topic) => topic.type === "custom" || topic.type === "other");

  root.innerHTML = `
    ${miniMonthHtml()}
    <div class="cal-topic-groups">
      <section class="cal-topic-group">
        <p class="cal-topics-label">Isabelle Barbour</p>
        <ul class="cal-topic-list">
          ${[...sessional, ...assignments, ...exams, ...courses, ...custom].map(topicItemHtml).join("")}
        </ul>
        <button type="button" class="cal-topic-add" id="cal-topic-add">
          <span class="cal-topic-add-plus" aria-hidden="true">+</span>
          Add calendar
        </button>
      </section>
    </div>
  `;
}

function applyTopicsCollapsed() {
  const main = document.querySelector(".cal-main");
  const toggle = document.getElementById("cal-topics-toggle");
  const collapsed = !!calState.topicsCollapsed;
  main?.classList.toggle("is-topics-collapsed", collapsed);
  if (toggle) {
    toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    toggle.setAttribute(
      "aria-label",
      collapsed ? "Show calendars sidebar" : "Hide calendars sidebar"
    );
    toggle.title = collapsed ? "Show calendars sidebar" : "Hide calendars sidebar";
  }
}

function toggleTopicsCollapsed() {
  calState.topicsCollapsed = !calState.topicsCollapsed;
  localStorage.setItem(TOPICS_COLLAPSE_KEY, calState.topicsCollapsed ? "1" : "0");
  applyTopicsCollapsed();
}

const topicsRoot = document.getElementById("cal-topics");
document.getElementById("cal-topics-toggle")?.addEventListener("click", toggleTopicsCollapsed);
applyTopicsCollapsed();
topicsRoot.addEventListener("click", (event) => {
  const miniDate = event.target.closest("[data-mini-date]");
  if (miniDate) {
    calState.cursor = fromDateKey(miniDate.dataset.miniDate);
    syncMiniMonth();
    renderTopics();
    renderCalendar();
    return;
  }
  if (event.target.closest("#mini-prev")) {
    const month = calState.miniMonth;
    calState.miniMonth = new Date(month.getFullYear(), month.getMonth() - 1, 1);
    renderTopics();
    return;
  }
  if (event.target.closest("#mini-next")) {
    const month = calState.miniMonth;
    calState.miniMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    renderTopics();
    return;
  }
  if (event.target.closest("#cal-topic-add")) {
    openTopicEditor(null);
    return;
  }
  const toggle = event.target.closest("[data-topic-toggle]");
  if (toggle) {
    const on = toggle.getAttribute("aria-pressed") === "true";
    window.ComCalTopics.setTopicVisible(toggle.dataset.topicToggle, !on);
    renderTopics();
    renderCalendar();
    refreshHomeCards();
    return;
  }
  const edit = event.target.closest("[data-topic-edit]");
  if (edit && !edit.disabled) {
    const topic = window.ComCalTopics.topicById(edit.dataset.topicEdit);
    if (topic?.type === "exams") {
      openExamImportModal();
      return;
    }
    openTopicEditor(edit.dataset.topicEdit);
    return;
  }
  const remove = event.target.closest("[data-topic-remove]");
  if (!remove) return;
  window.ComCalTopics.removeTopic(remove.dataset.topicRemove);
  reloadEvents();
});

calBody.addEventListener("click", (event) => {
  const eventEl = event.target.closest("[data-event-id]");
  if (eventEl) {
    event.preventDefault();
    event.stopPropagation();
    openEventEditor(eventEl.dataset.eventId);
    return;
  }
  const more = event.target.closest(".cal-chip.is-more");
  const cell = event.target.closest(".cal-cell[data-date]");
  if (more && cell) {
    calState.cursor = fromDateKey(cell.dataset.date);
    setView("day");
    return;
  }
  if (cell && calState.view === "month") {
    calState.cursor = fromDateKey(cell.dataset.date);
    setView("day");
  }
});

const eventModal = document.getElementById("event-modal");
let editingEventId = null;

function setTopicPickerValue(topicId) {
  const topics = window.ComCalTopics.getTopics();
  const topic = topics.find((item) => item.id === topicId) || topics[0];
  const hidden = document.getElementById("event-topic");
  const swatch = document.getElementById("event-topic-swatch");
  const label = document.getElementById("event-topic-label");
  if (!topic || !hidden) return;
  hidden.value = topic.id;
  swatch.style.background = topic.color;
  label.textContent = topic.name;
}

function closeTopicPicker() {
  const menu = document.getElementById("event-topic-menu");
  const trigger = document.getElementById("event-topic-trigger");
  if (!menu || !trigger) return;
  menu.hidden = true;
  trigger.setAttribute("aria-expanded", "false");
}

function fillTopicSelect(selectedId) {
  const menu = document.getElementById("event-topic-menu");
  const topics = window.ComCalTopics.getTopics();
  menu.innerHTML = topics
    .map(
      (topic) =>
        `<li role="option" class="topic-picker-option${topic.id === selectedId ? " is-selected" : ""}" data-topic-id="${escapeCal(topic.id)}" style="--topic:${topic.color}">
          <span class="topic-picker-option-swatch"></span>
          <span class="topic-picker-option-name">${escapeCal(topic.name)}</span>
          ${topic.id === selectedId ? `<span class="topic-picker-check" aria-hidden="true">✓</span>` : ""}
        </li>`
    )
    .join("");
  setTopicPickerValue(selectedId || topics[0]?.id);
  closeTopicPicker();
}

document.getElementById("event-topic-trigger")?.addEventListener("click", (event) => {
  event.preventDefault();
  const menu = document.getElementById("event-topic-menu");
  const trigger = document.getElementById("event-topic-trigger");
  const open = menu.hidden;
  menu.hidden = !open;
  trigger.setAttribute("aria-expanded", open ? "true" : "false");
});

document.getElementById("event-topic-menu")?.addEventListener("click", (event) => {
  const option = event.target.closest("[data-topic-id]");
  if (!option) return;
  fillTopicSelect(option.dataset.topicId);
});

document.addEventListener("click", (event) => {
  if (!event.target.closest("#event-topic-picker")) closeTopicPicker();
  if (!event.target.closest("#event-repeat-wrap")) closeRepeatMenu();
});

function isClassEvent(event) {
  return event.source === "schedule" || String(event.uid || "").startsWith("class-");
}

function weekdayLongName(dateLike) {
  if (typeof dateLike === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateLike)) {
    return fromDateKey(dateLike).toLocaleDateString("en-US", { weekday: "long" });
  }
  return new Date(dateLike).toLocaleDateString("en-US", { weekday: "long" });
}

function defaultRepeatForEvent(event) {
  if (event.repeat) return event.repeat;
  if (isClassEvent(event)) return "weekly";
  return "none";
}

function repeatOptionsForDate(dateLike) {
  const weekday = weekdayLongName(dateLike || new Date());
  return [
    { id: "none", label: "Does not repeat" },
    { id: "daily", label: "Daily" },
    { id: "weekly", label: `Weekly on ${weekday}` },
    { id: "weekdays", label: "Every weekday (Monday to Friday)" },
  ];
}

function fillRepeatMenu(value, dateLike, { open = false } = {}) {
  const options = repeatOptionsForDate(dateLike || document.getElementById("event-date").value);
  const selected = options.find((option) => option.id === value) || options[0];
  document.getElementById("event-repeat").value = selected.id;
  document.getElementById("event-repeat-label").textContent = selected.label;
  const menu = document.getElementById("event-repeat-menu");
  menu.innerHTML = options
    .map(
      (option) =>
        `<li class="event-repeat-option${option.id === selected.id ? " is-selected" : ""}" role="option" data-repeat="${option.id}">${escapeCal(option.label)}</li>`
    )
    .join("");
  menu.hidden = !open;
  document.getElementById("event-repeat-trigger").setAttribute("aria-expanded", open ? "true" : "false");
}

function setRepeatValue(value, dateLike) {
  fillRepeatMenu(value, dateLike, { open: false });
}

function closeRepeatMenu() {
  const menu = document.getElementById("event-repeat-menu");
  const trigger = document.getElementById("event-repeat-trigger");
  if (!menu || !trigger) return;
  menu.hidden = true;
  trigger.setAttribute("aria-expanded", "false");
}

function openEventEditor(eventId) {
  const item = calState.events.find((event) => event.id === eventId);
  if (!item) return;
  editingEventId = eventId;
  document.getElementById("event-title").value = item.title || "";
  document.getElementById("event-date").value = toInputDate(item.start);
  document.getElementById("event-allday").checked = Boolean(item.allDay);
  document.getElementById("event-start").value = item.allDay ? "00:00" : toInputTime(item.start);
  document.getElementById("event-end").value = item.allDay ? "23:59" : toInputTime(item.end);
  document.getElementById("event-location").value = item.location || "";
  document.getElementById("event-professor").value = item.professor || "";
  document.getElementById("event-description").value = item.description || "";
  document.getElementById("event-times").hidden = Boolean(item.allDay);
  document.getElementById("event-error").hidden = true;
  const seriesCount = calState.events.filter((event) => event.uid && event.uid === item.uid).length;
  const seriesWrap = document.getElementById("event-series-wrap");
  seriesWrap.hidden = item.source === "academic" || seriesCount < 2;
  document.getElementById("event-series").checked = seriesCount > 1 && isClassEvent(item);
  setRepeatValue(defaultRepeatForEvent(item), item.start);
  fillTopicSelect(item.topicId);
  eventModal.hidden = false;
  document.getElementById("event-title").focus();
}

function closeEventEditor() {
  editingEventId = null;
  closeTopicPicker();
  closeRepeatMenu();
  eventModal.hidden = true;
}

const topicEditModal = document.getElementById("topic-edit-modal");
let editingTopicId = null;
let topicEditorMode = "edit";
let topicEditorSelectedColor = "#4285F4";

const TOPIC_COLOR_PRESETS = [
  "#AD1457",
  "#D81B60",
  "#D50000",
  "#E67C73",
  "#F4511E",
  "#EF6C00",
  "#F09300",
  "#F6BF26",
  "#E4C441",
  "#C0CA33",
  "#7CB342",
  "#33B679",
  "#0B8043",
  "#009688",
  "#039BE5",
  "#4285F4",
  "#3F51B5",
  "#7986CB",
  "#B39DDB",
  "#9E69AF",
  "#8E24AA",
  "#795548",
  "#616161",
  "#A79B8E",
];

function normalizeHexColor(value) {
  const raw = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toUpperCase();
  return "#4285F4";
}

function nextUnusedTopicColor() {
  const used = new Set(window.ComCalTopics.getTopics().map((topic) => topic.color.toLowerCase()));
  return TOPIC_COLOR_PRESETS.find((color) => !used.has(color.toLowerCase())) || TOPIC_COLOR_PRESETS[0];
}

function setTopicEditorColor(color, { customOpen = false } = {}) {
  const hex = normalizeHexColor(color);
  topicEditorSelectedColor = hex;
  const input = document.getElementById("topic-edit-color");
  const dot = document.getElementById("topic-color-dot");
  const grid = document.getElementById("topic-color-grid");
  const custom = document.getElementById("topic-color-custom");
  input.value = hex;
  dot.style.setProperty("--topic", hex);
  dot.style.background = hex;
  grid.querySelectorAll("[data-topic-color]").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.topicColor.toLowerCase() === hex.toLowerCase());
  });
  const isPreset = TOPIC_COLOR_PRESETS.some((preset) => preset.toLowerCase() === hex.toLowerCase());
  custom.hidden = !(customOpen || !isPreset);
}

function fillTopicColorGrid(selected) {
  const grid = document.getElementById("topic-color-grid");
  grid.innerHTML = TOPIC_COLOR_PRESETS.map(
    (color) =>
      `<button type="button" class="topic-color-swatch${
        color.toLowerCase() === normalizeHexColor(selected).toLowerCase() ? " is-selected" : ""
      }" data-topic-color="${color}" style="--topic:${color}" aria-label="${color}"></button>`
  ).join("");
}

function setTopicColorPanelOpen(open) {
  const panel = document.getElementById("topic-color-panel");
  const trigger = document.getElementById("topic-color-trigger");
  panel.hidden = !open;
  trigger.setAttribute("aria-expanded", open ? "true" : "false");
}

function openTopicEditor(topicId) {
  const isCreate = !topicId;
  topicEditorMode = isCreate ? "create" : "edit";
  editingTopicId = topicId || null;
  const topic = isCreate ? null : window.ComCalTopics.topicById(topicId);
  if (!isCreate && (!topic || topic.type === "sessional")) return;

  const nameLocked = !isCreate && topic.type === "assignments";
  if (!isCreate && topic.type === "exams") {
    openExamImportModal();
    return;
  }
  const color = isCreate ? nextUnusedTopicColor() : topic.color;
  document.getElementById("topic-edit-heading").textContent = isCreate
    ? "Add calendar"
    : `Edit ${topic.name}`;
  const nameInput = document.getElementById("topic-edit-name");
  nameInput.value = isCreate ? "" : topic.name;
  nameInput.readOnly = nameLocked;
  nameInput.disabled = nameLocked;
  document.getElementById("topic-edit-error").hidden = true;
  document.getElementById("topic-edit-delete").hidden = isCreate || topic.type !== "custom";
  fillTopicColorGrid(color);
  setTopicEditorColor(color, { customOpen: false });
  setTopicColorPanelOpen(false);
  topicEditModal.hidden = false;
  if (nameLocked) {
    document.getElementById("topic-color-trigger")?.focus();
  } else {
    nameInput.focus();
    if (!isCreate) nameInput.select();
  }
}

function closeTopicEditor() {
  editingTopicId = null;
  topicEditorMode = "edit";
  const nameInput = document.getElementById("topic-edit-name");
  if (nameInput) {
    nameInput.readOnly = false;
    nameInput.disabled = false;
  }
  setTopicColorPanelOpen(false);
  topicEditModal.hidden = true;
}

document.getElementById("topic-edit-cancel")?.addEventListener("click", closeTopicEditor);
topicEditModal?.addEventListener("click", (event) => {
  if (event.target === topicEditModal) closeTopicEditor();
});

document.getElementById("topic-color-trigger")?.addEventListener("click", (event) => {
  event.preventDefault();
  const panel = document.getElementById("topic-color-panel");
  setTopicColorPanelOpen(panel.hidden);
});

document.getElementById("topic-color-grid")?.addEventListener("click", (event) => {
  const swatch = event.target.closest("[data-topic-color]");
  if (!swatch) return;
  setTopicEditorColor(swatch.dataset.topicColor, { customOpen: false });
});

document.getElementById("topic-color-custom-btn")?.addEventListener("click", () => {
  const custom = document.getElementById("topic-color-custom");
  custom.hidden = false;
  const input = document.getElementById("topic-edit-color");
  input.focus();
  input.click();
});

document.getElementById("topic-edit-color")?.addEventListener("input", (event) => {
  setTopicEditorColor(event.target.value, { customOpen: true });
});

document.getElementById("topic-edit-save")?.addEventListener("click", () => {
  const name = document.getElementById("topic-edit-name").value.trim();
  const color = normalizeHexColor(topicEditorSelectedColor);
  const error = document.getElementById("topic-edit-error");
  const editing = editingTopicId ? window.ComCalTopics.topicById(editingTopicId) : null;
  const nameLocked = editing?.type === "assignments";
  if (!nameLocked && !name) {
    error.hidden = false;
    error.textContent = "Enter a calendar name.";
    return;
  }
  if (topicEditorMode === "create") {
    try {
      window.ComCalTopics.addTopic(name, color);
    } catch (err) {
      error.hidden = false;
      error.textContent = err.message || "Could not add calendar.";
      return;
    }
  } else {
    if (!editingTopicId) return;
    if (!nameLocked) window.ComCalTopics.renameTopic(editingTopicId, name);
    window.ComCalTopics.setTopicColor(editingTopicId, color);
  }
  closeTopicEditor();
  reloadEvents();
});

document.getElementById("topic-edit-delete")?.addEventListener("click", () => {
  if (!editingTopicId) return;
  window.ComCalTopics.removeTopic(editingTopicId);
  closeTopicEditor();
  reloadEvents();
});

document.getElementById("event-repeat-trigger")?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  const menu = document.getElementById("event-repeat-menu");
  const willOpen = menu.hidden;
  fillRepeatMenu(
    document.getElementById("event-repeat").value,
    document.getElementById("event-date").value,
    { open: willOpen }
  );
});

document.getElementById("event-repeat-menu")?.addEventListener("click", (event) => {
  const option = event.target.closest("[data-repeat]");
  if (!option) return;
  setRepeatValue(option.dataset.repeat, document.getElementById("event-date").value);
});

document.getElementById("event-date")?.addEventListener("change", () => {
  setRepeatValue(document.getElementById("event-repeat").value, document.getElementById("event-date").value);
});

document.getElementById("event-allday").addEventListener("change", (event) => {
  document.getElementById("event-times").hidden = event.target.checked;
});

document.getElementById("event-close")?.addEventListener("click", closeEventEditor);
eventModal.addEventListener("click", (event) => {
  if (event.target === eventModal) closeEventEditor();
});

document.getElementById("event-save").addEventListener("click", () => {
  const item = calState.events.find((event) => event.id === editingEventId);
  if (!item) return;
  const title = document.getElementById("event-title").value.trim();
  const dateValue = document.getElementById("event-date").value;
  const allDay = document.getElementById("event-allday").checked;
  const error = document.getElementById("event-error");
  if (!title || !dateValue) {
    error.hidden = false;
    error.textContent = "Title and date are required.";
    return;
  }
  let start;
  let end;
  if (allDay) {
    start = fromDateAndTime(dateValue, "00:00");
    end = fromDateAndTime(dateValue, "00:00");
    end.setDate(end.getDate() + 1);
  } else {
    start = fromDateAndTime(dateValue, document.getElementById("event-start").value || "09:00");
    end = fromDateAndTime(dateValue, document.getElementById("event-end").value || "10:00");
    if (end <= start) end = new Date(start.getTime() + 60 * 60 * 1000);
  }
  const seriesVisible = !document.getElementById("event-series-wrap").hidden;
  const applySeries = seriesVisible
    ? document.getElementById("event-series").checked
    : isClassEvent(item) && document.getElementById("event-repeat").value === "weekly";
  window.ComCalTopics.saveEventPatch(
    item,
    {
      title,
      description: document.getElementById("event-description").value.trim(),
      location: document.getElementById("event-location").value.trim(),
      professor: document.getElementById("event-professor").value.trim(),
      topicId: document.getElementById("event-topic").value,
      repeat: document.getElementById("event-repeat").value,
      allDay,
      start: start.toISOString(),
      end: end.toISOString(),
    },
    applySeries
  );
  closeEventEditor();
  reloadEvents();
});

document.getElementById("event-delete").addEventListener("click", () => {
  const item = calState.events.find((event) => event.id === editingEventId);
  if (!item) return;
  window.ComCalTopics.deleteEvent(item, document.getElementById("event-series").checked);
  closeEventEditor();
  reloadEvents();
});

reloadEvents();
setInterval(() => {
  if (calState.view !== "month") renderCalendar();
}, 60000);

window.ComCalCalendar = {
  reload: reloadEvents,
};
