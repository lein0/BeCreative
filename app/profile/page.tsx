"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "../../components/ui/avatar";
import { supabase } from "../../lib/supabase";

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function fetchUser() {
      setLoading(true);
      setError("");
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }
      const { data, error: fetchError } = await supabase.from("users").select("*", { count: "exact" }).eq("id", user.id);
      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }
      if (!data || data.length === 0) {
        // No user row found, redirect to onboarding
        router.push("/onboarding/profile-setup");
        return;
      }
      setUser({ ...user, ...data[0] });
      setLoading(false);
    }
    fetchUser();
  }, [router]);

  const handleDeleteAvatar = async () => {
    if (!user?.avatar_url) return;
    setDeleting(true);
    setError("");
    try {
      // Extract the path from the public URL
      const url = user.avatar_url;
      const path = url.split("/storage/v1/object/public/profile-pictures/")[1];
      if (!path) throw new Error("Could not parse avatar path");
      const { error: deleteError } = await supabase.storage.from("profile-pictures").remove([`public/${user.id}/${path.split("/").pop()}`]);
      if (deleteError) throw deleteError;
      // Remove avatar_url from user row
      const { error: updateError } = await supabase.from("users").update({ avatar_url: null }).eq("id", user.id);
      if (updateError) throw updateError;
      setUser((u: any) => ({ ...u, avatar_url: null }));
    } catch (err: any) {
      setError(err.message || "Failed to delete profile picture");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
  if (error) return <div className="flex min-h-screen items-center justify-center text-red-500">{error}</div>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <Card className="w-full max-w-md p-8 flex flex-col items-center">
        <Avatar className="w-24 h-24 mb-4">
          <AvatarImage src={user.avatar_url || undefined} alt={user.full_name || user.email} />
          <AvatarFallback>{user.full_name ? user.full_name.split(' ').map((n: string) => n[0]).join('') : "U"}</AvatarFallback>
        </Avatar>
        <div className="text-xl font-bold mb-2">{user.full_name || user.email}</div>
        <div className="text-gray-600 mb-4">{user.email}</div>
        {user.bio && <div className="mb-4 text-center text-gray-700">{user.bio}</div>}
        <div className="flex flex-col gap-2 mb-4 w-full">
          {user.instagram_url && <a href={user.instagram_url} target="_blank" rel="noopener noreferrer" className="text-blue-500">Instagram</a>}
          {user.tiktok_url && <a href={user.tiktok_url} target="_blank" rel="noopener noreferrer" className="text-blue-500">TikTok</a>}
        </div>
        {user.avatar_url && (
          <Button variant="destructive" onClick={handleDeleteAvatar} disabled={deleting} className="mb-2">
            {deleting ? "Deleting..." : "Delete Profile Picture"}
          </Button>
        )}
        {error && <div className="text-red-500 text-sm mt-2">{error}</div>}
      </Card>
    </div>
  );
} 