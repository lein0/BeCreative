import React from 'react'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Header } from '@/components/header'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'BeCreative - Creative Classes Platform',
  description: 'Discover and book creative classes with talented instructors. From acting to music, find your next creative adventure.',
  keywords: 'creative classes, acting, music, dance, art, workshops, instructors',
  authors: [{ name: 'BeCreative Team' }],
  openGraph: {
    title: 'BeCreative - Creative Classes Platform',
    description: 'Discover and book creative classes with talented instructors.',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BeCreative - Creative Classes Platform',
    description: 'Discover and book creative classes with talented instructors.',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-background">
          <Header />
          {children}
        </div>
      </body>
    </html>
  )
} 