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

async function generateNote(key) {
  const r = await fetch(`${BASE}/note/${encodeKey(key)}/generate`, { method: "POST" });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail || "Generation failed");
  }
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

async function deleteNote(key) {
  const r = await fetch(`${BASE}/note/${encodeKey(key)}`, { method: "DELETE" });
  if (!r.ok) throw new Error("Delete failed");
  return r.json();
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

const SECTIONS = [
  { key: "what_it_is",      label: "What it is",               icon: "📌" },
  { key: "why_it_exists",   label: "Why it exists",            icon: "💡" },
  { key: "how_it_works",    label: "How it works (intuition)", icon: "⚙️" },
  { key: "when_to_use",     label: "When to use vs not use",   icon: "🎯" },
  { key: "what_goes_wrong", label: "What goes wrong",          icon: "⚠️" },
  { key: "real_example",    label: "Real example",             icon: "🔬" },
];

// ── app state ────────────────────────────────────────────────────────────

let TREE = [];
let selectedKey = null;
let searchQuery = "";

const subtitleEl   = document.getElementById("app-subtitle");
const treeEl       = document.getElementById("sidebar-tree");
const searchInput  = document.getElementById("search-input");
const mainEl       = document.getElementById("app-main");

searchInput.addEventListener("input", (e) => {
  searchQuery = e.target.value;
  renderSidebar();
});

// ── sidebar ──────────────────────────────────────────────────────────────

function filterTree(tree, q) {
  if (!q.trim()) return tree;
  const needle = q.toLowerCase();
  return tree
    .map((ph) => ({
      ...ph,
      groups: ph.groups
        .map((g) => ({
          ...g,
          subtopics: g.subtopics
            .map((s) => ({ ...s, items: s.items.filter((it) => it.toLowerCase().includes(needle)) }))
            .filter((s) => s.items.length > 0),
        }))
        .filter((g) => g.subtopics.length > 0),
    }))
    .filter((ph) => ph.groups.length > 0);
}

function renderSidebar() {
  const filtered = filterTree(TREE, searchQuery);
  const autoOpen = !!searchQuery.trim();

  treeEl.innerHTML = "";
  filtered.forEach((phase) => treeEl.appendChild(renderPhaseNode(phase, autoOpen)));
}

function renderPhaseNode(phase, autoOpen) {
  let open = autoOpen;
  const wrapper = el("div", { class: "phase-node" });
  const body = el("div");

  const header = el(
    "div",
    {
      class: "phase-header",
      style: `border-left: 4px solid ${phase.color}`,
      onclick: () => {
        open = !open;
        rebuild();
      },
    },
    [
      el("span", { class: "phase-emoji", text: phase.emoji }),
      el("span", { class: "phase-title", text: `Phase ${phase.phase}: ${phase.title}` }),
      el("span", { class: "chevron", text: open ? "▾" : "▸" }),
    ]
  );

  function rebuild() {
    header.querySelector(".chevron").textContent = open ? "▾" : "▸";
    body.innerHTML = "";
    if (open || autoOpen) {
      const isOpen = open || autoOpen;
      if (isOpen) {
        phase.groups.forEach((g) =>
          body.appendChild(renderGroupNode(g, phase.phase, phase.color, autoOpen))
        );
      }
    }
  }
  rebuild();

  wrapper.appendChild(header);
  wrapper.appendChild(body);
  return wrapper;
}

function renderGroupNode(group, phaseNum, phaseColor, autoOpen) {
  let open = autoOpen;
  const wrapper = el("div", { class: "group-node" });
  const body = el("div");

  const header = el(
    "div",
    {
      class: "group-header",
      onclick: () => {
        open = !open;
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
  let open = autoOpen;
  const wrapper = el("div", { class: "subtopic-node" });
  const body = el("div");

  const header = el(
    "div",
    {
      class: "subtopic-header",
      onclick: () => {
        open = !open;
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
        const leaf = el("div", {
          class: `item-leaf ${active ? "active" : ""}`,
          style: active ? `border-left: 3px solid ${phaseColor}` : "",
          text: item,
          onclick: () => selectTopic(key),
        });
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

async function handleGenerate() {
  currentLoading = true;
  currentError = null;
  paintNoteView();
  try {
    currentNote = await generateNote(selectedKey);
    currentMode = "read";
  } catch (e) {
    currentError = e.message;
  } finally {
    currentLoading = false;
    paintNoteView();
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

async function handleRegenerate() {
  if (!window.confirm("Regenerate this note? Your edits will be overwritten.")) return;
  await deleteNote(selectedKey).catch(() => {});
  handleGenerate();
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
        el("span", { text: "Generating note with Claude…" }),
      ])
    );
    mainEl.appendChild(view);
    return;
  }

  if (currentMode === "empty") {
    view.appendChild(
      el("div", { class: "note-empty-state" }, [
        el("p", { text: "No note saved for this topic yet." }),
        el("button", { class: "btn btn-primary", text: "✨ Generate with Claude", onclick: handleGenerate }),
      ])
    );
  } else if (currentMode === "read" && currentNote) {
    view.appendChild(
      el("div", { class: "note-meta", text: `Generated ${currentNote.generated_at} · ${currentNote.model}` })
    );
    const sections = el("div", { class: "sections" });
    SECTIONS.forEach(({ key, label, icon }) => {
      sections.appendChild(
        el("div", { class: "section" }, [
          el("div", { class: "section-heading" }, [
            el("span", { class: "section-icon", text: icon }),
            el("span", { class: "section-label", text: label }),
          ]),
          el("div", { class: "section-body", text: currentNote.sections[key] }),
        ])
      );
    });
    view.appendChild(sections);
    view.appendChild(
      el("div", { class: "note-actions" }, [
        el("button", { class: "btn btn-secondary", text: "✏️ Edit", onclick: handleEdit }),
        el("button", { class: "btn btn-ghost", text: "🔄 Regenerate", onclick: handleRegenerate }),
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

// ── boot ─────────────────────────────────────────────────────────────────

fetchTopics()
  .then((tree) => {
    TREE = tree;
    subtitleEl.textContent = `${countTopics(tree).toLocaleString()} topics across ${tree.length} phases`;
    renderSidebar();
    renderNoteView();
  })
  .catch(() => {
    subtitleEl.textContent = "Failed to load";
    treeEl.innerHTML = "";
    treeEl.appendChild(el("div", { class: "tree-error", text: "Could not load topics. Is the backend running?" }));
  });
