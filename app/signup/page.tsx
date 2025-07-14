'use client'

import React, { useState } from 'react'
import { AuthCard } from '@/components/ui/auth-card'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { directSupabase } from '@/lib/supabase-direct'

export default function SignupPage() {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const router = useRouter()



  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    
    // Client-side validation
    if (!form.firstName.trim()) {
      setError('Please enter your first name')
      return
    }
    
    if (!form.lastName.trim()) {
      setError('Please enter your last name')
      return
    }
    
    if (!form.email.trim()) {
      setError('Please enter your email address')
      return
    }
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(form.email)) {
      setError('Please enter a valid email address')
      return
    }
    
    if (!form.password) {
      setError('Please enter a password')
      return
    }
    
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    
    // Check for password strength
    const hasUpperCase = /[A-Z]/.test(form.password)
    const hasLowerCase = /[a-z]/.test(form.password)
    const hasNumbers = /\d/.test(form.password)
    
    if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
      setError('Password must contain at least one uppercase letter, one lowercase letter, and one number')
      return
    }
    
    setLoading(true)
    console.log('Signing up with:', { email: form.email, metadata: { first_name: form.firstName, last_name: form.lastName } })
    
    try {
      const { data, error } = await directSupabase.signUp(
        form.email,
        form.password,
        {
          first_name: form.firstName,
          last_name: form.lastName,
        }
      )
      
      console.log('Signup result:', { data, error })
      
      if (error) {
        console.error('Signup error:', error)
        
        // Convert API errors to user-friendly messages based on Supabase error codes
        let userMessage = error.message
        
        // Check for specific error codes first, then fall back to message content
        if ((error as any).code && typeof (error as any).code === 'string') {
          switch ((error as any).code) {
            case 'email_exists':
            case 'user_already_exists':
              userMessage = "An account with this email already exists. Please <a href='/login' style='color: #7c3aed; text-decoration: underline; font-weight: 500;' onmouseover='this.style.textDecoration=\"none\"' onmouseout='this.style.textDecoration=\"underline\"'>log in</a> instead."
              break
            case 'weak_password':
              userMessage = "Password is too weak. Please choose a stronger password with at least 6 characters."
              break
            case 'validation_failed':
              userMessage = "Please check your email format and password requirements."
              break
            case 'signup_disabled':
              userMessage = "Account creation is currently disabled. Please contact support."
              break
            case 'email_provider_disabled':
              userMessage = "Email signup is currently disabled. Please try a different method."
              break
            case 'over_email_send_rate_limit':
              userMessage = "Too many emails sent. Please wait a few minutes before trying again."
              break
            case 'over_request_rate_limit':
              userMessage = "Too many requests. Please wait a few minutes before trying again."
              break
            case 'captcha_failed':
              userMessage = "Captcha verification failed. Please try again."
              break
            default:
              // Fall back to message-based checks for older error formats
              if (error.message.includes('already_registered') || error.message.includes('User already registered')) {
                userMessage = "An account with this email already exists. Please <a href='/login' style='color: #7c3aed; text-decoration: underline; font-weight: 500;' onmouseover='this.style.textDecoration=\"none\"' onmouseout='this.style.textDecoration=\"underline\"'>log in</a> instead."
              } else if (error.message.includes('invalid_email') || error.message.includes('validation_failed')) {
                userMessage = "Please enter a valid email address."
              } else if (error.message.includes('weak_password')) {
                userMessage = "Password is too weak. Please choose a stronger password."
              } else if (error.message.includes('rate limit') || error.message.includes('too many')) {
                userMessage = "Too many requests. Please wait a few minutes before trying again."
              } else if (error.message.includes('signup_disabled') || error.message.includes('disabled')) {
                userMessage = "Account creation is currently disabled. Please contact support."
              } else if (error.message.includes('network') || error.message.includes('connection')) {
                userMessage = "Network error. Please check your connection and try again."
              } else if (error.message.includes('timeout')) {
                userMessage = "Request timed out. Please try again."
              } else {
                userMessage = "Unable to create account. Please try again or contact support."
              }
              break
          }
        } else {
          // Handle cases where there's no error code
          if (error.message.includes('already_registered') || error.message.includes('User already registered')) {
            userMessage = "An account with this email already exists. Please <a href='/login' style='color: #7c3aed; text-decoration: underline; font-weight: 500;' onmouseover='this.style.textDecoration=\"none\"' onmouseout='this.style.textDecoration=\"underline\"'>log in</a> instead."
          } else if (error.message.includes('invalid_email') || error.message.includes('validation_failed')) {
            userMessage = "Please enter a valid email address."
          } else if (error.message.includes('weak_password')) {
            userMessage = "Password is too weak. Please choose a stronger password."
          } else if (error.message.includes('rate limit') || error.message.includes('too many')) {
            userMessage = "Too many requests. Please wait a few minutes before trying again."
          } else if (error.message.includes('signup_disabled') || error.message.includes('disabled')) {
            userMessage = "Account creation is currently disabled. Please contact support."
          } else if (error.message.includes('network') || error.message.includes('connection')) {
            userMessage = "Network error. Please check your connection and try again."
          } else if (error.message.includes('timeout')) {
            userMessage = "Request timed out. Please try again."
          } else {
            userMessage = "Unable to create account. Please try again or contact support."
          }
        }
        
        setError(userMessage)
        return
      }
      
      if (data.user) {
        // Check if this is a new user or existing user
        // When email confirmation is enabled, Supabase returns a fake user object for existing emails
        // The key difference is that existing users have an empty identities array
        const isNewUser = data.user.identities && data.user.identities.length > 0
        
        if (isNewUser) {
          console.log('Signup successful! User created:', data.user.id)
          setSuccess('Account created successfully! Please check your email to verify your account.')
          
          // Redirect to verify email page
          setTimeout(() => {
            router.push('/verify-email')
          }, 2000)
        } else {
          console.log('Email already exists, user identities:', data.user.identities)
          setError('An account with this email already exists. Please <a href="/login" style="color: #7c3aed; text-decoration: underline; font-weight: 500;" onmouseover="this.style.textDecoration=\'none\'" onmouseout="this.style.textDecoration=\'underline\'">log in</a> instead.')
        }
      } else {
        setError('Signup completed but no user data returned. Please try again.')
      }
      
    } catch (err: any) {
      console.error('Signup error:', err)
      
      // Handle different types of errors
      let errorMessage = 'Unexpected error. Please try again.'
      
      if (err.name === 'NetworkError' || err.message.includes('fetch')) {
        errorMessage = 'Network error. Please check your internet connection and try again.'
      } else if (err.message.includes('timeout')) {
        errorMessage = 'Request timed out. Please try again.'
      } else if (err.message.includes('CORS')) {
        errorMessage = 'Configuration error. Please contact support.'
      } else if (err.message) {
        errorMessage = err.message
      }
      
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-creative-50 via-white to-creative-100 py-16">
      <AuthCard title="Join BeCreative" subtitle="Create your account to start learning from amazing instructors.">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
              <input
                type="text"
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-creative-500"
                value={form.firstName}
                onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <input
                type="text"
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-creative-500"
                value={form.lastName}
                onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                required
              />
            </div>
          </div>
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
          {error && <div className="text-red-600 text-sm text-center" dangerouslySetInnerHTML={{ __html: error }}></div>}
          {success && <div className="text-green-600 text-sm text-center">{success}</div>}
          
          <button
            type="submit"
            className="w-full bg-creative-600 hover:bg-creative-700 text-white font-semibold rounded-lg px-4 py-2 transition disabled:opacity-60"
            disabled={loading}
          >
            {loading ? 'Signing up...' : 'Sign Up'}
          </button>
        </form>
        <div className="mt-6 text-center text-sm text-gray-600">
          Already have an account? <Link href="/login" className="text-creative-600 hover:underline font-medium">Log in</Link>
        </div>
      </AuthCard>
    </div>
  )
} 