-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_config ENABLE ROW LEVEL SECURITY;

-- Users table policies
CREATE POLICY "Users can view their own record" ON public.users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own record" ON public.users
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own record" ON public.users
    FOR INSERT WITH CHECK (auth.uid() = id OR auth.uid() IS NULL);

-- Content Items policies
CREATE POLICY "Users can view their own content" ON public.content_items
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own content" ON public.content_items
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own content" ON public.content_items
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own content" ON public.content_items
    FOR DELETE USING (auth.uid() = user_id);

-- Engagement Data policies
CREATE POLICY "Users can view engagement data for their content" ON public.engagement_data
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.content_items 
            WHERE content_items.id = engagement_data.content_id 
            AND content_items.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert engagement data for their content" ON public.engagement_data
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.content_items 
            WHERE content_items.id = engagement_data.content_id 
            AND content_items.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update engagement data for their content" ON public.engagement_data
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.content_items 
            WHERE content_items.id = engagement_data.content_id 
            AND content_items.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete engagement data for their content" ON public.engagement_data
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.content_items 
            WHERE content_items.id = engagement_data.content_id 
            AND content_items.user_id = auth.uid()
        )
    );

-- API Config policies
CREATE POLICY "Users can view their own API config" ON public.api_config
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own API config" ON public.api_config
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own API config" ON public.api_config
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own API config" ON public.api_config
    FOR DELETE USING (auth.uid() = user_id); 