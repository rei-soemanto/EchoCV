from fastapi import FastAPI
from fastapi.responses import JSONResponse

app = FastAPI(title="EchoCV speech service")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze")
def analyze() -> JSONResponse:
    # VAD -> faster-whisper -> fillers, rate, prosody (and upload-mode vision). Not built yet.
    return JSONResponse({"error": "Not implemented"}, status_code=501)
