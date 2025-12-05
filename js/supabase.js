// Initialize Supabase client
const supabaseUrl = 'https://nivzsdyvkdkezigvmtqx.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pdnpzZHl2a2RrZXppZ3ZtdHF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDMxMjIwMTAsImV4cCI6MjA1ODY5ODAxMH0.Yb9a9MkU_iNc9G7iX04Kr6lDlSbSLS2go-zb_R5cCtA'

// Create Supabase client
export const supabase = window.supabase.createClient(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    }
})

// Session Management (Custom)
export async function getUserBySessionId(sessionId) {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', sessionId) // We are using the session ID as the user ID
        .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
        throw error
    }
    return data
}

export async function createUserWithSessionId(sessionId) {
    const { data, error } = await supabase
        .from('users')
        .insert([
            {
                id: sessionId,
                email: `${sessionId}@session.local`, // Dummy email
                name: sessionId,
                created_at: new Date().toISOString()
            }
        ])
        .select()
        .single()

    if (error) throw error
    return data
}

// Deprecated Auth Functions (kept for interface compatibility but unused)
export async function signUp(email, password, name) {
    console.warn('signUp is deprecated in Session ID mode')
    return { error: { message: 'Use Session ID login' } }
}

export async function signIn(email, password) {
    console.warn('signIn is deprecated in Session ID mode')
    return { error: { message: 'Use Session ID login' } }
}

export async function signOut() {
    // Just a placeholder, actual signout happens in app.js by clearing localStorage
    return { error: null }
}

// Content Management
export async function addContent(contentData) {
    const { data, error } = await supabase
        .from('content_items')
        .insert([contentData])
        .select()

    if (error) throw error
    return data[0]
}

export async function updateContent(id, contentData) {
    const { data, error } = await supabase
        .from('content_items')
        .update(contentData)
        .eq('id', id)
        .select()

    if (error) throw error
    return data[0]
}

export async function deleteContent(id) {
    const { error } = await supabase
        .from('content_items')
        .delete()
        .eq('id', id)

    if (error) throw error
}

export async function getContentItems(userId) {
    const { data, error } = await supabase
        .from('content_items')
        .select('*')
        .eq('user_id', userId)

    if (error) throw error
    return data
}

// Engagement Data
export async function addEngagementData(engagementData) {
    const { data, error } = await supabase
        .from('engagement_data')
        .insert([engagementData])
        .select()

    if (error) throw error
    return data[0]
}

export async function getEngagementData(userId) {
    const { data, error } = await supabase
        .from('engagement_data')
        .select(`
            id,
            content_id,
            views,
            likes,
            comments,
            shares,
            other_metrics,
            timestamp,
            content_items (
                id,
                user_id
            )
        `)
        .eq('content_items.user_id', userId)

    if (error) throw error
    return data
}

// API Configuration
export async function saveApiConfig(userId, platform, config) {
    const { data, error } = await supabase
        .from('api_config')
        .upsert({
            user_id: userId,
            platform,
            config
        })
        .select()

    if (error) throw error
    return data[0]
}

export async function getApiConfig(userId) {
    const { data, error } = await supabase
        .from('api_config')
        .select('*')
        .eq('user_id', userId)

    if (error) throw error
    return data
} 