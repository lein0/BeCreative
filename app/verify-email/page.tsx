'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AuthCard } from '../../components/ui/auth-card'
import { directSupabase } from '../../lib/supabase-direct'
import { Button } from '../../components/ui/button'

export default function VerifyEmailPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resendCountdown, setResendCountdown] = useState(0)
  const [resendLoading, setResendLoading] = useState(false)

  useEffect(() => {
    const handleVerification = async () => {
      try {
        console.log('Starting verification process');
        
        // Extract tokens from URL hash
        const hash = window.location.hash.substring(1)
        console.log('Hash:', hash);
        const params = new URLSearchParams(hash)
        const accessToken = params.get('access_token')
        const type = params.get('type')
        
        if (type === 'signup' && accessToken) {
          console.log('Found signup verification token, checking user status...');
          
          // Decode JWT to check if email is verified
          try {
            const tokenParts = accessToken.split('.')
            if (tokenParts.length === 3) {
              const payload = JSON.parse(atob(tokenParts[1]))
              console.log('Token payload:', payload);
              
              if (payload.user_metadata?.email_verified || payload.email_confirmed_at) {
                console.log('Email verified in token, redirecting to profile...');
                router.push('/profile');
                return;
              }
            }
          } catch (decodeErr) {
            console.error('Token decode error:', decodeErr);
          }
          
          // Fallback: Try to get current user with direct client
          console.log('Checking current user status...');
          const { data: authData, error: authError } = await directSupabase.getUser();
          console.log('Current user:', authData);
          
          if (!authError && authData.user && authData.user.email_confirmed_at) {
            console.log('User confirmed, redirecting to profile...');
            router.push('/profile');
            return;
          }
          
          // If we get here, email is not verified yet
          console.log('Email not verified, staying on verification page');
        } else {
          // No tokens: Check if already verified
          console.log('No verification tokens, checking if already logged in...');
          const { data: authData, error: authError } = await directSupabase.getUser();
          console.log('Current user check:', authData);
          
          if (!authError && authData.user && authData.user.email_confirmed_at) {
            console.log('Already verified, redirecting to profile...');
            router.push('/profile');
            return;
          }
          
          // If no user or not verified, stay on page
          if (authError || !authData.user) {
            console.log('No authenticated user, redirecting to login...');
            router.push('/login');
            return;
          }
        }
      } catch (err: any) {
        console.error('Verification error:', err);
        setError(err.message || 'Failed to verify email');
      } finally {
        setLoading(false);
      }
    };

    handleVerification();
  }, [router]);

  // Countdown timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (resendCountdown > 0) {
      interval = setInterval(() => {
        setResendCountdown(prev => prev - 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [resendCountdown]);

  const handleManualCheck = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('Manual verification check...');
      const { data: authData, error: authError } = await directSupabase.getUser();
      console.log('Manual check user:', authData);
      
      if (!authError && authData.user && authData.user.email_confirmed_at) {
        console.log('Manual check: User confirmed, redirecting...');
        router.push('/profile');
      } else {
        setError('Email not yet verified. Please click the link in your email first.');
      }
    } catch (err: any) {
      console.error('Manual check error:', err);
      setError(err.message || 'Failed to check verification status');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCountdown > 0) return; // Prevent clicking during countdown
    
    setResendLoading(true);
    setError(null);
    
    try {
      const { data: authData, error: authError } = await directSupabase.getUser();
      if (!authError && authData.user?.email) {
        const { error: resendError } = await directSupabase.resendVerification(authData.user.email);
        
        if (resendError) {
          throw resendError;
        }
        
        // Start 45-second countdown
        setResendCountdown(45);
        setError(null);
        
        // Show success message briefly
        const successMessage = 'Verification email sent! Please check your inbox.';
        setError(successMessage);
        setTimeout(() => {
          setError(null);
        }, 3000);
        
      } else {
        setError('No user found to resend email to');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to resend verification email');
    } finally {
      setResendLoading(false);
    }
  };

  const getResendButtonText = () => {
    if (resendLoading) return 'Sending...';
    if (resendCountdown > 0) return `Resend in ${resendCountdown}s`;
    return 'Resend Verification Email';
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-creative-50 via-white to-creative-100 py-16">
        <AuthCard title="Verifying Your Email" subtitle="Please wait while we verify your account...">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-creative-600 mx-auto"></div>
        </AuthCard>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-creative-50 via-white to-creative-100 py-16">
      <AuthCard 
        title="Verify Your Email" 
        subtitle="We've sent a verification link to your email. Please check your inbox and click the link to continue." 
      >
        {error && (
          <div className={`text-sm text-center mb-4 ${error.includes('sent!') ? 'text-green-600' : 'text-red-600'}`}>
            {error}
          </div>
        )}
        
        <div className="space-y-3">
          <Button onClick={handleManualCheck} className="w-full" disabled={loading}>
            Check Verification Status
          </Button>
          
          <Button 
            onClick={handleResend} 
            variant="outline" 
            className="w-full" 
            disabled={resendCountdown > 0 || resendLoading}
          >
            {getResendButtonText()}
          </Button>
        </div>
        
        <div className="mt-6 text-center text-sm text-gray-600">
          <a href="/login" className="text-creative-600 hover:underline font-medium">Back to login</a>
        </div>
      </AuthCard>
    </div>
  );
} 