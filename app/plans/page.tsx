import React from 'react'

export default function PlansPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white py-16">
      <h1 className="text-3xl md:text-4xl font-bold mb-4">Choose Your Plan</h1>
      <p className="text-lg text-gray-700 mb-8 text-center max-w-xl">
        BeCreative offers flexible plans for every creative. Compare credits, pricing, and what you can use your credits for. (Details coming soon!)
      </p>
      <div className="w-full max-w-2xl bg-gray-50 rounded-xl shadow p-8 text-center">
        <p className="text-gray-500">Plan options and details will be displayed here.</p>
      </div>
    </main>
  )
} 