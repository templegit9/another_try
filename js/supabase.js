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

// User Management
export async function signUp(email, password, name) {
    try {
        // First create the auth user
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password
        })
        
        if (authError) throw authError
        
        if (!authData?.user) {
            throw new Error('Registration failed - no user data returned')
        }
        
        // Now create the user record in the public users table
        const { error: userError } = await supabase
            .from('users')
            .insert([
                {
                    id: authData.user.id,  // Use the auth user's UUID
                    email: email,
                    name: name,
                    created_at: new Date().toISOString()
                }
            ])
            .select()
            .single()
        
        if (userError) {
            console.error('Error creating user record:', userError)
            throw new Error('Failed to create user record')
        }
        
        return { data: authData, error: null }
    } catch (error) {
        console.error('SignUp error:', error)
        throw error
    }
}

// Sign in with email and password
export async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    })
    
    if (error) throw error
    return { data, error }
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
        .order('timestamp', { ascending: false })
    
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