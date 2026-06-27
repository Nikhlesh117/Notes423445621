// ── API ──────────────────────────────────────────────────────────────────

const BASE = "/api";

function encodeKey(key) {
  const bytes = new TextEncoder().encode(key);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function fetchTopics() {
  const r = await fetch(`${BASE}/topics`);
  if (!r.ok) throw new Error("Failed to load topics");
  return r.json();
}

async function fetchNote(key) {
  const r = await fetch(`${BASE}/note/${encodeKey(key)}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("Failed to fetch note");
  return r.json();
}

async function saveNote(key, sections) {
  const r = await fetch(`${BASE}/note/${encodeKey(key)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sections }),
  });
  if (!r.ok) throw new Error("Save failed");
  return r.json();
}

// Progress is stored entirely in the browser (localStorage) — no server
// round-trip, nothing to reset on a restart. Same shape as before: a flat
// { rawKey: status } map.
const PROGRESS_STORAGE_KEY = "progress";
const VALID_STATUSES = new Set(["not_started", "studying", "done"]);

function readProgressStore() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function writeProgressStore(progress) {
  localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
}

async function fetchProgress() {
  return readProgressStore();
}

async function setProgress(key, status) {
  if (!VALID_STATUSES.has(status)) {
    throw new Error(`status must be one of ${[...VALID_STATUSES].sort()}`);
  }
  const progress = readProgressStore();
  if (status === "not_started") {
    delete progress[key];
  } else {
    progress[key] = status;
  }
  writeProgressStore(progress);
  return progress;
}

// ── helpers ──────────────────────────────────────────────────────────────

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

function countTopics(tree) {
  return tree.reduce(
    (a, p) => a + p.groups.reduce((b, g) => b + g.subtopics.reduce((c, s) => c + s.items.length, 0), 0),
    0
  );
}

const TIER_LABEL = { 1: "T1", 2: "T2", 3: "T3" };
const TIER_COLOR = { 1: "#DC2626", 2: "#D97706", 3: "#6B7280" };

// A vibrant spectrum so each phase reads as a distinct step on the journey
// (the source data colours nearly every phase the same blue). Applied to the
// tree at load time, so the sidebar, roadmap and dashboard all pick it up.
const PHASE_PALETTE = [
  "#3B82F6", "#6366F1", "#8B5CF6", "#A855F7", "#D946EF", "#EC4899",
  "#F43F5E", "#F97316", "#F59E0B", "#EAB308", "#84CC16", "#22C55E",
  "#10B981", "#14B8A6", "#06B6D4", "#7C3AED",
];
function applyPhaseColors(tree) {
  tree.forEach((ph, i) => { ph.color = PHASE_PALETTE[i % PHASE_PALETTE.length]; });
}

// Short, human descriptions per phase for the landing page + roadmap.
const PHASE_TAGLINE = {
  1:  "The bedrock — Python fluency plus the linear algebra, calculus, probability and statistics everything else stands on.",
  2:  "Regression, trees, SVMs and ensembles — the models that still win on real-world tabular data.",
  3:  "Neural nets from the ground up: CNNs, RNNs, LSTMs and your first generative models.",
  4:  "From tokenization to attention — how machines read, embed and retrieve human language.",
  5:  "Prompting, fine-tuning, RAG and agents — building real products on large language models.",
  6:  "Detection, segmentation and document OCR — making sense of the world from pixels.",
  7:  "Ship it: pipelines, serving, monitoring and deploying models that survive production.",
  8:  "Nodes, topics and control with ROS2 — bringing intelligence into the physical world.",
  9:  "Agents that learn by doing — policies, value functions, rewards and exploration.",
  10: "Learning on networks — graph neural nets, embeddings and relational data.",
  11: "The cutting-edge corners and techniques that set senior practitioners apart.",
  12: "Turning raw data into insight, experiments and decisions people act on.",
  13: "Pipelines, warehouses and streams — the plumbing that feeds every model.",
  14: "Enterprise-grade engineering on the C# / .NET stack.",
  15: "Clean code, design patterns and system design — the craft of building software.",
  16: "The capstone — deploy AI with customers, in the field, end to end as an FDE.",
};

const SECTIONS = [
  { key: "what_it_is",      label: "What it is",               icon: "📌" },
  { key: "why_it_exists",   label: "Why it exists",            icon: "💡" },
  { key: "how_it_works",    label: "How it works (intuition)", icon: "⚙️" },
  { key: "use_when",        label: "Use it when",              icon: "✅", tone: "good" },
  { key: "avoid_when",      label: "Skip it / reach for something else when", icon: "🚫", tone: "bad" },
  { key: "what_goes_wrong", label: "What goes wrong",          icon: "⚠️" },
  { key: "real_example",    label: "Real example",             icon: "🔬" },
];

// ── rich text rendering ──────────────────────────────────────────────────
// Section content is plain text written with light conventions so it reads
// cleanly as a study note: blank lines separate paragraphs, "- " starts a
// bullet, ```…``` fences a code block, and `…` marks inline code.

function renderInline(text) {
  const nodes = [];
  text.split(/(`[^`]+`)/g).forEach((part) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
      nodes.push(el("code", { text: part.slice(1, -1) }));
    } else if (part) {
      nodes.push(document.createTextNode(part));
    }
  });
  return nodes;
}

function renderProse(container, text) {
  text.trim().split(/\n\s*\n/).forEach((block) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    if (lines.every((l) => /^[-•]\s+/.test(l))) {
      const ul = el("ul", { class: "rich-list" });
      lines.forEach((l) => ul.appendChild(el("li", {}, renderInline(l.replace(/^[-•]\s+/, "")))));
      container.appendChild(ul);
    } else {
      container.appendChild(el("p", {}, renderInline(lines.join(" "))));
    }
  });
}

function renderRichText(text) {
  const container = el("div", { class: "rich-text" });
  if (!text) return container;
  const raw = text.replace(/\r\n/g, "\n").trim();
  raw.split(/```([\s\S]*?)```/g).forEach((part, i) => {
    if (i % 2 === 1) {
      const lines = part.replace(/^\n/, "").replace(/\n$/, "").split("\n");
      if (lines.length > 1 && /^[\w+-]{0,16}$/.test(lines[0])) lines.shift();
      container.appendChild(el("pre", { class: "rich-code" }, [el("code", { text: lines.join("\n") })]));
    } else if (part.trim()) {
      renderProse(container, part);
    }
  });
  return container;
}

const STATUS_LABEL = { not_started: "○ Not started", studying: "◐ Studying", done: "✓ Done" };

// ── progress helpers ─────────────────────────────────────────────────────

function getStatus(key) {
  return PROGRESS[key] || "not_started";
}

function collectGroupKeys(phaseNum, group) {
  const keys = [];
  group.subtopics.forEach((s) => s.items.forEach((item) => keys.push(`${phaseNum}|${group.name}|${s.name}|${item}`)));
  return keys;
}

function collectPhaseKeys(phase) {
  const keys = [];
  phase.groups.forEach((g) => keys.push(...collectGroupKeys(phase.phase, g)));
  return keys;
}

function summarize(keys) {
  let done = 0, studying = 0;
  keys.forEach((k) => {
    const st = getStatus(k);
    if (st === "done") done++;
    else if (st === "studying") studying++;
  });
  const total = keys.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return { total, done, studying, notStarted: total - done - studying, pct };
}

// ── theme ────────────────────────────────────────────────────────────────

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggleBtn.textContent = theme === "light" ? "☀️" : "🌙";
  localStorage.setItem("theme", theme);
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  applyTheme(current === "light" ? "dark" : "light");
}

// ── app state ────────────────────────────────────────────────────────────

let TREE = [];
let PROGRESS = {};
let selectedKey = null;
let searchQuery = "";
let currentView = "landing"; // "landing" | "notes" | "roadmap" | "dashboard"
let currentTier = "all";     // "all" | "1" | "2" | "3"

const subtitleEl     = document.getElementById("app-subtitle");
const sidebarEl      = document.getElementById("app-sidebar");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");
const menuToggleBtn  = document.getElementById("menu-toggle");
const treeEl         = document.getElementById("sidebar-tree");
const searchInput    = document.getElementById("search-input");
const tierFilterEl   = document.getElementById("tier-filter");
const viewTabsEl     = document.getElementById("view-tabs");
const themeToggleBtn = document.getElementById("theme-toggle");
const mainEl         = document.getElementById("app-main");
const roadmapEl      = document.getElementById("app-roadmap");
const dashboardEl    = document.getElementById("app-dashboard");
const landingEl      = document.getElementById("app-landing");
const brandBtn       = document.getElementById("brand");

// Sidebar nodes are rebuilt from scratch on every render (selection, status
// change, search…). Track which ones are expanded externally so rebuilds
// don't collapse the tree the user has open.
const openPhases    = new Set();
const openGroups    = new Set();
const openSubtopics = new Set();

applyTheme(localStorage.getItem("theme") || "dark");

themeToggleBtn.addEventListener("click", toggleTheme);

// ── mobile sidebar drawer ────────────────────────────────────────────────
// On desktop the sidebar is always part of the layout and these classes
// have no visual effect; on narrow screens (see style.css) they slide it
// in/out as an overlay.
function openSidebarDrawer() {
  sidebarEl.classList.add("open");
  sidebarBackdrop.classList.add("open");
}
function closeSidebarDrawer() {
  sidebarEl.classList.remove("open");
  sidebarBackdrop.classList.remove("open");
}
function toggleSidebarDrawer() {
  sidebarEl.classList.contains("open") ? closeSidebarDrawer() : openSidebarDrawer();
}

menuToggleBtn.addEventListener("click", toggleSidebarDrawer);
sidebarBackdrop.addEventListener("click", closeSidebarDrawer);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSidebarDrawer();
});

searchInput.addEventListener("input", (e) => {
  searchQuery = e.target.value;
  rerenderCurrentView();
});

tierFilterEl.querySelectorAll(".tier-pill").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentTier = btn.dataset.tier;
    tierFilterEl.querySelectorAll(".tier-pill").forEach((b) => b.classList.toggle("active", b === btn));
    rerenderCurrentView();
  });
});

viewTabsEl.querySelectorAll(".view-tab").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

function switchView(view) {
  currentView = view;
  viewTabsEl.querySelectorAll(".view-tab").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  sidebarEl.hidden   = view !== "notes";
  mainEl.hidden      = view !== "notes";
  roadmapEl.hidden   = view !== "roadmap";
  dashboardEl.hidden = view !== "dashboard";
  landingEl.hidden   = view !== "landing";
  closeSidebarDrawer();
  rerenderCurrentView();
  // jump scroll back to top when changing views
  [landingEl, mainEl, roadmapEl, dashboardEl].forEach((e) => { if (!e.hidden) e.scrollTop = 0; });
}

function rerenderCurrentView() {
  if (currentView === "landing") { renderLanding(); }
  else if (currentView === "notes") { renderSidebar(); renderNoteView(); }
  else if (currentView === "roadmap") { renderRoadmap(); }
  else if (currentView === "dashboard") { renderDashboard(); }
}

brandBtn.addEventListener("click", () => switchView("landing"));

function updateSubtitle() {
  const allKeys = [];
  TREE.forEach((ph) => allKeys.push(...collectPhaseKeys(ph)));
  const { total, done, studying, pct } = summarize(allKeys);
  subtitleEl.textContent = `${total.toLocaleString()} topics · ${done} done · ${studying} studying · ${pct}% complete`;
}

// ── sidebar ──────────────────────────────────────────────────────────────

function filterTree(tree, q, tier) {
  const needle = q.trim().toLowerCase();
  return tree
    .map((ph) => ({
      ...ph,
      groups: ph.groups
        .filter((g) => tier === "all" || String(g.tier) === String(tier))
        .map((g) => ({
          ...g,
          subtopics: g.subtopics
            .map((s) => ({ ...s, items: needle ? s.items.filter((it) => it.toLowerCase().includes(needle)) : s.items }))
            .filter((s) => s.items.length > 0),
        }))
        .filter((g) => g.subtopics.length > 0),
    }))
    .filter((ph) => ph.groups.length > 0);
}

function renderSidebar() {
  const filtered = filterTree(TREE, searchQuery, currentTier);
  const autoOpen = !!searchQuery.trim() || currentTier !== "all";

  treeEl.innerHTML = "";
  filtered.forEach((phase) => treeEl.appendChild(renderPhaseNode(phase, autoOpen)));
}

function renderPhaseNode(phase, autoOpen) {
  const id = `${phase.phase}`;
  let open = autoOpen || openPhases.has(id);
  const wrapper = el("div", { class: "phase-node" });
  const body = el("div");

  const { total, pct } = summarize(collectPhaseKeys(phase));

  const header = el(
    "div",
    {
      class: "phase-header",
      style: `--c:${phase.color}`,
      onclick: () => {
        open = !open;
        if (open) openPhases.add(id); else openPhases.delete(id);
        rebuild();
      },
    },
    [
      el("span", { class: "phase-emoji", text: phase.emoji }),
      el("div", { class: "phase-head-main" }, [
        el("div", { class: "phase-title", text: `Phase ${phase.phase}: ${phase.title}` }),
        el("div", { class: "phase-mini", text: `${total} topics · ${pct}% done` }),
      ]),
      el("span", { class: "chevron", text: open ? "▾" : "▸" }),
      el("div", { class: "phase-bar" }, [
        el("div", { class: "phase-bar-fill", style: `width:${pct}%; background:${phase.color}` }),
      ]),
    ]
  );

  function rebuild() {
    wrapper.classList.toggle("open", open || autoOpen);
    header.querySelector(".chevron").textContent = open ? "▾" : "▸";
    body.innerHTML = "";
    if (open || autoOpen) {
      phase.groups.forEach((g) =>
        body.appendChild(renderGroupNode(g, phase.phase, phase.color, autoOpen))
      );
    }
  }
  rebuild();

  wrapper.appendChild(header);
  wrapper.appendChild(body);
  return wrapper;
}

function renderGroupNode(group, phaseNum, phaseColor, autoOpen) {
  const id = `${phaseNum}|${group.name}`;
  let open = autoOpen || openGroups.has(id);
  const wrapper = el("div", { class: "group-node" });
  const body = el("div");

  const header = el(
    "div",
    {
      class: "group-header",
      onclick: () => {
        open = !open;
        if (open) openGroups.add(id); else openGroups.delete(id);
        rebuild();
      },
    },
    [
      el("span", { class: "group-name", text: group.name }),
      el("span", {
        class: "tier-badge",
        style: `color: ${TIER_COLOR[group.tier]}; border-color: ${TIER_COLOR[group.tier]}`,
        text: TIER_LABEL[group.tier],
      }),
      el("span", { class: "chevron", text: open ? "▾" : "▸" }),
    ]
  );

  function rebuild() {
    header.querySelector(".chevron").textContent = open ? "▾" : "▸";
    body.innerHTML = "";
    if (open || autoOpen) {
      group.subtopics.forEach((s) =>
        body.appendChild(renderSubtopicNode(s, phaseNum, group.name, phaseColor, autoOpen))
      );
    }
  }
  rebuild();

  wrapper.appendChild(header);
  wrapper.appendChild(body);
  return wrapper;
}

function renderSubtopicNode(subtopic, phaseNum, groupName, phaseColor, autoOpen) {
  const id = `${phaseNum}|${groupName}|${subtopic.name}`;
  let open = autoOpen || openSubtopics.has(id);
  const wrapper = el("div", { class: "subtopic-node" });
  const body = el("div");

  const header = el(
    "div",
    {
      class: "subtopic-header",
      onclick: () => {
        open = !open;
        if (open) openSubtopics.add(id); else openSubtopics.delete(id);
        rebuild();
      },
    },
    [
      el("span", { text: subtopic.name }),
      el("span", { class: "chevron", text: open ? "▾" : "▸" }),
    ]
  );

  function rebuild() {
    header.querySelector(".chevron").textContent = open ? "▾" : "▸";
    body.innerHTML = "";
    if (open || autoOpen) {
      subtopic.items.forEach((item) => {
        const key = `${phaseNum}|${groupName}|${subtopic.name}|${item}`;
        const active = key === selectedKey;
        const status = getStatus(key);
        const leaf = el(
          "div",
          {
            class: `item-leaf ${active ? "active" : ""}`,
            style: active ? `border-left: 3px solid ${phaseColor}` : "",
            onclick: () => selectTopic(key),
          },
          [
            el("span", { class: `status-dot ${status === "not_started" ? "" : status}`.trim() }),
            el("span", { class: "item-leaf-text", text: item }),
          ]
        );
        body.appendChild(leaf);
      });
    }
  }
  rebuild();

  wrapper.appendChild(header);
  wrapper.appendChild(body);
  return wrapper;
}

function selectTopic(key) {
  selectedKey = key;
  renderSidebar();
  renderNoteView();
  closeSidebarDrawer(); // no-op on desktop; closes the mobile drawer
}

// ── note view ────────────────────────────────────────────────────────────

let currentNote = null;
let currentMode = "empty"; // "empty" | "read" | "edit"
let currentDraft = {};
let currentLoading = false;
let currentError = null;
let loadToken = 0;

async function renderNoteView() {
  if (!selectedKey) {
    currentNote = null;
    currentMode = "empty";
    currentError = null;
    paintNoteView();
    return;
  }

  const token = ++loadToken;
  currentLoading = true;
  currentError = null;
  paintNoteView();

  try {
    const n = await fetchNote(selectedKey);
    if (token !== loadToken) return;
    if (n) { currentNote = n; currentMode = "read"; }
    else { currentNote = null; currentMode = "empty"; }
  } catch (e) {
    if (token !== loadToken) return;
    currentError = e.message;
  } finally {
    if (token === loadToken) {
      currentLoading = false;
      paintNoteView();
    }
  }
}

function handleEdit() {
  currentDraft = { ...currentNote.sections };
  currentMode = "edit";
  paintNoteView();
}

async function handleSave() {
  currentLoading = true;
  currentError = null;
  paintNoteView();
  try {
    currentNote = await saveNote(selectedKey, currentDraft);
    currentMode = "read";
  } catch (e) {
    currentError = e.message;
  } finally {
    currentLoading = false;
    paintNoteView();
  }
}

async function handleSetStatus(status) {
  if (getStatus(selectedKey) === status) return;
  try {
    PROGRESS = await setProgress(selectedKey, status);
  } catch (e) {
    currentError = e.message;
  }
  updateSubtitle();
  paintNoteView();
  renderSidebar();
}

function buildStatusPicker() {
  return el(
    "div",
    { class: "status-picker" },
    ["not_started", "studying", "done"].map((status) =>
      el("button", {
        class: `status-btn ${getStatus(selectedKey) === status ? "active" : ""}`,
        "data-status": status,
        text: STATUS_LABEL[status],
        onclick: () => handleSetStatus(status),
      })
    )
  );
}

function paintNoteView() {
  mainEl.innerHTML = "";

  if (!selectedKey) {
    mainEl.appendChild(
      el("div", { class: "note-view note-empty" }, [
        el("div", { class: "note-empty-icon", text: "📚" }),
        el("div", { class: "note-empty-text", text: "Select a topic from the sidebar to get started" }),
      ])
    );
    return;
  }

  const topicName = selectedKey.split("|").pop();
  const view = el("div", { class: "note-view" });

  view.appendChild(
    el("div", { class: "note-header" }, [
      el("h1", { class: "note-title", text: topicName }),
      el("div", { class: "note-breadcrumb", text: selectedKey.split("|").slice(0, -1).join(" › ") }),
    ])
  );

  view.appendChild(buildStatusPicker());

  if (currentError) {
    const errBox = el("div", { class: "note-error" }, [
      document.createTextNode(`⚠️ ${currentError}`),
    ]);
    errBox.appendChild(
      el("button", { class: "btn-close", text: "✕", onclick: () => { currentError = null; paintNoteView(); } })
    );
    view.appendChild(errBox);
  }

  if (currentLoading) {
    view.appendChild(
      el("div", { class: "note-loading" }, [
        el("div", { class: "spinner" }),
        el("span", { text: "Loading…" }),
      ])
    );
    mainEl.appendChild(view);
    return;
  }

  if (currentMode === "empty") {
    view.appendChild(
      el("div", { class: "note-empty-state" }, [
        el("p", { text: "No note available for this topic yet." }),
      ])
    );
  } else if (currentMode === "read" && currentNote) {
    const metaText = currentNote.model === "pre-written"
      ? "✍️ Pre-written study note"
      : `✏️ Edited ${currentNote.generated_at}`;
    view.appendChild(el("div", { class: "note-meta", text: metaText }));
    const sections = el("div", { class: "sections" });
    for (let i = 0; i < SECTIONS.length; i++) {
      const s = SECTIONS[i];
      const next = SECTIONS[i + 1];
      if (s.tone === "good" && next && next.tone === "bad") {
        sections.appendChild(
          el("div", { class: "section when-section" }, [
            el("div", { class: "section-heading" }, [
              el("span", { class: "section-icon", text: "🎯" }),
              el("span", { class: "section-label", text: "When to use it — and when not to" }),
            ]),
            el("div", { class: "when-grid" }, [
              el("div", { class: "when-block when-good" }, [
                el("div", { class: "when-block-head" }, [
                  el("span", { class: "when-block-icon", text: s.icon }),
                  el("span", { text: s.label }),
                ]),
                renderRichText(currentNote.sections[s.key]),
              ]),
              el("div", { class: "when-block when-bad" }, [
                el("div", { class: "when-block-head" }, [
                  el("span", { class: "when-block-icon", text: next.icon }),
                  el("span", { text: next.label }),
                ]),
                renderRichText(currentNote.sections[next.key]),
              ]),
            ]),
          ])
        );
        i++; // consumed the pair
        continue;
      }
      sections.appendChild(
        el("div", { class: "section" }, [
          el("div", { class: "section-heading" }, [
            el("span", { class: "section-icon", text: s.icon }),
            el("span", { class: "section-label", text: s.label }),
          ]),
          el("div", { class: "section-body" }, [renderRichText(currentNote.sections[s.key])]),
        ])
      );
    }
    view.appendChild(sections);
    view.appendChild(
      el("div", { class: "note-actions" }, [
        el("button", { class: "btn btn-secondary", text: "✏️ Edit", onclick: handleEdit }),
      ])
    );
  } else if (currentMode === "edit") {
    const sections = el("div", { class: "sections edit-mode" });
    SECTIONS.forEach(({ key, label, icon }) => {
      const textarea = el("textarea", { class: "section-textarea", rows: "4" });
      textarea.value = currentDraft[key] || "";
      textarea.addEventListener("input", (e) => { currentDraft[key] = e.target.value; });
      sections.appendChild(
        el("div", { class: "section" }, [
          el("div", { class: "section-heading" }, [
            el("span", { class: "section-icon", text: icon }),
            el("span", { class: "section-label", text: label }),
          ]),
          textarea,
        ])
      );
    });
    view.appendChild(sections);
    view.appendChild(
      el("div", { class: "note-actions" }, [
        el("button", { class: "btn btn-primary", text: "💾 Save", onclick: handleSave }),
        el("button", { class: "btn btn-ghost", text: "Cancel", onclick: () => { currentMode = "read"; paintNoteView(); } }),
      ])
    );
  }

  mainEl.appendChild(view);
}

// ── roadmap view ─────────────────────────────────────────────────────────

function renderRoadmap() {
  const filtered = filterTree(TREE, searchQuery, currentTier);
  roadmapEl.innerHTML = "";
  roadmapEl.appendChild(
    el("div", { class: "roadmap-head" }, [
      el("h1", { text: "Your learning roadmap" }),
      el("p", { text: "Sixteen phases from fundamentals to Forward Deployed Engineer — click any phase to expand its groups and track your progress." }),
    ])
  );
  const list = el("div", { class: "roadmap-list" });
  if (filtered.length) {
    filtered.forEach((phase) => list.appendChild(renderPhaseCard(phase)));
  } else {
    list.appendChild(el("div", { class: "tree-error", text: "No phases match your search or tier filter." }));
  }
  roadmapEl.appendChild(list);
}

function renderPhaseCard(phase) {
  let open = false;
  const card = el("div", { class: "phase-card", style: `--c:${phase.color}` });
  const body = el("div", { class: "phase-card-body" });
  body.style.display = "none";

  const keys = collectPhaseKeys(phase);
  const { total, done, studying, pct } = summarize(keys);
  const tierCounts = {};
  phase.groups.forEach((g) => { tierCounts[g.tier] = (tierCounts[g.tier] || 0) + 1; });

  const ring = el("div", { class: "progress-ring" }, [
    el("div", { class: "progress-ring-hole" }),
    el("span", { class: "progress-ring-pct", text: `${pct}%` }),
  ]);
  ring.style.background = `conic-gradient(${phase.color} ${pct}%, var(--surface2) 0)`;

  const header = el(
    "div",
    { class: "phase-card-header", onclick: () => { open = !open; rebuild(); } },
    [
      el("span", { class: "phase-card-emoji", text: phase.emoji }),
      el("div", { class: "phase-card-info" }, [
        el("div", { class: "phase-card-title", text: `Phase ${phase.phase}: ${phase.title}` }),
        el("div", { class: "phase-card-meta" }, [
          phase.duration ? el("span", { class: "pcm-dur", text: `⏱ ${phase.duration}` }) : null,
          el("span", { text: `${phase.groups.length} groups · ${total} items` }),
          el("span", { text: `${done} done · ${studying} studying` }),
          el(
            "span",
            { class: "phase-card-tiers" },
            [1, 2, 3].filter((t) => tierCounts[t]).map((t) =>
              el("span", {
                class: "tier-badge",
                style: `color: ${TIER_COLOR[t]}; border-color: ${TIER_COLOR[t]}`,
                text: `${TIER_LABEL[t]}×${tierCounts[t]}`,
              })
            )
          ),
        ]),
        PHASE_TAGLINE[phase.phase]
          ? el("div", { class: "phase-card-tagline", text: PHASE_TAGLINE[phase.phase] })
          : null,
      ]),
      ring,
      el("span", { class: "phase-card-chevron", text: open ? "▾" : "▸" }),
    ]
  );

  function rebuild() {
    card.classList.toggle("expanded", open);
    header.querySelector(".phase-card-chevron").textContent = open ? "▾" : "▸";
    body.style.display = open ? "block" : "none";
    body.innerHTML = "";
    if (open) {
      phase.groups.forEach((g) => body.appendChild(renderRoadmapGroupRow(phase, g)));
    }
  }
  rebuild();

  card.appendChild(header);
  card.appendChild(body);
  return card;
}

function renderRoadmapGroupRow(phase, group) {
  const keys = collectGroupKeys(phase.phase, group);
  const { total, done, pct } = summarize(keys);
  return el("div", { class: "roadmap-group-row", style: `--c:${phase.color}` }, [
    el("span", { class: "roadmap-group-name" }, [
      el("span", {
        class: "tier-badge",
        style: `color: ${TIER_COLOR[group.tier]}; border-color: ${TIER_COLOR[group.tier]}`,
        text: TIER_LABEL[group.tier],
      }),
      el("span", { class: "gname", text: group.name }),
    ]),
    el("span", { class: "roadmap-group-count", text: `${done}/${total}` }),
    el("div", { class: "roadmap-group-bar" }, [
      el("div", { class: "roadmap-group-bar-fill", style: `width: ${pct}%` }),
    ]),
  ]);
}

// ── dashboard / progress view ────────────────────────────────────────────

function renderDashboard() {
  const filtered = filterTree(TREE, searchQuery, currentTier);
  const allKeys = [];
  filtered.forEach((ph) => allKeys.push(...collectPhaseKeys(ph)));
  const { total, done, studying, pct } = summarize(allKeys);

  dashboardEl.innerHTML = "";

  dashboardEl.appendChild(
    el("div", { class: "dashboard-stats" }, [
      el("div", { class: "stat-card" }, [
        el("div", { class: "stat-card-value", text: total.toLocaleString() }),
        el("div", { class: "stat-card-label", text: "Total topics" }),
      ]),
      el("div", { class: "stat-card done" }, [
        el("div", { class: "stat-card-value", text: done.toLocaleString() }),
        el("div", { class: "stat-card-label", text: "Done" }),
      ]),
      el("div", { class: "stat-card studying" }, [
        el("div", { class: "stat-card-value", text: studying.toLocaleString() }),
        el("div", { class: "stat-card-label", text: "Studying" }),
      ]),
      el("div", { class: "stat-card complete" }, [
        el("div", { class: "stat-card-value", text: `${pct}%` }),
        el("div", { class: "stat-card-label", text: "Complete" }),
      ]),
    ])
  );

  const list = el("div", { class: "dashboard-list" });
  filtered.forEach((phase) => {
    const s = summarize(collectPhaseKeys(phase));
    const row = el("div", { class: "dashboard-row" });
    row.style.borderLeftColor = phase.color;
    row.appendChild(
      el("div", { class: "dashboard-row-top" }, [
        el("span", { class: "dashboard-row-emoji", text: phase.emoji }),
        el("span", { class: "dashboard-row-title", text: `Phase ${phase.phase}: ${phase.title}` }),
        el("span", { class: "dashboard-row-frac", text: `${s.done}/${s.total}` }),
        el("span", { class: "dashboard-row-pct", text: `${s.pct}%` }),
      ])
    );
    row.appendChild(
      el("div", { class: "progress-bar" }, [
        el("div", { class: "progress-bar-fill", style: `width: ${s.pct}%; background: ${phase.color}` }),
      ])
    );
    row.appendChild(
      el("div", {
        class: "dashboard-row-meta",
        text: `${phase.groups.length} groups · ${s.studying} studying · ${s.notStarted} not started`,
      })
    );
    list.appendChild(row);
  });
  dashboardEl.appendChild(list);
}

// ── landing / home ─────────────────────────────────────────────────────────

function heroStat(num, lbl) {
  return el("div", { class: "hero-stat" }, [
    el("div", { class: "hero-stat-num", text: num }),
    el("div", { class: "hero-stat-lbl", text: lbl }),
  ]);
}

function renderPathCard(phase) {
  const { total, pct } = summarize(collectPhaseKeys(phase));
  return el(
    "div",
    { class: "path-card", style: `--c:${phase.color}`, onclick: () => switchView("roadmap") },
    [
      el("div", { class: "path-card-top" }, [
        el("span", { class: "path-num", text: String(phase.phase) }),
        el("span", { class: "path-emoji", text: phase.emoji }),
        el("span", { class: "path-title", text: phase.title }),
      ]),
      el("div", { class: "path-tagline", text: PHASE_TAGLINE[phase.phase] || "" }),
      el("div", { class: "path-foot" }, [
        el("div", { class: "path-mini-bar" }, [
          el("div", { class: "path-mini-fill", style: `width:${pct}%; background:${phase.color}` }),
        ]),
        el("span", { class: "path-count", text: `${total} topics` }),
      ]),
    ]
  );
}

function renderLanding() {
  const allKeys = [];
  TREE.forEach((ph) => allKeys.push(...collectPhaseKeys(ph)));
  const { total, done, pct } = summarize(allKeys);

  landingEl.innerHTML = "";
  const root = el("div", { class: "landing" });

  // Hero
  root.appendChild(
    el("section", { class: "hero" }, [
      el("div", { class: "hero-glow" }),
      el("div", { class: "hero-badge" }, [
        el("span", { class: "dot" }),
        el("span", { text: "AI / ML Mastery Path" }),
      ]),
      el("h1", { class: "hero-title" }, [
        document.createTextNode("Go from "),
        el("span", { class: "grad-text", text: "fundamentals" }),
        document.createTextNode(" to "),
        el("span", { class: "grad-text", text: "Forward Deployed Engineer" }),
      ]),
      el("p", {
        class: "hero-sub",
        text:
          `A structured ${total.toLocaleString()}-topic roadmap across 16 phases. Every concept ` +
          `comes with a clear study note — what it is, why it exists, how it works, and when to ` +
          `use it. Track what you've learned and study at your own pace.`,
      }),
      el("div", { class: "hero-cta" }, [
        el("button", { class: "btn btn-primary btn-lg", text: "🚀 Start learning", onclick: () => switchView("notes") }),
        el("button", { class: "btn btn-secondary btn-lg", text: "🗺️ Explore the roadmap", onclick: () => switchView("roadmap") }),
      ]),
      el("div", { class: "hero-stats" }, [
        heroStat("16", "Phases"),
        heroStat(total.toLocaleString(), "Topics"),
        heroStat(`${pct}%`, "Complete"),
        heroStat(done.toLocaleString(), "Done"),
      ]),
    ])
  );

  // The path
  const pathGrid = el("div", { class: "path-grid" });
  TREE.forEach((phase) => pathGrid.appendChild(renderPathCard(phase)));
  root.appendChild(
    el("section", { class: "landing-section" }, [
      el("div", { class: "landing-eyebrow", text: "The journey" }),
      el("h2", { class: "landing-h2", text: "Your learning path" }),
      el("p", { class: "landing-p", text: "Sixteen phases, each building on the last — from Python and math all the way to deploying AI in the field." }),
      pathGrid,
    ])
  );

  // Features
  const features = [
    ["🧩", "Six-section notes", "Every topic is explained the same way — what it is, why it exists, how it works, when to use it, what goes wrong, and a real example."],
    ["📈", "Track your progress", "Mark topics as studying or done. Your progress is saved right in your browser — nothing to set up, nothing to lose."],
    ["🎯", "Career-focused", "Sequenced toward real ML and Forward Deployed Engineer roles, so you always know what to learn next."],
    ["✏️", "Make it yours", "Edit any note and save your own understanding, in your own words."],
  ];
  const featGrid = el("div", { class: "feature-grid" });
  features.forEach(([icon, title, text]) =>
    featGrid.appendChild(
      el("div", { class: "feature-card" }, [
        el("div", { class: "feature-icon", text: icon }),
        el("div", { class: "feature-title", text: title }),
        el("div", { class: "feature-text", text: text }),
      ])
    )
  );
  root.appendChild(
    el("section", { class: "landing-section" }, [
      el("div", { class: "landing-eyebrow", text: "Why it works" }),
      el("h2", { class: "landing-h2", text: "Built to make it stick" }),
      featGrid,
    ])
  );

  // CTA band
  root.appendChild(
    el("div", { class: "landing-cta-band" }, [
      el("h2", { text: pct > 0 ? `You're ${pct}% of the way there` : "Ready to start?" }),
      el("p", { text: pct > 0
        ? "Pick up where you left off and keep the momentum going."
        : "Open Phase 1 and begin with Python & Mathematics — the foundation for everything else." }),
      el("button", { class: "btn btn-primary btn-lg",
        text: pct > 0 ? "↪ Continue studying" : "🚀 Start with Phase 1",
        onclick: () => switchView("notes") }),
    ])
  );

  root.appendChild(
    el("div", { class: "landing-footer", text: "NeuroPath · a self-paced AI/ML study roadmap · your progress stays in your browser" })
  );

  landingEl.appendChild(root);
}

// ── boot ─────────────────────────────────────────────────────────────────

Promise.all([fetchTopics(), fetchProgress().catch(() => ({}))])
  .then(([tree, progress]) => {
    TREE = tree;
    applyPhaseColors(TREE);
    PROGRESS = progress;
    updateSubtitle();
    switchView(currentView); // initial view is "landing"
  })
  .catch(() => {
    subtitleEl.textContent = "Failed to load";
    landingEl.hidden = true;
    mainEl.hidden = false;
    treeEl.innerHTML = "";
    treeEl.appendChild(el("div", { class: "tree-error", text: "Could not load topics. Is the backend running?" }));
  });
