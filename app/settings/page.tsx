"use client";
import React, { useState } from "react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { directSupabase } from '../../lib/supabase-direct'
import { Input } from '../../components/ui/input'

export default function SettingsPage() {
  // Placeholder data
  const credits = 10;
  const nextBilling = "2025-07-30";
  const subscription = {
    plan: "Premium",
    status: "Active",
    renewal: nextBilling,
  };

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError('')
    if (newPassword !== confirmNewPassword) {
      setPasswordError('New passwords do not match')
      return
    }
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters')
      return
    }
    setPasswordLoading(true)
    try {
      const { data: userData, error: userError } = await directSupabase.getUser()
      if (userError || !userData.user?.email) throw new Error('No user found')

      // Verify current password by attempting to sign in
      const { error: signInError } = await directSupabase.signInWithPassword(
        userData.user.email,
        currentPassword
      )
      if (signInError) throw new Error('Current password is incorrect')

      // Update to new password
      const { error: updateError } = await directSupabase.updateUser({ password: newPassword })
      if (updateError) throw updateError

      setPasswordSuccess('Password updated successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to update password')
    } finally {
      setPasswordLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <Card className="w-full max-w-md p-8 flex flex-col gap-6">
        <h1 className="text-2xl font-bold mb-2 text-center">Account Settings</h1>
        <div className="space-y-4">
          <div>
            <div className="font-semibold mb-1">Payment Methods</div>
            <Button variant="outline" className="w-full">Add / Update Payment Method</Button>
          </div>
          <div>
            <div className="font-semibold mb-1">Subscription</div>
            <div className="flex flex-col gap-1 text-gray-700">
              <span>Plan: <b>{subscription.plan}</b></span>
              <span>Status: <b>{subscription.status}</b></span>
              <span>Next Billing: <b>{subscription.renewal}</b></span>
            </div>
            <Button variant="outline" className="w-full mt-2">Manage Subscription</Button>
          </div>
          <div>
            <div className="font-semibold mb-1">Credits</div>
            <div className="text-gray-700">You have <b>{credits}</b> credits remaining this month.</div>
          </div>
          <div>
            <div className="font-semibold mb-1">Change Password</div>
            <form onSubmit={handlePasswordUpdate} className="space-y-2">
              <Input type="password" placeholder="Current Password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
              <Input type="password" placeholder="New Password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
              <Input type="password" placeholder="Confirm New Password" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} required />
              {passwordError && <div className="text-red-600 text-sm">{passwordError}</div>}
              {passwordSuccess && <div className="text-green-600 text-sm">{passwordSuccess}</div>}
              <Button type="submit" disabled={passwordLoading} className="w-full">
                {passwordLoading ? 'Updating...' : 'Update Password'}
              </Button>
            </form>
          </div>
          <div>
            <div className="font-semibold mb-1">Other</div>
            <div className="text-gray-700">Update your email, password, or other account details here soon.</div>
          </div>
        </div>
      </Card>
    </div>
  );
} 