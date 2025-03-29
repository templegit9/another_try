-- Create tables
CREATE TABLE content_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    platform TEXT NOT NULL,
    url TEXT NOT NULL,
    content_id TEXT NOT NULL,
    published_date DATE NOT NULL,
    duration TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_updated TIMESTAMPTZ
);

CREATE TABLE engagement_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content_id UUID REFERENCES content_items(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    views INTEGER NOT NULL DEFAULT 0,
    likes INTEGER NOT NULL DEFAULT 0,
    comments INTEGER NOT NULL DEFAULT 0,
    shares INTEGER NOT NULL DEFAULT 0,
    other_metrics JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE api_config (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (user_id, platform)
);

-- Create indexes
CREATE INDEX idx_content_items_user_id ON content_items(user_id);
CREATE INDEX idx_content_items_url ON content_items(url);
CREATE INDEX idx_engagement_data_content_id ON engagement_data(content_id);
CREATE INDEX idx_engagement_data_timestamp ON engagement_data(timestamp);

-- Create RLS policies
ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_config ENABLE ROW LEVEL SECURITY;

-- Content items policies
CREATE POLICY "Users can view their own content items"
    ON content_items FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own content items"
    ON content_items FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own content items"
    ON content_items FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own content items"
    ON content_items FOR DELETE
    USING (auth.uid() = user_id);

-- Engagement data policies
CREATE POLICY "Users can view engagement data for their content"
    ON engagement_data FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM content_items
        WHERE content_items.id = engagement_data.content_id
        AND content_items.user_id = auth.uid()
    ));

CREATE POLICY "Users can insert engagement data for their content"
    ON engagement_data FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM content_items
        WHERE content_items.id = engagement_data.content_id
        AND content_items.user_id = auth.uid()
    ));

CREATE POLICY "Users can update engagement data for their content"
    ON engagement_data FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM content_items
        WHERE content_items.id = engagement_data.content_id
        AND content_items.user_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM content_items
        WHERE content_items.id = engagement_data.content_id
        AND content_items.user_id = auth.uid()
    ));

CREATE POLICY "Users can delete engagement data for their content"
    ON engagement_data FOR DELETE
    USING (EXISTS (
        SELECT 1 FROM content_items
        WHERE content_items.id = engagement_data.content_id
        AND content_items.user_id = auth.uid()
    ));

-- API config policies
CREATE POLICY "Users can view their own API config"
    ON api_config FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own API config"
    ON api_config FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own API config"
    ON api_config FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own API config"
    ON api_config FOR DELETE
    USING (auth.uid() = user_id); 