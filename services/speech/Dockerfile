FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    ECHOCV_SHARED_DIR=/srv/shared \
    WHISPER_MODEL_DIR=/models/whisper \
    VISION_MODEL_DIR=/models/vision

COPY services/speech/pyproject.toml services/speech/uv.lock ./
RUN uv sync --frozen --no-dev --group ml

COPY shared ./shared
COPY services/speech/app ./app

EXPOSE 8000
VOLUME /models
CMD ["sh", "-c", "uv run --no-sync python -m app.pull_model && exec uv run --no-sync uvicorn app.main:app --host 0.0.0.0 --port 8000"]
