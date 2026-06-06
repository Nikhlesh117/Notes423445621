import { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import NoteView from "./components/NoteView";
import { fetchTopics } from "./api";

export default function App() {
  const [tree,        setTree]        = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [treeError,   setTreeError]   = useState(null);

  useEffect(() => {
    fetchTopics()
      .then(setTree)
      .catch(() => setTreeError("Could not load topics. Is the backend running?"));
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-left">
          <span className="app-logo">🧠</span>
          <div>
            <div className="app-title">AI/ML Notes</div>
            <div className="app-subtitle">
              {tree.length > 0
                ? `${tree.reduce((a, p) => a + p.groups.reduce((b, g) => b + g.subtopics.reduce((c, s) => c + s.items.length, 0), 0), 0).toLocaleString()} topics across ${tree.length} phases`
                : "Loading…"}
            </div>
          </div>
        </div>
      </header>

      <div className="app-body">
        <aside className="app-sidebar">
          {treeError ? (
            <div className="tree-error">{treeError}</div>
          ) : (
            <Sidebar tree={tree} selectedKey={selectedKey} onSelect={setSelectedKey} />
          )}
        </aside>
        <main className="app-main">
          <NoteView topicKey={selectedKey} />
        </main>
      </div>
    </div>
  );
}
