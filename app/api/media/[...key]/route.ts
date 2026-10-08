import { readFile } from "node:fs/promises";
import path from "node:path";
import { uploadDir } from "@/lib/storage";

export async function GET(_request: Request, context: { params: Promise<{ key: string[] }> }) {
  const { key } = await context.params;
  const rel = key.join("/");
  if (rel.includes("..")) return new Response("Bad key", { status: 400 });
  try {
    const bytes = await readFile(path.join(uploadDir(), rel));
    const ext = rel.split(".").pop()?.toLowerCase() ?? "";
    const types: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
    return new Response(bytes, { headers: { "content-type": types[ext] ?? "application/octet-stream", "cache-control": "public, max-age=3600" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
