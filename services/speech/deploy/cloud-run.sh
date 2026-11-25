#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_HOST:?Set SUPABASE_HOST to <project-ref>.supabase.co}"
: "${SPEECH_SERVICE_KEY:?Set SPEECH_SERVICE_KEY to the shared secret the backend sends}"

PROJECT="${PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${REGION:-asia-southeast2}"
SERVICE="${SERVICE:-echocv-speech}"
BUCKET="${BUCKET:-${PROJECT}-echocv-models}"
IMAGE="${IMAGE:-ghcr.io/rei-soemanto/echocv-speech:latest}"
ACCOUNT_NAME="${ACCOUNT_NAME:-echocv-speech}"
KEY_SECRET="${KEY_SECRET:-echocv-speech-key}"
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
ACCOUNT="${ACCOUNT_NAME}@${PROJECT}.iam.gserviceaccount.com"

[ -n "$PROJECT" ] || { echo "Set PROJECT or run: gcloud config set project <id>" >&2; exit 1; }
[ -f "$REPO_ROOT/ml/artifacts/whisper/v0/ct2/model.bin" ] || { echo "Pull the models first: uv run python -m app.pull_model" >&2; exit 1; }

gcloud services enable run.googleapis.com secretmanager.googleapis.com storage.googleapis.com iam.googleapis.com --project "$PROJECT"

gcloud iam service-accounts describe "$ACCOUNT" --project "$PROJECT" >/dev/null 2>&1 \
  || gcloud iam service-accounts create "$ACCOUNT_NAME" --project "$PROJECT" --display-name "EchoCV speech service"

gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1 \
  || gcloud storage buckets create "gs://$BUCKET" --project "$PROJECT" --location "$REGION" \
    --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member "serviceAccount:$ACCOUNT" --role roles/storage.objectUser >/dev/null

gcloud storage rsync "$REPO_ROOT/ml/artifacts/whisper/v0/ct2" "gs://$BUCKET/whisper" --exclude '.*\.sha256$'
gcloud storage rsync "$REPO_ROOT/apps/web/public/models" "gs://$BUCKET/vision" \
  --exclude '^(ort|mediapipe)/|\.gitkeep$|.*\.sha256$'

if gcloud secrets describe "$KEY_SECRET" --project "$PROJECT" >/dev/null 2>&1; then
  printf %s "$SPEECH_SERVICE_KEY" | gcloud secrets versions add "$KEY_SECRET" --project "$PROJECT" --data-file=- >/dev/null
else
  printf %s "$SPEECH_SERVICE_KEY" | gcloud secrets create "$KEY_SECRET" --project "$PROJECT" \
    --replication-policy user-managed --locations "$REGION" --data-file=- >/dev/null
fi
gcloud secrets add-iam-policy-binding "$KEY_SECRET" --project "$PROJECT" \
  --member "serviceAccount:$ACCOUNT" --role roles/secretmanager.secretAccessor >/dev/null

gcloud run deploy "$SERVICE" --project "$PROJECT" --region "$REGION" --image "$IMAGE" --port 8000 \
  --cpu 2 --memory 4Gi --timeout 3600 --concurrency 1 --min-instances 0 --max-instances 2 \
  --execution-environment gen2 --service-account "$ACCOUNT" \
  --add-volume name=models,type=cloud-storage,bucket="$BUCKET" \
  --add-volume-mount volume=models,mount-path=/models \
  --set-env-vars "SPEECH_AUDIO_URL_HOSTS=$SUPABASE_HOST" \
  --set-secrets "SPEECH_SERVICE_KEY=$KEY_SECRET:latest" \
  --allow-unauthenticated

URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)')"
curl -fsS "$URL/health" && echo
echo "SPEECH_SERVICE_URL=$URL"
