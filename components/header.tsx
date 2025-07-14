'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Search, Menu, X, User, Settings, LogOut, BookOpen, Users, Calendar, Heart } from 'lucide-react'
import { directSupabase } from '@/lib/supabase-direct'

export function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchUser() {
      try {
        console.log("Header: Fetching user with direct client...")
        const { data: { user }, error } = await directSupabase.getUser()
        
        if (error) {
          console.error("Header: Auth error:", error)
          setUser(null)
          return
        }
        
        if (user) {
          console.log("Header: User found:", user.id)
          // Fetch user profile info
          try {
            const { data: profileData, error: profileError } = await directSupabase.queryTable('users', {
              select: '*',
              eq: ['id', user.id],
              single: true
            })
            
            if (profileError && !profileError.message.includes('No rows found')) {
              console.log("Header: Profile fetch error:", profileError)
              setUser({ ...user, full_name: user.email })
            } else if (profileData) {
              console.log("Header: Profile data found")
              setUser({ ...user, ...profileData })
            } else {
              console.log("Header: No profile data, using auth user")
              setUser({ ...user, full_name: user.email })
            }
          } catch (profileErr) {
            console.log("Header: Profile fetch failed:", profileErr)
            setUser({ ...user, full_name: user.email })
          }
        } else {
          console.log("Header: No user found")
          setUser(null)
        }
      } catch (err) {
        console.error("Header: Unexpected error:", err)
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    fetchUser()
    
    // Set up more frequent checks and listen for storage events
    const interval = setInterval(fetchUser, 2000) // Check every 2 seconds
    
    // Listen for custom auth events
    const handleAuthChange = () => {
      console.log("Header: Auth change event detected")
      fetchUser()
    }
    
    // Listen for storage changes (in case auth token is stored in localStorage)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key && e.key.includes('supabase') || e.key?.includes('auth')) {
        console.log("Header: Storage change detected")
        fetchUser()
      }
    }
    
    // Listen for page visibility changes
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log("Header: Page became visible, checking auth")
        fetchUser()
      }
    }
    
    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('focus', handleAuthChange)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    // Custom event for manual auth updates
    window.addEventListener('auth-state-changed', handleAuthChange)
    
    return () => {
      clearInterval(interval)
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('focus', handleAuthChange)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('auth-state-changed', handleAuthChange)
    }
  }, [])

  const navigationLinks = [
    { href: '/explore', label: 'Explore Classes', icon: Search },
    { href: '/plans', label: 'Plans', icon: BookOpen },
    { href: '/become-a-teacher', label: 'Become a Teacher', icon: Users },
  ]

  const handleSignOut = async () => {
    console.log("Header: Signing out...")
    try {
      await directSupabase.signOut()
      setUser(null)
      
      // Dispatch custom event
      window.dispatchEvent(new CustomEvent('auth-state-changed'))
      
      window.location.href = '/'
    } catch (err) {
      console.error("Header: Sign out error:", err)
    }
  }



  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo and Home Link */}
          <div className="flex items-center space-x-4">
            <Link href="/" className="flex items-center space-x-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-creative-500 to-creative-600 text-white font-bold text-sm">
                BC
              </div>
              <span className="text-xl font-bold text-gray-900">BeCreative</span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            {navigationLinks.map((link) => {
              const Icon = link.icon
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center space-x-1 text-sm font-medium text-gray-700 hover:text-creative-600 transition-colors"
                >
                  <Icon className="h-4 w-4" />
                  <span>{link.label}</span>
                </Link>
              )
            })}
          </nav>

          {/* Right Side - Auth */}
          <div className="flex items-center space-x-4">
            {/* Search Button */}
            <Button variant="ghost" size="sm" className="hidden sm:flex">
              <Search className="h-4 w-4" />
            </Button>

            {/* Auth Section */}
            {loading ? (
              <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse"></div>
            ) : user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.avatar_url || undefined} alt={user.full_name || user.email} />
                      <AvatarFallback>{user.full_name ? user.full_name.split(' ').map((n: string) => n[0]).join('') : "U"}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{user.full_name || user.email}</p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/profile" className="flex items-center">
                      <User className="mr-2 h-4 w-4" />
                      <span>Profile</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/settings" className="flex items-center">
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Settings</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild={false} className="text-red-600">
                    <button
                      onClick={handleSignOut}
                      className="flex items-center w-full text-left"
                      type="button"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Sign out</span>
                    </button>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex items-center space-x-2">
                <Link href="/login" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2">
                  Sign In
                </Link>
                <Link href="/signup" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-creative-600 hover:bg-creative-700 text-white h-10 px-4 py-2">
                  Sign Up
                </Link>
              </div>
            )}

            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <div className="md:hidden">
            <div className="space-y-1 pb-3 pt-2">
              {navigationLinks.map((link) => {
                const Icon = link.icon
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-creative-600 rounded-md transition-colors"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{link.label}</span>
                  </Link>
                )
              })}
              {!user && (
                <div className="px-3 py-2 space-y-2">
                  <Link href="/login" className="w-full justify-start">
                    Sign In
                  </Link>
                  <Link href="/signup" className="w-full">
                    Sign Up
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  )
} 