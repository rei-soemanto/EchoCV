# ml/data

Download scripts only. Everything else in this folder (datasets, Roboflow exports, recordings) is
git-ignored: it is either large or personal data.

Tag every trained checkpoint with the datasets it touched, so a commercial version can later be
retrained on commercially safe data only (see `docs/tech-stack-and-datasets.md`).
