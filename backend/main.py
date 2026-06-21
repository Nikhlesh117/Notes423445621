import base64
import datetime
import json
import pathlib

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE_DIR   = pathlib.Path(__file__).parent
NOTES_DIR  = BASE_DIR / "notes"
NOTES_DIR.mkdir(exist_ok=True)

PHASE_NOTES_DIR = BASE_DIR / "phase_notes"
_phase_notes_cache: dict[int, dict] = {}

def load_phase_notes(phase_num: int) -> dict:
    if phase_num not in _phase_notes_cache:
        path = PHASE_NOTES_DIR / f"phase_{phase_num:02d}.json"
        if path.exists():
            _phase_notes_cache[phase_num] = json.loads(path.read_text(encoding="utf-8"))
        else:
            _phase_notes_cache[phase_num] = {}
    return _phase_notes_cache[phase_num]

TOPICS_TREE: list = json.loads((BASE_DIR / "topics_tree.json").read_text(encoding="utf-8"))

def _build_index(tree: list) -> dict:
    index = {}
    for ph in tree:
        for g in ph["groups"]:
            for s in g["subtopics"]:
                for item in s["items"]:
                    key = f"{ph['phase']}|{g['name']}|{s['name']}|{item}"
                    index[key] = {
                        "key": key, "phase": ph["phase"], "emoji": ph["emoji"],
                        "color": ph["color"], "title": ph["title"],
                        "group": g["name"], "tier": g["tier"],
                        "subtopic": s["name"], "item": item,
                    }
    return index

TOPICS_INDEX: dict = _build_index(TOPICS_TREE)

app = FastAPI(title="AI/ML Notes API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:8000", "http://localhost:8000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── helpers ────────────────────────────────────────────────────────────────

def decode_key(encoded: str) -> str:
    padded = encoded + "=" * (-len(encoded) % 4)
    return base64.urlsafe_b64decode(padded).decode("utf-8")

def note_path(encoded: str) -> pathlib.Path:
    return NOTES_DIR / (encoded + ".json")

# ── models ─────────────────────────────────────────────────────────────────

class Sections(BaseModel):
    what_it_is:      str
    why_it_exists:   str
    how_it_works:    str
    use_when:        str
    avoid_when:      str
    what_goes_wrong: str
    real_example:    str

class NoteResponse(BaseModel):
    key:          str
    generated_at: str
    model:        str
    sections:     Sections

class NoteUpdateRequest(BaseModel):
    sections: Sections

# ── routes ─────────────────────────────────────────────────────────────────

@app.get("/api/topics")
def get_topics():
    return TOPICS_TREE


@app.get("/api/note/{encoded_key}", response_model=NoteResponse)
def get_note(encoded_key: str):
    path = note_path(encoded_key)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))

    raw_key = decode_key(encoded_key)
    topic = TOPICS_INDEX.get(raw_key)
    if topic is not None:
        sections = load_phase_notes(topic["phase"]).get(raw_key)
        if sections is not None:
            return {
                "key": raw_key,
                "generated_at": "pre-written",
                "model": "pre-written",
                "sections": sections,
            }

    raise HTTPException(status_code=404, detail="Note not found")


@app.put("/api/note/{encoded_key}", response_model=NoteResponse)
def update_note(encoded_key: str, body: NoteUpdateRequest):
    """Save manual edits. Works even the first time a pre-written note is
    edited — it materializes a `notes/` override seeded from the topic's
    pre-written content instead of requiring AI generation first."""
    path = note_path(encoded_key)
    if path.exists():
        existing = json.loads(path.read_text(encoding="utf-8"))
        existing["sections"] = body.sections.model_dump()
    else:
        raw_key = decode_key(encoded_key)
        if raw_key not in TOPICS_INDEX:
            raise HTTPException(status_code=404, detail=f"Unknown topic key: {raw_key!r}")
        existing = {
            "key":          raw_key,
            "generated_at": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "model":        "edited",
            "sections":     body.sections.model_dump(),
        }
    path.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
    return existing


# ── static frontend ─────────────────────────────────────────────────────────

app.mount("/", StaticFiles(directory=BASE_DIR / "static", html=True), name="static")
