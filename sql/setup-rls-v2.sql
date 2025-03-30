-- Users table policies
CREATE POLICY "Enable all operations for users based on id" ON public.users
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Enable insert for authentication" ON public.users
    FOR INSERT WITH CHECK (true);

-- Content Items policies
CREATE POLICY "Enable all operations for users based on user_id" ON public.content_items
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Engagement Data policies
CREATE POLICY "Enable all operations for users based on content ownership" ON public.engagement_data
    USING (
        EXISTS (
            SELECT 1 FROM public.content_items 
            WHERE content_items.id = engagement_data.content_id 
            AND content_items.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.content_items 
            WHERE content_items.id = engagement_data.content_id 
            AND content_items.user_id = auth.uid()
        )
    );

-- API Config policies
CREATE POLICY "Enable all operations for users based on user_id" ON public.api_config
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id); 