"use client";
import React, { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { supabase } from "../../../lib/supabase";
import Cropper from "react-easy-crop";

function getCroppedImg(imageSrc: any, crop: any, zoom: any, aspect: any) {
  // Placeholder: In production, use a utility to crop the image and return a blob/file
  // For now, just return the original file (no server-side cropping)
  return imageSrc;
}

export default function ProfileSetupPage() {
  const router = useRouter();
  const [bio, setBio] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [profilePic, setProfilePic] = useState<File | null>(null);
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [authChecked, setAuthChecked] = useState(false);

  // Check authentication on page load
  useEffect(() => {
    async function checkAuth() {
      console.log('Profile setup: Checking authentication...');
      const { data: { user }, error } = await supabase.auth.getUser();
      console.log('Profile setup: Auth check result:', { user: !!user, error: error?.message });
      
      if (error || !user) {
        console.error('Profile setup: Not authenticated, redirecting to login');
        router.push('/login');
        return;
      }
      
      // Check if user exists in users table
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();
      
      console.log('Profile setup: User table check:', { userData: !!userData, userError: userError?.message });
      
      if (userError && userError.code !== 'PGRST116') {
        console.error('Profile setup: User not found in database');
        // User doesn't exist in our table, redirect to signup
        router.push('/signup');
        return;
      }
      
      setAuthChecked(true);
    }
    
    checkAuth();
  }, [router]);

  const onDrop = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Only image files are allowed.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be less than 5MB (standard iPhone photo size).");
      return;
    }
    setProfilePic(file);
    const reader = new FileReader();
    reader.onload = () => setImageSrc(reader.result as string);
    reader.readAsDataURL(file);
    setError("");
  }, []);

  const onCropComplete = useCallback((croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleClearImage = () => {
    setProfilePic(null);
    setImageSrc(null);
    setProfilePicUrl(null);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      console.log('Profile setup: Starting form submission...');
      
      // Check authentication first
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      console.log('Profile setup: Auth check:', { user: !!user, error: authError?.message });
      
      if (authError || !user) {
        console.error('Profile setup: Not authenticated');
        throw new Error("Not authenticated. Please try logging in again.");
      }
      
      // Check if user exists in users table
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();
      
      console.log('Profile setup: User table check:', { userData: !!userData, userError: userError?.message });
      
      if (userError && userError.code !== 'PGRST116') {
        console.error('Profile setup: Error checking user table:', userError);
        throw new Error('User profile not found. Please try signing up again.');
      }
      
      let avatar_url = null;
      if (profilePic && imageSrc) {
        console.log('Profile setup: Uploading profile picture...');
        // Check if bucket exists (defensive)
        const { data: bucketList, error: bucketError } = await supabase.storage.listBuckets();
        console.log('DEBUG: bucketList', bucketList, 'bucketError', bucketError);
        if (bucketError || !bucketList?.find((b: any) => b.name === "profile-pictures")) {
          throw new Error("Profile pictures bucket not found. Please contact support.");
        }
        const { data, error: uploadError } = await supabase.storage
          .from("profile-pictures")
          .upload(`public/${user.id}/${profilePic.name}`, profilePic, {
            cacheControl: "3600",
            upsert: true,
          });
        if (uploadError) throw uploadError;
        avatar_url = data?.path
          ? supabase.storage.from("profile-pictures").getPublicUrl(data.path).data.publicUrl
          : null;
        console.log('Profile setup: Avatar uploaded:', avatar_url);
      }
      
      // Generate social URLs
      const instagram_url = instagram ? `https://instagram.com/${instagram.replace(/^@/, "")}` : null;
      const tiktok_url = tiktok ? `https://tiktok.com/@${tiktok.replace(/^@/, "")}` : null;
      
      console.log('Profile setup: Updating user profile...', {
        bio: bio.length,
        avatar_url: !!avatar_url,
        instagram_url,
        tiktok_url
      });
      
      const { error: updateError } = await supabase.from("users").update({
        bio,
        avatar_url,
        instagram_url,
        tiktok_url,
      }).eq("id", user.id);
      
      if (updateError) {
        console.error('Profile setup: Update error:', updateError);
        throw updateError;
      }
      
      console.log('Profile setup: Success! Redirecting to explore...');
      router.push("/explore");
    } catch (err: any) {
      console.error('Profile setup: Error:', err);
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    setLoading(true);
    setError("");
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Not authenticated");
      router.push("/explore");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <Card className="w-full max-w-md p-8">
        {!authChecked ? (
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-creative-600 mx-auto"></div>
            <p className="text-gray-700">Checking authentication...</p>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold mb-6 text-center">Complete your profile</h1>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block mb-1 font-medium">Profile picture</label>
                <div className="border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center bg-gray-50 relative" style={{ minHeight: 220 }}>
                  {imageSrc ? (
                    <>
                      <div className="w-40 h-40 relative rounded-full overflow-hidden">
                        <Cropper
                          image={imageSrc}
                          crop={crop}
                          zoom={zoom}
                          aspect={1}
                          cropShape="round"
                          showGrid={false}
                          onCropChange={setCrop}
                          onZoomChange={setZoom}
                          onCropComplete={onCropComplete}
                        />
                      </div>
                      <Button type="button" variant="outline" className="mt-2" onClick={handleClearImage}>
                        Remove
                      </Button>
                    </>
                  ) : (
                    <>
                      <input
                        type="file"
                        accept="image/*"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        style={{ width: "100%", height: "100%" }}
                        onChange={onDrop}
                      />
                      <span className="text-gray-400">Drag & drop or click to upload</span>
                    </>
                  )}
                </div>
              </div>
              <div>
                <label className="block mb-1 font-medium">Bio</label>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[80px]"
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  placeholder="Tell us about yourself (2-3 sentences)"
                  maxLength={320}
                  rows={3}
                />
              </div>
              <div>
                <label className="block mb-1 font-medium">Instagram Handle</label>
                <div className="flex items-center">
                  <span className="px-2 py-2 bg-gray-100 border border-input rounded-l-md text-gray-500 select-none">@</span>
                  <Input
                    type="text"
                    value={instagram.replace(/^@/, "")}
                    onChange={e => setInstagram(e.target.value.replace(/[^a-zA-Z0-9_\.]/g, ""))}
                    placeholder="yourhandle"
                    maxLength={30}
                    className="rounded-l-none"
                  />
                </div>
              </div>
              <div>
                <label className="block mb-1 font-medium">TikTok Handle</label>
                <div className="flex items-center">
                  <span className="px-2 py-2 bg-gray-100 border border-input rounded-l-md text-gray-500 select-none">@</span>
                  <Input
                    type="text"
                    value={tiktok.replace(/^@/, "")}
                    onChange={e => setTiktok(e.target.value.replace(/[^a-zA-Z0-9_\.]/g, ""))}
                    placeholder="yourhandle"
                    maxLength={30}
                    className="rounded-l-none"
                  />
                </div>
              </div>
              {error && <div className="text-red-500 text-sm">{error}</div>}
              <div className="flex gap-2">
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Saving..." : "Save and continue"}
                </Button>
                <Button type="button" variant="outline" className="w-full" onClick={handleSkip} disabled={loading}>
                  Skip
                </Button>
              </div>
            </form>
          </>
        )}
      </Card>
    </div>
  );
} 