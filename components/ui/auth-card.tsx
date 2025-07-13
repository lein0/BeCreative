import React from 'react'

export function AuthCard({ children, title, subtitle }: { children: React.ReactNode, title: string, subtitle?: string }) {
  return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-creative-100 p-8 flex flex-col items-center">
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-creative-500 to-creative-600 flex items-center justify-center mb-4">
        <span className="text-white font-bold text-xl">BC</span>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">{title}</h1>
      {subtitle && <p className="text-gray-600 mb-6 text-center text-sm">{subtitle}</p>}
      <div className="w-full">{children}</div>
    </div>
  )
} 