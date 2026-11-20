import csv
import json
import re
import subprocess
from fractions import Fraction
from pathlib import Path

from common.paths import DATA

INHOUSE = DATA / "inhouse"
RAW = INHOUSE / "raw"
INVENTORY = INHOUSE / "inventory.csv"
SESSIONS = INHOUSE / "sessions.csv"
VIDEO_SUFFIXES = {".mp4", ".mov", ".mkv", ".webm", ".avi"}

PART_A_CLIPS = (
    "upright",
    "looking_away",
    "smile",
    "gestures",
    "desk_hands",
    "touching_face",
    "arms_crossed",
    "slouching",
    "reading_notes_held",
    "reading_notes_desk",
)
MIN_CLIP_S = 30.0
MIN_ANSWER_S = 45.0

SESSION_COLUMNS = (
    "participant,session,date,split,place,lighting,clothing,glasses,head_covering,laptop_model,"
    "camera_resolution,mic,studio_effects_off,consent_version,clips,answers,notes"
).split(",")

_PART_A = re.compile(rf"^(p\d+)_(s\d+)_({'|'.join(PART_A_CLIPS)})$")
_PART_B = re.compile(r"^(p\d+)_(s\d+)_answer(\d+)_(q\d+)_(id|en|mix)$")


def parse_name(stem: str) -> dict | None:
    if m := _PART_A.match(stem):
        person, session, clip = m.groups()
        return {
            "person": person,
            "session": session,
            "part": "A",
            "clip": clip,
            "question": "",
            "language": "",
        }
    if m := _PART_B.match(stem):
        person, session, _, question, language = m.groups()
        return {
            "person": person,
            "session": session,
            "part": "B",
            "clip": f"{question}_{language}",
            "question": question,
            "language": language,
        }
    return None


def parse_rate(rate: str) -> float:
    try:
        return float(Fraction(rate))
    except (ValueError, ZeroDivisionError):
        return 0.0


def probe(path: Path) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
        capture_output=True,
        text=True,
        check=True,
    )
    info = json.loads(out.stdout)
    video = next((s for s in info["streams"] if s["codec_type"] == "video"), {})
    audio = next((s for s in info["streams"] if s["codec_type"] == "audio"), None)
    rotation = 0
    for side in video.get("side_data_list", []):
        rotation = int(side.get("rotation", rotation))
    return {
        "duration_s": round(float(info["format"].get("duration", 0.0)), 2),
        "width": video.get("width", 0),
        "height": video.get("height", 0),
        "fps": round(parse_rate(video.get("avg_frame_rate", "0/1")), 2),
        "rotation": rotation,
        "audio": bool(audio),
        "audio_rate": int(audio["sample_rate"]) if audio else 0,
    }


def flags_for(row: dict) -> list[str]:
    flags = []
    if not row["audio"]:
        flags.append("no_audio")
    if row["part"] == "A" and row["duration_s"] < MIN_CLIP_S:
        flags.append("short_clip")
    if row["part"] == "B" and row["duration_s"] < MIN_ANSWER_S:
        flags.append("short_answer")
    if row["fps"] < 15:
        flags.append("low_fps")
    if min(row["width"], row["height"]) < 720:
        flags.append("low_resolution")
    return flags


def session_flags(rows: list[dict]) -> dict[tuple[str, str], list[str]]:
    out: dict[tuple[str, str], list[str]] = {}
    sessions = sorted({(r["person"], r["session"]) for r in rows})
    for key in sessions:
        clips = {r["clip"] for r in rows if (r["person"], r["session"]) == key and r["part"] == "A"}
        answers = [r for r in rows if (r["person"], r["session"]) == key and r["part"] == "B"]
        missing = [c for c in PART_A_CLIPS if c not in clips]
        flags = []
        if missing and len(missing) < len(PART_A_CLIPS):
            flags.append("missing_clips:" + "+".join(missing))
        if len(missing) == len(PART_A_CLIPS):
            flags.append("no_part_a")
        if not answers:
            flags.append("no_part_b")
        out[key] = flags
    return out


def collect(raw: Path = RAW) -> tuple[list[dict], list[str]]:
    rows, unparsed = [], []
    for path in sorted(raw.rglob("*")):
        if path.suffix.lower() not in VIDEO_SUFFIXES:
            continue
        meta = parse_name(path.stem)
        if meta is None:
            unparsed.append(str(path.relative_to(raw)))
            continue
        row = {"file": str(path.relative_to(raw)).replace("\\", "/"), **meta, **probe(path)}
        row["flags"] = ";".join(flags_for(row))
        rows.append(row)
    return rows, unparsed


def write_inventory(rows: list[dict], path: Path = INVENTORY) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def write_sessions_skeleton(rows: list[dict], path: Path = SESSIONS) -> bool:
    if path.exists():
        return False
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=SESSION_COLUMNS)
        writer.writeheader()
        for person, session in sorted({(r["person"], r["session"]) for r in rows}):
            mine = [r for r in rows if (r["person"], r["session"]) == (person, session)]
            first = mine[0]
            writer.writerow(
                {
                    "participant": person,
                    "session": session,
                    "split": "lopo",
                    "camera_resolution": f"{first['height']}p",
                    "studio_effects_off": "yes",
                    "clips": sum(r["part"] == "A" for r in mine),
                    "answers": sum(r["part"] == "B" for r in mine),
                }
            )
    return True


def read_inventory(path: Path = INVENTORY) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def main() -> None:
    rows, unparsed = collect()
    if not rows:
        raise SystemExit(f"no recordings found under {RAW}")
    write_inventory(rows)
    created = write_sessions_skeleton(rows)
    print(f"{len(rows)} recordings -> {INVENTORY}")
    for (person, session), flags in session_flags(rows).items():
        mine = [r for r in rows if (r["person"], r["session"]) == (person, session)]
        a = sum(r["part"] == "A" for r in mine)
        b = sum(r["part"] == "B" for r in mine)
        minutes = sum(float(r["duration_s"]) for r in mine) / 60
        note = f"  {', '.join(flags)}" if flags else ""
        print(f"  {person} {session}: {a} clips, {b} answers, {minutes:.1f} min{note}")
    for r in rows:
        if r["flags"]:
            print(f"  ! {r['file']}: {r['flags']}")
    for name in unparsed:
        print(f"  ? name does not follow the protocol: {name}")
    if created:
        print(f"sessions.csv skeleton -> {SESSIONS} (fill in the empty columns)")


if __name__ == "__main__":
    main()
