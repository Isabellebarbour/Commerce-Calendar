const TOPIC_STORAGE = "comcal-topics";
const EVENT_EDIT_STORAGE = "comcal-event-edits";
const DISMISSED_TOPIC_STORAGE = "comcal-dismissed-topics";
const SESSIONAL_ID = "sessional";
const SESSIONAL_COLOR = "#071e49";
const ASSIGNMENTS_ID = "assignments";
const ASSIGNMENTS_COLOR = "#E8A838";
const EXAMS_ID = "exams";
const EXAMS_COLOR = "#E85D4C";
const COURSE_COLORS = [
  "#5B8DEF",
  "#E8A838",
  "#6BCB77",
  "#A78BFA",
  "#F472B6",
  "#FB923C",
  "#38BDF8",
  "#34D399",
  "#F87171",
  "#818CF8",
];

function loadDismissedTopics() {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED_TOPIC_STORAGE)) || []);
  } catch {
    return new Set();
  }
}

function saveDismissedTopics(ids) {
  localStorage.setItem(DISMISSED_TOPIC_STORAGE, JSON.stringify([...ids]));
  window.ComCalCloud?.notifyChanged?.();
}

function dismissTopic(id) {
  const next = loadDismissedTopics();
  next.add(id);
  saveDismissedTopics(next);
}

function clearDismissedTopics() {
  localStorage.removeItem(DISMISSED_TOPIC_STORAGE);
  window.ComCalCloud?.notifyChanged?.();
}

function isTopicDismissed(id) {
  return loadDismissedTopics().has(id);
}

function loadTopics() {
  try {
    return JSON.parse(localStorage.getItem(TOPIC_STORAGE)) || [];
  } catch {
    return [];
  }
}

function saveTopics(topics) {
  localStorage.setItem(TOPIC_STORAGE, JSON.stringify(topics));
  window.ComCalCloud?.notifyChanged?.();
}

function loadEdits() {
  try {
    return JSON.parse(localStorage.getItem(EVENT_EDIT_STORAGE)) || {};
  } catch {
    return {};
  }
}

function saveEdits(edits) {
  localStorage.setItem(EVENT_EDIT_STORAGE, JSON.stringify(edits));
  window.ComCalCloud?.notifyChanged?.();
}

function courseTopicId(code) {
  return `course-${String(code).toUpperCase().replace(/\s+/g, "-")}`;
}

function nextCourseColor(topics) {
  const used = new Set(topics.map((topic) => topic.color.toLowerCase()));
  return COURSE_COLORS.find((color) => !used.has(color.toLowerCase())) || COURSE_COLORS[topics.length % COURSE_COLORS.length];
}

function ensureSessional(topics) {
  const existing = topics.find((topic) => topic.id === SESSIONAL_ID);
  if (existing) {
    existing.name = "Sessional Dates";
    existing.color = SESSIONAL_COLOR;
    existing.type = "sessional";
    existing.locked = true;
  } else {
    topics.unshift({
      id: SESSIONAL_ID,
      name: "Sessional Dates",
      color: SESSIONAL_COLOR,
      type: "sessional",
      locked: true,
      visible: true,
    });
  }
  return ensureAssignmentsTopic(topics);
}

function ensureAssignmentsTopic(topics) {
  const existing = topics.find((topic) => topic.id === ASSIGNMENTS_ID);
  if (existing) {
    existing.name = "Assignments";
    existing.type = "assignments";
    existing.locked = true;
    if (!isValidHexColor(existing.color)) existing.color = ASSIGNMENTS_COLOR;
    return ensureExamsTopic(topics);
  }
  const sessionalIndex = topics.findIndex((topic) => topic.id === SESSIONAL_ID);
  const entry = {
    id: ASSIGNMENTS_ID,
    name: "Assignments",
    color: ASSIGNMENTS_COLOR,
    type: "assignments",
    locked: true,
    visible: true,
  };
  if (sessionalIndex >= 0) topics.splice(sessionalIndex + 1, 0, entry);
  else topics.unshift(entry);
  return ensureExamsTopic(topics);
}

function ensureExamsTopic(topics) {
  const existing = topics.find((topic) => topic.id === EXAMS_ID);
  if (existing) {
    existing.name = "Exams";
    existing.type = "exams";
    existing.locked = true;
    if (!isValidHexColor(existing.color)) existing.color = EXAMS_COLOR;
    return topics;
  }
  const assignmentsIndex = topics.findIndex((topic) => topic.id === ASSIGNMENTS_ID);
  const entry = {
    id: EXAMS_ID,
    name: "Exams",
    color: EXAMS_COLOR,
    type: "exams",
    locked: true,
    visible: true,
  };
  if (assignmentsIndex >= 0) topics.splice(assignmentsIndex + 1, 0, entry);
  else {
    const sessionalIndex = topics.findIndex((topic) => topic.id === SESSIONAL_ID);
    if (sessionalIndex >= 0) topics.splice(sessionalIndex + 1, 0, entry);
    else topics.unshift(entry);
  }
  return topics;
}

function isValidHexColor(color) {
  return /^#[0-9a-fA-F]{6}$/.test(String(color || "").trim());
}

function getTopics() {
  const topics = ensureSessional(loadTopics());
  let changed = false;
  topics.forEach((topic, index) => {
    if (topic.type === "sessional" || topic.type === "assignments" || topic.type === "exams") return;
    if (isValidHexColor(topic.color)) return;
    topic.color = COURSE_COLORS[index % COURSE_COLORS.length];
    changed = true;
  });
  if (changed) saveTopics(topics);
  return topics;
}

function topicById(id) {
  return getTopics().find((topic) => topic.id === id) || null;
}

function colorForCourse(code) {
  const normalized = String(code || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  if (!normalized) return COURSE_COLORS[0];
  const id = courseTopicId(normalized);
  const match = getTopics().find(
    (topic) =>
      topic.id === id ||
      String(topic.courseCode || "").replace(/\s+/g, " ").trim().toUpperCase() === normalized ||
      String(topic.name || "").replace(/\s+/g, " ").trim().toUpperCase() === normalized
  );
  if (match?.color) return match.color;
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return COURSE_COLORS[hash % COURSE_COLORS.length];
}

function inferredTopicId(event) {
  if (event.source === "assignment") return ASSIGNMENTS_ID;
  if (event.source === "exam") return EXAMS_ID;
  if (event.topicId && topicById(event.topicId)) return event.topicId;
  if (event.source === "academic") return SESSIONAL_ID;
  const codes = window.ComCalSchedule.extractCourseCodes(`${event.title || ""} ${event.description || ""}`);
  if (codes[0]) return courseTopicId(codes[0]);
  return "other";
}

function syncCourseTopics(events) {
  const topics = ensureSessional(loadTopics());
  const codes = new Set();
  events.forEach((event) => {
    if (event.source === "academic" || event.source === "assignment" || event.source === "exam") return;
    window.ComCalSchedule.extractCourseCodes(`${event.title || ""} ${event.description || ""}`).forEach((code) => {
      codes.add(code);
    });
  });

  codes.forEach((code) => {
    const id = courseTopicId(code);
    if (topics.some((topic) => topic.id === id) || isTopicDismissed(id)) return;
    topics.push({
      id,
      name: code,
      color: nextCourseColor(topics),
      type: "course",
      courseCode: code,
      visible: true,
    });
  });

  const hasOther = events.some((event) => inferredTopicId(event) === "other");
  if (hasOther && !topics.some((topic) => topic.id === "other") && !isTopicDismissed("other")) {
    topics.push({
      id: "other",
      name: "Other",
      color: "#8E8E93",
      type: "other",
      visible: true,
    });
  }

  saveTopics(topics);
  return topics;
}

function addTopic(name, color) {
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new Error("Enter a topic name.");
  const topics = getTopics();
  const id = `topic-${Date.now()}`;
  topics.push({
    id,
    name: trimmed,
    color: color || nextCourseColor(topics),
    type: "custom",
    visible: true,
  });
  saveTopics(topics);
  return id;
}

function removeTopic(id) {
  if (id === SESSIONAL_ID || id === ASSIGNMENTS_ID || id === EXAMS_ID) return;
  const topic = getTopics().find((row) => row.id === id);
  const topics = getTopics().filter((row) => row.id !== id);
  saveTopics(topics);
  if (topic && (topic.type === "other" || topic.type === "course" || topic.type === "custom")) {
    dismissTopic(id);
  }
  const edits = loadEdits();
  Object.keys(edits).forEach((eventId) => {
    if (edits[eventId].topicId === id) delete edits[eventId].topicId;
  });
  saveEdits(edits);
}

function setTopicVisible(id, visible) {
  const topics = getTopics().map((topic) =>
    topic.id === id ? { ...topic, visible: Boolean(visible) } : topic
  );
  saveTopics(topics);
}

function setTopicColor(id, color) {
  if (id === SESSIONAL_ID) return;
  const next = String(color || "").trim().toUpperCase();
  if (!isValidHexColor(next)) return;
  const topics = ensureSessional(loadTopics());
  if (!topics.some((topic) => topic.id === id)) return;
  saveTopics(topics.map((topic) => (topic.id === id ? { ...topic, color: next } : topic)));
}

function renameTopic(id, name) {
  if (id === SESSIONAL_ID || id === ASSIGNMENTS_ID || id === EXAMS_ID) return;
  const trimmed = String(name || "").trim();
  if (!trimmed) return;
  const topics = getTopics().map((topic) => (topic.id === id ? { ...topic, name: trimmed } : topic));
  saveTopics(topics);
}

function removeCourseTopics() {
  clearDismissedTopics();
  saveTopics(getTopics().filter((topic) => topic.type !== "course" && topic.type !== "other"));
}

function decorate(events) {
  const edits = loadEdits();
  const decorated = events
    .map((event) => {
      const patch = edits[event.id];
      if (patch?.deleted) return null;
      const merged = { ...event, professor: event.professor || "", ...(patch || {}) };
      merged.topicId = inferredTopicId(merged);
      return merged;
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.start) - new Date(b.start));
  syncCourseTopics(decorated);
  return decorated.map((event) => {
    const topic = topicById(event.topicId);
    return {
      ...event,
      topicId: topic?.id || event.topicId,
      color: topic?.color || SESSIONAL_COLOR,
    };
  });
}

function visibleEvents(events) {
  const hidden = new Set(getTopics().filter((topic) => topic.visible === false).map((topic) => topic.id));
  return events.filter((event) => !hidden.has(event.topicId));
}

function saveEventPatch(event, patch, applySeries = false) {
  const edits = loadEdits();
  const targets = applySeries && event.uid
    ? window.ComCalSchedule.allEvents().filter((item) => item.uid === event.uid)
    : [event];

  targets.forEach((target) => {
    const current = edits[target.id] || {};
    const next = { ...current, ...patch };
    if (applySeries) {
      delete next.start;
      delete next.end;
      delete next.allDay;
      if (patch.start && patch.end) {
        const start = new Date(target.start);
        const end = new Date(target.end);
        const patchedStart = new Date(patch.start);
        const patchedEnd = new Date(patch.end);
        start.setHours(patchedStart.getHours(), patchedStart.getMinutes(), 0, 0);
        end.setHours(patchedEnd.getHours(), patchedEnd.getMinutes(), 0, 0);
        next.start = start.toISOString();
        next.end = end.toISOString();
        next.allDay = Boolean(patch.allDay);
      }
    }
    edits[target.id] = next;
  });

  const schedule = window.ComCalSchedule.load();
  const scheduleIds = new Set(schedule.map((item) => item.id));
  targets.forEach((target) => {
    if (!scheduleIds.has(target.id)) return;
    const index = schedule.findIndex((item) => item.id === target.id);
    schedule[index] = { ...schedule[index], ...edits[target.id] };
    delete edits[target.id];
  });
  window.ComCalSchedule.save(schedule);
  saveEdits(edits);
}

function deleteEvent(event, applySeries = false) {
  const targets = applySeries && event.uid
    ? window.ComCalSchedule.allEvents().filter((item) => item.uid === event.uid)
    : [event];
  const schedule = window.ComCalSchedule.load().filter(
    (item) => !targets.some((target) => target.id === item.id)
  );
  window.ComCalSchedule.save(schedule);

  const edits = loadEdits();
  targets.forEach((target) => {
    if (target.source === "academic") edits[target.id] = { ...(edits[target.id] || {}), deleted: true };
    else delete edits[target.id];
  });
  saveEdits(edits);
}

window.ComCalTopics = {
  SESSIONAL_ID,
  SESSIONAL_COLOR,
  ASSIGNMENTS_ID,
  ASSIGNMENTS_COLOR,
  EXAMS_ID,
  EXAMS_COLOR,
  getTopics,
  topicById,
  colorForCourse,
  courseTopicId,
  addTopic,
  removeTopic,
  setTopicVisible,
  setTopicColor,
  renameTopic,
  removeCourseTopics,
  syncCourseTopics,
  clearDismissedTopics,
  decorate,
  visibleEvents,
  saveEventPatch,
  deleteEvent,
};
