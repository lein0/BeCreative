'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Upload, Plus, X } from 'lucide-react'

const instructorSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email'),
  bio: z.string().min(50, 'Bio must be at least 50 characters'),
  credentials: z.string().min(20, 'Please provide your credentials'),
  experience_years: z.number().min(1, 'Please specify your years of experience'),
  specialties: z.array(z.string()).min(1, 'Please select at least one specialty'),
  city: z.string().min(2, 'Please enter your city'),
  social_links: z.object({
    instagram: z.string().optional(),
    youtube: z.string().optional(),
    website: z.string().optional(),
  }),
})

type InstructorFormData = z.infer<typeof instructorSchema>

const SPECIALTY_OPTIONS = [
  'Acting',
  'Voice & Singing',
  'Dance',
  'Music (Guitar)',
  'Music (Piano)',
  'Music (Drums)',
  'Music (Violin)',
  'Art & Painting',
  'Photography',
  'Creative Writing',
  'Comedy & Improv',
  'Film & Video',
  'Fashion Design',
  'Cooking & Culinary',
  'Other',
]

export default function InstructorOnboardingForm() {
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([])
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<InstructorFormData>({
    resolver: zodResolver(instructorSchema),
    defaultValues: {
      specialties: [],
      social_links: {},
    },
  })

  const handleSpecialtyToggle = (specialty: string) => {
    setSelectedSpecialties(prev => {
      const newSpecialties = prev.includes(specialty)
        ? prev.filter(s => s !== specialty)
        : [...prev, specialty]
      
      setValue('specialties', newSpecialties)
      return newSpecialties
    })
  }

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setAvatarFile(file)
    }
  }

  const onSubmit = async (data: InstructorFormData) => {
    setIsSubmitting(true)
    try {
      // TODO: Implement form submission logic
      console.log('Form data:', data)
      console.log('Avatar file:', avatarFile)
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Show success message
      alert('Application submitted successfully! We\'ll review your application and get back to you within 3-5 business days.')
    } catch (error) {
      console.error('Error submitting form:', error)
      alert('There was an error submitting your application. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Become an Instructor
        </h1>
        <p className="text-gray-600">
          Share your creative expertise and inspire others through teaching
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>
              Tell us about yourself and your creative background
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Avatar Upload */}
            <div className="flex items-center space-x-4">
              <Avatar className="w-20 h-20">
                <AvatarImage src={avatarFile ? URL.createObjectURL(avatarFile) : undefined} />
                <AvatarFallback>IN</AvatarFallback>
              </Avatar>
              <div>
                <label htmlFor="avatar" className="cursor-pointer">
                  <Button type="button" variant="outline" size="sm">
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Photo
                  </Button>
                </label>
                <input
                  id="avatar"
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Recommended: Square image, 400x400px or larger
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name *
                </label>
                <Input
                  {...register('name')}
                  placeholder="Enter your full name"
                  className={errors.name ? 'border-red-500' : ''}
                />
                {errors.name && (
                  <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email *
                </label>
                <Input
                  {...register('email')}
                  type="email"
                  placeholder="Enter your email"
                  className={errors.email ? 'border-red-500' : ''}
                />
                {errors.email && (
                  <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                City/Location *
              </label>
              <Input
                {...register('city')}
                placeholder="Enter your city"
                className={errors.city ? 'border-red-500' : ''}
              />
              {errors.city && (
                <p className="text-red-500 text-sm mt-1">{errors.city.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Bio *
              </label>
              <textarea
                {...register('bio')}
                rows={4}
                placeholder="Tell us about your creative journey, experience, and what makes you unique as an instructor..."
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-creative-500 ${
                  errors.bio ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.bio && (
                <p className="text-red-500 text-sm mt-1">{errors.bio.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Professional Information */}
        <Card>
          <CardHeader>
            <CardTitle>Professional Information</CardTitle>
            <CardDescription>
              Share your credentials and teaching experience
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Credentials & Qualifications *
              </label>
              <textarea
                {...register('credentials')}
                rows={3}
                placeholder="List your degrees, certifications, awards, and relevant qualifications..."
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-creative-500 ${
                  errors.credentials ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.credentials && (
                <p className="text-red-500 text-sm mt-1">{errors.credentials.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Years of Teaching Experience *
              </label>
              <Input
                {...register('experience_years', { valueAsNumber: true })}
                type="number"
                min="0"
                placeholder="Enter number of years"
                className={errors.experience_years ? 'border-red-500' : ''}
              />
              {errors.experience_years && (
                <p className="text-red-500 text-sm mt-1">{errors.experience_years.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Teaching Specialties *
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {SPECIALTY_OPTIONS.map((specialty) => (
                  <button
                    key={specialty}
                    type="button"
                    onClick={() => handleSpecialtyToggle(specialty)}
                    className={`p-2 text-sm rounded-md border transition-colors ${
                      selectedSpecialties.includes(specialty)
                        ? 'bg-creative-500 text-white border-creative-500'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-creative-300'
                    }`}
                  >
                    {specialty}
                  </button>
                ))}
              </div>
              {errors.specialties && (
                <p className="text-red-500 text-sm mt-1">{errors.specialties.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Social Links */}
        <Card>
          <CardHeader>
            <CardTitle>Social Media & Portfolio</CardTitle>
            <CardDescription>
              Help students discover your work (optional)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Instagram
              </label>
              <Input
                {...register('social_links.instagram')}
                placeholder="https://instagram.com/yourusername"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                YouTube
              </label>
              <Input
                {...register('social_links.youtube')}
                placeholder="https://youtube.com/@yourchannel"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Website
              </label>
              <Input
                {...register('social_links.website')}
                placeholder="https://yourwebsite.com"
              />
            </div>
          </CardContent>
        </Card>

        {/* Submit Button */}
        <div className="flex justify-center">
          <Button
            type="submit"
            size="lg"
            disabled={isSubmitting}
            className="creative-gradient text-white px-8 py-3"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Application'}
          </Button>
        </div>
      </form>
    </div>
  )
} 