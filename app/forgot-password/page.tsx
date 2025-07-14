'use client'

import React, { useState } from 'react'
import { AuthCard } from '@/components/ui/auth-card'
import Link from 'next/link'
import { directSupabase } from '@/lib/supabase-direct'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)
    const { error } = await directSupabase.resetPasswordForEmail(email, window.location.origin + '/reset-password')
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setSuccess('Check your email for a password reset link!')
      setEmail('')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-creative-50 via-white to-creative-100 py-16">
      <AuthCard title="Forgot Password?" subtitle="Enter your email and we'll send you a link to reset your password.">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-creative-500"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          {error && <div className="text-red-600 text-sm text-center">{error}</div>}
          {success && <div className="text-green-600 text-sm text-center">{success}</div>}
          <button
            type="submit"
            className="w-full bg-creative-600 hover:bg-creative-700 text-white font-semibold rounded-lg px-4 py-2 transition disabled:opacity-60"
            disabled={loading}
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>
        <div className="mt-6 text-center text-sm text-gray-600">
          <Link href="/login" className="text-creative-600 hover:underline font-medium">Back to login</Link>
        </div>
      </AuthCard>
    </div>
  )
} 