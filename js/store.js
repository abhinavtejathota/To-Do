const STORAGE_KEY = "flowtask_data_v2";
const LEGACY_KEY = "topicData";

const DEFAULT_SETTINGS = {
  theme: "dark",
  accent: "#ff204e",
  defaultPriority: "medium",
  notifications: true,
  sortBy: "manual",
  compactView: false,
};

function generateId() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createTask(text, overrides = {}) {
  return {
    id: generateId(),
    text: text.trim(),
    completed: false,
    priority: overrides.priority || "medium",
    dueDate: overrides.dueDate || null,
    notes: overrides.notes || "",
    tags: overrides.tags || [],
    createdAt: Date.now(),
    completedAt: null,
  };
}

function createList(name, overrides = {}) {
  return {
    id: generateId(),
    name: name.trim(),
    color: overrides.color || "#ff204e",
    tasks: [],
    createdAt: Date.now(),
  };
}

function migrateLegacyData() {
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (!legacy) return null;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = legacy;
  const lists = [];

  wrapper.querySelectorAll(".topic").forEach((topicEl) => {
    const name = topicEl.querySelector("h3")?.textContent?.trim();
    if (!name) return;

    const list = createList(name);
    topicEl.querySelectorAll(".task-list li").forEach((li) => {
      const text = li.childNodes[0]?.textContent?.trim();
      if (!text) return;
      const task = createTask(text);
      if (li.classList.contains("checked")) {
        task.completed = true;
        task.completedAt = Date.now();
      }
      list.tasks.push(task);
    });
    lists.push(list);
  });

  localStorage.removeItem(LEGACY_KEY);
  return lists.length ? lists : null;
}

export class Store {
  constructor() {
    this.listeners = new Set();
    this.state = this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
          lists: parsed.lists || [],
          activeListId: parsed.activeListId || null,
          ui: parsed.ui || { sidebarOpen: true, filter: "all", search: "" },
        };
      }
    } catch {
      /* fall through to fresh state */
    }

    const migrated = migrateLegacyData();
    const lists = migrated || [createList("My Tasks")];
    return {
      settings: { ...DEFAULT_SETTINGS },
      lists,
      activeListId: lists[0]?.id || null,
      ui: { sidebarOpen: true, filter: "all", search: "" },
    };
  }

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    this.notify();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    this.listeners.forEach((fn) => fn(this.state));
  }

  getActiveList() {
    return this.state.lists.find((l) => l.id === this.state.activeListId) || this.state.lists[0];
  }

  setActiveList(id) {
    this.state.activeListId = id;
    this.save();
  }

  addList(name, overrides = {}) {
    const list = createList(name, overrides);
    this.state.lists.unshift(list);
    this.state.activeListId = list.id;
    this.save();
    return list;
  }

  updateList(id, updates) {
    const list = this.state.lists.find((l) => l.id === id);
    if (!list) return;
    Object.assign(list, updates);
    this.save();
  }

  deleteList(id) {
    this.state.lists = this.state.lists.filter((l) => l.id !== id);
    if (this.state.activeListId === id) {
      this.state.activeListId = this.state.lists[0]?.id || null;
    }
    this.save();
  }

  addTask(listId, text, overrides = {}) {
    const list = this.state.lists.find((l) => l.id === listId);
    if (!list || !text.trim()) return null;
    const task = createTask(text, {
      ...overrides,
      priority: overrides.priority || this.state.settings.defaultPriority,
    });
    list.tasks.push(task);
    this.save();
    return task;
  }

  addTasks(listId, texts, overrides = {}) {
    const added = [];
    texts.forEach((text) => {
      const task = this.addTask(listId, text, overrides);
      if (task) added.push(task);
    });
    return added;
  }

  updateTask(listId, taskId, updates) {
    const list = this.state.lists.find((l) => l.id === listId);
    const task = list?.tasks.find((t) => t.id === taskId);
    if (!task) return;
    Object.assign(task, updates);
    if (updates.completed === true && !task.completedAt) {
      task.completedAt = Date.now();
    }
    if (updates.completed === false) {
      task.completedAt = null;
    }
    this.save();
  }

  deleteTask(listId, taskId) {
    const list = this.state.lists.find((l) => l.id === listId);
    if (!list) return;
    list.tasks = list.tasks.filter((t) => t.id !== taskId);
    this.save();
  }

  reorderTasks(listId, fromIndex, toIndex) {
    const list = this.state.lists.find((l) => l.id === listId);
    if (!list) return;
    const [item] = list.tasks.splice(fromIndex, 1);
    list.tasks.splice(toIndex, 0, item);
    this.save();
  }

  clearCompleted(listId) {
    const list = this.state.lists.find((l) => l.id === listId);
    if (!list) return;
    list.tasks = list.tasks.filter((t) => !t.completed);
    this.save();
  }

  updateSettings(updates) {
    this.state.settings = { ...this.state.settings, ...updates };
    this.save();
  }

  updateUI(updates) {
    this.state.ui = { ...this.state.ui, ...updates };
    this.save();
  }

  exportData() {
    return JSON.stringify(this.state, null, 2);
  }

  importData(json) {
    const parsed = JSON.parse(json);
    if (!parsed.lists || !Array.isArray(parsed.lists)) {
      throw new Error("Invalid backup file");
    }
    this.state = {
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
      lists: parsed.lists,
      activeListId: parsed.activeListId || parsed.lists[0]?.id,
      ui: { sidebarOpen: true, filter: "all", search: "", ...parsed.ui },
    };
    this.save();
  }

  getFilteredTasks(list) {
    if (!list) return [];
    let tasks = [...list.tasks];
    const { filter, search } = this.state.ui;
    const query = search.trim().toLowerCase();

    if (filter === "active") tasks = tasks.filter((t) => !t.completed);
    else if (filter === "completed") tasks = tasks.filter((t) => t.completed);
    else if (filter === "overdue") {
      tasks = tasks.filter((t) => !t.completed && t.dueDate && t.dueDate < todayStr());
    } else if (filter === "today") {
      tasks = tasks.filter((t) => t.dueDate === todayStr());
    }

    if (query) {
      tasks = tasks.filter(
        (t) =>
          t.text.toLowerCase().includes(query) ||
          t.notes.toLowerCase().includes(query) ||
          t.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    const { sortBy } = this.state.settings;
    if (sortBy === "priority") {
      const order = { high: 0, medium: 1, low: 2 };
      tasks.sort((a, b) => order[a.priority] - order[b.priority]);
    } else if (sortBy === "dueDate") {
      tasks.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
    } else if (sortBy === "created") {
      tasks.sort((a, b) => b.createdAt - a.createdAt);
    } else if (sortBy === "alpha") {
      tasks.sort((a, b) => a.text.localeCompare(b.text));
    }

    return tasks;
  }

  getDueSoonTasks() {
    const today = todayStr();
    const soon = [];
    this.state.lists.forEach((list) => {
      list.tasks.forEach((task) => {
        if (!task.completed && task.dueDate && task.dueDate <= today) {
          soon.push({ list, task });
        }
      });
    });
    return soon;
  }
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function formatDate(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = (date - today) / 86400000;
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function listProgress(list) {
  if (!list?.tasks.length) return 0;
  const done = list.tasks.filter((t) => t.completed).length;
  return Math.round((done / list.tasks.length) * 100);
}
