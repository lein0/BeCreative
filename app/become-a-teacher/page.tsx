import React from 'react'
import Link from 'next/link'

export default function BecomeATeacherPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white py-16">
      <h1 className="text-3xl md:text-4xl font-bold mb-4">Become a Teacher</h1>
      <p className="text-lg text-gray-700 mb-8 text-center max-w-xl">
        Share your creative skills and inspire others. Apply to become an instructor and list your classes on BeCreative.
      </p>
      <Link href="/onboarding" className="bg-creative-600 hover:bg-creative-700 text-white font-semibold rounded-lg px-8 py-3 text-center shadow transition">
        Start Onboarding
      </Link>
    </main>
  )
} 