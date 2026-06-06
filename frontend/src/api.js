const BASE = "http://localhost:8000/api";

function encodeKey(key) {
  const bytes = new TextEncoder().encode(key);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export async function fetchTopics() {
  const r = await fetch(`${BASE}/topics`);
  if (!r.ok) throw new Error("Failed to load topics");
  return r.json();
}

export async function fetchNote(key) {
  const r = await fetch(`${BASE}/note/${encodeKey(key)}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("Failed to fetch note");
  return r.json();
}

export async function generateNote(key) {
  const r = await fetch(`${BASE}/note/${encodeKey(key)}/generate`, {
    method: "POST",
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail || "Generation failed");
  }
  return r.json();
}

export async function saveNote(key, sections) {
  const r = await fetch(`${BASE}/note/${encodeKey(key)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sections }),
  });
  if (!r.ok) throw new Error("Save failed");
  return r.json();
}

export async function deleteNote(key) {
  const r = await fetch(`${BASE}/note/${encodeKey(key)}`, { method: "DELETE" });
  if (!r.ok) throw new Error("Delete failed");
  return r.json();
}
