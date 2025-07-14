"use client";
import React, { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { directSupabase } from "../../../lib/supabase-direct";
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
      const { data: authData, error: authError } = await directSupabase.getUser();
      console.log('Profile setup: Auth check result:', { user: !!authData.user, error: authError?.message });
      
      if (authError || !authData.user) {
        console.error('Profile setup: Not authenticated, redirecting to login');
        router.push('/login');
        return;
      }
      
      // Check if user exists in users table
      const { data: userData, error: userError } = await directSupabase.queryTable('users', {
        select: '*',
        eq: ['id', authData.user.id],
        single: true
      });
      
      console.log('Profile setup: User table check:', { userData: !!userData, userError: userError?.message });
      
      if (userError && !userError.message.includes('No rows found')) {
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
      const { data: authData, error: authError } = await directSupabase.getUser();
      console.log('Profile setup: Auth check:', { user: !!authData.user, error: authError?.message });
      
      if (authError || !authData.user) {
        console.error('Profile setup: Not authenticated');
        throw new Error("Not authenticated. Please try logging in again.");
      }
      
      // Check if user exists in users table
      const { data: userData, error: userError } = await directSupabase.queryTable('users', {
        select: '*',
        eq: ['id', authData.user.id],
        single: true
      });
      
      console.log('Profile setup: User table check:', { userData: !!userData, userError: userError?.message });
      
      if (userError && !userError.message.includes('No rows found')) {
        console.error('Profile setup: Error checking user table:', userError);
        throw new Error('User profile not found. Please try signing up again.');
      }
      
      let avatar_url = null;
      if (profilePic && imageSrc) {
        console.log('Profile setup: Uploading profile picture...');
        // Check if bucket exists (defensive)
        const { data: bucketList, error: bucketError } = await directSupabase.storageListBuckets();
        console.log('DEBUG: bucketList', bucketList, 'bucketError', bucketError);
        if (bucketError || !bucketList?.find((b: any) => b.name === "profile-pictures")) {
          throw new Error("Profile pictures bucket not found. Please contact support.");
        }
        const { data, error: uploadError } = await directSupabase.storageUpload(
          "profile-pictures",
          `public/${authData.user.id}/${profilePic.name}`,
          profilePic,
          {
            cacheControl: "3600",
            upsert: true,
          }
        );
        if (uploadError) throw uploadError;
        if (data?.path) {
          const { data: urlData } = await directSupabase.storageGetPublicUrl("profile-pictures", data.path);
          avatar_url = urlData.publicUrl;
        } else {
          avatar_url = null;
        }
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
      
      const { error: updateError } = await directSupabase.updateTable('users', {
        bio,
        avatar_url,
        instagram_url,
        tiktok_url,
      }, {
        eq: ['id', authData.user.id]
      });
      
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
      const { data: authData, error: authError } = await directSupabase.getUser();
      if (authError || !authData.user) throw new Error("Not authenticated");
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
                <label className="block mb-1 font-medium">Instagram</label>
                <Input
                  type="text"
                  value={instagram}
                  onChange={e => setInstagram(e.target.value)}
                  placeholder="@username"
                />
              </div>
              <div>
                <label className="block mb-1 font-medium">TikTok</label>
                <Input
                  type="text"
                  value={tiktok}
                  onChange={e => setTiktok(e.target.value)}
                  placeholder="@username"
                />
              </div>
              {error && <div className="text-red-600 text-sm">{error}</div>}
              <div className="flex gap-2">
                <Button type="submit" disabled={loading} className="flex-1">
                  {loading ? "Saving..." : "Complete Profile"}
                </Button>
                <Button type="button" variant="outline" onClick={handleSkip} disabled={loading}>
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