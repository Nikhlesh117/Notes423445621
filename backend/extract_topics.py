#!/usr/bin/env python3
"""
Decode the gzip+base64-encoded roadmap from the JSX source file.
Outputs topics_tree.json and topics_flat.json alongside this script.

Usage:
    python3 extract_topics.py /path/to/learning_roadmap.jsx
"""
import re, base64, gzip, json, sys, pathlib

FALLBACK_COLORS = [
    "#3B82F6","#10B981","#F59E0B","#06B6D4","#8B5CF6",
    "#F97316","#EF4444","#DC2626","#7C3AED","#0EA5E9",
    "#059669","#0891B2","#7C3AED","#059669","#B45309","#7C3AED"
]

def decode_jsx(jsx_path: str) -> list:
    text = pathlib.Path(jsx_path).read_text(encoding="utf-8")
    m = re.search(r'const DATA="([^"]+)"', text)
    if not m:
        raise ValueError("Could not find 'const DATA=' in the JSX file")
    b64 = m.group(1)
    # Add padding in case encoder stripped it
    padded = b64 + "=" * (-len(b64) % 4)
    raw = base64.b64decode(padded)
    return json.loads(gzip.decompress(raw).decode("utf-8"))

def expand_phase(ph: dict, index: int) -> dict:
    """Expand a mini-JSON phase object to human-readable keys.
    The actual mini-JSON key names are discovered dynamically from the data.
    """
    # Try common single-letter key patterns
    def get(obj, *candidates):
        for k in candidates:
            if k in obj:
                return obj[k]
        return None

    phase_num  = get(ph, "p", "phase") or (index + 1)
    emoji      = get(ph, "e", "emoji") or ""
    color      = get(ph, "c", "color") or FALLBACK_COLORS[index % len(FALLBACK_COLORS)]
    title      = get(ph, "t", "title") or f"Phase {phase_num}"
    duration   = get(ph, "d", "duration") or ""
    why        = get(ph, "w", "why") or ""
    groups_raw = get(ph, "g", "groups") or []

    groups = []
    for g in groups_raw:
        group_name  = get(g, "n", "name") or ""
        group_tier  = get(g, "t", "tier") or 2
        subs_raw    = get(g, "s", "subtopics") or []

        subtopics = []
        for s in subs_raw:
            sub_name  = get(s, "n", "name") or ""
            items     = get(s, "i", "items") or []
            subtopics.append({"name": sub_name, "items": items})

        groups.append({"name": group_name, "tier": group_tier, "subtopics": subtopics})

    return {
        "phase":    phase_num,
        "emoji":    emoji,
        "color":    color,
        "title":    title,
        "duration": duration,
        "why":      why,
        "groups":   groups,
    }

def build_flat(roadmap: list) -> list:
    records = []
    for ph in roadmap:
        for g in ph["groups"]:
            for s in g["subtopics"]:
                for item in s["items"]:
                    key = f"{ph['phase']}|{g['name']}|{s['name']}|{item}"
                    records.append({
                        "key":      key,
                        "phase":    ph["phase"],
                        "emoji":    ph["emoji"],
                        "color":    ph["color"],
                        "title":    ph["title"],
                        "group":    g["name"],
                        "tier":     g["tier"],
                        "subtopic": s["name"],
                        "item":     item,
                    })
    return records

if __name__ == "__main__":
    jsx_path = sys.argv[1] if len(sys.argv) > 1 else "3d6fea7a-learning_roadmap_1.jsx"

    print(f"Decoding {jsx_path} ...")
    mini = decode_jsx(jsx_path)

    # Print the first phase keys to confirm key names
    if mini and isinstance(mini, list):
        print(f"Sample phase keys: {list(mini[0].keys())}")
        first_group = (mini[0].get("g") or mini[0].get("groups") or [{}])[0]
        print(f"Sample group keys: {list(first_group.keys())}")

    roadmap = [expand_phase(ph, i) for i, ph in enumerate(mini)]
    flat    = build_flat(roadmap)

    out_tree = pathlib.Path(__file__).parent / "topics_tree.json"
    out_flat = pathlib.Path(__file__).parent / "topics_flat.json"

    out_tree.write_text(json.dumps(roadmap, ensure_ascii=False, indent=2))
    out_flat.write_text(json.dumps(flat, ensure_ascii=False, indent=2))

    print(f"Wrote {len(roadmap)} phases  →  {out_tree}")
    print(f"Wrote {len(flat)} leaf topics  →  {out_flat}")
