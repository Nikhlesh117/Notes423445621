import { useState, useMemo } from "react";

export default function Sidebar({ tree, selectedKey, onSelect }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return tree;
    const q = search.toLowerCase();
    return tree
      .map((ph) => ({
        ...ph,
        groups: ph.groups
          .map((g) => ({
            ...g,
            subtopics: g.subtopics
              .map((s) => ({
                ...s,
                items: s.items.filter((it) => it.toLowerCase().includes(q)),
              }))
              .filter((s) => s.items.length > 0),
          }))
          .filter((g) => g.subtopics.length > 0),
      }))
      .filter((ph) => ph.groups.length > 0);
  }, [tree, search]);

  return (
    <div className="sidebar">
      <div className="sidebar-search">
        <input
          placeholder="Search topics…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="sidebar-tree">
        {filtered.map((phase) => (
          <PhaseNode
            key={phase.phase}
            phase={phase}
            selectedKey={selectedKey}
            onSelect={onSelect}
            autoOpen={!!search.trim()}
          />
        ))}
      </div>
    </div>
  );
}

function PhaseNode({ phase, selectedKey, onSelect, autoOpen }) {
  const [open, setOpen] = useState(false);
  const isOpen = autoOpen || open;

  return (
    <div className="phase-node">
      <div
        className="phase-header"
        style={{ borderLeft: `4px solid ${phase.color}` }}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="phase-emoji">{phase.emoji}</span>
        <span className="phase-title">
          Phase {phase.phase}: {phase.title}
        </span>
        <span className="chevron">{isOpen ? "▾" : "▸"}</span>
      </div>

      {isOpen &&
        phase.groups.map((g) => (
          <GroupNode
            key={g.name}
            group={g}
            phaseNum={phase.phase}
            phaseColor={phase.color}
            selectedKey={selectedKey}
            onSelect={onSelect}
            autoOpen={autoOpen}
          />
        ))}
    </div>
  );
}

const TIER_LABEL = { 1: "T1", 2: "T2", 3: "T3" };
const TIER_COLOR = { 1: "#DC2626", 2: "#D97706", 3: "#6B7280" };

function GroupNode({ group, phaseNum, phaseColor, selectedKey, onSelect, autoOpen }) {
  const [open, setOpen] = useState(false);
  const isOpen = autoOpen || open;

  return (
    <div className="group-node">
      <div className="group-header" onClick={() => setOpen((o) => !o)}>
        <span className="group-name">{group.name}</span>
        <span
          className="tier-badge"
          style={{ color: TIER_COLOR[group.tier], borderColor: TIER_COLOR[group.tier] }}
        >
          {TIER_LABEL[group.tier]}
        </span>
        <span className="chevron">{isOpen ? "▾" : "▸"}</span>
      </div>

      {isOpen &&
        group.subtopics.map((s) => (
          <SubtopicNode
            key={s.name}
            subtopic={s}
            phaseNum={phaseNum}
            groupName={group.name}
            phaseColor={phaseColor}
            selectedKey={selectedKey}
            onSelect={onSelect}
            autoOpen={autoOpen}
          />
        ))}
    </div>
  );
}

function SubtopicNode({
  subtopic,
  phaseNum,
  groupName,
  phaseColor,
  selectedKey,
  onSelect,
  autoOpen,
}) {
  const [open, setOpen] = useState(false);
  const isOpen = autoOpen || open;

  return (
    <div className="subtopic-node">
      <div className="subtopic-header" onClick={() => setOpen((o) => !o)}>
        <span>{subtopic.name}</span>
        <span className="chevron">{isOpen ? "▾" : "▸"}</span>
      </div>

      {isOpen &&
        subtopic.items.map((item) => {
          const key = `${phaseNum}|${groupName}|${subtopic.name}|${item}`;
          const active = key === selectedKey;
          return (
            <div
              key={key}
              className={`item-leaf ${active ? "active" : ""}`}
              style={active ? { borderLeft: `3px solid ${phaseColor}` } : {}}
              onClick={() => onSelect(key)}
            >
              {item}
            </div>
          );
        })}
    </div>
  );
}
