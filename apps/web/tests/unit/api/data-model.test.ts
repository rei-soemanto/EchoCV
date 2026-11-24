import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const migrationsDir = join(__dirname, "../../../../../supabase/migrations");
const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";

const supabaseStub = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (
    id text primary key, name text not null, public boolean,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema public, auth, storage to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
`;

let db: PGlite;

async function asUser<T>(userId: string, run: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
  try {
    return await run();
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);");
  }
}

async function createSession(userId: string) {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.practice_sessions (user_id, job_field, role, level, language, question_set, mode)
     values ($1, 'IT', 'Backend developer', 'fresh_graduate', 'id', 'behavioral', 'live') returning id`,
    [userId],
  );
  return rows[0].id;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(supabaseStub);
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  }
  await db.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated, anon;
    grant select, insert, delete on storage.objects to authenticated;
    insert into auth.users (id) values ('${alice}'), ('${bob}');
  `);
}, 60_000);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec("reset role; truncate public.practice_sessions, public.profiles, public.consents cascade;");
});

describe("data model migrations", () => {
  it("turns on row-level security for every public table", async () => {
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
       where relnamespace = 'public'::regnamespace and relkind = 'r'`,
    );
    expect(rows.length).toBe(8);
    expect(rows.every((row) => row.relrowsecurity)).toBe(true);
  });

  it("creates private answer buckets with the upload limits", async () => {
    const { rows } = await db.query<{ id: string; public: boolean; file_size_limit: number }>(
      "select id, public, file_size_limit from storage.buckets order by id",
    );
    expect(rows).toEqual([
      { id: "answer-audio", public: false, file_size_limit: 52428800 },
      { id: "answer-videos", public: false, file_size_limit: 524288000 },
    ]);
  });
});

describe("scoring bands", () => {
  it("lets signed-in users read the seeded bands but not change them", async () => {
    const seen = await asUser(alice, () =>
      db.query<{ dimension: string; provisional: boolean }>("select dimension, provisional from public.scoring_bands order by dimension, language"),
    );
    expect(seen.rows.map((row) => row.dimension)).toEqual([
      "clarity_mixing", "eye_contact", "fillers", "pace", "pace", "pauses", "posture", "smile", "voice",
    ]);
    expect(seen.rows.every((row) => row.provisional)).toBe(true);
    const changed = await asUser(alice, () => db.query("update public.scoring_bands set ideal_low = 0 returning dimension"));
    expect(changed.rows).toEqual([]);
  });

  it("rejects a band whose ideal range sits outside its zero range", async () => {
    await expect(
      db.query(
        `insert into public.scoring_bands (dimension, metric, ideal_low, ideal_high, zero_low, zero_high, version)
         values ('test', 'x', 10, 5, 0, 20, '0')`,
      ),
    ).rejects.toThrow(/check constraint/);
  });
});

describe("row-level security", () => {
  it("lets a user read only their own sessions", async () => {
    await createSession(alice);
    await createSession(bob);
    const seen = await asUser(alice, () =>
      db.query<{ user_id: string }>("select user_id from public.practice_sessions"),
    );
    expect(seen.rows).toEqual([{ user_id: alice }]);
  });

  it("blocks inserting a session for someone else", async () => {
    await expect(
      asUser(alice, () => createSession(bob)),
    ).rejects.toThrow(/row-level security/);
  });

  it("blocks attaching a question to someone else's session", async () => {
    const bobSession = await createSession(bob);
    await expect(
      db.query(
        `insert into public.session_questions (session_id, user_id, position, question_id, question_text)
         values ($1, $2, 0, 'q1', 'Tell me about yourself')`,
        [bobSession, alice],
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("hides another user's stored answer files", async () => {
    await db.exec(`insert into storage.objects (bucket_id, name) values
      ('answer-audio', '${alice}/a.webm'), ('answer-audio', '${bob}/b.webm')`);
    const seen = await asUser(alice, () => db.query<{ name: string }>("select name from storage.objects"));
    expect(seen.rows).toEqual([{ name: `${alice}/a.webm` }]);
    await db.exec("truncate storage.objects");
  });

  it("returns nothing to a signed-out visitor", async () => {
    await createSession(alice);
    await db.exec("set role anon");
    const seen = await db.query("select * from public.practice_sessions");
    await db.exec("reset role");
    expect(seen.rows).toEqual([]);
  });
});

describe("business rules", () => {
  it("keeps the session mode and language fixed after creation (BR-25, BR-26)", async () => {
    const id = await createSession(alice);
    await expect(
      db.query("update public.practice_sessions set mode = 'upload' where id = $1", [id]),
    ).rejects.toThrow(/cannot change/);
    await expect(
      db.query("update public.practice_sessions set language = 'en' where id = $1", [id]),
    ).rejects.toThrow(/cannot change/);
    await db.query("update public.practice_sessions set status = 'finished' where id = $1", [id]);
  });

  it("requires a self-registered user to be 18 or older (BR-01)", async () => {
    const insertProfile = (dateOfBirth: string) =>
      db.query(
        `insert into public.profiles (id, full_name, date_of_birth, status, job_field, preferred_language)
         values ($1, 'Test User', $2, 'student', 'IT', 'id')`,
        [alice, dateOfBirth],
      );
    const seventeen = new Date();
    seventeen.setFullYear(seventeen.getFullYear() - 17);
    await expect(insertProfile(seventeen.toISOString().slice(0, 10))).rejects.toThrow(/18 or older/);
    await insertProfile("2000-01-01");
  });

  it("turns optional consents off by default (BR-02)", async () => {
    await db.query("insert into public.consents (user_id, analysis) values ($1, true)", [alice]);
    const { rows } = await db.query("select model_training, hr_rater_sharing from public.consents");
    expect(rows).toEqual([{ model_training: false, hr_rater_sharing: false }]);
  });

  it("keeps an upload inside its owner's storage folder", async () => {
    const session = await createSession(alice);
    const question = await db.query<{ id: string }>(
      `insert into public.session_questions (session_id, user_id, position, question_id, question_text)
       values ($1, $2, 0, 'q1', 'Tell me about yourself') returning id`,
      [session, alice],
    );
    const answer = await db.query<{ id: string }>(
      "insert into public.answers (session_question_id, user_id) values ($1, $2) returning id",
      [question.rows[0].id, alice],
    );
    await expect(
      db.query(
        `insert into public.uploads (answer_id, user_id, kind, bucket, storage_path)
         values ($1, $2, 'audio', 'answer-audio', $3)`,
        [answer.rows[0].id, alice, `${bob}/a.webm`],
      ),
    ).rejects.toThrow(/check constraint/);
  });
});
