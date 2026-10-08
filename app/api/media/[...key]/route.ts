import { readFile } from "node:fs/promises";
import { containedMediaPath } from "@/lib/review-rules";
import { uploadDir } from "@/lib/storage";

export async function GET(_request: Request, context: { params: Promise<{ key: string[] }> }) {
  const { key } = await context.params;
  const full = containedMediaPath(uploadDir(), key.join("/"));
  if (!full) return new Response("Bad key", { status: 400 });
  const rel = key.join("/");
  try {
    const bytes = await readFile(full);
    const ext = rel.split(".").pop()?.toLowerCase() ?? "";
    const types: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
    return new Response(bytes, { headers: { "content-type": types[ext] ?? "application/octet-stream", "cache-control": "public, max-age=3600" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
