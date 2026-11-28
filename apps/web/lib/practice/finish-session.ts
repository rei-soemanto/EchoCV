export async function finishSession(sessionId: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  const res = await fetcher(`/api/sessions/${sessionId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "finished" }),
  }).catch(() => null);
  return Boolean(res && (res.ok || res.status === 409));
}
