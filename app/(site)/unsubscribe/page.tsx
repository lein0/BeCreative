import { redirect } from "next/navigation";

export default async function UnsubscribeQueryPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) redirect("/");
  redirect(`/unsubscribe/${encodeURIComponent(token)}`);
}
