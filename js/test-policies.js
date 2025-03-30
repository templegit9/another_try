// test-policies.js
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client
const supabaseUrl = 'https://nivzsdyvkdkezigvmtqx.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pdnpzZHl2a2RrZXppZ3ZtdHF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDMxMjIwMTAsImV4cCI6MjA1ODY5ODAxMH0.Yb9a9MkU_iNc9G7iX04Kr6lDlSbSLS2go-zb_R5cCtA'

const supabase = createClient(supabaseUrl, supabaseKey)

// Helper functions
async function signUp(email, password, name) {
    try {
        // First create the auth user with auto-confirm enabled
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    name: name
                },
                emailRedirectTo: 'http://localhost:3000'
            }
        })
        
        if (authError) throw authError
        
        if (!authData?.user) {
            throw new Error('Registration failed - no user data returned')
        }

        // Sign in with the new credentials to get a valid session
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password
        })

        if (signInError) throw signInError

        // Now create the user record in the public users table
        const { error: userError } = await supabase
            .from('users')
            .insert([
                {
                    id: authData.user.id,
                    email: email,
                    name: name,
                    created_at: new Date().toISOString()
                }
            ])
        
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

async function signIn(email, password) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        })
        
        if (error) throw error
        return { data, error }
    } catch (error) {
        console.error('SignIn error:', error)
        throw error
    }
}

async function signOut() {
    try {
        const { error } = await supabase.auth.signOut()
        if (error) throw error
        await wait(1000) // Wait for session to clear
    } catch (error) {
        console.error('SignOut error:', error)
        throw error
    }
}

// Helper function to wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function testRLSPolicies() {
    console.log('Starting RLS Policy Tests...');
    
    // Generate unique timestamp for email addresses
    const timestamp = new Date().getTime();
    
    // Test user credentials with unique email addresses
    const testUser1 = {
        email: `test.user1.${timestamp}@gmail.com`,
        password: 'testpassword123',
        name: 'Test User 1'
    };
    
    const testUser2 = {
        email: `test.user2.${timestamp}@gmail.com`,
        password: 'testpassword123',
        name: 'Test User 2'
    };

    try {
        // 1. Test Users Table Policies
        console.log('\nTesting Users Table Policies:');
        
        // Create test user 1
        const user1Result = await signUp(testUser1.email, testUser1.password, testUser1.name);
        console.log('✓ Created test user 1');
        const user1 = user1Result.data.user;
        await wait(2000); // Wait for user creation to complete
        
        // Sign in as user 1
        await signIn(testUser1.email, testUser1.password);
        console.log('✓ Signed in as user 1');
        await wait(1000);
        
        // Try to read own user record (should succeed)
        let { data: userData, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('id', user1.id)
            .single();
            
        console.log(userError ? '✗ Failed to read own user record' : '✓ Successfully read own user record');
        
        // Try to read all users (should only return own record)
        let { data: allUsers } = await supabase.from('users').select('*');
        console.log(allUsers.length === 1 ? '✓ Can only see own user record' : '✗ Can see other users records');
        await wait(1000);

        // Create test user 2
        await signOut();
        const user2Result = await signUp(testUser2.email, testUser2.password, testUser2.name);
        console.log('✓ Created test user 2');
        const user2 = user2Result.data.user;
        await wait(2000); // Wait for user creation to complete

        // Sign in as user 2
        await signIn(testUser2.email, testUser2.password);
        console.log('✓ Signed in as user 2');
        await wait(1000);

        // 2. Test Content Items Policies
        console.log('\nTesting Content Items Policies:');
        
        // Create a content item
        const contentItem = {
            user_id: user2.id, // Create content as user 2
            name: 'Test Content',
            platform: 'youtube',
            url: 'https://youtube.com/test',
            content_id: 'test123',
            description: 'Test description',
            published_date: new Date().toISOString()
        };
        
        const { data: content, error: contentError } = await supabase
            .from('content_items')
            .insert([contentItem])
            .select();
            
        console.log(contentError ? '✗ Failed to create content item' : '✓ Successfully created content item');
        await wait(1000);
        
        // Try to read user 1's content (should fail or return empty)
        const { data: otherContent } = await supabase
            .from('content_items')
            .select('*')
            .eq('user_id', user1.id);
            
        console.log(otherContent.length === 0 ? '✓ Cannot read other user\'s content' : '✗ Can read other user\'s content');

        // 3. Test API Config Policies
        console.log('\nTesting API Config Policies:');
        
        // Create API config for user 2
        const apiConfig = {
            user_id: user2.id,
            platform: 'youtube',
            config: { api_key: 'test_key' }
        };
        
        const { error: configError } = await supabase
            .from('api_config')
            .insert([apiConfig]);
            
        console.log(configError ? '✗ Failed to create API config' : '✓ Successfully created API config');
        await wait(1000);
        
        // Try to read all API configs (should only see own)
        const { data: configs } = await supabase
            .from('api_config')
            .select('*');
            
        console.log(configs.length === 1 ? '✓ Can only see own API config' : '✗ Can see other users\' API configs');

        // 4. Test Engagement Data Policies
        console.log('\nTesting Engagement Data Policies:');
        
        // Create content for user 2
        const user2Content = {
            user_id: user2.id,
            name: 'User 2 Content',
            platform: 'youtube',
            url: 'https://youtube.com/test2',
            content_id: 'test456',
            description: 'Test description 2',
            published_date: new Date().toISOString()
        };
        
        const { data: content2 } = await supabase
            .from('content_items')
            .insert([user2Content])
            .select();
        
        await wait(1000);
        
        // Add engagement data for user 2's content
        const engagementData = {
            content_id: content2[0].id,
            views: 100,
            likes: 10,
            comments: 5,
            shares: 2,
            timestamp: new Date().toISOString()
        };
        
        const { error: engagementError } = await supabase
            .from('engagement_data')
            .insert([engagementData]);
            
        console.log(engagementError ? '✗ Failed to create engagement data' : '✓ Successfully created engagement data');
        await wait(1000);
        
        // Try to read all engagement data (should only see own content's engagement)
        const { data: allEngagement } = await supabase
            .from('engagement_data')
            .select('*');
            
        console.log(allEngagement.length === 1 ? '✓ Can only see own content\'s engagement data' : '✗ Can see other users\' engagement data');

        // Clean up
        await signOut();
        console.log('\nTest completed successfully!');
        
    } catch (error) {
        console.error('Test failed:', error.message);
    }
}

// Run the tests
testRLSPolicies(); 