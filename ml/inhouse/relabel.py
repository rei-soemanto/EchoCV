import csv

from inhouse.extract_pose import DERIVED

RELABEL_CSV = DERIVED.parent / "relabel.csv"


def read_relabel(path=RELABEL_CSV) -> list[dict]:
    if not path.exists():
        return []
    with open(path, newline="", encoding="utf-8") as f:
        return [
            {**r, "start": float(r["start"]), "end": float(r["end"])} for r in csv.DictReader(f)
        ]


def relabelled(rows: list[dict], rules: list[dict] | None = None) -> list[dict]:
    rules = read_relabel() if rules is None else rules
    out = []
    for row in rows:
        clip = row["clip"]
        for rule in rules:
            if row["stem"] == rule["stem"] and rule["start"] <= float(row["t"]) < rule["end"]:
                clip = rule["clip"]
                break
        if clip:
            out.append({**row, "clip": clip})
    return out
