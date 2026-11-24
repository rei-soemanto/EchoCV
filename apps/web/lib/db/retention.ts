export type StoredUpload = {
  id: string;
  user_id: string;
  kind: "audio" | "video";
  bucket: string;
  storage_path: string;
  status: string;
  created_at: string;
  deleted_at: string | null;
};

export type MediaConsent = { model_training: boolean; hr_rater_sharing: boolean };

type StorageClient = {
  storage: { from: (bucket: string) => { remove: (paths: string[]) => PromiseLike<{ error: unknown }> } };
};

export function keepsMedia(consent: MediaConsent | null | undefined): boolean {
  return Boolean(consent?.model_training || consent?.hr_rater_sharing);
}

export function isKeptAudio(upload: StoredUpload, consent: MediaConsent | null | undefined): boolean {
  return upload.kind === "audio" && upload.status === "processed" && keepsMedia(consent);
}

export function expiredUploads(
  uploads: StoredUpload[],
  consentByUser: Map<string, MediaConsent>,
  now: Date,
  hours: number,
): StoredUpload[] {
  const cutoff = now.getTime() - hours * 3_600_000;
  return uploads.filter(
    (upload) =>
      upload.deleted_at === null &&
      new Date(upload.created_at).getTime() < cutoff &&
      !isKeptAudio(upload, consentByUser.get(upload.user_id)),
  );
}

export async function removeStoredFiles(client: StorageClient, uploads: Pick<StoredUpload, "bucket" | "storage_path">[]) {
  const byBucket = new Map<string, string[]>();
  for (const upload of uploads) byBucket.set(upload.bucket, [...(byBucket.get(upload.bucket) ?? []), upload.storage_path]);
  for (const [bucket, paths] of byBucket) {
    const { error } = await client.storage.from(bucket).remove(paths);
    if (error) return false;
  }
  return true;
}
