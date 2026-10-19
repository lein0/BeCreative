import QRCode from "qrcode";

export async function GET(request: Request) {
  const text = new URL(request.url).searchParams.get("text") || "https://localhost:3000";
  const png = await QRCode.toBuffer(text, { width: 512, margin: 1 });
  return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "public, max-age=3600" } });
}
