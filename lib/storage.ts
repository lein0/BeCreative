import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { appOrigin } from "@/lib/env";

export type UploadGrant = {
  uploadUrl: string;
  method: "PUT" | "POST";
  headers: Record<string, string>;
  publicUrl: string;
  key: string;
};

export interface StorageProvider {
  readonly name: string;
  createUpload(input: { key: string; contentType: string }): Promise<UploadGrant>;
  publicUrl(key: string): string;
}

function appUrl() {
  return appOrigin();
}

function s3Credentials() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) return undefined;
  return { accessKeyId, secretAccessKey };
}

export function safeKey(filename: string) {
  const cleaned = filename.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, "");
  return `uploads/${new Date().getFullYear()}/${crypto.randomUUID()}-${cleaned || "file"}`;
}

class LocalStorage implements StorageProvider {
  readonly name = "local";
  async createUpload(input: { key: string; contentType: string; token?: string }): Promise<UploadGrant> {
    return {
      uploadUrl: `${appUrl()}/api/uploads/local?token=${input.token ?? ""}`,
      method: "PUT",
      headers: { "content-type": input.contentType },
      publicUrl: `${appUrl()}/api/media/${input.key}`,
      key: input.key,
    };
  }
  publicUrl(key: string) {
    return `${appUrl()}/api/media/${key}`;
  }
}

class S3Storage implements StorageProvider {
  readonly name = "s3";
  private client() {
    return new S3Client({
      region: process.env.AWS_REGION ?? "us-west-2",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: s3Credentials(),
    });
  }
  async createUpload(input: { key: string; contentType: string }): Promise<UploadGrant> {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new Error("S3_BUCKET is required when STORAGE_PROVIDER=s3.");
    const command = new PutObjectCommand({ Bucket: bucket, Key: input.key, ContentType: input.contentType });
    const uploadUrl = await getSignedUrl(this.client(), command, { expiresIn: 900 });
    return { uploadUrl, method: "PUT", headers: { "content-type": input.contentType }, publicUrl: this.publicUrl(input.key), key: input.key };
  }
  publicUrl(key: string) {
    if (process.env.S3_PUBLIC_URL_BASE) return `${process.env.S3_PUBLIC_URL_BASE.replace(/\/$/, "")}/${key}`;
    const bucket = process.env.S3_BUCKET;
    const region = process.env.AWS_REGION ?? "us-west-2";
    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  }
}

export function storageProvider(): StorageProvider {
  return process.env.STORAGE_PROVIDER === "s3" ? new S3Storage() : new LocalStorage();
}

export function uploadDir() {
  const configured = process.env.UPLOAD_DIR;
  if (configured && path.isAbsolute(configured)) return configured;
  return path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "uploads");
}

export async function writeLocalObject(key: string, bytes: Buffer) {
  if (key.includes("..")) throw new Error("Invalid upload key.");
  const full = path.join(uploadDir(), key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes);
  return full;
}

export const localStorage = new LocalStorage();
