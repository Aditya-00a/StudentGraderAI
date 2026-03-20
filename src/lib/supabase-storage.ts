import { createClient } from "@supabase/supabase-js";

function getTrimmedEnvValue(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return "";
}

function getSupabaseConfig() {
  return {
    url: getTrimmedEnvValue("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
    serviceRoleKey: getTrimmedEnvValue("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"),
    bucketName: getTrimmedEnvValue("SUPABASE_STORAGE_BUCKET") || "student-grader-ai",
  };
}

function getSupabaseClient() {
  const config = getSupabaseConfig();

  if (!config.url || !config.serviceRoleKey) {
    return null;
  }

  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function hasSupabaseStorageConfigured() {
  const config = getSupabaseConfig();
  return Boolean(config.url && config.serviceRoleKey);
}

export function getSupabaseBucketName() {
  return getSupabaseConfig().bucketName;
}

export function getSupabaseEnvDiagnostics() {
  const config = getSupabaseConfig();

  return {
    urlDetected: Boolean(config.url),
    serviceRoleKeyDetected: Boolean(config.serviceRoleKey),
    bucketName: config.bucketName,
  };
}

export async function readSupabaseText(pathname: string) {
  const client = getSupabaseClient();
  const { bucketName } = getSupabaseConfig();
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
  const { bucketName } = getSupabaseConfig();
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
  const { bucketName } = getSupabaseConfig();
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
  const { bucketName } = getSupabaseConfig();

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
