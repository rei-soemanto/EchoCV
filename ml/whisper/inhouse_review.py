import argparse
import csv
import html
import json
import shutil
from pathlib import Path

from whisper.inhouse_draft import TRANSCRIPTS, read_tsv, write_tsv
from whisper.inhouse_segments import INHOUSE

REVIEW = INHOUSE / "review"
CORRECTION_COLUMNS = ["stem", "seg", "start", "end", "draft", "verbatim"]

RULES = [
    "Write exactly what was said: repetitions, false starts and self-corrections stay.",
    "Open hesitation (eee, uh, er) is [EEE]. Nasal hesitation (em, um, ehm) is [UM]. "
    "Closed-mouth hum (hmm, mm) is [HMM]. One token per filler, however long.",
    "Backchannels (mm-hmm), interjections used as words (ah, eh) and lexical fillers "
    "(jadi, gitu, kayak, apa, anu, seperti) are written as normal words.",
    "English words inside Indonesian answers are written as said, in normal spelling.",
    "If a segment has no speech, leave the box empty.",
    "Never write names, addresses or other personal details even if someone said them: "
    "write [NAME] instead.",
]

PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>EchoCV transcript check: __PID__</title>
<style>
body{font:16px/1.5 system-ui,sans-serif;max-width:900px;margin:0 auto;padding:16px;
background:#f4f1ea;color:#1c1b18}
h1{font-size:28px;margin:8px 0}h2{font-size:18px;margin:32px 0 8px;
border-top:1px solid #dcd5c4;padding-top:16px}
.seg{display:grid;grid-template-columns:1fr;gap:6px;padding:12px 0;
border-bottom:1px solid #dcd5c4}
.draft{color:#5f5a4f;font-size:14px}textarea{width:100%;min-height:64px;font:16px/1.5
system-ui,sans-serif;padding:8px;border:1px solid #7d776a;border-radius:4px;
background:#fbf9f4;box-sizing:border-box}
button{font:600 14px system-ui;padding:8px 12px;margin-right:6px;border-radius:4px;
border:1px solid #7d776a;background:#fbf9f4;cursor:pointer;min-height:36px}
.primary{background:#2f5a4c;color:#fbf9f4;border-color:#2f5a4c}
.bar{position:sticky;top:0;background:#f4f1ea;padding:8px 0;border-bottom:1px solid #dcd5c4;
z-index:1}
.done{color:#2f6b3f;font-size:14px}audio{width:100%}code{background:#ebe6da;padding:0 4px}
</style></head><body>
<h1>Transcript check: __PID__</h1>
<p>Listen to each segment and fix the text so it matches what was said, word for word.
The draft was written by the current EchoCV model, so expect mistakes, especially in fillers.
Your work is saved in this browser as you type. When you finish, press
<b>Download corrections</b> and send the file to Rei.</p>
<ul>__RULES__</ul>
<div class="bar"><button class="primary" id="dl">Download corrections</button>
<span>Speed </span><select id="rate"><option>0.75</option><option selected>1</option>
<option>1.25</option></select> <span id="progress"></span></div>
<div id="list"></div>
<script>
const SEGMENTS = __DATA__;
const KEY = "echocv-review-__PID__";
const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
const list = document.getElementById("list");
let current = "";
function id(s){return s.stem + "#" + s.seg}
function progress(){
  const n = SEGMENTS.filter(s => saved[id(s)] !== undefined).length;
  document.getElementById("progress").textContent = n + " of " + SEGMENTS.length + " edited";
}
SEGMENTS.forEach(s => {
  if (s.stem !== current){
    current = s.stem;
    const h = document.createElement("h2"); h.textContent = s.stem; list.appendChild(h);
  }
  const box = document.createElement("div"); box.className = "seg";
  const audio = document.createElement("audio"); audio.controls = true;
  audio.preload = "none"; audio.src = s.audio;
  const draft = document.createElement("div"); draft.className = "draft";
  draft.textContent = s.start + "s to " + s.end + "s. Draft: " + s.draft;
  const area = document.createElement("textarea");
  area.value = saved[id(s)] !== undefined ? saved[id(s)] : s.verbatim;
  area.addEventListener("input", () => {
    saved[id(s)] = area.value; localStorage.setItem(KEY, JSON.stringify(saved)); progress();
  });
  const tools = document.createElement("div");
  ["[EEE]","[UM]","[HMM]"].forEach(t => {
    const b = document.createElement("button"); b.textContent = t; b.type = "button";
    b.onclick = () => {
      const i = area.selectionStart, v = area.value;
      const pad = (i > 0 && v[i-1] !== " ") ? " " : "";
      area.value = v.slice(0,i) + pad + t + " " + v.slice(area.selectionEnd);
      area.dispatchEvent(new Event("input")); area.focus();
    };
    tools.appendChild(b);
  });
  box.append(audio, draft, area, tools); list.appendChild(box);
});
document.getElementById("rate").onchange = e => {
  document.querySelectorAll("audio").forEach(a => a.playbackRate = Number(e.target.value));
};
function clean(t){return String(t).replace(/[\\t\\r\\n]+/g, " ").trim()}
document.getElementById("dl").onclick = () => {
  const head = ["stem","seg","start","end","draft","verbatim"].join("\\t");
  const rows = SEGMENTS.map(s => [s.stem, s.seg, s.start, s.end, clean(s.draft),
    clean(saved[id(s)] !== undefined ? saved[id(s)] : s.verbatim)].join("\\t"));
  const text = head + "\\n" + rows.join("\\n") + "\\n";
  const blob = new Blob([text], {type: "text/tab-separated-values"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = "corrections___PID__.tsv"; a.click();
};
progress();
</script></body></html>
"""


def page(pid: str, segments: list[dict]) -> str:
    rules = "".join(f"<li>{html.escape(r)}</li>" for r in RULES)
    data = json.dumps(segments, ensure_ascii=False).replace("</", "<\\/")
    return PAGE.replace("__RULES__", rules).replace("__DATA__", data).replace("__PID__", pid)


def package(pid: str) -> Path:
    out = REVIEW / pid
    if out.exists():
        shutil.rmtree(out)
    segments = []
    for tsv in sorted(TRANSCRIPTS.glob(f"{pid}_*.tsv")):
        stem = tsv.stem
        for r in read_tsv(tsv):
            name = f"{stem}_{int(r['seg']):03d}.flac"
            src = INHOUSE / "derived" / "audio" / stem / name
            dst = out / "audio" / stem / name
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, dst)
            segments.append(
                {
                    "stem": stem,
                    "seg": int(r["seg"]),
                    "start": r["start"],
                    "end": r["end"],
                    "draft": r["draft"],
                    "verbatim": r["verbatim"],
                    "audio": f"audio/{stem}/{name}",
                }
            )
    out.mkdir(parents=True, exist_ok=True)
    (out / "index.html").write_text(page(pid, segments), encoding="utf-8")
    return out


def import_corrections(path: Path) -> int:
    with open(path, encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f, delimiter="\t"))
    by_stem: dict[str, dict[str, str]] = {}
    for r in rows:
        by_stem.setdefault(r["stem"], {})[str(int(r["seg"]))] = r["verbatim"]
    changed = 0
    for stem, fixes in by_stem.items():
        tsv = TRANSCRIPTS / f"{stem}.tsv"
        current = read_tsv(tsv)
        for r in current:
            new = fixes.get(str(int(r["seg"])))
            if new is not None and new != r["verbatim"]:
                r["verbatim"] = new
                changed += 1
            r["checked"] = "yes" if new is not None else r.get("checked", "")
        write_tsv(tsv, current)
    return changed


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--package", nargs="*", default=None)
    ap.add_argument("--import-file", default="")
    args = ap.parse_args()
    if args.import_file:
        print(f"{import_corrections(Path(args.import_file))} segments updated")
        return
    people = args.package or sorted({p.name.split("_")[0] for p in TRANSCRIPTS.glob("*.tsv")})
    for pid in people:
        print(f"{pid}: {package(pid)}")


if __name__ == "__main__":
    main()
