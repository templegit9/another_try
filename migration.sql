-- Add new columns first
ALTER TABLE content_items 
    ADD COLUMN IF NOT EXISTS type VARCHAR(50),
    ADD COLUMN IF NOT EXISTS platform_specific_data JSONB DEFAULT '{}';

-- Create indexes after columns exist
CREATE INDEX IF NOT EXISTS idx_content_type ON content_items(type);
CREATE INDEX IF NOT EXISTS idx_engagement_timestamp ON engagement_data(timestamp);

-- Add check constraint for platform types
ALTER TABLE content_items
    ADD CONSTRAINT valid_platform_type 
    CHECK (type IN ('youtube', 'servicenow', 'linkedin', 'reddit', 'twitter', 'slack'));

-- Create function for platform data validation
CREATE OR REPLACE FUNCTION validate_platform_data()
RETURNS TRIGGER AS $$
BEGIN
    -- Validate platform-specific data based on type
    CASE NEW.type
        WHEN 'reddit' THEN
            IF NOT (NEW.platform_specific_data ? 'subreddit' AND NEW.platform_specific_data ? 'post_id') THEN
                RAISE EXCEPTION 'Reddit content requires subreddit and post_id';
            END IF;
        WHEN 'twitter' THEN
            IF NOT (NEW.platform_specific_data ? 'tweet_id') THEN
                RAISE EXCEPTION 'Twitter content requires tweet_id';
            END IF;
        WHEN 'slack' THEN
            IF NOT (NEW.platform_specific_data ? 'channel_id' AND NEW.platform_specific_data ? 'message_ts') THEN
                RAISE EXCEPTION 'Slack content requires channel_id and message_ts';
            END IF;
    END CASE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for platform data validation
DROP TRIGGER IF EXISTS validate_platform_data_trigger ON content_items;
CREATE TRIGGER validate_platform_data_trigger
    BEFORE INSERT OR UPDATE ON content_items
    FOR EACH ROW
    WHEN (NEW.type IN ('reddit', 'twitter', 'slack'))
    EXECUTE FUNCTION validate_platform_data();

-- Update RLS policies
ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_items_select_policy ON content_items;
DROP POLICY IF EXISTS content_items_insert_policy ON content_items;
DROP POLICY IF EXISTS content_items_update_policy ON content_items;
DROP POLICY IF EXISTS content_items_delete_policy ON content_items;

CREATE POLICY content_items_select_policy ON content_items
    FOR SELECT USING (auth.uid() = user_id);
    
CREATE POLICY content_items_insert_policy ON content_items
    FOR INSERT WITH CHECK (auth.uid() = user_id);
    
CREATE POLICY content_items_update_policy ON content_items
    FOR UPDATE USING (auth.uid() = user_id);
    
CREATE POLICY content_items_delete_policy ON content_items
    FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS engagement_data_select_policy ON engagement_data;
DROP POLICY IF EXISTS engagement_data_insert_policy ON engagement_data;
DROP POLICY IF EXISTS engagement_data_update_policy ON engagement_data;
DROP POLICY IF EXISTS engagement_data_delete_policy ON engagement_data;

CREATE POLICY engagement_data_select_policy ON engagement_data
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM content_items 
            WHERE content_items.id = engagement_data.content_id 
            AND content_items.user_id = auth.uid()
        )
    );

CREATE POLICY engagement_data_insert_policy ON engagement_data
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM content_items 
            WHERE content_items.id = engagement_data.content_id 
            AND content_items.user_id = auth.uid()
        )
    );

CREATE POLICY engagement_data_update_policy ON engagement_data
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM content_items 
            WHERE content_items.id = engagement_data.content_id 
            AND content_items.user_id = auth.uid()
        )
    );

CREATE POLICY engagement_data_delete_policy ON engagement_data
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM content_items 
            WHERE content_items.id = engagement_data.content_id 
            AND content_items.user_id = auth.uid()
        )
    ); 