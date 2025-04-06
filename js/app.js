import { 
    supabase,
    signUp,
    signIn,
    signOut,
    addContent,
    updateContent,
    deleteContent,
    getContentItems,
    addEngagementData,
    getEngagementData,
    saveApiConfig,
    getApiConfig
} from './supabase.js'

// Global state
let currentUser = null;
let contentItems = [];
let engagementData = [];
let urlToContentMap = {};
let apiConfig = {
    youtube: { apiKey: null },
    servicenow: { instance: null, username: null, password: null },
    linkedin: { clientId: null, clientSecret: null, accessToken: null },
    reddit: { clientId: null, clientSecret: null, username: null },
    twitter: { apiKey: null, apiKeySecret: null, bearerToken: null },
    slack: { botToken: null, signingSecret: null }
};

// Initialize the app
async function initApp() {
    // Check for existing session
    const { data: { session }, error } = await supabase.auth.getSession()
    
    if (session) {
        await loginUser(session.user)
    } else {
        showAuthScreen()
    }
    
    // Set up event listeners
    document.getElementById('save-api-config').addEventListener('click', handleApiConfigSave)
    
    setupEventListeners()
    setupCollapsibleSections()
}

// Handle login
async function handleLogin(e) {
    e.preventDefault()
    
    const email = document.getElementById('login-email').value
    const password = document.getElementById('login-password').value
    const rememberMe = document.getElementById('remember-me').checked
    
    try {
        // Show loading state
        const submitButton = e.target.querySelector('button[type="submit"]')
        const originalText = submitButton.innerHTML
        submitButton.disabled = true
        submitButton.innerHTML = '<span class="material-icons animate-spin">refresh</span> Logging in...'
        
        // Attempt login
        const { data, error } = await signIn(email, password)
        
        if (error) throw error
        
        if (data?.user) {
            // Login successful
            await loginUser(data.user)
            
            // Clear form and error
            e.target.reset()
            document.getElementById('login-error').classList.add('hidden')
            
            // Store session if remember me is checked
            if (rememberMe) {
                localStorage.setItem('supabase.auth.token', data.session.access_token)
            }
        } else {
            throw new Error('Login failed - no user data returned')
        }
    } catch (error) {
        console.error('Login error:', error)
        const errorMessage = error.message || 'Failed to login. Please check your credentials and try again.'
        document.getElementById('login-error').textContent = errorMessage
        document.getElementById('login-error').classList.remove('hidden')
    } finally {
        // Reset button state
        const submitButton = e.target.querySelector('button[type="submit"]')
        submitButton.disabled = false
        submitButton.innerHTML = '<span class="material-icons mr-1">login</span> Sign in'
    }
}

// Handle registration
async function handleRegister(e) {
    e.preventDefault()
    
    const name = document.getElementById('register-name').value.trim()
    const email = document.getElementById('register-email').value.trim()
    const password = document.getElementById('register-password').value
    const confirmPassword = document.getElementById('register-confirm-password').value
    
    // Basic validation
    if (!name || !email || !password) {
        const registerError = document.getElementById('register-error')
        registerError.textContent = 'All fields are required'
        registerError.classList.remove('hidden', 'text-green-500')
        registerError.classList.add('text-red-500')
        return
    }
    
    // Show loading state
    const submitButton = e.target.querySelector('button[type="submit"]')
    const originalText = submitButton.innerHTML
    submitButton.disabled = true
    submitButton.innerHTML = '<span class="material-icons animate-spin">refresh</span> Creating Account...'
    
    try {
        if (password !== confirmPassword) {
            throw new Error('Passwords do not match')
        }
        
        // Attempt registration
        const { data, error } = await signUp(email, password, name)
        if (error) throw error
        
        // Registration successful
        const registerError = document.getElementById('register-error')
        registerError.textContent = 'Account created successfully! You can now log in.'
        registerError.classList.remove('hidden', 'text-red-500')
        registerError.classList.add('text-green-500')
        
        // Clear form
        e.target.reset()
        
        // Switch to login tab after a delay
        setTimeout(() => {
            document.getElementById('login-tab').click()
        }, 3000)
        
    } catch (error) {
        console.error('Registration error:', error)
        const registerError = document.getElementById('register-error')
        registerError.textContent = error.message || 'Failed to create account'
        registerError.classList.remove('hidden', 'text-green-500')
        registerError.classList.add('text-red-500')
    } finally {
        // Reset button state
        submitButton.disabled = false
        submitButton.innerHTML = originalText
    }
}

// Login user and load their data
async function loginUser(user) {
    try {
        // Get user data from users table
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single()
        
        if (userError) {
            console.error('Error fetching user data:', userError)
            throw userError
        }
        
        // Set current user with combined auth and db data
        currentUser = {
            ...user,
            ...userData
        }
        
        // Update UI
        document.getElementById('current-user-name').textContent = currentUser.name
        document.getElementById('auth-content').style.display = 'none'
        document.getElementById('main-content').style.display = 'block'
        
        // Initialize user dropdown state
        initializeUserDropdown()
        
        // Load user data
        await loadUserData()
    } catch (error) {
        console.error('Error loading user data:', error)
        // If we can't load the user data, sign them out
        await signOut()
        showAuthScreen()
        showErrorNotification('Error loading user data')
    }
}

// Initialize the state of the user dropdown
function initializeUserDropdown() {
    const userDropdown = document.getElementById('user-dropdown')
    if (userDropdown) {
        userDropdown.classList.add('hidden')
        userDropdown.style.display = 'none'
    }
}

// Load user data from Supabase
async function loadUserData() {
    try {
        // First check if we have a valid user
        if (!currentUser || !currentUser.id) {
            throw new Error('No valid user session')
        }

        // Load API config
        const apiConfigs = await getApiConfig(currentUser.id)
        if (apiConfigs) {
            apiConfigs.forEach(config => {
                apiConfig[config.platform] = config.config
            })
            updateApiConfigUI()
        }
        
        // Load content items
        const items = await getContentItems(currentUser.id)
        if (items) {
            contentItems = items
            rebuildUrlContentMap()
        }
        
        // Load engagement data
        const data = await getEngagementData(currentUser.id)
        if (data) {
            engagementData = data
        }
        
        // Set default date to today for content form
        const publishedDateInput = document.getElementById('content-published')
        if (publishedDateInput) {
            publishedDateInput.valueAsDate = new Date()
        }
        
        // Render data
        renderContentItems()
        renderEngagementData()
        updateStats()
        renderCharts()
    } catch (error) {
        console.error('Error loading user data:', error)
        showErrorNotification('Error loading user data: ' + error.message)
        
        // If we can't load the user data, sign them out
        await signOut()
        showAuthScreen()
    }
}

// Handle content form submission
async function handleContentFormSubmit(e) {
    e.preventDefault();
    
    const contentUrl = document.getElementById('add-content-url').value;
    const platform = document.getElementById('add-content-source').value;
    
    if (!contentUrl) {
        showErrorNotification('Please enter a URL');
        return;
    }

    const contentData = {
        user_id: currentUser.id,
        name: document.getElementById('add-content-name').value,
        description: document.getElementById('add-content-description').value,
        platform: platform,
        url: contentUrl,
        content_id: extractContentId(contentUrl, platform),
        published_date: document.getElementById('add-content-published').value,
        duration: document.getElementById('add-content-duration').value,
        created_at: new Date().toISOString()
    };
    
    try {
        // Show loading state
        const submitButton = e.target.querySelector('button[type="submit"]');
        const originalText = submitButton.innerHTML;
        submitButton.disabled = true;
        submitButton.innerHTML = '<span class="material-icons animate-spin">refresh</span> Adding...';
        
        // Add content to Supabase
        const { data: newContent, error } = await supabase
            .from('content_items')
            .insert([contentData])
            .select()
            .single();
            
        if (error) throw error;
        
        // Update local state
        contentItems.push(newContent);
        rebuildUrlContentMap();
        
        // Fetch initial engagement data
        await fetchEngagementData([newContent]);
        
        // Update UI
        renderContentItems();
        renderEngagementData();
        updateStats();
        renderCharts();
        
        // Reset form
        e.target.reset();
        document.getElementById('add-content-published').valueAsDate = new Date();
        document.getElementById('add-duplicate-warning').classList.add('hidden');
        
        // Collapse the add content section
        document.getElementById('add-content-body').classList.add('hidden');
        document.getElementById('toggle-add-content').querySelector('.material-icons').classList.remove('rotate-180');
        
        showSuccessNotification('Content added successfully');
    } catch (error) {
        console.error('Error adding content:', error);
        showErrorNotification(error.message || 'Error adding content');
    } finally {
        // Reset button state
        const submitButton = e.target.querySelector('button[type="submit"]');
        submitButton.disabled = false;
        submitButton.innerHTML = '<span class="material-icons mr-1">add</span> Add Content';
    }
}

// Delete content
async function handleContentDeletion(id) {
    if (confirm('Are you sure you want to delete this content? This operation cannot be undone.')) {
        try {
            await deleteContent(id)
            
            // Update local state
            contentItems = contentItems.filter(c => c.id !== id)
            rebuildUrlContentMap()
            
            // Update UI
            renderContentItems()
            renderEngagementData()
            updateStats()
            renderCharts()
            
            showSuccessNotification('Content deleted successfully')
        } catch (error) {
            console.error('Error deleting content:', error)
            showErrorNotification('Error deleting content')
        }
    }
}

// Save API configuration
async function handleApiConfigSave() {
    const config = {
        youtube: {
            apiKey: document.getElementById('youtube-api-key').value
        },
        servicenow: {
            instanceUrl: document.getElementById('servicenow-instance-url').value,
            username: document.getElementById('servicenow-username').value,
            password: document.getElementById('servicenow-password').value
        },
        linkedin: {
            clientId: document.getElementById('linkedin-client-id').value,
            clientSecret: document.getElementById('linkedin-client-secret').value
        },
        reddit: {
            clientId: document.getElementById('reddit-client-id').value,
            clientSecret: document.getElementById('reddit-client-secret').value,
            username: document.getElementById('reddit-username').value
        },
        twitter: {
            apiKey: document.getElementById('twitter-api-key').value,
            apiKeySecret: document.getElementById('twitter-api-key-secret').value,
            bearerToken: document.getElementById('twitter-bearer-token').value
        },
        slack: {
            botToken: document.getElementById('slack-bot-token').value,
            signingSecret: document.getElementById('slack-signing-secret').value
        }
    };

    try {
        const { data, error } = await supabase
            .from('user_api_config')
            .upsert({ user_id: currentUser.id, config: config }, { onConflict: 'user_id' });

        if (error) throw error;
        showNotification('API configuration saved successfully', 'success');
        
        // Update global apiConfig
        apiConfig = config;
        
        // Update API status indicators
        updateApiStatusIndicators();
    } catch (error) {
        console.error('Error saving API configuration:', error);
        showNotification('Failed to save API configuration', 'error');
    }
}

function updateApiStatusIndicators() {
    // Update YouTube status
    const youtubeStatus = document.getElementById('youtube-api-status');
    if (apiConfig.youtube?.apiKey) {
        youtubeStatus.textContent = 'Configured';
        youtubeStatus.className = 'badge bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 ml-2';
    }

    // Update ServiceNow status
    const servicenowStatus = document.getElementById('servicenow-api-status');
    if (apiConfig.servicenow?.instanceUrl && apiConfig.servicenow?.username && apiConfig.servicenow?.password) {
        servicenowStatus.textContent = 'Configured';
        servicenowStatus.className = 'badge bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 ml-2';
    }

    // Update LinkedIn status
    const linkedinStatus = document.getElementById('linkedin-api-status');
    if (apiConfig.linkedin?.clientId && apiConfig.linkedin?.clientSecret) {
        linkedinStatus.textContent = 'Configured';
        linkedinStatus.className = 'badge bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 ml-2';
    }

    // Update Reddit status
    const redditStatus = document.getElementById('reddit-api-status');
    if (apiConfig.reddit?.clientId && apiConfig.reddit?.clientSecret && apiConfig.reddit?.username) {
        redditStatus.textContent = 'Configured';
        redditStatus.className = 'badge bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 ml-2';
    }

    // Update Twitter status
    const twitterStatus = document.getElementById('twitter-api-status');
    if (apiConfig.twitter?.apiKey && apiConfig.twitter?.apiKeySecret && apiConfig.twitter?.bearerToken) {
        twitterStatus.textContent = 'Configured';
        twitterStatus.className = 'badge bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 ml-2';
    }

    // Update Slack status
    const slackStatus = document.getElementById('slack-api-status');
    if (apiConfig.slack?.botToken && apiConfig.slack?.signingSecret) {
        slackStatus.textContent = 'Configured';
        slackStatus.className = 'badge bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 ml-2';
    }
}

// Test API Configuration Functions
async function testRedditApi() {
    if (!apiConfig.reddit?.clientId || !apiConfig.reddit?.clientSecret || !apiConfig.reddit?.username) {
        showNotification('Please fill in all Reddit API fields first', 'error');
        return;
    }

    try {
        // Test Reddit API connection
        const response = await fetch('https://www.reddit.com/api/v1/me', {
            headers: {
                'Authorization': `Bearer ${apiConfig.reddit.clientId}`
            }
        });

        if (response.ok) {
            showNotification('Reddit API connection successful', 'success');
        } else {
            throw new Error('Failed to connect to Reddit API');
        }
    } catch (error) {
        console.error('Error testing Reddit API:', error);
        showNotification('Failed to connect to Reddit API', 'error');
    }
}

async function testTwitterApi() {
    if (!apiConfig.twitter?.apiKey || !apiConfig.twitter?.apiKeySecret || !apiConfig.twitter?.bearerToken) {
        showNotification('Please fill in all Twitter API fields first', 'error');
        return;
    }

    try {
        // Test Twitter API connection
        const response = await fetch('https://api.twitter.com/2/users/me', {
            headers: {
                'Authorization': `Bearer ${apiConfig.twitter.bearerToken}`
            }
        });

        if (response.ok) {
            showNotification('Twitter API connection successful', 'success');
        } else {
            throw new Error('Failed to connect to Twitter API');
        }
    } catch (error) {
        console.error('Error testing Twitter API:', error);
        showNotification('Failed to connect to Twitter API', 'error');
    }
}

async function testSlackApi() {
    if (!apiConfig.slack?.botToken || !apiConfig.slack?.signingSecret) {
        showNotification('Please fill in all Slack API fields first', 'error');
        return;
    }

    try {
        // Test Slack API connection
        const response = await fetch('https://slack.com/api/auth.test', {
            headers: {
                'Authorization': `Bearer ${apiConfig.slack.botToken}`
            }
        });

        if (response.ok) {
            showNotification('Slack API connection successful', 'success');
        } else {
            throw new Error('Failed to connect to Slack API');
        }
    } catch (error) {
        console.error('Error testing Slack API:', error);
        showNotification('Failed to connect to Slack API', 'error');
    }
}

// Add event listeners for test buttons
document.addEventListener('DOMContentLoaded', () => {
    // ... existing event listeners ...

    document.getElementById('test-reddit-api')?.addEventListener('click', testRedditApi);
    document.getElementById('test-twitter-api')?.addEventListener('click', testTwitterApi);
    document.getElementById('test-slack-api')?.addEventListener('click', testSlackApi);
});

// Utility functions
function showSuccessNotification(message) {
    const notification = document.createElement('div')
    notification.className = 'fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow-lg'
    notification.innerHTML = `<div class="flex items-center"><span class="material-icons mr-2">check_circle</span> ${message}</div>`
    document.body.appendChild(notification)
    setTimeout(() => notification.remove(), 3000)
}

function showErrorNotification(message) {
    const notification = document.createElement('div')
    notification.className = 'fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded shadow-lg'
    notification.innerHTML = `<div class="flex items-center"><span class="material-icons mr-2">error</span> ${message}</div>`
    document.body.appendChild(notification)
    setTimeout(() => notification.remove(), 5000)
}

// Show authentication screen
function showAuthScreen() {
    // Hide main content and show auth content
    document.getElementById('auth-content').style.display = 'block'
    document.getElementById('main-content').style.display = 'none'
    
    // Set up auth event listeners
    const loginTab = document.getElementById('login-tab')
    const registerTab = document.getElementById('register-tab')
    const loginForm = document.getElementById('login-form')
    const registerForm = document.getElementById('register-form')
    
    loginTab.addEventListener('click', () => {
        loginTab.classList.add('border-b-2', 'border-green-500', 'text-green-600', 'dark:text-green-400')
        loginTab.classList.remove('text-gray-500', 'dark:text-gray-400')
        registerTab.classList.remove('border-b-2', 'border-green-500', 'text-green-600', 'dark:text-green-400')
        registerTab.classList.add('text-gray-500', 'dark:text-gray-400')
        loginForm.classList.remove('hidden')
        registerForm.classList.add('hidden')
    })
    
    registerTab.addEventListener('click', () => {
        registerTab.classList.add('border-b-2', 'border-green-500', 'text-green-600', 'dark:text-green-400')
        registerTab.classList.remove('text-gray-500', 'dark:text-gray-400')
        loginTab.classList.remove('border-b-2', 'border-green-500', 'text-green-600', 'dark:text-green-400')
        loginTab.classList.add('text-gray-500', 'dark:text-gray-400')
        registerForm.classList.remove('hidden')
        loginForm.classList.add('hidden')
    })
    
    // Set up form submissions
    loginForm.addEventListener('submit', handleLogin)
    registerForm.addEventListener('submit', handleRegister)
    
    // Set up dark mode toggle
    const authDarkModeToggle = document.getElementById('auth-dark-toggle')
    if (authDarkModeToggle) {
        authDarkModeToggle.addEventListener('change', toggleDarkMode)
        
        // Set initial state based on system preference or saved preference
        const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches
        const savedDarkMode = localStorage.getItem('darkMode') === 'true'
        
        if (savedDarkMode || (localStorage.getItem('darkMode') === null && prefersDarkMode)) {
            document.documentElement.classList.add('dark')
            authDarkModeToggle.checked = true
        }
    }
}

// Toggle dark mode
function toggleDarkMode(e) {
    const isDarkMode = e.target.checked
    
    if (isDarkMode) {
        document.documentElement.classList.add('dark')
        localStorage.setItem('darkMode', 'true')
    } else {
        document.documentElement.classList.remove('dark')
        localStorage.setItem('darkMode', 'false')
    }
    
    // Keep both toggles in sync
    const otherToggle = e.target.id === 'dark-mode-toggle' ? 
        document.getElementById('auth-dark-toggle') : 
        document.getElementById('dark-mode-toggle')
        
    if (otherToggle) {
        otherToggle.checked = isDarkMode
    }
    
    // Update charts for better visibility in dark mode
    if (typeof updateChartsForColorMode === 'function') {
        updateChartsForColorMode()
    }
}

// Set up main application event listeners
function setupEventListeners() {
    // User menu dropdown
    const userMenuButton = document.getElementById('user-menu-button');
    const userDropdown = document.getElementById('user-dropdown');
    
    if (userMenuButton && userDropdown) {
        // Define the toggle function
        function toggleUserDropdown(e) {
            e.preventDefault();
            e.stopPropagation();
            
            // Toggle visibility using both class and direct style manipulation
            if (userDropdown.classList.contains('hidden')) {
                userDropdown.classList.remove('hidden');
                userDropdown.style.display = 'block';
                userDropdown.style.zIndex = '9999'; // Ensure high z-index
                userDropdown.style.position = 'absolute'; // Confirm absolute positioning
            } else {
                userDropdown.classList.add('hidden');
                userDropdown.style.display = 'none';
            }
            console.log('User dropdown toggled, current state:', !userDropdown.classList.contains('hidden'));
        }
        
        // Add click listener
        userMenuButton.addEventListener('click', toggleUserDropdown);
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!userMenuButton.contains(e.target) && !userDropdown.contains(e.target)) {
                userDropdown.classList.add('hidden');
                userDropdown.style.display = 'none';
            }
        });
    }
    
    // Logout button
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            try {
                await signOut();
                currentUser = null;
                showAuthScreen();
            } catch (error) {
                console.error('Error signing out:', error);
                showErrorNotification('Error signing out');
            }
        });
    }
    
    // Export/Import data
    const exportButton = document.getElementById('export-data-dropdown');
    if (exportButton) {
        exportButton.addEventListener('click', exportData);
    }
    
    const importButton = document.getElementById('import-data-dropdown');
    if (importButton) {
        importButton.addEventListener('click', showImportModal);
    }
    
    const closeImportModal = document.getElementById('close-import-modal');
    if (closeImportModal) {
        closeImportModal.addEventListener('click', () => {
            document.getElementById('import-modal').classList.add('hidden');
            document.getElementById('file-info').classList.add('hidden');
            document.getElementById('import-preview').classList.add('hidden');
            document.getElementById('import-data-btn').disabled = true;
            document.getElementById('import-message').classList.add('hidden');
            document.getElementById('import-error').classList.add('hidden');
        });
    }
    
    const importFile = document.getElementById('import-file');
    if (importFile) {
        importFile.addEventListener('change', handleFileSelection);
    }
    
    const importDataBtn = document.getElementById('import-data-btn');
    if (importDataBtn) {
        importDataBtn.addEventListener('click', importData);
    }
    
    // Content form
    const contentForm = document.getElementById('add-content-form');
    if (contentForm) {
        contentForm.addEventListener('submit', handleContentFormSubmit);
        
        // URL field validation
        const contentUrlField = document.getElementById('add-content-url');
        if (contentUrlField) {
            contentUrlField.addEventListener('blur', checkForDuplicateUrl);
        }
        
        // Fetch content info button
        const fetchInfoButton = document.getElementById('add-fetch-content-info');
        if (fetchInfoButton) {
            fetchInfoButton.addEventListener('click', fetchContentInfo);
        }
    }
    
    // Data actions
    const refreshDataBtn = document.getElementById('refresh-data');
    if (refreshDataBtn) {
        refreshDataBtn.addEventListener('click', refreshEngagementData);
    }
    
    const refreshAllDataBtn = document.getElementById('refresh-all-data');
    if (refreshAllDataBtn) {
        refreshAllDataBtn.addEventListener('click', refreshEngagementData);
    }
    
    // Settings and modals
    const apiSettingsSection = document.getElementById('api-settings');
    const showSettingsBtn = document.getElementById('show-settings-link');
    const hideSettingsBtn = document.getElementById('hide-settings');
    
    if (showSettingsBtn && apiSettingsSection && userDropdown) {
        showSettingsBtn.addEventListener('click', () => {
            apiSettingsSection.classList.remove('hidden');
            userDropdown.classList.add('hidden');
        });
    }
    
    if (hideSettingsBtn && apiSettingsSection) {
        hideSettingsBtn.addEventListener('click', () => {
            apiSettingsSection.classList.add('hidden');
        });
    }
    
    // Rest of the existing event listeners...
}

// Show user profile
function showUserProfile() {
    document.getElementById('profile-modal').classList.remove('hidden')
    document.getElementById('user-dropdown').classList.add('hidden')
    
    // Populate profile data
    document.getElementById('profile-name').textContent = currentUser.name
    document.getElementById('profile-email').textContent = currentUser.email
    document.getElementById('profile-display-name').value = currentUser.name
    
    // Update stats
    document.getElementById('profile-content-count').textContent = contentItems.length.toLocaleString()
    
    const totalViews = Object.values(engagementData.reduce((acc, curr) => {
        if (!acc[curr.content_id] || new Date(acc[curr.content_id].timestamp) < new Date(curr.timestamp)) {
            acc[curr.content_id] = curr
        }
        return acc
    }, {})).reduce((sum, data) => sum + data.views, 0)
    
    document.getElementById('profile-views-count').textContent = totalViews.toLocaleString()
    document.getElementById('profile-member-since').textContent = 
        new Date(currentUser.created_at).toLocaleDateString()
}

// Save user profile
async function saveUserProfile() {
    try {
        const newName = document.getElementById('profile-display-name').value.trim()
        const currentPassword = document.getElementById('profile-current-password').value
        const newPassword = document.getElementById('profile-new-password').value
        
        // Update name if changed
        if (newName !== currentUser.name) {
            const { error: updateError } = await supabase
                .from('users')
                .update({ name: newName })
                .eq('id', currentUser.id)
            
            if (updateError) throw updateError
            currentUser.name = newName
        }
        
        // Update password if provided
        if (currentPassword && newPassword) {
            const { error } = await supabase.auth.updateUser({
                password: newPassword
            })
            
            if (error) throw error
        }
        
        // Update UI
        document.getElementById('current-user-name').textContent = currentUser.name
        document.getElementById('profile-name').textContent = currentUser.name
        
        // Clear password fields
        document.getElementById('profile-current-password').value = ''
        document.getElementById('profile-new-password').value = ''
        
        showSuccessNotification('Profile updated successfully')
    } catch (error) {
        console.error('Error updating profile:', error)
        showErrorNotification(`Error updating profile: ${error.message}`)
    }
}

async function confirmDeleteAccount() {
    if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
        try {
            const { error } = await supabase.auth.admin.deleteUser(currentUser.id)
            if (error) throw error
            
            await signOut()
            currentUser = null
            showAuthScreen()
            showSuccessNotification('Account deleted successfully')
        } catch (error) {
            console.error('Error deleting account:', error)
            showErrorNotification(`Error deleting account: ${error.message}`)
        }
    }
}

// Rebuild URL to content map
function rebuildUrlContentMap() {
    urlToContentMap = {}
    contentItems.forEach(item => {
        const normalizedUrl = normalizeUrl(item.url)
        urlToContentMap[normalizedUrl] = item.id
    })
}

// Update API configuration UI
function updateApiConfigUI() {
    // YouTube
    if (apiConfig.youtube.apiKey) {
        document.getElementById('youtube-api-key').value = apiConfig.youtube.apiKey
        document.getElementById('youtube-api-status').textContent = 'Configured'
        document.getElementById('youtube-api-status').className = 
            'badge bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 ml-2'
    }
    
    // ServiceNow
    if (apiConfig.servicenow.instance) {
        document.getElementById('servicenow-instance').value = apiConfig.servicenow.instance
        document.getElementById('servicenow-username').value = apiConfig.servicenow.username
        document.getElementById('servicenow-password').value = apiConfig.servicenow.password
        document.getElementById('servicenow-api-status').textContent = 'Configured'
        document.getElementById('servicenow-api-status').className = 
            'badge bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 ml-2'
    }
    
    // LinkedIn
    if (apiConfig.linkedin.clientId) {
        document.getElementById('linkedin-client-id').value = apiConfig.linkedin.clientId
        document.getElementById('linkedin-client-secret').value = apiConfig.linkedin.clientSecret
        document.getElementById('linkedin-api-status').textContent = 'Configured'
        document.getElementById('linkedin-api-status').className = 
            'badge bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 ml-2'
    }
}

// Set up collapsible sections
function setupCollapsibleSections() {
    // Add content section
    const addContentToggle = document.getElementById('toggle-add-content')
    const addContentBody = document.getElementById('add-content-body')
    const addContentIcon = addContentToggle.querySelector('.material-icons')
    
    addContentToggle.addEventListener('click', () => {
        addContentBody.classList.toggle('hidden')
        addContentIcon.classList.toggle('rotate-180')
    })
    
    // Content library section
    const contentLibraryToggle = document.getElementById('toggle-content-library')
    const contentLibraryBody = document.getElementById('content-library-body')
    const contentLibraryIcon = contentLibraryToggle.querySelector('.material-icons')
    
    contentLibraryToggle.addEventListener('click', () => {
        contentLibraryBody.classList.toggle('hidden')
        contentLibraryIcon.classList.toggle('rotate-180')
    })
    
    // Engagement data section
    const engagementDataToggle = document.getElementById('toggle-engagement-data')
    const engagementDataBody = document.getElementById('engagement-data-body')
    const engagementDataIcon = engagementDataToggle.querySelector('.material-icons')
    
    engagementDataToggle.addEventListener('click', () => {
        engagementDataBody.classList.toggle('hidden')
        engagementDataIcon.classList.toggle('rotate-180')
    })
    
    // Initially expand all sections
    addContentBody.classList.remove('hidden')
    contentLibraryBody.classList.remove('hidden')
    engagementDataBody.classList.remove('hidden')
}

// Initialize the app when the page loads
window.addEventListener('DOMContentLoaded', initApp) 

function renderEngagementChart(contentId, dataPoints) {
    return `
        <div class="mt-6">
            <canvas id="engagement-chart-${contentId}" class="w-full"></canvas>
        </div>
    `;
}

function initializeCharts(contentId, dataPoints) {
    // Sort data points by timestamp (oldest first for charts)
    dataPoints.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const labels = dataPoints.map(d => new Date(d.timestamp).toLocaleDateString());
    const views = dataPoints.map(d => d.views);
    const likes = dataPoints.map(d => d.likes);
    const comments = dataPoints.map(d => d.comments);
    const shares = dataPoints.map(d => d.shares);

    const ctx = document.getElementById(`engagement-chart-${contentId}`).getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Views',
                    data: views,
                    borderColor: 'rgb(59, 130, 246)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.1
                },
                {
                    label: 'Likes',
                    data: likes,
                    borderColor: 'rgb(16, 185, 129)',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.1
                },
                {
                    label: 'Comments',
                    data: comments,
                    borderColor: 'rgb(245, 158, 11)',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    tension: 0.1
                },
                {
                    label: 'Shares',
                    data: shares,
                    borderColor: 'rgb(139, 92, 246)',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                },
                title: {
                    display: true,
                    text: 'Engagement Trends'
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

function updatePlatformChart() {
    const platformStats = contentItems.reduce((acc, item) => {
        acc[item.type] = (acc[item.type] || 0) + 1;
        return acc;
    }, {});

    const platformColors = {
        youtube: 'rgb(255, 0, 0)',
        servicenow: 'rgb(81, 40, 136)',
        linkedin: 'rgb(0, 119, 181)',
        reddit: 'rgb(255, 69, 0)',
        twitter: 'rgb(29, 161, 242)',
        slack: 'rgb(74, 21, 75)'
    };

    const platformLabels = {
        youtube: 'YouTube',
        servicenow: 'ServiceNow',
        linkedin: 'LinkedIn',
        reddit: 'Reddit',
        twitter: 'Twitter',
        slack: 'Slack'
    };

    const ctx = document.getElementById('platform-chart').getContext('2d');
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(platformStats).map(type => platformLabels[type]),
            datasets: [{
                data: Object.values(platformStats),
                backgroundColor: Object.keys(platformStats).map(type => platformColors[type]),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'right',
                },
                title: {
                    display: true,
                    text: 'Content Distribution by Platform'
                }
            }
        }
    });
}

// Render trends chart
function renderTrendsChart() {
    const canvas = document.getElementById('trends-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Group engagement data by date
    const dailyStats = engagementData.reduce((acc, data) => {
        const date = new Date(data.timestamp).toLocaleDateString();
        if (!acc[date]) {
            acc[date] = {
                views: 0,
                likes: 0,
                comments: 0,
                shares: 0,
                watchTime: 0
            };
        }
        acc[date].views += data.views || 0;
        acc[date].likes += data.likes || 0;
        acc[date].comments += data.comments || 0;
        acc[date].shares += data.shares || 0;
        acc[date].watchTime += data.watch_time || 0;
        return acc;
    }, {});

    const dates = Object.keys(dailyStats).sort((a, b) => new Date(a) - new Date(b));
    
    // Destroy existing chart if it exists
    if (window.trendsChart) {
        window.trendsChart.destroy();
    }
    
    window.trendsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [
                {
                    label: 'Views',
                    data: dates.map(date => dailyStats[date].views),
                    borderColor: 'rgb(59, 130, 246)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.1,
                    yAxisID: 'y'
                },
                {
                    label: 'Watch Time (hours)',
                    data: dates.map(date => dailyStats[date].watchTime),
                    borderColor: 'rgb(16, 185, 129)',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.1,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: document.documentElement.classList.contains('dark') ? '#fff' : '#000'
                    }
                },
                title: {
                    display: true,
                    text: 'Daily Engagement Trends'
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Views'
                    },
                    ticks: {
                        color: document.documentElement.classList.contains('dark') ? '#fff' : '#000'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Watch Time (hours)'
                    },
                    grid: {
                        drawOnChartArea: false
                    },
                    ticks: {
                        color: document.documentElement.classList.contains('dark') ? '#fff' : '#000'
                    }
                },
                x: {
                    ticks: {
                        color: document.documentElement.classList.contains('dark') ? '#fff' : '#000'
                    }
                }
            }
        }
    });
}

// Export data functionality
async function exportData() {
    try {
        // Prepare data for export
        const exportData = {
            version: '1.0',
            timestamp: new Date().toISOString(),
            user: {
                id: currentUser.id,
                name: currentUser.name,
                email: currentUser.email
            },
            content: contentItems,
            engagement: engagementData,
            apiConfig: apiConfig
        };
        
        // Convert to JSON and create blob
        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        
        // Create download link
        const downloadLink = document.createElement('a');
        downloadLink.href = URL.createObjectURL(blob);
        downloadLink.download = `platform-engagement-export-${new Date().toISOString().split('T')[0]}.json`;
        
        // Trigger download
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        
        // Close dropdown
        document.getElementById('user-dropdown').classList.add('hidden');
        
        showSuccessNotification('Data exported successfully');
    } catch (error) {
        console.error('Error exporting data:', error);
        showErrorNotification('Error exporting data: ' + error.message);
    }
}

// Show the import modal
function showImportModal() {
    document.getElementById('import-modal').classList.remove('hidden');
    document.getElementById('user-dropdown').classList.add('hidden');
    document.getElementById('import-file').value = '';
    document.getElementById('file-info').classList.add('hidden');
    document.getElementById('import-preview').classList.add('hidden');
    document.getElementById('import-data-btn').disabled = true;
    document.getElementById('import-message').classList.add('hidden');
    document.getElementById('import-error').classList.add('hidden');
}

// Handle file selection for import
function handleFileSelection(event) {
    const file = event.target.files[0];
    const fileInfo = document.getElementById('file-info');
    const previewElement = document.getElementById('import-preview');
    const importButton = document.getElementById('import-data-btn');
    const importError = document.getElementById('import-error');
    
    if (!file) {
        fileInfo.classList.add('hidden');
        previewElement.classList.add('hidden');
        importButton.disabled = true;
        return;
    }
    
    // Check file type
    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
        fileInfo.textContent = 'Error: Please select a valid JSON file.';
        fileInfo.classList.remove('hidden');
        fileInfo.classList.add('text-red-500');
        previewElement.classList.add('hidden');
        importButton.disabled = true;
        return;
    }
    
    // Show file info
    fileInfo.textContent = `Selected file: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`;
    fileInfo.classList.remove('hidden', 'text-red-500');
    fileInfo.classList.add('text-green-500');
    
    // Read file content
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            
            // Validate data structure
            if (!data.content || !data.engagement || !data.user) {
                throw new Error('Invalid data format');
            }
            
            // Store data for import
            window.importData = data;
            
            // Show preview
            document.getElementById('preview-content-count').textContent = data.content.length.toLocaleString();
            document.getElementById('preview-engagement-count').textContent = data.engagement.length.toLocaleString();
            document.getElementById('preview-export-date').textContent = new Date(data.timestamp).toLocaleString();
            document.getElementById('preview-user').textContent = data.user.name || data.user.email;
            
            previewElement.classList.remove('hidden');
            importButton.disabled = false;
            importError.classList.add('hidden');
        } catch (error) {
            console.error('Error parsing import file:', error);
            fileInfo.textContent = 'Error: Invalid JSON format or unsupported data structure.';
            fileInfo.classList.remove('text-green-500');
            fileInfo.classList.add('text-red-500');
            previewElement.classList.add('hidden');
            importButton.disabled = true;
        }
    };
    
    reader.readAsText(file);
}

// Import data from the selected file
async function importData() {
    if (!window.importData) {
        showErrorNotification('No import data available');
        return;
    }
    
    const importOption = document.querySelector('input[name="import-option"]:checked').value;
    const importButton = document.getElementById('import-data-btn');
    const importMessage = document.getElementById('import-message');
    const importError = document.getElementById('import-error');
    
    try {
        // Show loading state
        importButton.disabled = true;
        const originalText = importButton.innerHTML;
        importButton.innerHTML = '<span class="material-icons animate-spin">refresh</span> Importing...';
        
        if (importOption === 'replace') {
            // Clear existing data if replace option is selected
            await clearUserData();
        }
        
        // Import content items
        for (const item of window.importData.content) {
            // Skip if this content already exists (by URL) and we're merging
            const normalizedUrl = normalizeUrl(item.url);
            if (importOption === 'merge' && urlToContentMap[normalizedUrl]) {
                continue;
            }
            
            // Make sure the item has the current user's ID
            const contentData = {
                ...item,
                user_id: currentUser.id,
                id: undefined  // Remove any existing ID to create a new record
            };
            
            // Add to database
            const newItem = await addContent(contentData);
            contentItems.push(newItem);
        }
        
        // Rebuild URL map
        rebuildUrlContentMap();
        
        // Import engagement data
        for (const engagement of window.importData.engagement) {
            // Find the corresponding content item
            const originalContentId = engagement.content_id;
            const originalContent = window.importData.content.find(c => c.id === originalContentId);
            
            if (!originalContent) continue;
            
            // Find the new content ID for this URL
            const normalizedUrl = normalizeUrl(originalContent.url);
            const newContentId = urlToContentMap[normalizedUrl];
            if (!newContentId) continue;
            
            // Create new engagement record with the new content ID
            const engagementData = {
                ...engagement,
                id: undefined,  // Remove any existing ID
                content_id: newContentId,
                timestamp: engagement.timestamp || new Date().toISOString()
            };
            
            // Add to database
            const newEngagement = await addEngagementData(engagementData);
            engagementData.push(newEngagement);
        }
        
        // Import API configuration if available
        if (window.importData.apiConfig) {
            for (const [platform, config] of Object.entries(window.importData.apiConfig)) {
                if (!config || Object.keys(config).length === 0) continue;
                
                apiConfig[platform] = config;
                await saveApiConfig(currentUser.id, platform, config);
            }
            
            updateApiConfigUI();
        }
        
        // Reload and render data
        await loadUserData();
        
        // Show success message
        importMessage.textContent = 'Import completed successfully!';
        importMessage.classList.remove('hidden');
        
        // Clear import data
        window.importData = null;
        
        showSuccessNotification('Data imported successfully');
    } catch (error) {
        console.error('Error importing data:', error);
        importError.textContent = 'Error importing data: ' + error.message;
        importError.classList.remove('hidden');
        importMessage.classList.add('hidden');
        showErrorNotification('Error importing data: ' + error.message);
    } finally {
        // Reset button state
        importButton.disabled = false;
        importButton.innerHTML = '<span class="material-icons mr-1">upload</span> Import Data';
    }
}

// Helper function to clear all user data
async function clearUserData() {
    // Delete all content items (will cascade delete engagement data due to foreign key)
    for (const item of contentItems) {
        await deleteContent(item.id);
    }
    
    // Clear local data
    contentItems = [];
    engagementData = [];
    urlToContentMap = {};
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', initApp);

// Normalize URL to prevent duplicates
function normalizeUrl(url) {
    try {
        const urlObj = new URL(url);
        // Remove common tracking parameters
        urlObj.searchParams.delete('utm_source');
        urlObj.searchParams.delete('utm_medium');
        urlObj.searchParams.delete('utm_campaign');
        urlObj.searchParams.delete('utm_content');
        urlObj.searchParams.delete('utm_term');
        urlObj.searchParams.delete('feature');
        // Remove hash
        urlObj.hash = '';
        return urlObj.toString();
    } catch (e) {
        // If URL parsing fails, return original
        return url;
    }
}

// Check for duplicate URL
function checkForDuplicateUrl() {
    const contentUrl = document.getElementById('add-content-url').value;
    const warningElement = document.getElementById('add-duplicate-warning');
    
    if (!contentUrl) {
        warningElement.classList.add('hidden');
        return;
    }
    
    try {
        const normalizedUrl = normalizeUrl(contentUrl);
        const isDuplicate = contentItems.some(item => normalizeUrl(item.url) === normalizedUrl);
        
        if (isDuplicate) {
            warningElement.classList.remove('hidden');
        } else {
            warningElement.classList.add('hidden');
        }
    } catch (error) {
        console.error('Error checking URL:', error);
        warningElement.classList.add('hidden');
    }
}

// Extract content ID from URL based on platform
function extractContentId(url, platform) {
    try {
        const urlObj = new URL(url);
        
        switch (platform.toLowerCase()) {
            case 'youtube':
                // YouTube URLs can be in formats:
                // https://www.youtube.com/watch?v=VIDEO_ID
                // https://youtu.be/VIDEO_ID
                // https://www.youtube.com/embed/VIDEO_ID
                if (urlObj.hostname.includes('youtu.be')) {
                    return urlObj.pathname.substring(1);
                } else if (urlObj.searchParams.has('v')) {
                    return urlObj.searchParams.get('v');
                } else if (urlObj.pathname.includes('/embed/')) {
                    return urlObj.pathname.split('/embed/')[1];
                }
                break;
                
            case 'linkedin':
                // LinkedIn post URLs typically contain an activity ID
                // https://www.linkedin.com/posts/username_activity-ACTIVITY_ID
                if (urlObj.pathname.includes('/posts/')) {
                    const match = urlObj.pathname.match(/activity-(\d+)/);
                    if (match && match[1]) return match[1];
                }
                
                // For articles
                if (urlObj.pathname.includes('/pulse/')) {
                    return urlObj.pathname.split('/pulse/')[1];
                }
                break;
                
            case 'twitter':
                // Twitter URLs: https://twitter.com/username/status/TWEET_ID
                if (urlObj.pathname.includes('/status/')) {
                    return urlObj.pathname.split('/status/')[1];
                }
                break;
                
            case 'reddit':
                // Reddit URLs: https://www.reddit.com/r/subreddit/comments/POST_ID/
                if (urlObj.pathname.includes('/comments/')) {
                    const parts = urlObj.pathname.split('/');
                    const index = parts.indexOf('comments');
                    if (index !== -1 && parts.length > index + 1) {
                        return parts[index + 1];
                    }
                }
                break;
                
            case 'servicenow':
                // ServiceNow community URLs might have post IDs
                if (urlObj.pathname.includes('/now-community/')) {
                    return urlObj.pathname.split('/').pop();
                }
                break;
                
            case 'slack':
                // Slack URLs with message IDs
                if (urlObj.hash && urlObj.hash.includes('thread_')) {
                    return urlObj.hash.split('thread_')[1];
                }
                break;
        }
        
        // If we can't extract a specific ID, use a hash of the URL
        return btoa(url).replace(/[/+=]/g, '').substring(0, 16);
        
    } catch (e) {
        // If URL parsing fails, generate a random ID
        console.error('Error extracting content ID:', e);
        return Math.random().toString(36).substring(2, 15);
    }
}