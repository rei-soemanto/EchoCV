"""Download smile/eye-contact calibration data and the MediaPipe face model.

Columbia Gaze and MPIIFaceGaze are non-commercial: evaluation and threshold choice only.
Run from ml/:  uv run python -m data.download_calibration
"""

from urllib.parse import quote

from common.download import extract, fetch
from common.paths import DATA

FACE_LANDMARKER = (
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/"
    "float16/latest/face_landmarker.task"
)
GENKI = "https://mplab.ucsd.edu/398/media/genki4k.tar"
COLUMBIA = (
    "https://www.cs.columbia.edu/CAVE/databases/columbia_gaze/downloader.php"
    f"?p={quote('Columbia Gaze Data Set')}&f=columbia_gaze_data_set.zip"
)
MPIIFACEGAZE = "https://datasets.d2.mpi-inf.mpg.de/MPIIGaze/MPIIFaceGaze.zip"


def main() -> None:
    fetch(FACE_LANDMARKER, DATA / "mediapipe" / "face_landmarker.task")

    print("Columbia Gaze")
    archive = DATA / "columbia_gaze" / "columbia_gaze_data_set.zip"
    try:
        extract(fetch(COLUMBIA, archive), DATA / "columbia_gaze")
    except RuntimeError as err:
        print(f"  {err}\n  Download it manually from the dataset page into {archive}")

    print("MPIIFaceGaze")
    extract(fetch(MPIIFACEGAZE, DATA / "mpiifacegaze" / "MPIIFaceGaze.zip"), DATA / "mpiifacegaze")

    # GENKI's server is slow and drops connections; fetch() resumes the partial file.
    print("GENKI-4K")
    extract(fetch(GENKI, DATA / "genki4k" / "genki4k.tar"), DATA / "genki4k")
    print("done")


if __name__ == "__main__":
    main()
