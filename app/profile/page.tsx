"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "../../components/ui/avatar";
import { directSupabase } from "../../lib/supabase-direct";
import { User, Mail, Calendar, MapPin, Instagram, Edit, Save, X, Award, BookOpen, Clock, ExternalLink } from "lucide-react";

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  bio: string;
  city: string;
  avatar_url: string;
  instagram_url: string;
  tiktok_url: string;
  role: 'student' | 'instructor' | 'admin';
  credits: number;
  created_at: string;
  updated_at: string;
}

interface InstructorProfile {
  id: string;
  user_id: string;
  bio: string;
  credentials: string;
  experience_years: number;
  specialties: string[];
  hourly_rate: number;
  location: string;
  is_verified: boolean;
  is_approved: boolean;
  is_active: boolean;
  created_at: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [instructor, setInstructor] = useState<InstructorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: '',
    bio: '',
    city: '',
    instagram_url: '',
    tiktok_url: ''
  });

  useEffect(() => {
    fetchUserProfile();
  }, []);

  const fetchUserProfile = async () => {
    setLoading(true);
    setError("");
    
    try {
      // Get current user
      const { data: authData, error: authError } = await directSupabase.getUser();
      if (authError || !authData.user) {
        setError("Not authenticated");
        router.push('/login');
        return;
      }

      // Get user profile
      const { data: userData, error: userError } = await directSupabase.queryTable('users', {
        select: '*',
        eq: ['id', authData.user.id],
        single: true
      });

      if (userError) {
        if (userError.message.includes('No rows found')) {
          router.push('/onboarding/profile-setup');
          return;
        }
        throw userError;
      }

      setUser(userData);
      setEditForm({
        full_name: userData.full_name || '',
        bio: userData.bio || '',
        city: userData.city || '',
        instagram_url: userData.instagram_url || '',
        tiktok_url: userData.tiktok_url || ''
      });

      // If user is an instructor, get instructor profile
      if (userData.role === 'instructor') {
        const { data: instructorData, error: instructorError } = await directSupabase.queryTable('instructors', {
          select: '*',
          eq: ['user_id', authData.user.id],
          single: true
        });

        if (!instructorError && instructorData) {
          setInstructor(instructorData);
        }
      }

    } catch (err: any) {
      console.error('Profile fetch error:', err);
      setError(err.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    
    setSaving(true);
    setError("");
    
    try {
      // Update user profile
      const { data: updatedUser, error: updateError } = await directSupabase.updateTable('users', editForm, {
        eq: ['id', user.id]
      });

      if (updateError) {
        throw updateError;
      }

      // Update local state with the returned data
      if (updatedUser && updatedUser.length > 0) {
        setUser(prev => prev ? { ...prev, ...updatedUser[0] } : null);
      } else {
        // Fallback to form data if no data returned
        setUser(prev => prev ? { ...prev, ...editForm } : null);
      }
      
      setEditing(false);
      
    } catch (err: any) {
      console.error('Save error:', err);
      setError(err.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (user) {
      setEditForm({
        full_name: user.full_name || '',
        bio: user.bio || '',
        city: user.city || '',
        instagram_url: user.instagram_url || '',
        tiktok_url: user.tiktok_url || ''
      });
    }
    setEditing(false);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getMembershipDuration = (createdAt: string) => {
    const created = new Date(createdAt);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - created.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 30) {
      return `${diffDays} day${diffDays === 1 ? '' : 's'}`;
    } else if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return `${months} month${months === 1 ? '' : 's'}`;
    } else {
      const years = Math.floor(diffDays / 365);
      const remainingMonths = Math.floor((diffDays % 365) / 30);
      return `${years} year${years === 1 ? '' : 's'}${remainingMonths > 0 ? ` ${remainingMonths} month${remainingMonths === 1 ? '' : 's'}` : ''}`;
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'instructor':
        return <Award className="h-5 w-5 text-creative-600" />;
      case 'admin':
        return <BookOpen className="h-5 w-5 text-purple-600" />;
      default:
        return <User className="h-5 w-5 text-blue-600" />;
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'instructor':
        return 'Instructor';
      case 'admin':
        return 'Administrator';
      default:
        return 'Student';
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-creative-50 via-white to-creative-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-creative-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-creative-50 via-white to-creative-100">
        <Card className="w-full max-w-md p-8 text-center">
          <div className="text-red-500 mb-4">
            <X className="h-12 w-12 mx-auto mb-2" />
            <p className="font-semibold">Error Loading Profile</p>
          </div>
          <p className="text-gray-600 mb-4">{error}</p>
          <Button onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </Card>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-creative-50 via-white to-creative-100 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        {/* Header Card */}
        <Card className="mb-8 p-8 bg-white/80 backdrop-blur-sm shadow-xl border-creative-100">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            {/* Avatar */}
            <div className="relative">
              <Avatar className="w-32 h-32 border-4 border-creative-200 shadow-lg">
                <AvatarImage src={user.avatar_url || undefined} alt={user.full_name || user.email} />
                <AvatarFallback className="text-2xl font-bold bg-gradient-to-br from-creative-500 to-creative-600 text-white">
                  {user.full_name ? user.full_name.split(' ').map((n: string) => n[0]).join('') : "U"}
                </AvatarFallback>
              </Avatar>
              {instructor?.is_verified && (
                <div className="absolute -bottom-2 -right-2 bg-green-500 rounded-full p-2 border-4 border-white shadow-lg">
                  <Award className="h-4 w-4 text-white" />
                </div>
              )}
            </div>

            {/* User Info */}
            <div className="flex-1 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
                {getRoleIcon(user.role)}
                <span className="text-sm font-medium text-gray-600 uppercase tracking-wide">
                  {getRoleLabel(user.role)}
                </span>
              </div>
              
              {editing ? (
                <input
                  type="text"
                  value={editForm.full_name}
                  onChange={(e) => setEditForm(prev => ({ ...prev, full_name: e.target.value }))}
                  className="text-3xl font-bold text-gray-900 mb-2 bg-transparent border-b-2 border-creative-300 focus:border-creative-600 outline-none"
                  placeholder="Your full name"
                />
              ) : (
                <h1 className="text-3xl font-bold text-gray-900 mb-2">{user.full_name || user.email}</h1>
              )}
              
              <div className="flex items-center justify-center md:justify-start gap-2 text-gray-600 mb-4">
                <Mail className="h-4 w-4" />
                <span>{user.email}</span>
              </div>

              {/* Member Since */}
              <div className="flex items-center justify-center md:justify-start gap-2 text-gray-600 mb-4">
                <Calendar className="h-4 w-4" />
                <span>Member for {getMembershipDuration(user.created_at)}</span>
                <span className="text-gray-400">•</span>
                <span>Since {formatDate(user.created_at)}</span>
              </div>

              {/* Location */}
              {(user.city || editing) && (
                <div className="flex items-center justify-center md:justify-start gap-2 text-gray-600 mb-4">
                  <MapPin className="h-4 w-4" />
                  {editing ? (
                    <input
                      type="text"
                      value={editForm.city}
                      onChange={(e) => setEditForm(prev => ({ ...prev, city: e.target.value }))}
                      className="bg-transparent border-b border-gray-300 focus:border-creative-600 outline-none"
                      placeholder="Your city"
                    />
                  ) : (
                    <span>{user.city}</span>
                  )}
                </div>
              )}

              {/* Credits */}
              <div className="flex items-center justify-center md:justify-start gap-2 text-creative-600 font-semibold">
                <Clock className="h-4 w-4" />
                <span>{user.credits} Credits Available</span>
              </div>
            </div>

            {/* Edit Button */}
            <div className="flex gap-2">
              {editing ? (
                <>
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-creative-600 hover:bg-creative-700"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? 'Saving...' : 'Save'}
                  </Button>
                  <Button
                    onClick={handleCancel}
                    variant="outline"
                    disabled={saving}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => setEditing(true)}
                  variant="outline"
                  className="border-creative-300 hover:bg-creative-50"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Profile
                </Button>
              )}
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Bio Section */}
          <Card className="lg:col-span-2 p-6 bg-white/80 backdrop-blur-sm shadow-xl border-creative-100">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">About</h2>
            {editing ? (
              <textarea
                value={editForm.bio}
                onChange={(e) => setEditForm(prev => ({ ...prev, bio: e.target.value }))}
                className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:border-creative-600 focus:ring-2 focus:ring-creative-200 outline-none resize-none"
                placeholder="Tell us about yourself..."
              />
            ) : (
              <p className="text-gray-700 leading-relaxed">
                {user.bio || "No bio added yet. Click 'Edit Profile' to add one!"}
              </p>
            )}
          </Card>

          {/* Social Links & Stats */}
          <div className="space-y-6">
            {/* Social Links */}
            <Card className="p-6 bg-white/80 backdrop-blur-sm shadow-xl border-creative-100">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Social Links</h3>
              <div className="space-y-3">
                {editing ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Instagram</label>
                      <input
                        type="url"
                        value={editForm.instagram_url}
                        onChange={(e) => setEditForm(prev => ({ ...prev, instagram_url: e.target.value }))}
                        className="w-full p-2 border border-gray-300 rounded-lg focus:border-creative-600 focus:ring-2 focus:ring-creative-200 outline-none"
                        placeholder="https://instagram.com/username"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">TikTok</label>
                      <input
                        type="url"
                        value={editForm.tiktok_url}
                        onChange={(e) => setEditForm(prev => ({ ...prev, tiktok_url: e.target.value }))}
                        className="w-full p-2 border border-gray-300 rounded-lg focus:border-creative-600 focus:ring-2 focus:ring-creative-200 outline-none"
                        placeholder="https://tiktok.com/@username"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    {user.instagram_url && (
                      <a
                        href={user.instagram_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-pink-600 hover:text-pink-700 transition-colors"
                      >
                        <Instagram className="h-4 w-4" />
                        <span>Instagram</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {user.tiktok_url && (
                      <a
                        href={user.tiktok_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-gray-900 hover:text-gray-700 transition-colors"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M19.321 5.562a5.124 5.124 0 0 1-.443-.258 6.228 6.228 0 0 1-1.137-.966c-.849-.849-1.204-1.859-1.204-2.859V1h-3.179v14.66c0 2.072-1.678 3.75-3.75 3.75s-3.75-1.678-3.75-3.75 1.678-3.75 3.75-3.75c.414 0 .815.067 1.19.19v-3.368c-.382-.055-.773-.084-1.19-.084C4.822 8.648 1 12.47 1 17.154S4.822 25.66 9.506 25.66s8.506-3.822 8.506-8.506V9.721a9.468 9.468 0 0 0 5.556 1.785V8.327c-1.533 0-2.944-.6-3.986-1.571-.849-.849-1.204-1.859-1.204-2.859V1h-3.179v14.66c0 2.072-1.678 3.75-3.75 3.75s-3.75-1.678-3.75-3.75 1.678-3.75 3.75-3.75c.414 0 .815.067 1.19.19v-3.368c-.382-.055-.773-.084-1.19-.084C4.822 8.648 1 12.47 1 17.154S4.822 25.66 9.506 25.66s8.506-3.822 8.506-8.506V9.721a9.468 9.468 0 0 0 5.556 1.785V8.327c-1.533 0-2.944-.6-3.986-1.571z"/>
                        </svg>
                        <span>TikTok</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {!user.instagram_url && !user.tiktok_url && (
                      <p className="text-gray-500 text-sm">No social links added yet</p>
                    )}
                  </>
                )}
              </div>
            </Card>

            {/* Instructor Stats */}
            {instructor && (
              <Card className="p-6 bg-white/80 backdrop-blur-sm shadow-xl border-creative-100">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Instructor Stats</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Experience</span>
                    <span className="font-semibold">{instructor.experience_years || 0} years</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Hourly Rate</span>
                    <span className="font-semibold">${instructor.hourly_rate || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Status</span>
                    <div className="flex items-center gap-1">
                      {instructor.is_verified && (
                        <Award className="h-4 w-4 text-green-500" />
                      )}
                      <span className={`font-semibold ${instructor.is_approved ? 'text-green-600' : 'text-yellow-600'}`}>
                        {instructor.is_approved ? 'Approved' : 'Pending'}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Teaching Since</span>
                    <span className="font-semibold">{formatDate(instructor.created_at)}</span>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
} 