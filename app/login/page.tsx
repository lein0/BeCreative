'use client'

import React, { useState } from 'react'
import { AuthCard } from '@/components/ui/auth-card'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

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
      console.log("Logging in with", form.email)
      const { data, error } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      })
      console.log("Login result", { data, error })
      if (error) {
        setError(error.message)
      } else if (data.user && !data.user.email_confirmed_at) {
        router.push('/verify-email')
      } else if (data.user) {
        router.push('/') // or dashboard
      } else {
        setError("Unknown error. Please try again.")
      }
    } catch (err: any) {
      setError(err.message || "Unexpected error. Please try again.")
    } finally {
      setLoading(false)
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