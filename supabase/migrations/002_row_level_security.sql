-- Enable Row Level Security on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE instructors ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorite_instructors ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view their own profile" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Instructors policies
CREATE POLICY "Anyone can view approved instructors" ON instructors
  FOR SELECT USING (is_approved = true);

CREATE POLICY "Instructors can view their own profile" ON instructors
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Instructors can update their own profile" ON instructors
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can apply to become instructors" ON instructors
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Classes policies
CREATE POLICY "Anyone can view active classes" ON classes
  FOR SELECT USING (is_active = true);

CREATE POLICY "Instructors can view their own classes" ON classes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM instructors 
      WHERE instructors.id = classes.instructor_id 
      AND instructors.user_id = auth.uid()
    )
  );

CREATE POLICY "Instructors can create classes" ON classes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM instructors 
      WHERE instructors.id = classes.instructor_id 
      AND instructors.user_id = auth.uid()
      AND instructors.is_approved = true
    )
  );

CREATE POLICY "Instructors can update their own classes" ON classes
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM instructors 
      WHERE instructors.id = classes.instructor_id 
      AND instructors.user_id = auth.uid()
    )
  );

CREATE POLICY "Instructors can delete their own classes" ON classes
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM instructors 
      WHERE instructors.id = classes.instructor_id 
      AND instructors.user_id = auth.uid()
    )
  );

-- Subscriptions policies
CREATE POLICY "Users can view their own subscriptions" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own subscriptions" ON subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own subscriptions" ON subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Bookings policies
CREATE POLICY "Users can view their own bookings" ON bookings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Instructors can view bookings for their classes" ON bookings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM classes 
      JOIN instructors ON classes.instructor_id = instructors.id
      WHERE classes.id = bookings.class_id 
      AND instructors.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create bookings" ON bookings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bookings" ON bookings
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Instructors can update bookings for their classes" ON bookings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM classes 
      JOIN instructors ON classes.instructor_id = instructors.id
      WHERE classes.id = bookings.class_id 
      AND instructors.user_id = auth.uid()
    )
  );

-- Reviews policies
CREATE POLICY "Anyone can view reviews" ON reviews
  FOR SELECT USING (true);

CREATE POLICY "Users can create reviews for instructors" ON reviews
  FOR INSERT WITH CHECK (auth.uid() = reviewer_id);

CREATE POLICY "Users can update their own reviews" ON reviews
  FOR UPDATE USING (auth.uid() = reviewer_id);

CREATE POLICY "Users can delete their own reviews" ON reviews
  FOR DELETE USING (auth.uid() = reviewer_id);

-- Favorite instructors policies
CREATE POLICY "Users can view their own favorites" ON favorite_instructors
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can add favorites" ON favorite_instructors
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove their own favorites" ON favorite_instructors
  FOR DELETE USING (auth.uid() = user_id);

-- Add subcategory column to classes table
ALTER TABLE classes ADD COLUMN IF NOT EXISTS subcategory TEXT; 