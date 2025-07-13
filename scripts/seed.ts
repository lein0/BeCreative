import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

async function seedDatabase() {
  const { createServerClient } = await import('../lib/supabase')
  const supabase = createServerClient()
  
  console.log('🌱 Starting database seeding...')

  try {
    // Create sample users
    const users = [
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        email: 'sarah.johnson@example.com',
        full_name: 'Sarah Johnson',
        role: 'instructor' as const,
        credits: 0,
        avatar_url: 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=400&h=400&fit=crop&crop=face',
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440002',
        email: 'marcus.chen@example.com',
        full_name: 'Marcus Chen',
        role: 'instructor' as const,
        credits: 0,
        avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=face',
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440003',
        email: 'elena.rodriguez@example.com',
        full_name: 'Elena Rodriguez',
        role: 'instructor' as const,
        credits: 0,
        avatar_url: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop&crop=face',
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440004',
        email: 'student@example.com',
        full_name: 'Alex Thompson',
        role: 'student' as const,
        credits: 10,
        avatar_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=400&fit=crop&crop=face',
      },
    ]

    console.log('Creating users...')
    for (const user of users) {
      const { error } = await supabase
        .from('users')
        .upsert(user, { onConflict: 'id' })
      
      if (error) {
        console.error('Error creating user:', error)
      }
    }

    // Create sample instructors
    const instructors = [
      {
        id: '660e8400-e29b-41d4-a716-446655440001',
        user_id: '550e8400-e29b-41d4-a716-446655440001',
        bio: 'Broadway actress with 15+ years of experience. Specializing in musical theater and voice training.',
        experience_years: 15,
        specialties: ['Acting', 'Voice & Singing'],
        hourly_rate: 25.00,
        location: 'New York, NY',
        is_verified: true,
        is_active: true,
      },
      {
        id: '660e8400-e29b-41d4-a716-446655440002',
        user_id: '550e8400-e29b-41d4-a716-446655440002',
        bio: 'Professional guitarist and music educator. Teaching all levels from beginner to advanced.',
        experience_years: 10,
        specialties: ['Music', 'Guitar'],
        hourly_rate: 30.00,
        location: 'Los Angeles, CA',
        is_verified: true,
        is_active: true,
      },
      {
        id: '660e8400-e29b-41d4-a716-446655440003',
        user_id: '550e8400-e29b-41d4-a716-446655440003',
        bio: 'Professional dancer and choreographer. Teaching contemporary, jazz, and hip-hop styles.',
        experience_years: 12,
        specialties: ['Dance'],
        hourly_rate: 35.00,
        location: 'Miami, FL',
        is_verified: true,
        is_active: true,
      },
    ]

    console.log('Creating instructors...')
    for (const instructor of instructors) {
      const { error } = await supabase
        .from('instructors')
        .upsert(instructor, { onConflict: 'id' })
      
      if (error) {
        console.error('Error creating instructor:', error)
      }
    }

    // Create sample classes
    const classes = [
      {
        id: '770e8400-e29b-41d4-a716-446655440001',
        instructor_id: '660e8400-e29b-41d4-a716-446655440001',
        title: 'Broadway Voice Training',
        description: 'Learn vocal techniques used by Broadway performers. Perfect for aspiring musical theater actors.',
        category: 'Voice & Singing',
        subcategory: 'Musical Theater',
        duration_minutes: 120,
        max_students: 8,
        price_credits: 3,
        price_dollars: 25.00,
        location: 'Manhattan, NY',
        is_virtual: false,
        scheduled_at: '2024-02-15T18:00:00Z',
        is_active: true,
      },
      {
        id: '770e8400-e29b-41d4-a716-446655440002',
        instructor_id: '660e8400-e29b-41d4-a716-446655440002',
        title: 'Guitar Fundamentals',
        description: 'Master the basics of guitar playing. Learn chords, strumming patterns, and your first songs.',
        category: 'Music',
        subcategory: 'Guitar',
        duration_minutes: 90,
        max_students: 12,
        price_credits: 2,
        price_dollars: 20.00,
        location: null,
        is_virtual: true,
        virtual_meeting_url: 'https://zoom.us/j/123456789',
        scheduled_at: '2024-02-16T19:00:00Z',
        is_active: true,
      },
      {
        id: '770e8400-e29b-41d4-a716-446655440003',
        instructor_id: '660e8400-e29b-41d4-a716-446655440003',
        title: 'Contemporary Dance Workshop',
        description: 'Explore contemporary dance techniques and choreography. All levels welcome.',
        category: 'Dance',
        subcategory: 'Contemporary',
        duration_minutes: 120,
        max_students: 15,
        price_credits: 4,
        price_dollars: 35.00,
        location: 'Miami, FL',
        is_virtual: false,
        scheduled_at: '2024-02-17T14:00:00Z',
        is_active: true,
      },
      {
        id: '770e8400-e29b-41d4-a716-446655440004',
        instructor_id: '660e8400-e29b-41d4-a716-446655440001',
        title: 'Acting for Beginners',
        description: 'Introduction to acting techniques and scene work. Perfect for those new to acting.',
        category: 'Acting',
        subcategory: 'Beginner',
        duration_minutes: 120,
        max_students: 10,
        price_credits: 2,
        price_dollars: 20.00,
        location: 'Manhattan, NY',
        is_virtual: false,
        scheduled_at: '2024-02-18T16:00:00Z',
        is_active: true,
      },
    ]

    console.log('Creating classes...')
    for (const classItem of classes) {
      const { error } = await supabase
        .from('classes')
        .upsert(classItem, { onConflict: 'id' })
      
      if (error) {
        console.error('Error creating class:', error)
      }
    }

    // Create sample bookings
    const bookings = [
      {
        id: '880e8400-e29b-41d4-a716-446655440001',
        user_id: '550e8400-e29b-41d4-a716-446655440004',
        class_id: '770e8400-e29b-41d4-a716-446655440001',
        payment_method: 'credits' as const,
        credits_used: 3,
        amount_paid: null,
        status: 'confirmed' as const,
      },
      {
        id: '880e8400-e29b-41d4-a716-446655440002',
        user_id: '550e8400-e29b-41d4-a716-446655440004',
        class_id: '770e8400-e29b-41d4-a716-446655440002',
        payment_method: 'stripe' as const,
        credits_used: null,
        amount_paid: 20.00,
        status: 'confirmed' as const,
      },
    ]

    console.log('Creating bookings...')
    for (const booking of bookings) {
      const { error } = await supabase
        .from('bookings')
        .upsert(booking, { onConflict: 'id' })
      
      if (error) {
        console.error('Error creating booking:', error)
      }
    }

    // Create sample reviews
    const reviews = [
      {
        id: '990e8400-e29b-41d4-a716-446655440001',
        user_id: '550e8400-e29b-41d4-a716-446655440004',
        instructor_id: '660e8400-e29b-41d4-a716-446655440001',
        class_id: '770e8400-e29b-41d4-a716-446655440001',
        rating: 5,
        comment: 'Amazing voice training session! Sarah is incredibly talented and patient.',
      },
      {
        id: '990e8400-e29b-41d4-a716-446655440002',
        user_id: '550e8400-e29b-41d4-a716-446655440004',
        instructor_id: '660e8400-e29b-41d4-a716-446655440002',
        class_id: '770e8400-e29b-41d4-a716-446655440002',
        rating: 4,
        comment: 'Great guitar fundamentals class. Marcus explains everything clearly.',
      },
    ]

    console.log('Creating reviews...')
    for (const review of reviews) {
      const { error } = await supabase
        .from('reviews')
        .upsert(review, { onConflict: 'id' })
      
      if (error) {
        console.error('Error creating review:', error)
      }
    }

    // Create sample subscriptions
    const subscriptions = [
      {
        id: 'aa0e8400-e29b-41d4-a716-446655440001',
        user_id: '550e8400-e29b-41d4-a716-446655440004',
        plan_type: 'basic' as const,
        status: 'active' as const,
        credits_per_month: 10,
        current_period_start: '2024-02-01T00:00:00Z',
        current_period_end: '2024-03-01T00:00:00Z',
      },
    ]

    console.log('Creating subscriptions...')
    for (const subscription of subscriptions) {
      const { error } = await supabase
        .from('subscriptions')
        .upsert(subscription, { onConflict: 'id' })
      
      if (error) {
        console.error('Error creating subscription:', error)
      }
    }

    // Create sample favorite instructors
    const favoriteInstructors = [
      {
        id: 'bb0e8400-e29b-41d4-a716-446655440001',
        user_id: '550e8400-e29b-41d4-a716-446655440004',
        instructor_id: '660e8400-e29b-41d4-a716-446655440001',
      },
      {
        id: 'bb0e8400-e29b-41d4-a716-446655440002',
        user_id: '550e8400-e29b-41d4-a716-446655440004',
        instructor_id: '660e8400-e29b-41d4-a716-446655440002',
      },
    ]

    console.log('Creating favorite instructors...')
    for (const favorite of favoriteInstructors) {
      const { error } = await supabase
        .from('favorite_instructors')
        .upsert(favorite, { onConflict: 'id' })
      
      if (error) {
        console.error('Error creating favorite instructor:', error)
      }
    }

    console.log('✅ Database seeding completed successfully!')
  } catch (error) {
    console.error('❌ Error seeding database:', error)
  }
}

// Run the seeding
seedDatabase() 