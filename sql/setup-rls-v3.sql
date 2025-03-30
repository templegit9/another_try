-- First, drop all existing policies
DROP POLICY IF EXISTS "Enable all operations for users based on id" ON public.users;
DROP POLICY IF EXISTS "Enable insert for authentication" ON public.users;
DROP POLICY IF EXISTS "Enable all operations for users based on user_id" ON public.content_items;
DROP POLICY IF EXISTS "Enable all operations for users based on content ownership" ON public.engagement_data;
DROP POLICY IF EXISTS "Enable all operations for users based on user_id" ON public.api_config;

-- Disable and re-enable RLS
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_data DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_config DISABLE ROW LEVEL SECURITY;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_config ENABLE ROW LEVEL SECURITY;

-- Users table policies
CREATE POLICY "Enable read access to own user" ON public.users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Enable insert access during signup" ON public.users
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update access to own user" ON public.users
    FOR UPDATE USING (auth.uid() = id);

-- Content Items policies
CREATE POLICY "Enable read access to own content" ON public.content_items
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Enable insert access to own content" ON public.content_items
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Enable update access to own content" ON public.content_items
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Enable delete access to own content" ON public.content_items
    FOR DELETE USING (auth.uid() = user_id);

-- Engagement Data policies
CREATE POLICY "Enable read access to own content engagement" ON public.engagement_data
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.content_items 
            WHERE content_items.id = engagement_data.content_id 
            AND content_items.user_id = auth.uid()
        )
    );

CREATE POLICY "Enable insert access to own content engagement" ON public.engagement_data
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.content_items 
            WHERE content_items.id = engagement_data.content_id 
            AND content_items.user_id = auth.uid()
        )
    );

CREATE POLICY "Enable update access to own content engagement" ON public.engagement_data
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.content_items 
            WHERE content_items.id = engagement_data.content_id 
            AND content_items.user_id = auth.uid()
        )
    );

CREATE POLICY "Enable delete access to own content engagement" ON public.engagement_data
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.content_items 
            WHERE content_items.id = engagement_data.content_id 
            AND content_items.user_id = auth.uid()
        )
    );

-- API Config policies
CREATE POLICY "Enable read access to own API config" ON public.api_config
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Enable insert access to own API config" ON public.api_config
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Enable update access to own API config" ON public.api_config
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Enable delete access to own API config" ON public.api_config
    FOR DELETE USING (auth.uid() = user_id); 