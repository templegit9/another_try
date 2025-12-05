-- Disable RLS on all tables to allow "Session ID" based access without Supabase Auth
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_data DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_config DISABLE ROW LEVEL SECURITY;

-- Grant access to anon role (if not already granted, though DISABLE RLS usually handles checks)
GRANT ALL ON public.users TO anon;
GRANT ALL ON public.content_items TO anon;
GRANT ALL ON public.engagement_data TO anon;
GRANT ALL ON public.api_config TO anon;
