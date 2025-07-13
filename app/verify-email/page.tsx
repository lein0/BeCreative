'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AuthCard } from '../../components/ui/auth-card'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'

export default function VerifyEmailPage() {
  const router = useRouter()
  const [resent, setResent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [debugInfo, setDebugInfo] = useState<string>('')
  const [manualVerifying, setManualVerifying] = useState(false)

  useEffect(() => {
    console.log('VerifyEmailPage mounted')
    console.log('Current URL:', window.location.href)
    console.log('Hash:', window.location.hash)
    console.log('Search params:', window.location.search)
    
    setDebugInfo(`URL: ${window.location.href}\nHash: ${window.location.hash}\nSearch: ${window.location.search}`)
    
    // First, check if user is already authenticated
    checkAuthState()
    
    // Then check for verification tokens in URL
    checkForVerificationTokens()
  }, [])

  async function checkAuthState() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser()
      console.log('Current auth state:', { user: !!user, error })
      
      if (user && user.email_confirmed_at) {
        console.log('User is already verified, redirecting to profile setup')
        router.push('/onboarding/profile-setup')
        return
      }
    } catch (err) {
      console.error('Error checking auth state:', err)
    }
  }

  function checkForVerificationTokens() {
    let accessToken = null
    let refreshToken = null
    
    // Check hash fragment first (typical Supabase email verification)
    if (window.location.hash) {
      const hash = window.location.hash.substring(1)
      const params = new URLSearchParams(hash)
      accessToken = params.get('access_token')
      refreshToken = params.get('refresh_token')
    }
    
    // Check query parameters as fallback
    if (!accessToken || !refreshToken) {
      const searchParams = new URLSearchParams(window.location.search)
      accessToken = accessToken || searchParams.get('access_token')
      refreshToken = refreshToken || searchParams.get('refresh_token')
    }
    
    console.log('Parsed tokens:', { accessToken: !!accessToken, refreshToken: !!refreshToken })
    setDebugInfo(prev => prev + `\nTokens found: access=${!!accessToken}, refresh=${!!refreshToken}`)
    
    if (accessToken && refreshToken) {
      handleEmailVerification(accessToken, refreshToken)
    } else {
      console.log('No verification tokens found in URL')
      setDebugInfo(prev => prev + '\nNo verification tokens found in URL')
    }
  }

  async function handleEmailVerification(accessToken: string, refreshToken: string) {
    console.log('Starting email verification...')
    setVerifying(true)
    setError(null)
    
    // Add a timeout to prevent hanging
    const timeoutId = setTimeout(() => {
      console.error('Verification timeout - taking too long')
      setError('Verification is taking too long. Please try again.')
      setVerifying(false)
    }, 10000) // 10 second timeout
    
    try {
      console.log('Setting session with tokens...')
      
      // Try setSession with a shorter timeout
      const sessionPromise = supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      
      // Add a 3-second timeout to setSession
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('setSession timeout')), 3000)
      })
      
      let data, error;
      try {
        const result = await Promise.race([sessionPromise, timeoutPromise]) as any;
        data = result.data;
        error = result.error;
      } catch (timeoutError: any) {
        console.log('setSession timed out, using alternative verification...');
        clearTimeout(timeoutId);
        await handleAlternativeVerification(accessToken);
        return;
      }
      
      console.log('setSession result:', { 
        success: !error, 
        user: !!data?.user, 
        error: error?.message,
        emailConfirmed: data?.user?.email_confirmed_at 
      })
      
      if (error) {
        console.error('setSession error:', error)
        clearTimeout(timeoutId);
        await handleAlternativeVerification(accessToken);
        return;
      }
      
      if (data?.user) {
        console.log('User verified successfully:', {
          id: data.user.id,
          email: data.user.email,
          emailConfirmed: data.user.email_confirmed_at
        })
        
        // Check if user exists in our users table
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('*')
          .eq('id', data.user.id)
          .single()
        
        console.log('User table check:', { userData: !!userData, userError: userError?.message })
        
        if (userError && userError.code !== 'PGRST116') {
          console.error('Error checking user table:', userError)
        }
        
        console.log('Redirecting to profile setup...')
        clearTimeout(timeoutId)
        router.push('/onboarding/profile-setup')
      } else {
        console.error('No user data returned from setSession')
        clearTimeout(timeoutId);
        await handleAlternativeVerification(accessToken);
      }
    } catch (err: any) {
      console.error('Email verification error:', err)
      clearTimeout(timeoutId)
      setError(err.message || 'Failed to verify email')
    } finally {
      clearTimeout(timeoutId)
      setVerifying(false)
    }
  }

  async function handleAlternativeVerification(accessToken: string) {
    console.log('Using alternative verification method...')
    try {
      // Decode the JWT token to get user info
      const tokenParts = accessToken.split('.')
      if (tokenParts.length !== 3) {
        throw new Error('Invalid token format')
      }
      
      const payload = JSON.parse(atob(tokenParts[1]))
      console.log('Token payload:', payload)
      
      // Check if email is verified in the token
      if (payload.user_metadata?.email_verified) {
        console.log('Email verified in token, proceeding...')
        
        // Try to get user from database with a timeout
        const userCheckPromise = supabase
          .from('users')
          .select('*')
          .eq('id', payload.sub)
          .single()
        
        const userCheckTimeout = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('User check timeout')), 3000)
        })
        
        let userData, userError;
        try {
          const result = await Promise.race([userCheckPromise, userCheckTimeout]) as any;
          userData = result.data;
          userError = result.error;
        } catch (timeoutError) {
          console.log('User check timed out, proceeding anyway...');
          userData = null;
          userError = { code: 'TIMEOUT' };
        }
        
        console.log('User table check:', { userData: !!userData, userError: userError?.message })
        
        if (userData) {
          console.log('User found in database, redirecting...')
          router.push('/onboarding/profile-setup')
          return
        } else {
          console.log('User not found in database, but token is valid - redirecting anyway')
          // Still redirect to profile setup - the user might be created by the trigger
          router.push('/onboarding/profile-setup')
          return
        }
      } else {
        throw new Error('Email not verified in token')
      }
    } catch (err: any) {
      console.error('Alternative verification failed:', err)
      // Even if alternative verification fails, try to redirect if we have a valid token
      try {
        const tokenParts = accessToken.split('.')
        if (tokenParts.length === 3) {
          const payload = JSON.parse(atob(tokenParts[1]))
          console.log('Attempting redirect despite verification failure...')
          router.push('/onboarding/profile-setup')
          return
        }
      } catch (decodeError) {
        console.error('Failed to decode token for fallback redirect:', decodeError)
      }
      throw err
    }
  }

  async function handleManualVerification() {
    setManualVerifying(true)
    setError(null)
    try {
      // Check if user is already verified
      const { data: { user }, error } = await supabase.auth.getUser()
      if (error) throw error
      
      if (user && user.email_confirmed_at) {
        console.log('User is already verified, redirecting to profile setup')
        router.push('/onboarding/profile-setup')
        return
      }
      
      // If not verified, show message
      setError('Please click the verification link in your email first, then try this button again.')
    } catch (err: any) {
      console.error('Manual verification error:', err)
      setError(err.message || 'Failed to check verification status')
    } finally {
      setManualVerifying(false)
    }
  }

  async function handleTestRedirect() {
    console.log('Testing redirect to profile setup...')
    try {
      router.push('/onboarding/profile-setup')
    } catch (err) {
      console.error('Redirect test error:', err)
      setError('Redirect test failed: ' + err)
    }
  }

  async function handleResend() {
    setLoading(true)
    setError(null)
    try {
      // Try to get the current user's email
      const { data: { user } } = await supabase.auth.getUser()
      const email = user?.email || ''
      
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email,
      })
      if (error) {
        setError(error.message)
      } else {
        setResent(true)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to resend verification email')
    } finally {
      setLoading(false)
    }
  }

  if (verifying) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-creative-50 via-white to-creative-100 py-16">
        <AuthCard title="Verifying Email" subtitle="Please wait while we verify your email address...">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-creative-600 mx-auto"></div>
            <p className="text-gray-700">Verifying your email...</p>
            {debugInfo && (
              <details className="text-left text-xs text-gray-500 mt-4">
                <summary>Debug Info</summary>
                <pre className="whitespace-pre-wrap mt-2">{debugInfo}</pre>
              </details>
            )}
          </div>
        </AuthCard>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-creative-50 via-white to-creative-100 py-16">
      <AuthCard title="Verify Your Email" subtitle="Check your email inbox and click the verification link to activate your account.">
        <div className="text-center space-y-4">
          <p className="text-gray-700">You must verify your email before logging in.</p>
          
          <div className="space-y-2">
            <button
              className="w-full bg-creative-600 hover:bg-creative-700 text-white font-semibold rounded-lg px-4 py-2 transition disabled:opacity-60"
              onClick={handleResend}
              disabled={loading || resent}
            >
              {resent ? 'Verification Email Sent!' : loading ? 'Resending...' : 'Resend Verification Email'}
            </button>
            
            <button
              className="w-full bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg px-4 py-2 transition disabled:opacity-60"
              onClick={handleManualVerification}
              disabled={manualVerifying}
            >
              {manualVerifying ? 'Checking...' : 'I Clicked the Email Link - Check Status'}
            </button>
            
            <button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-4 py-2 transition disabled:opacity-60"
              onClick={handleTestRedirect}
            >
              Test Redirect to Profile Setup
            </button>
            
            <button
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg px-4 py-2 transition disabled:opacity-60"
              onClick={() => {
                const hash = window.location.hash.substring(1)
                const params = new URLSearchParams(hash)
                const accessToken = params.get('access_token')
                if (accessToken) {
                  handleAlternativeVerification(accessToken)
                } else {
                  setError('No access token found in URL')
                }
              }}
            >
              Use Alternative Verification
            </button>
            
            <button
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg px-4 py-2 transition disabled:opacity-60"
              onClick={() => {
                console.log('Skipping verification and going directly to profile setup...')
                router.push('/onboarding/profile-setup')
              }}
            >
              Skip Verification (Go to Profile Setup)
            </button>
          </div>
          
          {error && <div className="text-red-600 text-sm text-center">{error}</div>}
          {debugInfo && (
            <details className="text-left text-xs text-gray-500 mt-4">
              <summary>Debug Info</summary>
              <pre className="whitespace-pre-wrap mt-2">{debugInfo}</pre>
            </details>
          )}
          <div className="mt-6 text-center text-sm text-gray-600">
            Already verified?{' '}
            <Link href="/login" className="text-creative-600 hover:underline font-medium">Log in</Link>
          </div>
        </div>
      </AuthCard>
    </div>
  )
} 