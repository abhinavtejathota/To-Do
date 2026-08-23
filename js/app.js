import { Store } from "./store.js";
import { scanImage, readFileAsDataURL, preprocessImageForOCR, parseLinesToTasks } from "./ocr.js";
import {
  renderApp,
  renderTaskList,
  renderSettingsForm,
  renderScanPreview,
  getScanPreviewTasks,
  openModal,
  closeModal,
  closeTopModal,
  closeAllModals,
  getTopModalId,
  openTaskEditor,
  openListOptions,
  setScanProgress,
  showToast,
  showConfirm,
  resolveConfirm,
  showListForm,
  resolveListForm,
} from "./ui.js";

const store = new Store();
let dragTaskId = null;
let dragListId = null;

function refreshTasksOnly() {
  const activeList = store.getActiveList();
  const tasks = store.getFilteredTasks(activeList);
  renderTaskList(tasks, activeList?.id);
}

function refresh() {
  const activeList = store.getActiveList();
  const tasks = store.getFilteredTasks(activeList);
  renderApp(store.state, tasks);
}

function bindGlobalEvents() {
  document.getElementById("settings-btn").addEventListener("click", () => {
    renderSettingsForm(store.state.settings);
    openModal("settings-modal");
  });

  document.getElementById("global-scan-btn").addEventListener("click", () => {
    openModal("scan-modal");
  });

  document.getElementById("sidebar-toggle").addEventListener("click", () => {
    store.updateUI({ sidebarOpen: !store.state.ui.sidebarOpen });
  });

  document.body.addEventListener("click", (e) => {
    const closeTarget = e.target.closest("[data-close-modal]");
    if (!closeTarget) return;

    const modalId = closeTarget.dataset.closeModal;
    const isBackdrop = closeTarget.classList.contains("modal-backdrop");
    if (isBackdrop && modalId !== getTopModalId()) return;

    if (modalId === "confirm-modal") {
      resolveConfirm(false);
    } else if (modalId === "list-form-modal") {
      resolveListForm(null);
    } else {
      closeModal(modalId);
    }
  });

  document.getElementById("confirm-cancel-btn").addEventListener("click", () => resolveConfirm(false));
  document.getElementById("confirm-action-btn").addEventListener("click", () => resolveConfirm(true));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeTopModal();
  });
}

function bindDelegatedEvents() {
  document.body.addEventListener("click", async (e) => {
    const target = e.target;

    if (target.id === "add-list-btn") {
      const result = await showListForm({ title: "New list", submitLabel: "Create list" });
      if (result?.name?.trim()) {
        store.addList(result.name.trim(), { color: result.color });
        showToast(`Created "${result.name.trim()}"`, "success");
      }
      return;
    }

    const listBtn = target.closest(".list-item");
    if (listBtn?.dataset.listId) {
      store.setActiveList(listBtn.dataset.listId);
      if (window.innerWidth <= 768) {
        store.updateUI({ sidebarOpen: false });
      }
      return;
    }

    if (target.id === "list-options-btn") {
      const list = store.getActiveList();
      if (list) openListOptions(list);
      return;
    }

    const filterTab = target.closest(".filter-tab");
    if (filterTab?.dataset.filter) {
      store.updateUI({ filter: filterTab.dataset.filter });
      return;
    }

    const taskCard = target.closest(".task-card");
    if (taskCard) {
      const action = target.closest("[data-action]")?.dataset.action;
      const listId = taskCard.dataset.listId;
      const taskId = taskCard.dataset.taskId;
      const list = store.state.lists.find((l) => l.id === listId);
      const task = list?.tasks.find((t) => t.id === taskId);

      if (action === "toggle" && task) {
        store.updateTask(listId, taskId, { completed: !task.completed });
      } else if (action === "delete" && task) {
        const ok = await showConfirm({
          title: "Delete task",
          message: `Remove "${task.text}" from this list?`,
          confirmLabel: "Delete",
          variant: "danger",
        });
        if (ok) {
          store.deleteTask(listId, taskId);
          showToast("Task removed", "info");
        }
      } else if (action === "edit" && task) {
        openTaskEditor(task, listId);
      }
      return;
    }

    if (target.id === "clear-completed-btn") {
      const list = store.getActiveList();
      if (!list) return;
      const count = list.tasks.filter((t) => t.completed).length;
      const ok = await showConfirm({
        title: "Clear completed",
        message: `Remove ${count} completed task${count === 1 ? "" : "s"} from "${list.name}"?`,
        confirmLabel: "Clear",
        variant: "danger",
      });
      if (ok) {
        store.clearCompleted(list.id);
        showToast("Cleared completed tasks", "info");
      }
    }
  });

  document.body.addEventListener("input", (e) => {
    if (e.target.id === "search-input") {
      store.state.ui.search = e.target.value;
      refreshTasksOnly();
    }
  });

  document.body.addEventListener("submit", (e) => {
    if (e.target.id === "add-task-form") {
      e.preventDefault();
      const list = store.getActiveList();
      if (!list) return;
      const input = document.getElementById("task-input");
      const priority = document.getElementById("quick-priority").value;
      const dueDate = document.getElementById("quick-due").value || null;
      const text = input.value.trim();
      if (!text) {
        showToast("Enter a task description", "error");
        input.focus();
        return;
      }
      store.addTask(list.id, text, { priority, dueDate });
      input.value = "";
      document.getElementById("quick-due").value = "";
      showToast("Task added", "success");
    }
  });

  bindDragDrop();
  bindScanModal();
  bindSettingsModal();
  bindTaskModal();
  bindListModals();
}

function bindListModals() {
  document.getElementById("list-form").addEventListener("submit", (e) => {
    e.preventDefault();
    resolveListForm({
      name: document.getElementById("list-form-name").value,
      color: document.getElementById("list-form-color").value,
    });
  });

  document.getElementById("list-options-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target;
    const listId = form.dataset.listId;
    store.updateList(listId, {
      name: document.getElementById("list-options-name").value.trim(),
      color: document.getElementById("list-options-color").value,
    });
    closeModal("list-options-modal");
    showToast("List updated", "success");
  });

  document.getElementById("list-options-delete-btn").addEventListener("click", async () => {
    const form = document.getElementById("list-options-form");
    const listId = form.dataset.listId;
    const list = store.state.lists.find((l) => l.id === listId);
    if (!list) return;

    const ok = await showConfirm({
      title: "Delete list",
      message: `Delete "${list.name}" and all ${list.tasks.length} task${list.tasks.length === 1 ? "" : "s"}? This cannot be undone.`,
      confirmLabel: "Delete list",
      variant: "danger",
    });

    if (ok) {
      store.deleteList(listId);
      closeModal("list-options-modal");
      showToast("List deleted", "info");
    }
  });
}

function bindDragDrop() {
  document.body.addEventListener("dragstart", (e) => {
    const card = e.target.closest(".task-card");
    if (!card) return;
    dragTaskId = card.dataset.taskId;
    dragListId = card.dataset.listId;
    card.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });

  document.body.addEventListener("dragend", (e) => {
    e.target.closest(".task-card")?.classList.remove("dragging");
    dragTaskId = dragListId = null;
  });

  document.body.addEventListener("dragover", (e) => {
    const card = e.target.closest(".task-card");
    if (!card || card.dataset.taskId === dragTaskId) return;
    e.preventDefault();
    card.classList.add("drag-over");
  });

  document.body.addEventListener("dragleave", (e) => {
    e.target.closest(".task-card")?.classList.remove("drag-over");
  });

  document.body.addEventListener("drop", (e) => {
    const card = e.target.closest(".task-card");
    if (!card || !dragTaskId || card.dataset.listId !== dragListId) return;
    e.preventDefault();
    card.classList.remove("drag-over");

    const list = store.state.lists.find((l) => l.id === dragListId);
    if (!list) return;
    const fromIndex = list.tasks.findIndex((t) => t.id === dragTaskId);
    const toIndex = list.tasks.findIndex((t) => t.id === card.dataset.taskId);
    if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
      store.reorderTasks(dragListId, fromIndex, toIndex);
      store.updateSettings({ sortBy: "manual" });
    }
  });
}

function bindScanModal() {
  const fileInput = document.getElementById("scan-file-input");
  const cameraInput = document.getElementById("scan-camera-input");

  async function handleImageFile(file) {
    if (!file?.type.startsWith("image/")) {
      showToast("Please choose an image file", "error");
      return;
    }

    openModal("scan-modal");
    setScanProgress(true, 5, "Preparing image…");

    try {
      const dataUrl = await readFileAsDataURL(file);
      const processed = await preprocessImageForOCR(dataUrl);
      setScanProgress(true, 15, "Loading OCR engine…");

      const result = await scanImage(processed, (pct) => {
        setScanProgress(true, 15 + Math.round(pct * 0.75), `Reading text… ${pct}%`);
      });

      renderScanPreview(result.tasks, result.rawText);
      setScanProgress(false);

      if (result.tasks.length) {
        showToast(`Found ${result.tasks.length} items`, "success");
      } else {
        showToast("No list items found — edit raw text to add manually", "info");
      }
    } catch (err) {
      setScanProgress(false);
      showToast(err.message || "Scan failed", "error");
    }
  }

  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) handleImageFile(fileInput.files[0]);
    fileInput.value = "";
  });

  cameraInput.addEventListener("change", () => {
    if (cameraInput.files[0]) handleImageFile(cameraInput.files[0]);
    cameraInput.value = "";
  });

  document.getElementById("scan-upload-btn").addEventListener("click", () => fileInput.click());
  document.getElementById("scan-camera-btn").addEventListener("click", () => cameraInput.click());

  document.getElementById("scan-reparse-btn").addEventListener("click", () => {
    const raw = document.getElementById("scan-raw-text").textContent;
    renderScanPreview(parseLinesToTasks(raw), raw);
    showToast("Text re-parsed", "info");
  });

  document.getElementById("scan-add-btn").addEventListener("click", () => {
    const list = store.getActiveList();
    if (!list) {
      showToast("Select or create a list first", "error");
      return;
    }
    const tasks = getScanPreviewTasks();
    if (!tasks.length) {
      showToast("Select at least one item", "error");
      return;
    }
    store.addTasks(list.id, tasks);
    closeModal("scan-modal");
    showToast(`Added ${tasks.length} tasks from scan`, "success");
  });

  document.getElementById("scan-add-one-btn").addEventListener("click", () => {
    const preview = document.getElementById("scan-preview-list");
    const label = document.createElement("label");
    label.className = "scan-item";
    label.innerHTML = `
      <input type="checkbox" checked />
      <input type="text" class="scan-item-input" value="" placeholder="New item" />
    `;
    preview.appendChild(label);
    label.querySelector("input[type=text]").focus();
  });
}

function bindSettingsModal() {
  document.getElementById("settings-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    store.updateSettings({
      theme: fd.get("theme"),
      accent: fd.get("accent"),
      defaultPriority: fd.get("defaultPriority"),
      sortBy: fd.get("sortBy"),
      compactView: fd.get("compactView") === "on",
      notifications: fd.get("notifications") === "on",
    });
    closeModal("settings-modal");
    showToast("Settings saved", "success");
    if (store.state.settings.notifications) requestNotificationPermission();
  });

  document.getElementById("settings-form").addEventListener("click", async (e) => {
    if (e.target.id === "export-btn") {
      const blob = new Blob([store.exportData()], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `flowtask-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      showToast("Backup downloaded", "success");
    }

    if (e.target.id === "clear-data-btn") {
      const ok = await showConfirm({
        title: "Clear all data",
        message: "Delete every list and task? This cannot be undone.",
        confirmLabel: "Delete everything",
        variant: "danger",
      });
      if (ok) {
        localStorage.removeItem("flowtask_data_v2");
        location.reload();
      }
    }
  });

  document.getElementById("settings-form").addEventListener("change", (e) => {
    if (e.target.id === "import-file" && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          store.importData(reader.result);
          closeModal("settings-modal");
          showToast("Backup restored", "success");
        } catch {
          showToast("Invalid backup file", "error");
        }
      };
      reader.readAsText(e.target.files[0]);
      e.target.value = "";
    }
  });
}

function bindTaskModal() {
  document.getElementById("task-edit-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target;
    const listId = form.dataset.listId;
    const taskId = form.dataset.taskId;
    const fd = new FormData(form);
    const text = fd.get("text").trim();
    if (!text) {
      showToast("Task cannot be empty", "error");
      return;
    }
    const tags = fd
      .get("tags")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    store.updateTask(listId, taskId, {
      text,
      priority: fd.get("priority"),
      dueDate: fd.get("dueDate") || null,
      notes: fd.get("notes").trim(),
      tags,
    });
    closeModal("task-modal");
    showToast("Task updated", "success");
  });
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
}

function checkDueReminders() {
  if (!store.state.settings.notifications) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const due = store.getDueSoonTasks();
  due.forEach(({ list, task }) => {
    const key = `notified-${task.id}-${task.dueDate}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    new Notification(`Due: ${task.text}`, {
      body: `List: ${list.name}`,
      icon: "images/icon3.png",
    });
  });
}

function init() {
  bindGlobalEvents();
  bindDelegatedEvents();
  store.subscribe(() => refresh());
  refresh();
  requestNotificationPermission();
  checkDueReminders();
  setInterval(checkDueReminders, 60000);

  if (store.state.lists.length === 0) {
    store.addList("My Tasks");
  }
}

init();
