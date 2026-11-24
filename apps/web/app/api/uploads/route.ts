import { AUDIO_BUCKET, parseUploadRequest, VIDEO_BUCKET } from "@/lib/db/uploads";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const parsed = parseUploadRequest(await request.json().catch(() => null));
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const { sessionQuestionId, contentType, extension, kind } = parsed.value;
  const bucket = kind === "audio" ? AUDIO_BUCKET : VIDEO_BUCKET;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const userId = auth.user.id;

  const { data: question } = await supabase
    .from("session_questions")
    .select("id, session_id")
    .eq("id", sessionQuestionId)
    .maybeSingle();
  if (!question) return Response.json({ error: "Question not found." }, { status: 404 });

  const { data: session } = await supabase
    .from("practice_sessions")
    .select("status, mode")
    .eq("id", question.session_id)
    .maybeSingle();
  if (!session || session.status !== "in_progress") {
    return Response.json({ error: "The session is not in progress." }, { status: 409 });
  }
  if (session.mode !== (kind === "audio" ? "live" : "upload")) {
    return Response.json(
      { error: kind === "audio" ? "Answer audio is uploaded only in live sessions." : "Answer videos are uploaded only in upload sessions." },
      { status: 409 },
    );
  }

  let { data: answer } = await supabase
    .from("answers")
    .select("id, status")
    .eq("session_question_id", sessionQuestionId)
    .maybeSingle();
  if (!answer) {
    const created = await supabase
      .from("answers")
      .insert({ session_question_id: sessionQuestionId, user_id: userId })
      .select("id, status")
      .single();
    if (created.error || !created.data) return Response.json({ error: "Could not start the upload." }, { status: 500 });
    answer = created.data;
  }
  if (answer.status === "analyzed") {
    return Response.json({ error: "This answer is already analysed." }, { status: 409 });
  }

  const path = `${userId}/${question.session_id}/${answer.id}/${crypto.randomUUID()}.${extension}`;
  const { data: upload, error: uploadError } = await supabase
    .from("uploads")
    .insert({ answer_id: answer.id, user_id: userId, kind, bucket, storage_path: path })
    .select("id")
    .single();
  if (uploadError || !upload) return Response.json({ error: "Could not start the upload." }, { status: 500 });

  const { data: signed, error: signError } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
  if (signError || !signed) {
    await supabase.from("uploads").delete().eq("id", upload.id);
    return Response.json({ error: "Could not start the upload." }, { status: 500 });
  }

  return Response.json(
    {
      upload_id: upload.id,
      answer_id: answer.id,
      bucket,
      kind,
      path,
      content_type: contentType,
      signed_url: signed.signedUrl,
      token: signed.token,
    },
    { status: 201 },
  );
}
