"use client";

import { useState } from "react";
import { mediaAction } from "@/lib/actions";

export function Uploader({ classId }: { classId: string }) {
  const [status, setStatus] = useState("");

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setStatus("Uploading…");
    const grant = await fetch("/api/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream", classId }),
    });
    if (!grant.ok) {
      setStatus("Upload needs a signed-in teacher.");
      return;
    }
    const data = (await grant.json()) as { uploadUrl: string; method: string; headers: Record<string, string>; publicUrl: string };
    const put = await fetch(data.uploadUrl, { method: data.method, headers: data.headers, body: file });
    if (!put.ok) {
      setStatus("The file did not save.");
      return;
    }
    const form = new FormData();
    form.set("classId", classId);
    form.set("url", data.publicUrl);
    form.set("type", file.type.startsWith("video") ? "video" : "image");
    await mediaAction(form);
    setStatus("Added to the gallery.");
    window.location.reload();
  }

  return (
    <label className="block rounded-2xl border border-dashed border-line bg-white px-4 py-6 text-sm">
      <span className="font-medium">Add a photo or video</span>
      <input type="file" accept="image/*,video/*" className="mt-2 block w-full text-sm" onChange={onChange} />
      {status ? <p className="mt-2 text-ink/60">{status}</p> : null}
    </label>
  );
}
