import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Search, MapPin, Calendar, Users, Star, Filter } from 'lucide-react'

export default function ExplorePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Explore Creative Classes
          </h1>
          <p className="text-gray-600 mb-6">
            Discover amazing classes from talented instructors in your area
          </p>
          
          {/* Search and Filters */}
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
              <Input
                placeholder="Search classes, instructors, or locations..."
                className="pl-10 h-12"
              />
            </div>
            <Button variant="outline" className="lg:w-auto">
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </Button>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="creative-gradient text-white">
              All Categories
            </Button>
            <Button variant="outline" size="sm">Acting</Button>
            <Button variant="outline" size="sm">Music</Button>
            <Button variant="outline" size="sm">Dance</Button>
            <Button variant="outline" size="sm">Art</Button>
            <Button variant="outline" size="sm">Writing</Button>
            <Button variant="outline" size="sm">Virtual</Button>
            <Button variant="outline" size="sm">In-Person</Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Class Card 1 */}
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <div className="h-48 bg-gradient-to-br from-creative-100 to-creative-200 rounded-t-lg flex items-center justify-center">
              <span className="text-creative-600 font-semibold">Voice & Singing</span>
            </div>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Broadway Voice Training</CardTitle>
              <CardDescription className="flex items-center gap-2">
                <Avatar className="w-6 h-6">
                  <AvatarImage src="/api/placeholder/24/24" alt="Sarah Johnson" />
                  <AvatarFallback>SJ</AvatarFallback>
                </Avatar>
                <span>Sarah Johnson</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                <MapPin className="h-4 w-4" />
                <span>Manhattan, NY</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                <Calendar className="h-4 w-4" />
                <span>Feb 15, 6:00 PM</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                <Users className="h-4 w-4" />
                <span>3/8 spots filled</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  <span className="text-sm font-medium">4.9</span>
                  <span className="text-sm text-gray-600">(127)</span>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-creative-600">3 credits</div>
                  <div className="text-sm text-gray-600">or $25</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Class Card 2 */}
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <div className="h-48 bg-gradient-to-br from-blue-100 to-blue-200 rounded-t-lg flex items-center justify-center">
              <span className="text-blue-600 font-semibold">Music</span>
            </div>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Guitar Fundamentals</CardTitle>
              <CardDescription className="flex items-center gap-2">
                <Avatar className="w-6 h-6">
                  <AvatarImage src="/api/placeholder/24/24" alt="Marcus Chen" />
                  <AvatarFallback>MC</AvatarFallback>
                </Avatar>
                <span>Marcus Chen</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                <MapPin className="h-4 w-4" />
                <span>Virtual Class</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                <Calendar className="h-4 w-4" />
                <span>Feb 16, 7:00 PM</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                <Users className="h-4 w-4" />
                <span>7/12 spots filled</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  <span className="text-sm font-medium">4.8</span>
                  <span className="text-sm text-gray-600">(89)</span>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-creative-600">2 credits</div>
                  <div className="text-sm text-gray-600">or $20</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Class Card 3 */}
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <div className="h-48 bg-gradient-to-br from-purple-100 to-purple-200 rounded-t-lg flex items-center justify-center">
              <span className="text-purple-600 font-semibold">Dance</span>
            </div>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Contemporary Dance Workshop</CardTitle>
              <CardDescription className="flex items-center gap-2">
                <Avatar className="w-6 h-6">
                  <AvatarImage src="/api/placeholder/24/24" alt="Elena Rodriguez" />
                  <AvatarFallback>ER</AvatarFallback>
                </Avatar>
                <span>Elena Rodriguez</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                <MapPin className="h-4 w-4" />
                <span>Miami, FL</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                <Calendar className="h-4 w-4" />
                <span>Feb 17, 2:00 PM</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                <Users className="h-4 w-4" />
                <span>11/15 spots filled</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  <span className="text-sm font-medium">4.9</span>
                  <span className="text-sm text-gray-600">(156)</span>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-creative-600">4 credits</div>
                  <div className="text-sm text-gray-600">or $35</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Class Card 4 */}
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <div className="h-48 bg-gradient-to-br from-green-100 to-green-200 rounded-t-lg flex items-center justify-center">
              <span className="text-green-600 font-semibold">Acting</span>
            </div>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Acting for Beginners</CardTitle>
              <CardDescription className="flex items-center gap-2">
                <Avatar className="w-6 h-6">
                  <AvatarImage src="/api/placeholder/24/24" alt="Sarah Johnson" />
                  <AvatarFallback>SJ</AvatarFallback>
                </Avatar>
                <span>Sarah Johnson</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                <MapPin className="h-4 w-4" />
                <span>Manhattan, NY</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                <Calendar className="h-4 w-4" />
                <span>Feb 18, 4:00 PM</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                <Users className="h-4 w-4" />
                <span>5/10 spots filled</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  <span className="text-sm font-medium">4.7</span>
                  <span className="text-sm text-gray-600">(203)</span>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-creative-600">2 credits</div>
                  <div className="text-sm text-gray-600">or $20</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Class Card 5 */}
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <div className="h-48 bg-gradient-to-br from-red-100 to-red-200 rounded-t-lg flex items-center justify-center">
              <span className="text-red-600 font-semibold">Art</span>
            </div>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Watercolor Painting</CardTitle>
              <CardDescription className="flex items-center gap-2">
                <Avatar className="w-6 h-6">
                  <AvatarImage src="/api/placeholder/24/24" alt="David Kim" />
                  <AvatarFallback>DK</AvatarFallback>
                </Avatar>
                <span>David Kim</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                <MapPin className="h-4 w-4" />
                <span>Brooklyn, NY</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                <Calendar className="h-4 w-4" />
                <span>Feb 19, 1:00 PM</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                <Users className="h-4 w-4" />
                <span>8/12 spots filled</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  <span className="text-sm font-medium">4.6</span>
                  <span className="text-sm text-gray-600">(78)</span>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-creative-600">3 credits</div>
                  <div className="text-sm text-gray-600">or $30</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Class Card 6 */}
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <div className="h-48 bg-gradient-to-br from-yellow-100 to-yellow-200 rounded-t-lg flex items-center justify-center">
              <span className="text-yellow-600 font-semibold">Writing</span>
            </div>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Creative Writing Workshop</CardTitle>
              <CardDescription className="flex items-center gap-2">
                <Avatar className="w-6 h-6">
                  <AvatarImage src="/api/placeholder/24/24" alt="Maria Garcia" />
                  <AvatarFallback>MG</AvatarFallback>
                </Avatar>
                <span>Maria Garcia</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                <MapPin className="h-4 w-4" />
                <span>Virtual Class</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                <Calendar className="h-4 w-4" />
                <span>Feb 20, 7:30 PM</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                <Users className="h-4 w-4" />
                <span>6/15 spots filled</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  <span className="text-sm font-medium">4.8</span>
                  <span className="text-sm text-gray-600">(92)</span>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-creative-600">2 credits</div>
                  <div className="text-sm text-gray-600">or $18</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Load More */}
        <div className="text-center mt-12">
          <Button variant="outline" size="lg">
            Load More Classes
          </Button>
        </div>
      </div>
    </div>
  )
} 