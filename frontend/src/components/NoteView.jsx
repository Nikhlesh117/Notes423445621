import { useState, useEffect } from "react";
import { fetchNote, generateNote, saveNote, deleteNote } from "../api";

const SECTIONS = [
  { key: "what_it_is",      label: "What it is",                  icon: "📌" },
  { key: "why_it_exists",   label: "Why it exists",               icon: "💡" },
  { key: "how_it_works",    label: "How it works (intuition)",    icon: "⚙️"  },
  { key: "when_to_use",     label: "When to use vs not use",      icon: "🎯" },
  { key: "what_goes_wrong", label: "What goes wrong",             icon: "⚠️"  },
  { key: "real_example",    label: "Real example",                icon: "🔬" },
];

export default function NoteView({ topicKey }) {
  const [note,    setNote]    = useState(null);
  const [mode,    setMode]    = useState("empty"); // "empty" | "read" | "edit"
  const [draft,   setDraft]   = useState({});
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!topicKey) { setNote(null); setMode("empty"); return; }
    setLoading(true);
    setError(null);
    fetchNote(topicKey)
      .then((n) => { if (n) { setNote(n); setMode("read"); } else { setNote(null); setMode("empty"); } })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [topicKey]);

  const handleGenerate = async () => {
    setLoading(true); setError(null);
    try { const n = await generateNote(topicKey); setNote(n); setMode("read"); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleEdit = () => { setDraft({ ...note.sections }); setMode("edit"); };

  const handleSave = async () => {
    setLoading(true); setError(null);
    try { const n = await saveNote(topicKey, draft); setNote(n); setMode("read"); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleRegenerate = async () => {
    if (!window.confirm("Regenerate this note? Your edits will be overwritten.")) return;
    await deleteNote(topicKey).catch(() => {});
    handleGenerate();
  };

  // ── empty panel ────────────────────────────────────────────────────────
  if (!topicKey) {
    return (
      <div className="note-view note-empty">
        <div className="note-empty-icon">📚</div>
        <div className="note-empty-text">Select a topic from the sidebar to get started</div>
      </div>
    );
  }

  const topicName = topicKey.split("|").pop();

  return (
    <div className="note-view">
      <div className="note-header">
        <h1 className="note-title">{topicName}</h1>
        <div className="note-breadcrumb">{topicKey.split("|").slice(0, -1).join(" › ")}</div>
      </div>

      {error && (
        <div className="note-error">
          ⚠️ {error}
          <button onClick={() => setError(null)} className="btn-close">✕</button>
        </div>
      )}

      {loading && (
        <div className="note-loading">
          <div className="spinner" />
          <span>Generating note with Claude…</span>
        </div>
      )}

      {!loading && mode === "empty" && (
        <div className="note-empty-state">
          <p>No note saved for this topic yet.</p>
          <button className="btn btn-primary" onClick={handleGenerate}>
            ✨ Generate with Claude
          </button>
        </div>
      )}

      {!loading && mode === "read" && note && (
        <>
          <div className="note-meta">
            Generated {note.generated_at} · {note.model}
          </div>
          <div className="sections">
            {SECTIONS.map(({ key, label, icon }) => (
              <div key={key} className="section">
                <div className="section-heading">
                  <span className="section-icon">{icon}</span>
                  <span className="section-label">{label}</span>
                </div>
                <div className="section-body">{note.sections[key]}</div>
              </div>
            ))}
          </div>
          <div className="note-actions">
            <button className="btn btn-secondary" onClick={handleEdit}>✏️ Edit</button>
            <button className="btn btn-ghost" onClick={handleRegenerate}>🔄 Regenerate</button>
          </div>
        </>
      )}

      {!loading && mode === "edit" && (
        <>
          <div className="sections edit-mode">
            {SECTIONS.map(({ key, label, icon }) => (
              <div key={key} className="section">
                <div className="section-heading">
                  <span className="section-icon">{icon}</span>
                  <span className="section-label">{label}</span>
                </div>
                <textarea
                  className="section-textarea"
                  value={draft[key] || ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [key]: e.target.value }))
                  }
                  rows={4}
                />
              </div>
            ))}
          </div>
          <div className="note-actions">
            <button className="btn btn-primary" onClick={handleSave}>💾 Save</button>
            <button className="btn btn-ghost" onClick={() => setMode("read")}>Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}
