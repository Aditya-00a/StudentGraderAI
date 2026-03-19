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
