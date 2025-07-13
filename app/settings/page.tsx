"use client";
import React from "react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";

export default function SettingsPage() {
  // Placeholder data
  const credits = 10;
  const nextBilling = "2025-07-30";
  const subscription = {
    plan: "Premium",
    status: "Active",
    renewal: nextBilling,
  };

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
            <div className="font-semibold mb-1">Other</div>
            <div className="text-gray-700">Update your email, password, or other account details here soon.</div>
          </div>
        </div>
      </Card>
    </div>
  );
} 