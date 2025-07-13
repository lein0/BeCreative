# BeCreative - Creative Classes Platform

A full-stack web application that connects creative instructors with students, similar to ClassPass but focused on creative arts and performance classes.

## 🎨 Features

### For Students
- Discover in-person and virtual creative classes
- Book classes using credits or direct payment
- View instructor profiles with reviews and credentials
- Track upcoming classes and credit balance
- Favorite instructors and classes
- City-based search and filtering

### For Instructors
- Instructor onboarding and approval process
- Create and manage class listings
- Set pricing in credits and/or dollars
- Manage bookings and student communications
- Receive payments via Stripe Connect
- Track revenue and class performance

### Core Features
- Role-based authentication (Student/Instructor/Admin)
- Credit subscription system with rollover
- Stripe integration for payments and instructor payouts
- Real-time booking and availability management
- Review and rating system
- Mobile-responsive design

## 🛠 Tech Stack

- **Frontend**: Next.js 14 (App Router)
- **Backend**: Supabase (Auth, Database, Storage)
- **Styling**: Tailwind CSS + shadcn/ui
- **Payments**: Stripe (Subscriptions, One-time payments, Connect)
- **Deployment**: Vercel
- **Database**: PostgreSQL (via Supabase)
- **Authentication**: Supabase Auth with Row Level Security

## 📦 Project Structure

```
BeCreative/
├── app/                    # Next.js App Router pages
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Homepage
├── components/            # React components
│   ├── ui/               # shadcn/ui components
│   └── forms/            # Form components
├── lib/                  # Utility functions
│   ├── supabase.ts       # Supabase client
│   ├── stripe.ts         # Stripe utilities
│   └── utils.ts          # General utilities
├── supabase/             # Database migrations
│   └── migrations/       # SQL migration files
├── scripts/              # Database seeding
└── public/               # Static assets
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account
- Stripe account

### 1. Clone the Repository

```bash
git clone <repository-url>
cd BeCreative
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Setup

Copy the example environment file and fill in your credentials:

```bash
cp env.example .env.local
```

Update `.env.local` with your actual values:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Stripe Configuration
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret

# Stripe Connect (for instructor payouts)
STRIPE_CONNECT_CLIENT_ID=your_stripe_connect_client_id

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=BeCreative
```

### 4. Database Setup

#### Option A: Using Supabase CLI (Recommended)

1. Install Supabase CLI:
```bash
npm install -g supabase
```

2. Login to Supabase:
```bash
supabase login
```

3. Link your project:
```bash
supabase link --project-ref your-project-ref
```

4. Push the database schema:
```bash
npm run db:push
```

#### Option B: Manual Setup

1. Go to your Supabase dashboard
2. Navigate to the SQL Editor
3. Run the contents of `supabase/migrations/001_initial_schema.sql`
4. Run the contents of `supabase/migrations/002_row_level_security.sql`

### 5. Seed the Database

Populate the database with sample data:

```bash
npm run db:seed
```

### 6. Start the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## 🗄 Database Schema

### Core Tables

- **users**: User profiles and authentication
- **instructors**: Extended instructor information
- **classes**: Class listings and details
- **bookings**: Student class reservations
- **subscriptions**: Credit subscription management
- **reviews**: Instructor reviews and ratings
- **favorite_instructors**: Student favorite instructors

### Key Features

- Row Level Security (RLS) for data protection
- UUID primary keys for scalability
- JSONB fields for flexible data storage
- Proper indexing for performance
- Automatic timestamp management

## 💳 Payment Integration

### Stripe Setup

1. Create a Stripe account and get your API keys
2. Set up Stripe Connect for instructor payouts
3. Create subscription products in Stripe dashboard
4. Configure webhooks for payment events

### Credit System

- **Basic Plan**: 5 credits/month ($19.99)
- **Premium Plan**: 10 credits/month ($34.99)
- **Unlimited Plan**: 20 credits/month ($59.99)

Credits roll over month to month and can be used for class bookings.

## 🔐 Authentication & Authorization

### User Roles

- **Student**: Can browse, book classes, leave reviews
- **Instructor**: Can create classes, manage bookings, receive payments
- **Admin**: Full system access

### Security Features

- Supabase Auth with email/password
- Row Level Security policies
- Role-based access control
- Secure API endpoints

## 📱 Pages & Routes

- `/` - Homepage with featured instructors
- `/explore` - Browse and filter classes
- `/classes/[id]` - Class details and booking
- `/instructors/[id]` - Instructor profile and reviews
- `/dashboard` - Role-aware user dashboard
- `/onboarding` - Instructor application form

## 🎯 Development Guidelines

### Code Style

- Use TypeScript for type safety
- Follow Next.js 14 App Router conventions
- Use shadcn/ui components for consistency
- Implement proper error handling
- Write meaningful commit messages

### Testing

```bash
# Run linting
npm run lint

# Type checking
npx tsc --noEmit
```

### Database Changes

1. Create new migration files in `supabase/migrations/`
2. Test migrations locally
3. Update TypeScript types if needed
4. Deploy to production

## 🚀 Deployment

### Vercel Deployment

1. Connect your repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Environment Variables

Ensure all environment variables are set in your production environment:

- Supabase configuration
- Stripe API keys
- App configuration

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:

- Create an issue in the repository
- Check the documentation
- Review the code examples

## 🔮 Future Enhancements

- Class reviews and ratings
- Community "local hubs" by city
- Referral credit system
- Advanced analytics dashboard
- Mobile app development
- Video streaming integration
- Group class discounts
- Instructor scheduling tools

---

Built with ❤️ for the creative community 