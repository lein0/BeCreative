import { getActor } from "@/lib/actor";
import { exportAccount } from "@/lib/account-data";

export async function GET() {
  const actor = await getActor();
  if (!actor) return new Response("Sign in required", { status: 401 });
  const data = await exportAccount(actor.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": "attachment; filename=becreative-export.json",
    },
  });
}
