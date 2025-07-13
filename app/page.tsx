"use client";
import React, { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Search, Star, MapPin, Users, Calendar } from 'lucide-react'

const cityPills = [
  { name: 'Los Angeles', href: '/explore?city=los-angeles' },
  { name: 'New York City', href: '/explore?city=new-york-city' },
]

const collageImages = [
  '/images/creative1.jpg',
  '/images/creative2.jpg',
  '/images/creative3.jpg',
  '/images/creative4.jpg',
  '/images/creative5.jpg',
  '/images/creative6.jpg',
  '/images/creative7.jpg',
  '/images/creative8.jpg',
]

export default function HomePage() {
  const router = useRouter();
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash.startsWith('#access_token')) {
      router.replace(`/verify-email${window.location.hash}`);
    }
  }, [router]);

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-creative-50 via-white to-creative-100">
      {/* Hero card */}
      <div className="relative z-10 flex flex-col items-center justify-center bg-white/95 rounded-2xl shadow-xl px-8 py-12 max-w-lg mx-auto mt-24 border border-creative-100">
        <h1 className="text-3xl md:text-4xl font-extrabold text-center mb-4">One app for all things creative: classes, workshops, and more</h1>
        <p className="text-lg text-center text-gray-700 mb-6">BeCreative gives you access to top-rated creative classes, workshops, and instructors in your city.</p>
        <div className="flex flex-col sm:flex-row gap-4 w-full justify-center mb-4">
          <Link href="/signup" className="bg-creative-600 hover:bg-creative-700 text-white font-semibold rounded-lg px-6 py-3 text-center shadow transition">Get Started</Link>
          <Link href="/explore" className="border border-creative-600 text-creative-600 hover:bg-creative-50 font-semibold rounded-lg px-6 py-3 text-center shadow transition">Browse Classes</Link>
        </div>
        <div className="flex gap-2 justify-center mt-2">
          {cityPills.map(city => (
            <Link key={city.name} href={city.href} className="px-4 py-2 rounded-full bg-gray-100 hover:bg-creative-100 text-gray-700 font-medium text-sm transition">
              {city.name}
            </Link>
          ))}
        </div>
      </div>

      {/* How It Works */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              How BeCreative Works
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Get started in just a few simple steps
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-creative-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="h-8 w-8 text-creative-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">1. Discover</h3>
              <p className="text-gray-600">
                Browse classes by location, category, or instructor. Find the perfect creative experience for you.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-creative-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Calendar className="h-8 w-8 text-creative-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">2. Book</h3>
              <p className="text-gray-600">
                Reserve your spot using credits or pay directly. Get instant confirmation and class details.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-creative-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="h-8 w-8 text-creative-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">3. Create</h3>
              <p className="text-gray-600">
                Attend your class, learn from talented instructors, and unleash your creative potential.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Instructors */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Featured Instructors
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Meet some of our most popular and highly-rated creative instructors
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Instructor Card 1 */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="text-center">
                <Avatar className="w-20 h-20 mx-auto mb-4">
                  <AvatarImage src="/api/placeholder/80/80" alt="Sarah Johnson" />
                  <AvatarFallback>SJ</AvatarFallback>
                </Avatar>
                <CardTitle className="text-xl">Sarah Johnson</CardTitle>
                <CardDescription>Acting & Voice Coach</CardDescription>
                <div className="flex items-center justify-center gap-1 text-yellow-500">
                  <Star className="h-4 w-4 fill-current" />
                  <Star className="h-4 w-4 fill-current" />
                  <Star className="h-4 w-4 fill-current" />
                  <Star className="h-4 w-4 fill-current" />
                  <Star className="h-4 w-4 fill-current" />
                  <span className="text-gray-600 ml-1">(127 reviews)</span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                  <MapPin className="h-4 w-4" />
                  <span>New York, NY</span>
                </div>
                <p className="text-gray-700 mb-4">
                  Broadway actress with 15+ years of experience. Specializing in musical theater and voice training.
                </p>
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>From $25/class</span>
                  <span>5 classes available</span>
                </div>
              </CardContent>
            </Card>

            {/* Instructor Card 2 */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="text-center">
                <Avatar className="w-20 h-20 mx-auto mb-4">
                  <AvatarImage src="/api/placeholder/80/80" alt="Marcus Chen" />
                  <AvatarFallback>MC</AvatarFallback>
                </Avatar>
                <CardTitle className="text-xl">Marcus Chen</CardTitle>
                <CardDescription>Guitar & Music Theory</CardDescription>
                <div className="flex items-center justify-center gap-1 text-yellow-500">
                  <Star className="h-4 w-4 fill-current" />
                  <Star className="h-4 w-4 fill-current" />
                  <Star className="h-4 w-4 fill-current" />
                  <Star className="h-4 w-4 fill-current" />
                  <Star className="h-4 w-4 fill-current" />
                  <span className="text-gray-600 ml-1">(89 reviews)</span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                  <MapPin className="h-4 w-4" />
                  <span>Los Angeles, CA</span>
                </div>
                <p className="text-gray-700 mb-4">
                  Professional guitarist and music educator. Teaching all levels from beginner to advanced.
                </p>
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>From $30/class</span>
                  <span>8 classes available</span>
                </div>
              </CardContent>
            </Card>

            {/* Instructor Card 3 */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="text-center">
                <Avatar className="w-20 h-20 mx-auto mb-4">
                  <AvatarImage src="/api/placeholder/80/80" alt="Elena Rodriguez" />
                  <AvatarFallback>ER</AvatarFallback>
                </Avatar>
                <CardTitle className="text-xl">Elena Rodriguez</CardTitle>
                <CardDescription>Contemporary Dance</CardDescription>
                <div className="flex items-center justify-center gap-1 text-yellow-500">
                  <Star className="h-4 w-4 fill-current" />
                  <Star className="h-4 w-4 fill-current" />
                  <Star className="h-4 w-4 fill-current" />
                  <Star className="h-4 w-4 fill-current" />
                  <Star className="h-4 w-4 fill-current" />
                  <span className="text-gray-600 ml-1">(156 reviews)</span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                  <MapPin className="h-4 w-4" />
                  <span>Miami, FL</span>
                </div>
                <p className="text-gray-700 mb-4">
                  Professional dancer and choreographer. Teaching contemporary, jazz, and hip-hop styles.
                </p>
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>From $35/class</span>
                  <span>6 classes available</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="text-center mt-12">
            <Link href="/explore">
              <Button variant="outline" size="lg">
                View All Instructors
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 creative-gradient">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to Start Your Creative Journey?
          </h2>
          <p className="text-white/90 mb-8 max-w-2xl mx-auto">
            Join thousands of creatives who are already discovering new skills and passions
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" variant="secondary" className="px-8 py-3">
              Sign Up Free
            </Button>
            <Button size="lg" variant="outline" className="px-8 py-3 bg-white/10 border-white/20 text-white hover:bg-white/20">
              Learn More
            </Button>
          </div>
        </div>
      </section>
    </main>
  )
} 