import { createClient } from "@supabase/supabase-js";

const bucketName = process.env.SUPABASE_STORAGE_BUCKET || "student-grader-ai";

function getSupabaseClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function hasSupabaseStorageConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function readSupabaseText(pathname: string) {
  const client = getSupabaseClient();
  if (!client) {
    return null;
  }

  const { data, error } = await client.storage
    .from(bucketName)
    .download(pathname, {}, { cache: "no-store" });

  if (error || !data) {
    return null;
  }

  return await data.text();
}

export async function readSupabaseBuffer(pathname: string) {
  const client = getSupabaseClient();
  if (!client) {
    return null;
  }

  const { data, error } = await client.storage
    .from(bucketName)
    .download(pathname, {}, { cache: "no-store" });

  if (error || !data) {
    return null;
  }

  return Buffer.from(await data.arrayBuffer());
}

export async function writeSupabaseFile(
  pathname: string,
  body: string | Buffer,
  contentType = "application/octet-stream",
) {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase storage is not configured.");
  }

  const { error } = await client.storage.from(bucketName).upload(pathname, body, {
    upsert: true,
    contentType,
  });

  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }
}

export async function checkSupabaseStorageHealth() {
  if (!hasSupabaseStorageConfigured()) {
    return {
      ok: false,
      detail: "Supabase storage environment variables are missing.",
    };
  }

  const pathname = "healthchecks/runtime-check.txt";
  const value = `health-check:${Date.now()}`;

  try {
    await writeSupabaseFile(pathname, value, "text/plain");
    const roundTrip = await readSupabaseText(pathname);

    if (roundTrip !== value) {
      return {
        ok: false,
        detail: "Supabase write succeeded, but the read-back value did not match.",
      };
    }

    return {
      ok: true,
      detail: `Bucket "${bucketName}" is writable.`,
    };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : "Supabase storage check failed.",
    };
  }
}
