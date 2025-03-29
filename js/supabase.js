// Initialize Supabase client
const supabaseUrl = 'https://nivzsdyvkdkezigvmtqx.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pdnpzZHl2a2RrZXppZ3ZtdHF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDMxMjIwMTAsImV4cCI6MjA1ODY5ODAxMH0.Yb9a9MkU_iNc9G7iX04Kr6lDlSbSLS2go-zb_R5cCtA'

// Create client using the global Supabase object
export const supabase = window.supabase.createClient(supabaseUrl, supabaseKey)

// User Management
export async function signUp(email, password, name) {
    const { data: { user }, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                name
            }
        }
    })
    
    if (error) throw error
    return user
}

export async function signIn(email, password) {
    const { data: { user }, error } = await supabase.auth.signInWithPassword({
        email,
        password
    })
    
    if (error) throw error
    return user
}

export async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
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
        .select('*')
        .eq('user_id', userId)
    
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