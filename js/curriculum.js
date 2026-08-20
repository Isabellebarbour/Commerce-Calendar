const CURR_STORAGE = "comcal-curriculum";

const CURRICULUM = {
  1: {
    label: "Year 1",
    note: "For students starting Fall 2026 and after. COMM 121 is taken in Year 1; COMM 112 moves to Year 2.",
    totalUnits: 33,
    items: [
      {
        id: "y1-comm101",
        type: "course",
        code: "COMM 101",
        name: "Introduction to Commerce",
        units: 6,
      },
      {
        id: "y1-comm111",
        type: "course",
        code: "COMM 111",
        name: "Introduction To Financial Accounting",
        units: 3,
      },
      {
        id: "y1-comm121",
        type: "course",
        code: "COMM 121",
        name: "Introduction To Finance (for students starting Fall 2026 and after)",
        units: 3,
      },
      {
        id: "y1-comm151",
        type: "course",
        code: "COMM 151",
        name: "Organizational Behaviour",
        units: 3,
      },
      {
        id: "y1-comm161",
        type: "course",
        code: "COMM 161",
        name: "Introduction To Mathematical Analysis",
        units: 3,
      },
      {
        id: "y1-comm162",
        type: "course",
        code: "COMM 162",
        name: "Managerial Statistics",
        units: 3,
      },
      {
        id: "y1-comm171",
        type: "course",
        code: "COMM 171",
        name: "Principles of Economics for Business",
        units: 3,
      },
      {
        id: "y1-comm172",
        type: "course",
        code: "COMM 172",
        name: "Managerial Economics",
        units: 3,
      },
      {
        id: "y1-nc",
        type: "elective",
        name: "Non-Commerce Electives",
        units: 6,
      },
    ],
  },
  2: {
    label: "Year 2",
    note: "For students starting Fall 2026 and after. COMM 112 is taken in Year 2.",
    totalUnits: 33,
    items: [
      {
        id: "y2-comm112",
        type: "course",
        code: "COMM 112",
        name: "Introduction To Management Accounting (for students starting Fall 2026 and after)",
        units: 3,
      },
      {
        id: "y2-comm122",
        type: "course",
        code: "COMM 122",
        name: "Finance II",
        units: 3,
      },
      {
        id: "y2-comm131",
        type: "course",
        code: "COMM 131",
        name: "Introduction To Marketing",
        units: 3,
      },
      {
        id: "y2-comm132",
        type: "course",
        code: "COMM 132",
        name: "Marketing II",
        units: 3,
      },
      {
        id: "y2-comm163",
        type: "course",
        code: "COMM 163",
        name: "Business Decision Models I",
        units: 3,
      },
      {
        id: "y2-comm173",
        type: "course",
        code: "COMM 173",
        name: "Introduction to International Business",
        units: 3,
      },
      {
        id: "y2-comm181",
        type: "course",
        code: "COMM 181",
        name: "Introduction to Human Resources Management",
        units: 3,
      },
      {
        id: "y2-comm190",
        type: "course",
        code: "COMM 190",
        name: "Introduction to Digital Business and Technologies",
        units: 3,
      },
      {
        id: "y2-nc",
        type: "elective",
        name: "Non-Commerce Electives",
        units: 6,
      },
      {
        id: "y2-any",
        type: "elective",
        name: "Commerce or Non-Commerce Electives",
        units: 3,
      },
    ],
  },
  3: {
    label: "Year 3",
    note: "COMM 341 and COMM 306 are typically taken in Year 3. Elective units from the Year 3–4 block are split across these two years.",
    totalUnits: 30,
    items: [
      {
        id: "y3-comm341",
        type: "course",
        code: "COMM 341",
        name: "Operations Management",
        units: 3,
      },
      {
        id: "y3-comm306",
        type: "course",
        code: "COMM 306",
        name: "Business for Good: An Introduction to Impact-Driven Leadership",
        units: 3,
      },
      {
        id: "y3-comm-el",
        type: "elective",
        name: "Commerce Electives",
        units: 15,
      },
      {
        id: "y3-nc",
        type: "elective",
        name: "Non-Commerce Electives",
        units: 6,
      },
      {
        id: "y3-any",
        type: "elective",
        name: "Commerce or Non-Commerce Electives",
        units: 3,
      },
    ],
  },
  4: {
    label: "Year 4",
    note: "COMM 401 is typically taken in Year 4. Remaining Year 3–4 elective units are listed here.",
    totalUnits: 30,
    items: [
      {
        id: "y4-comm401",
        type: "course",
        code: "COMM 401",
        name: "Business and Corporate Strategy",
        units: 3,
      },
      {
        id: "y4-comm-el",
        type: "elective",
        name: "Commerce Electives",
        units: 15,
      },
      {
        id: "y4-nc",
        type: "elective",
        name: "Non-Commerce Electives",
        units: 6,
      },
      {
        id: "y4-any",
        type: "elective",
        name: "Commerce or Non-Commerce Electives",
        units: 6,
      },
    ],
  },
};

const STATUS_OPTIONS = [
  { value: "incomplete", label: "Incomplete" },
  { value: "planned", label: "Planned" },
  { value: "complete", label: "Complete" },
];

const currBody = document.getElementById("curr-body");
const currSummary = document.getElementById("curr-summary");
const yearButtons = document.querySelectorAll("[data-curr-year]");

let currYear = 1;
let currState = loadCurriculum();

function loadCurriculum() {
  try {
    return JSON.parse(localStorage.getItem(CURR_STORAGE)) || {};
  } catch {
    return {};
  }
}

function saveCurriculum() {
  localStorage.setItem(CURR_STORAGE, JSON.stringify(currState));
}

function slotCount(units) {
  return Math.round(units / 3);
}

function formatUnits(units) {
  return `${units.toFixed(2)} units`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getEntry(id) {
  return currState[id] || { status: "incomplete", code: "", name: "" };
}

function parseCourseText(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return { code: "", name: "" };
  const match = trimmed.match(/^([A-Za-z]{3,4})\s*[-]?\s*(\d{2,3}[A-Za-z]?)\s*(.*)$/);
  if (match) {
    return {
      code: `${match[1].toUpperCase()} ${match[2].toUpperCase()}`,
      name: match[3].trim(),
    };
  }
  return { code: "", name: trimmed };
}

function splitCourseValues(code, name, title) {
  const parsedTitle = parseCourseText(title);
  const parsedCode = parseCourseText(code);
  const parsedName = parseCourseText(name);
  const nextCode = parsedCode.code || String(code || "").trim() || parsedName.code || parsedTitle.code;
  const nextName =
    String(name || "").trim() && !parsedName.code
      ? String(name).trim()
      : parsedCode.name || parsedName.name || parsedTitle.name;
  return {
    code: nextCode.replace(/\s+/g, " ").toUpperCase(),
    name: nextName,
  };
}

function getElectiveEntry(id) {
  const entry = getEntry(id);
  const split = splitCourseValues(entry.code, entry.name, entry.title);
  return { ...entry, code: split.code, name: split.name };
}

function electiveFilled(entry) {
  return Boolean(String(entry.code || "").trim() && String(entry.name || "").trim());
}

let editingElectiveId = null;

function setEntry(id, patch) {
  currState[id] = { ...getEntry(id), ...patch };
  saveCurriculum();
  updateSummary();
  window.ComCalProfile?.render();
}

function currStatusSelect(id, status) {
  const options = STATUS_OPTIONS.map(
    (option) =>
      `<option value="${option.value}" ${option.value === status ? "selected" : ""}>${option.label}</option>`
  ).join("");

  return `<select class="curr-status" data-status="${status}" data-id="${id}" aria-label="Course status">${options}</select>`;
}

function allEntries() {
  const entries = [];
  Object.values(CURRICULUM).forEach((year) => {
    year.items.forEach((item) => {
      if (item.type === "course") {
        entries.push(getEntry(item.id));
      } else {
        for (let i = 0; i < slotCount(item.units); i += 1) {
          entries.push(getEntry(`${item.id}-${i}`));
        }
      }
    });
  });
  return entries;
}

function updateSummary() {
  const entries = allEntries();
  const complete = entries.filter((entry) => entry.status === "complete").length;
  const planned = entries.filter((entry) => entry.status === "planned").length;
  const incomplete = entries.length - complete - planned;
  currSummary.textContent = `${complete} complete · ${planned} planned · ${incomplete} incomplete`;
}

function courseRowHtml(code, name, units, statusHtml) {
  return `<div class="curr-row">
    <div class="curr-code">${escapeHtml(code)}</div>
    <div class="curr-name">${escapeHtml(name)}</div>
    <div class="curr-units">${formatUnits(units)}</div>
    ${statusHtml}
  </div>`;
}

function commitElective(id) {
  const row = currBody.querySelector(`.curr-elective[data-elective-id="${id}"]`);
  if (!row) return false;
  const rawCode = row.querySelector('[data-field="code"]')?.value || "";
  const rawName = row.querySelector('[data-field="name"]')?.value || "";
  const split = splitCourseValues(rawCode, rawName, "");
  setEntry(id, { code: split.code, name: split.name, title: "" });
  if (split.code && split.name) {
    editingElectiveId = null;
    renderYear();
    return true;
  }
  return false;
}

function renderElectiveRow(id, index, groupName) {
  const entry = getElectiveEntry(id);
  const status = currStatusSelect(id, entry.status);

  if (electiveFilled(entry) && editingElectiveId !== id) {
    return `<div class="curr-row">
      <div class="curr-code" data-edit-elective="${id}" role="button" tabindex="0">${escapeHtml(entry.code)}</div>
      <div class="curr-name" data-edit-elective="${id}" role="button" tabindex="0">${escapeHtml(entry.name)}</div>
      <div class="curr-units">${formatUnits(3)}</div>
      ${status}
    </div>`;
  }

  return `<div class="curr-row curr-elective" data-elective-id="${id}">
    <input
      class="curr-input curr-input-code"
      data-id="${id}"
      data-field="code"
      type="text"
      value="${escapeHtml(entry.code || "")}"
      placeholder="Course code"
      aria-label="${groupName} course ${index + 1} code"
    />
    <input
      class="curr-input curr-input-name"
      data-id="${id}"
      data-field="name"
      type="text"
      value="${escapeHtml(entry.name || "")}"
      placeholder="Course title"
      aria-label="${groupName} course ${index + 1} title"
    />
    <div class="curr-units">${formatUnits(3)}</div>
    ${status}
  </div>`;
}

function renderYear() {
  const year = CURRICULUM[currYear];
  const rows = year.items
    .map((item) => {
      if (item.type === "course") {
        const entry = getEntry(item.id);
        return courseRowHtml(item.code, item.name, item.units, currStatusSelect(item.id, entry.status));
      }

      const slots = slotCount(item.units);
      const group = `<div class="curr-row is-group">
        <div>${item.name}</div>
        <div class="curr-units">${formatUnits(item.units)}</div>
      </div>`;

      const inputs = Array.from({ length: slots }, (_, index) =>
        renderElectiveRow(`${item.id}-${index}`, index, item.name)
      ).join("");

      return group + inputs;
    })
    .join("");

  currBody.innerHTML = `
    ${year.note ? `<p class="curr-note">${year.note}</p>` : ""}
    <div class="curr-list">${rows}</div>
    <div class="curr-total">
      <span>Total Units</span>
      <span>${year.totalUnits.toFixed(2)}</span>
    </div>
  `;

  currBody.querySelectorAll(".curr-status").forEach((select) => {
    select.addEventListener("change", () => {
      setEntry(select.dataset.id, { status: select.value });
      select.dataset.status = select.value;
    });
  });

  currBody.querySelectorAll(".curr-input").forEach((input) => {
    input.addEventListener("input", () => {
      const field = input.dataset.field;
      const value = field === "code" ? input.value.toUpperCase() : input.value;
      if (field === "code") input.value = value;
      setEntry(input.dataset.id, { [field]: value });
    });
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const id = input.dataset.id;
      if (input.dataset.field === "code") {
        const nameInput = currBody.querySelector(`.curr-input-name[data-id="${id}"]`);
        if (!(nameInput?.value || "").trim()) {
          nameInput?.focus();
          return;
        }
      }
      commitElective(id);
    });
  });

  currBody.querySelectorAll(".curr-elective").forEach((row) => {
    row.addEventListener("focusout", (event) => {
      if (row.contains(event.relatedTarget)) return;
      commitElective(row.dataset.electiveId);
    });
  });

  currBody.querySelectorAll("[data-edit-elective]").forEach((el) => {
    const openEdit = () => {
      editingElectiveId = el.dataset.editElective;
      renderYear();
      const codeInput = currBody.querySelector(`.curr-input-code[data-id="${editingElectiveId}"]`);
      codeInput?.focus();
    };
    el.addEventListener("click", openEdit);
    el.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openEdit();
      }
    });
  });
}

yearButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currYear = Number(button.dataset.currYear);
    yearButtons.forEach((item) => {
      item.classList.toggle("is-active", item === button);
    });
    renderYear();
  });
});

function markCurriculumFromSchedule(events) {
  currState = loadCurriculum();
  const required = [];
  const electives = [];

  Object.values(CURRICULUM).forEach((year) => {
    year.items.forEach((item) => {
      if (item.type === "course") required.push(item);
      else electives.push(item);
    });
  });

  const codes = new Set();
  events.forEach((event) => {
    window.ComCalSchedule.extractCourseCodes(`${event.title} ${event.description}`).forEach((code) =>
      codes.add(code)
    );
  });

  let planned = 0;

  codes.forEach((code) => {
    const course = required.find((item) => item.code === code);
    if (course) {
      const entry = getEntry(course.id);
      if (entry.status === "incomplete") {
        setEntry(course.id, { status: "planned" });
        planned += 1;
      }
      return;
    }

    const alreadyFilled = electives.some((item) =>
      Array.from({ length: slotCount(item.units) }, (_, index) => getElectiveEntry(`${item.id}-${index}`)).some(
        (entry) => (entry.code || "").toUpperCase() === code
      )
    );
    if (alreadyFilled) return;

    const slot = electives
      .flatMap((item) =>
        Array.from({ length: slotCount(item.units) }, (_, index) => ({
          id: `${item.id}-${index}`,
        }))
      )
      .find((item) => !electiveFilled(getElectiveEntry(item.id)));

    if (slot) {
      setEntry(slot.id, { status: "planned", code, name: "" });
      planned += 1;
    }
  });

  renderYear();
  updateSummary();
  return { courses: codes.size, planned };
}

function getProgress() {
  currState = loadCurriculum();
  const years = [1, 2, 3, 4].map((yearNum) => {
    const year = CURRICULUM[yearNum];
    const entries = [];
    year.items.forEach((item) => {
      if (item.type === "course") entries.push(getEntry(item.id));
      else {
        for (let i = 0; i < slotCount(item.units); i += 1) {
          entries.push(getElectiveEntry(`${item.id}-${i}`));
        }
      }
    });
    const complete = entries.filter((entry) => entry.status === "complete").length;
    return {
      year: yearNum,
      label: year.label,
      complete,
      total: entries.length,
      done: entries.length > 0 && complete === entries.length,
    };
  });
  const total = years.reduce((sum, year) => sum + year.total, 0);
  const complete = years.reduce((sum, year) => sum + year.complete, 0);
  const percent = total ? Math.round((complete / total) * 100) : 0;
  return { percent, complete, total, years };
}

function coursesForYear(yearNum) {
  currState = loadCurriculum();
  const year = CURRICULUM[yearNum];
  if (!year) return [];
  const courses = [];
  year.items.forEach((item) => {
    if (item.type === "course") {
      courses.push({ code: item.code, name: item.name });
      return;
    }
    for (let i = 0; i < slotCount(item.units); i += 1) {
      const entry = getElectiveEntry(`${item.id}-${i}`);
      if (String(entry.code || "").trim()) {
        courses.push({
          code: entry.code.replace(/\s+/g, " ").toUpperCase(),
          name: entry.name || entry.code,
        });
      }
    }
  });
  return courses;
}

window.ComCalCurriculum = {
  markFromSchedule: markCurriculumFromSchedule,
  getProgress,
  coursesForYear,
  year(yearNum) {
    return CURRICULUM[yearNum];
  },
  reload() {
    currState = loadCurriculum();
    migrateElectives();
    updateSummary();
    renderYear();
    window.ComCalProfile?.render();
  },
};

function migrateElectives() {
  Object.values(CURRICULUM).forEach((year) => {
    year.items.forEach((item) => {
      if (item.type !== "elective") return;
      for (let i = 0; i < slotCount(item.units); i += 1) {
        const id = `${item.id}-${i}`;
        const stored = currState[id];
        if (!stored) continue;
        const split = splitCourseValues(stored.code, stored.name, stored.title);
        if (split.code === (stored.code || "") && split.name === (stored.name || "")) continue;
        currState[id] = { ...stored, code: split.code, name: split.name, title: "" };
      }
    });
  });
  saveCurriculum();
}

migrateElectives();
updateSummary();
renderYear();
