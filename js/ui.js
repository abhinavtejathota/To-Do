import { formatDate, listProgress, todayStr } from "./store.js";

const PRIORITY_LABELS = { high: "High", medium: "Med", low: "Low" };

let confirmResolver = null;
let listFormResolver = null;
const modalStack = [];
const MODAL_Z_BASE = 1100;
const MODAL_Z_STEP = 20;

function syncModalLayers() {
  modalStack.forEach((id, index) => {
    const el = document.getElementById(id);
    if (el) el.style.zIndex = String(MODAL_Z_BASE + index * MODAL_Z_STEP);
  });
}

export function getTopModalId() {
  return modalStack.at(-1) ?? null;
}

export function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;

  const existing = modalStack.indexOf(id);
  if (existing !== -1) modalStack.splice(existing, 1);
  modalStack.push(id);

  el.classList.add("open");
  syncModalLayers();
  document.body.classList.add("modal-open");

  const panel = el.querySelector(".modal-panel");
  const focusable = panel?.querySelector("input, button, textarea, select");
  if (focusable && id !== "confirm-modal") {
    focusable.focus();
  } else if (id === "confirm-modal") {
    document.getElementById("confirm-cancel-btn")?.focus();
  }
}

export function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;

  el.classList.remove("open");
  el.style.zIndex = "";
  const index = modalStack.indexOf(id);
  if (index !== -1) modalStack.splice(index, 1);
  syncModalLayers();

  if (!modalStack.length) {
    document.body.classList.remove("modal-open");
  } else {
    const topId = getTopModalId();
    const topEl = document.getElementById(topId);
    topEl?.querySelector(".modal-panel button, .modal-panel input")?.focus();
  }
}

export function closeTopModal() {
  const top = getTopModalId();
  if (!top) return false;
  if (top === "confirm-modal") {
    resolveConfirm(false);
  } else if (top === "list-form-modal") {
    resolveListForm(null);
  } else {
    closeModal(top);
  }
  return true;
}

export function closeAllModals() {
  [...modalStack].reverse().forEach((id) => {
    document.getElementById(id)?.classList.remove("open");
    document.getElementById(id).style.zIndex = "";
  });
  modalStack.length = 0;
  document.body.classList.remove("modal-open");
  if (confirmResolver) {
    confirmResolver(false);
    confirmResolver = null;
  }
  if (listFormResolver) {
    listFormResolver(null);
    listFormResolver = null;
  }
}

export function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("visible"));
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

export function applyTheme(settings) {
  const root = document.documentElement;
  root.dataset.theme =
    settings.theme === "system"
      ? matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : settings.theme;
  root.style.setProperty("--accent", settings.accent);
  document.body.classList.toggle("compact", settings.compactView);
}

export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

export function showConfirm({ title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", variant = "primary" }) {
  return new Promise((resolve) => {
    confirmResolver = resolve;
    document.getElementById("confirm-title").textContent = title;
    document.getElementById("confirm-message").textContent = message;
    document.getElementById("confirm-cancel-btn").textContent = cancelLabel;
    const actionBtn = document.getElementById("confirm-action-btn");
    actionBtn.textContent = confirmLabel;
    actionBtn.className = variant === "danger" ? "btn btn-danger" : "btn btn-primary";
    openModal("confirm-modal");
  });
}

export function resolveConfirm(result) {
  closeModal("confirm-modal");
  confirmResolver?.(result);
  confirmResolver = null;
}

export function showListForm({ title = "New list", name = "", color = "#ff204e", submitLabel = "Create list" }) {
  return new Promise((resolve) => {
    listFormResolver = resolve;
    document.getElementById("list-form-title").textContent = title;
    document.getElementById("list-form-name").value = name;
    document.getElementById("list-form-color").value = color;
    document.getElementById("list-form-submit").textContent = submitLabel;
    openModal("list-form-modal");
    setTimeout(() => document.getElementById("list-form-name").focus(), 50);
  });
}

export function resolveListForm(data) {
  closeModal("list-form-modal");
  listFormResolver?.(data);
  listFormResolver = null;
}

export function openListOptions(list) {
  document.getElementById("list-options-title").textContent = `Options — ${list.name}`;
  document.getElementById("list-options-name").value = list.name;
  document.getElementById("list-options-color").value = list.color;
  document.getElementById("list-options-form").dataset.listId = list.id;
  openModal("list-options-modal");
}

export function renderSidebar(state) {
  const nav = document.getElementById("list-sidebar");
  const stats = document.getElementById("sidebar-stats");
  const totalTasks = state.lists.reduce((n, l) => n + l.tasks.length, 0);
  const totalDone = state.lists.reduce((n, l) => n + l.tasks.filter((t) => t.completed).length, 0);
  const activeCount = state.lists.reduce((n, l) => n + l.tasks.filter((t) => !t.completed).length, 0);

  stats.textContent = `${state.lists.length} lists · ${activeCount} active · ${totalDone}/${totalTasks} done`;

  nav.innerHTML = state.lists
    .map(
      (list) => `
    <button type="button" class="list-item ${list.id === state.activeListId ? "active" : ""}" data-list-id="${list.id}">
      <span class="list-color" style="background:${escapeHtml(list.color)}"></span>
      <span class="list-name">${escapeHtml(list.name)}</span>
      <span class="list-count">${list.tasks.filter((t) => !t.completed).length}</span>
      <span class="list-progress-mini" style="width:${listProgress(list)}%"></span>
    </button>`
    )
    .join("");
}

export function renderListHeader(activeList) {
  const el = document.getElementById("list-header");
  if (!activeList) {
    el.innerHTML = `<div class="empty-hint"><p>No list selected</p><p class="muted">Create a list from the sidebar to get started.</p></div>`;
    return;
  }

  const progress = listProgress(activeList);
  const active = activeList.tasks.filter((t) => !t.completed).length;
  const completed = activeList.tasks.filter((t) => t.completed).length;

  el.innerHTML = `
    <div class="list-header-row">
      <div class="list-header-info">
        <h1>${escapeHtml(activeList.name)}</h1>
        <p class="list-meta">${active} active · ${completed} done · ${activeList.tasks.length} total · ${progress}% complete</p>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" id="list-options-btn" title="List options">⋮ Options</button>
    </div>
    <div class="progress-track" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100">
      <div class="progress-fill" style="width:${progress}%"></div>
    </div>`;
}

export function renderListToolbar(state) {
  const el = document.getElementById("list-toolbar");
  if (!state.activeListId) {
    el.innerHTML = "";
    return;
  }

  el.innerHTML = `
    <div class="toolbar-row">
      <div class="filter-tabs" id="filter-tabs" role="tablist" aria-label="Filter tasks">
        ${["all", "active", "today", "overdue", "completed"]
          .map(
            (f) =>
              `<button type="button" role="tab" class="filter-tab ${state.ui.filter === f ? "active" : ""}" data-filter="${f}" aria-selected="${state.ui.filter === f}">${f.charAt(0).toUpperCase() + f.slice(1)}</button>`
          )
          .join("")}
      </div>
    </div>
    <div class="toolbar-row">
      <label class="search-field" for="search-input">
        <span class="search-icon" aria-hidden="true">🔍</span>
        <input type="search" id="search-input" placeholder="Search tasks, tags, notes…" value="${escapeHtml(state.ui.search)}" autocomplete="off" />
      </label>
    </div>`;
}

export function renderTaskList(tasks, listId) {
  const el = document.getElementById("task-list");
  if (!listId) {
    el.innerHTML = "";
    return;
  }

  if (!tasks.length) {
    el.innerHTML = `<div class="empty-state">
      <p>No tasks match this view.</p>
      <p class="muted">Add a task below or scan a paper list from the top bar.</p>
    </div>`;
    return;
  }

  el.innerHTML = tasks
    .map((task) => {
      const overdue = !task.completed && task.dueDate && task.dueDate < todayStr();
      const dueToday = task.dueDate === todayStr();
      return `
      <article class="task-card ${task.completed ? "completed" : ""} ${overdue ? "overdue" : ""}"
        draggable="true" data-task-id="${task.id}" data-list-id="${listId}">
        <button type="button" class="task-check ${task.completed ? "checked" : ""}" aria-label="Toggle complete" data-action="toggle"></button>
        <div class="task-body">
          <p class="task-text">${escapeHtml(task.text)}</p>
          <div class="task-meta">
            <span class="priority priority-${task.priority}">${PRIORITY_LABELS[task.priority]}</span>
            ${task.dueDate ? `<span class="due ${dueToday ? "due-today" : ""} ${overdue ? "due-overdue" : ""}">${formatDate(task.dueDate)}</span>` : ""}
            ${task.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
            ${task.notes ? `<span class="has-notes" title="${escapeHtml(task.notes)}">📝</span>` : ""}
          </div>
        </div>
        <div class="task-actions">
          <button type="button" class="icon-btn-sm" data-action="edit" title="Edit">✎</button>
          <button type="button" class="icon-btn-sm danger-ghost" data-action="delete" title="Delete">×</button>
        </div>
      </article>`;
    })
    .join("");
}

export function renderTaskFooter(activeList) {
  const el = document.getElementById("task-footer");
  if (!activeList) {
    el.innerHTML = "";
    el.hidden = true;
    return;
  }

  el.hidden = false;
  const completedCount = activeList.tasks.filter((t) => t.completed).length;

  el.innerHTML = `
    <form id="add-task-form" class="quick-add-form">
      <div class="quick-add-main">
        <input type="text" id="task-input" placeholder="What needs to be done?" autocomplete="off" />
        <button type="submit" class="btn btn-primary">Add task</button>
      </div>
      <div class="quick-add-options">
        <label class="inline-label">
          Priority
          <select id="quick-priority" aria-label="Priority">
            <option value="low">Low</option>
            <option value="medium" selected>Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label class="inline-label">
          Due
          <input type="date" id="quick-due" aria-label="Due date" />
        </label>
        ${
          completedCount > 0
            ? `<button type="button" class="btn btn-ghost btn-sm" id="clear-completed-btn">Clear ${completedCount} completed</button>`
            : ""
        }
      </div>
    </form>`;
}

export function renderScanPreview(tasks, rawText) {
  const preview = document.getElementById("scan-preview-list");
  const rawEl = document.getElementById("scan-raw-text");

  rawEl.textContent = rawText || "(no text detected)";

  if (!tasks.length) {
    preview.innerHTML = `<p class="muted">No list items detected. Edit the raw text below or try a clearer photo.</p>`;
    return;
  }

  preview.innerHTML = tasks
    .map(
      (text, i) => `
    <label class="scan-item">
      <input type="checkbox" checked data-scan-index="${i}" />
      <input type="text" class="scan-item-input" value="${escapeHtml(text)}" data-scan-index="${i}" />
    </label>`
    )
    .join("");
}

export function getScanPreviewTasks() {
  const inputs = document.querySelectorAll(".scan-item");
  const tasks = [];
  inputs.forEach((label) => {
    const checkbox = label.querySelector('input[type="checkbox"]');
    const input = label.querySelector(".scan-item-input");
    if (checkbox?.checked && input?.value.trim()) {
      tasks.push(input.value.trim());
    }
  });
  return tasks;
}

export function renderSettingsForm(settings) {
  const form = document.getElementById("settings-form");
  form.innerHTML = `
    <fieldset class="settings-group">
      <legend>Appearance</legend>
      <label>Theme
        <select name="theme">
          <option value="dark" ${settings.theme === "dark" ? "selected" : ""}>Dark</option>
          <option value="light" ${settings.theme === "light" ? "selected" : ""}>Light</option>
          <option value="system" ${settings.theme === "system" ? "selected" : ""}>System</option>
        </select>
      </label>
      <label>Accent color <input type="color" name="accent" value="${settings.accent}" /></label>
      <label class="checkbox-label">
        <input type="checkbox" name="compactView" ${settings.compactView ? "checked" : ""} /> Compact task view
      </label>
    </fieldset>
    <fieldset class="settings-group">
      <legend>Tasks</legend>
      <label>Default priority
        <select name="defaultPriority">
          <option value="low" ${settings.defaultPriority === "low" ? "selected" : ""}>Low</option>
          <option value="medium" ${settings.defaultPriority === "medium" ? "selected" : ""}>Medium</option>
          <option value="high" ${settings.defaultPriority === "high" ? "selected" : ""}>High</option>
        </select>
      </label>
      <label>Sort tasks by
        <select name="sortBy">
          <option value="manual" ${settings.sortBy === "manual" ? "selected" : ""}>Manual order</option>
          <option value="priority" ${settings.sortBy === "priority" ? "selected" : ""}>Priority</option>
          <option value="dueDate" ${settings.sortBy === "dueDate" ? "selected" : ""}>Due date</option>
          <option value="created" ${settings.sortBy === "created" ? "selected" : ""}>Date added</option>
          <option value="alpha" ${settings.sortBy === "alpha" ? "selected" : ""}>Alphabetical</option>
        </select>
      </label>
      <label class="checkbox-label">
        <input type="checkbox" name="notifications" ${settings.notifications ? "checked" : ""} /> Due date reminders
      </label>
    </fieldset>
    <fieldset class="settings-group">
      <legend>Data</legend>
      <div class="settings-actions">
        <button type="button" class="btn btn-ghost" id="export-btn">Export backup</button>
        <label class="btn btn-ghost import-label">
          Import backup
          <input type="file" id="import-file" accept=".json,application/json" hidden />
        </label>
        <button type="button" class="btn btn-danger" id="clear-data-btn">Clear all data</button>
      </div>
    </fieldset>`;
}

export function openTaskEditor(task, listId) {
  const form = document.getElementById("task-edit-form");
  form.dataset.listId = listId;
  form.dataset.taskId = task.id;
  form.querySelector('[name="text"]').value = task.text;
  form.querySelector('[name="priority"]').value = task.priority;
  form.querySelector('[name="dueDate"]').value = task.dueDate || "";
  form.querySelector('[name="notes"]').value = task.notes || "";
  form.querySelector('[name="tags"]').value = task.tags.join(", ");
  openModal("task-modal");
}

export function setScanProgress(visible, percent = 0, message = "") {
  const el = document.getElementById("scan-progress");
  el.hidden = !visible;
  el.querySelector(".progress-bar-inner").style.width = `${percent}%`;
  el.querySelector(".progress-label").textContent = message || `Scanning… ${percent}%`;
}

export function renderApp(state, filteredTasks) {
  applyTheme(state.settings);
  renderSidebar(state);
  const activeList = state.lists.find((l) => l.id === state.activeListId);
  renderListHeader(activeList);
  renderListToolbar(state);
  renderTaskList(filteredTasks, activeList?.id);

  const footerFocused = document.activeElement?.closest("#add-task-form");
  if (!footerFocused) {
    renderTaskFooter(activeList);
  }

  document.getElementById("sidebar-toggle").ariaExpanded = String(state.ui.sidebarOpen);
  document.querySelector(".app-layout").classList.toggle("sidebar-collapsed", !state.ui.sidebarOpen);
}
