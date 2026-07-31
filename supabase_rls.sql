-- Enable Row Level Security on the finances table
ALTER TABLE finances ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (optional, but good for a clean slate)
DROP POLICY IF EXISTS "Users can view their own finances" ON finances;
DROP POLICY IF EXISTS "Users can insert their own finances" ON finances;
DROP POLICY IF EXISTS "Users can update their own finances" ON finances;
DROP POLICY IF EXISTS "Users can delete their own finances" ON finances;

-- Create policy for SELECT: Users can only see their own row
CREATE POLICY "Users can view their own finances" 
ON finances FOR SELECT 
USING (auth.uid() = user_id);

-- Create policy for INSERT: Users can only insert rows where user_id matches their auth.uid()
CREATE POLICY "Users can insert their own finances" 
ON finances FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create policy for UPDATE: Users can only update their own row
CREATE POLICY "Users can update their own finances" 
ON finances FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create policy for DELETE: Users can only delete their own row
CREATE POLICY "Users can delete their own finances" 
ON finances FOR DELETE 
USING (auth.uid() = user_id);
