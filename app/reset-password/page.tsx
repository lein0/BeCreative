'use client'

import React, { useState, useEffect } from 'react'
import { AuthCard } from '@/components/ui/auth-card'
import { useRouter } from 'next/navigation'
import { directSupabase } from '@/lib/supabase-direct'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isValidToken, setIsValidToken] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const handleTokens = async () => {
      const hash = window.location.hash.substring(1)
      const params = new URLSearchParams(hash)
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')
      const type = params.get('type')

      if (type === 'recovery' && accessToken && refreshToken) {
        const { error } = await directSupabase.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        })
        if (error) {
          setError('Invalid or expired reset link.')
          return
        }
        setIsValidToken(true)
      } else {
        setError('Invalid or expired reset link. Please request a new one.')
      }
    }
    handleTokens()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (password.length < 6) {
      setError('Password must be at least 6 characters long')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)

    try {
      const { error } = await directSupabase.updateUser({ password })

      if (error) throw error

      setSuccess('Password updated successfully! Redirecting to login...')
      setTimeout(() => router.push('/login'), 2000)
    } catch (err: any) {
      setError(err.message || 'Failed to update password')
    } finally {
      setLoading(false)
    }
  }

  if (!isValidToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-creative-50 via-white to-creative-100 py-16">
        <AuthCard title="Reset Password" subtitle={error ?? undefined}>
          <div className="mt-6 text-center text-sm text-gray-600">
            <a href="/forgot-password" className="text-creative-600 hover:underline font-medium">Request new reset link</a>
          </div>
        </AuthCard>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-creative-50 via-white to-creative-100 py-16">
      <AuthCard title="Reset Password" subtitle={error ?? undefined}>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
            <input
              type="password"
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-creative-500"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
            <input
              type="password"
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-creative-500"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
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
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </AuthCard>
    </div>
  )
} 