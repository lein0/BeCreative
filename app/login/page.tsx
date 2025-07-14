'use client'

import React, { useState } from 'react'
import { AuthCard } from '@/components/ui/auth-card'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { directSupabase } from '@/lib/supabase-direct'

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    
    try {
      console.log("=== LOGIN START (Direct Client) ===")
      console.log("Logging in with", form.email)
      
      const { data, error } = await directSupabase.signInWithPassword(
        form.email,
        form.password
      )
      
      console.log("Login result", { data, error })
      
      if (error) {
        console.error("Login error:", error)
        
        // Convert API errors to user-friendly messages
        let userMessage = error.message
        if (error.message.includes('invalid_credentials') || error.message.includes('Invalid login credentials')) {
          userMessage = "Invalid email or password. Please check your credentials and try again."
        } else if (error.message.includes('too_many_requests')) {
          userMessage = "Too many login attempts. Please wait a moment before trying again."
        } else if (error.message.includes('email_not_confirmed')) {
          userMessage = "Please check your email and click the verification link before logging in."
        }
        
        setError(userMessage)
        return
      }
      
      if (!data.user) {
        console.error("No user data returned")
        setError("Login failed. Please try again.")
        return
      }
      
      console.log("Login successful for user:", data.user.id)
      console.log("Email confirmed:", data.user.email_confirmed_at ? "Yes" : "No")
      
      // Notify header about auth state change
      window.dispatchEvent(new CustomEvent('auth-state-changed'))
      
      // Check if email is confirmed
      if (!data.user.email_confirmed_at) {
        console.log("Email not confirmed, redirecting to verify-email")
        router.push('/verify-email')
        return
      }
      
      // Email is confirmed, check if user exists in our database
      console.log("Checking user in database...")
      try {
        const { data: userData, error: userError } = await directSupabase.queryTable('users', {
          select: '*',
          eq: ['id', data.user.id],
          single: true
        })
        
        if (userError && !userError.message.includes('No rows found')) {
          console.error("User check error:", userError)
          // User might not exist in our database, redirect to profile setup
          router.push('/onboarding/profile-setup')
          return
        }
        
        if (userData) {
          console.log("User found in database, redirecting to profile")
          router.push('/profile')
        } else {
          console.log("User not found in database, redirecting to onboarding")
          router.push('/onboarding/profile-setup')
        }
      } catch (userCheckErr) {
        console.log("User check failed, redirecting to profile:", userCheckErr)
        router.push('/profile')
      }
      
    } catch (err: any) {
      console.error("Unexpected login error:", err)
      setError(err.message || "Unexpected error. Please try again.")
    } finally {
      setLoading(false)
      console.log("=== LOGIN END ===")
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-creative-50 via-white to-creative-100 py-16">
      <AuthCard title="Log In to BeCreative" subtitle="Welcome back! Log in to book classes, manage your profile, and more.">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-creative-500"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-creative-500"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              required
            />
          </div>
          {error && <div className="text-red-600 text-sm text-center">{error}</div>}
          <button
            type="submit"
            className="w-full bg-creative-600 hover:bg-creative-700 text-white font-semibold rounded-lg px-4 py-2 transition disabled:opacity-60"
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Log In'}
          </button>
        </form>
        <div className="mt-6 text-center text-sm text-gray-600">
          <Link href="/forgot-password" className="text-creative-600 hover:underline font-medium">Forgot password?</Link>
        </div>
        <div className="mt-2 text-center text-sm text-gray-600">
          New to BeCreative?{' '}
          <Link href="/signup" className="text-creative-600 hover:underline font-medium">Sign up</Link>
        </div>
      </AuthCard>
    </div>
  )
} 