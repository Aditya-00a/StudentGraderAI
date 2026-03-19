import { get, put } from "@vercel/blob";

export function hasBlobStorageConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function readPrivateBlobText(pathname: string) {
  const result = await get(pathname, {
    access: "private",
    useCache: false,
  });

  if (!result || result.statusCode !== 200) {
    return null;
  }

  return await new Response(result.stream).text();
}

export async function readPrivateBlobBuffer(pathname: string) {
  const result = await get(pathname, {
    access: "private",
    useCache: false,
  });

  if (!result || result.statusCode !== 200) {
    return null;
  }

  const arrayBuffer = await new Response(result.stream).arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function writePrivateBlob(pathname: string, body: string | Buffer) {
  await put(pathname, body, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}
