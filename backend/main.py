import base64
import datetime
import json
import os
import pathlib
import re

import anthropic
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

BASE_DIR   = pathlib.Path(__file__).parent
NOTES_DIR  = BASE_DIR / "notes"
NOTES_DIR.mkdir(exist_ok=True)

TOPICS_TREE: list = json.loads((BASE_DIR / "topics_tree.json").read_text())

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

client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

app = FastAPI(title="AI/ML Notes API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── helpers ────────────────────────────────────────────────────────────────

def decode_key(encoded: str) -> str:
    padded = encoded + "=" * (-len(encoded) % 4)
    return base64.urlsafe_b64decode(padded).decode("utf-8")

def note_path(encoded: str) -> pathlib.Path:
    return NOTES_DIR / (encoded + ".json")

def build_prompt(topic: dict) -> str:
    return f"""You are a technical educator writing structured notes for an AI/ML learning roadmap.

Topic: {topic["item"]}
Context:
  Phase {topic["phase"]}: {topic["title"]}
  Group: {topic["group"]}
  Subtopic: {topic["subtopic"]}

Write a concise, accurate note for a practitioner who already understands software but is learning AI/ML.
Return ONLY a JSON object with exactly these six keys. Do not include markdown fences or any text outside the JSON.

{{
  "what_it_is": "1-3 sentence definition in plain English.",
  "why_it_exists": "The problem it solves or the gap it fills.",
  "how_it_works": "Intuitive explanation. Avoid heavy math; use analogies where helpful.",
  "when_to_use": "When this is a good choice AND when to prefer something else.",
  "what_goes_wrong": "Common pitfalls, failure modes, and gotchas practitioners encounter.",
  "real_example": "A concrete, specific example from practice or a well-known paper/project."
}}"""

# ── models ─────────────────────────────────────────────────────────────────

class Sections(BaseModel):
    what_it_is:      str
    why_it_exists:   str
    how_it_works:    str
    when_to_use:     str
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
    if not path.exists():
        raise HTTPException(status_code=404, detail="Note not found")
    return json.loads(path.read_text())


@app.post("/api/note/{encoded_key}/generate", response_model=NoteResponse)
def generate_note(encoded_key: str):
    raw_key = decode_key(encoded_key)
    topic   = TOPICS_INDEX.get(raw_key)
    if topic is None:
        raise HTTPException(status_code=404, detail=f"Unknown topic key: {raw_key!r}")

    try:
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            messages=[{"role": "user", "content": build_prompt(topic)}],
        )
    except anthropic.APIError as e:
        raise HTTPException(status_code=502, detail=f"Claude API error: {e}")

    raw_text = message.content[0].text.strip()

    try:
        sections_dict = json.loads(raw_text)
    except json.JSONDecodeError:
        m = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", raw_text)
        if m:
            sections_dict = json.loads(m.group(1))
        else:
            raise HTTPException(status_code=502, detail="Claude returned non-JSON response")

    note = {
        "key":          raw_key,
        "generated_at": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "model":        "claude-sonnet-4-6",
        "sections":     sections_dict,
    }
    note_path(encoded_key).write_text(json.dumps(note, ensure_ascii=False, indent=2))
    return note


@app.put("/api/note/{encoded_key}", response_model=NoteResponse)
def update_note(encoded_key: str, body: NoteUpdateRequest):
    path = note_path(encoded_key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Note not found; generate it first")
    existing = json.loads(path.read_text())
    existing["sections"] = body.sections.model_dump()
    path.write_text(json.dumps(existing, ensure_ascii=False, indent=2))
    return existing


@app.delete("/api/note/{encoded_key}")
def delete_note(encoded_key: str):
    path = note_path(encoded_key)
    if path.exists():
        path.unlink()
    return {"deleted": True}
