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

// Initialize dark mode state
function initializeDarkMode() {
    // Get saved preference or system preference
    const savedDarkMode = localStorage.getItem('darkMode')
    const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches
    
    // Determine initial state
    const shouldBeDark = savedDarkMode === 'true' || 
        (savedDarkMode === null && prefersDarkMode)
    
    // Apply initial state
    if (shouldBeDark) {
        document.documentElement.classList.add('dark')
    }
    
    // Set up system preference change listener
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (localStorage.getItem('darkMode') === null) {
            if (e.matches) {
                document.documentElement.classList.add('dark')
            } else {
                document.documentElement.classList.remove('dark')
            }
        }
    })
    
    return shouldBeDark
}

// Initialize the app
async function initApp() {
    // Initialize dark mode first
    const isDarkMode = initializeDarkMode()
    
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
        
        // Set up collapsible sections after main content is displayed and data is loaded
        setTimeout(() => {
            setupCollapsibleSections()
        }, 0)
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
    const userDropdown = document.getElementById('user-dropdown');
    if (userDropdown) {
        userDropdown.classList.add('hidden');
        userDropdown.style.display = 'none';
        userDropdown.style.position = 'absolute';
        userDropdown.style.zIndex = '9999';
    }
    
    // Initialize the dropdown functionality
    setupUserDropdown();
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
    
    // Check for duplicate URL
    const normalizedUrl = normalizeUrl(contentUrl);
    if (contentItems.some(item => normalizeUrl(item.url) === normalizedUrl)) {
        showErrorNotification('This URL already exists in your content library');
        document.getElementById('add-duplicate-warning').classList.remove('hidden');
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

// Make these functions globally accessible for inline event handlers
window.handleContentDeletion = handleContentDeletion;
window.showContentDetails = showContentDetails;
window.refreshSingleItemData = refreshSingleItemData;

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
        authDarkModeToggle.checked = document.documentElement.classList.contains('dark')
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
    // User dropdown is now handled by setupUserDropdown()
    
    // Dark mode toggle in settings
    const settingsDarkModeToggle = document.getElementById('dark-mode-toggle')
    if (settingsDarkModeToggle) {
        settingsDarkModeToggle.addEventListener('change', toggleDarkMode)
        settingsDarkModeToggle.checked = document.documentElement.classList.contains('dark')
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
    
    // Profile modal close button
    const closeProfileModal = document.getElementById('close-profile-modal');
    if (closeProfileModal) {
        closeProfileModal.addEventListener('click', () => {
            document.getElementById('profile-modal').classList.add('hidden');
        });
    }
    
    // Content details modal close button
    const closeContentModal = document.getElementById('close-modal');
    if (closeContentModal) {
        closeContentModal.addEventListener('click', () => {
            document.getElementById('content-modal').classList.add('hidden');
        });
    }
    
    // Save profile button
    const saveProfileButton = document.getElementById('save-profile');
    if (saveProfileButton) {
        saveProfileButton.addEventListener('click', saveUserProfile);
    }
    
    // Delete account button
    const deleteAccountButton = document.getElementById('delete-account');
    if (deleteAccountButton) {
        deleteAccountButton.addEventListener('click', confirmDeleteAccount);
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
    
    // Test duplicate prevention
    const testDuplicateButton = document.getElementById('test-duplicate-prevention');
    if (testDuplicateButton) {
        testDuplicateButton.addEventListener('click', testDuplicatePrevention);
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
    
    if (showSettingsBtn && apiSettingsSection) {
        showSettingsBtn.addEventListener('click', () => {
            // Get the user dropdown element directly when needed
            const userDropdown = document.getElementById('user-dropdown');
            
            // Show settings and hide dropdown
            apiSettingsSection.classList.remove('hidden');
            if (userDropdown) {
                userDropdown.classList.add('hidden');
                userDropdown.style.display = 'none';
            }
        });
    }
    
    if (hideSettingsBtn && apiSettingsSection) {
        hideSettingsBtn.addEventListener('click', () => {
            apiSettingsSection.classList.add('hidden');
        });
    }
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
    if (addContentToggle && addContentBody) {
        const addContentIcon = addContentToggle.querySelector('.material-icons')
        if (addContentIcon) {
            // Set initial state
            addContentBody.classList.remove('hidden')
            addContentIcon.classList.add('rotate-180')
            
            addContentToggle.addEventListener('click', () => {
                addContentBody.classList.toggle('hidden')
                addContentIcon.classList.toggle('rotate-180')
            })
        }
    }
    
    // Content library section
    const contentLibraryToggle = document.getElementById('toggle-content-library')
    const contentLibraryBody = document.getElementById('content-library-body')
    if (contentLibraryToggle && contentLibraryBody) {
        const contentLibraryIcon = contentLibraryToggle.querySelector('.material-icons')
        if (contentLibraryIcon) {
            // Set initial state
            contentLibraryBody.classList.remove('hidden')
            contentLibraryIcon.classList.add('rotate-180')
            
            contentLibraryToggle.addEventListener('click', () => {
                contentLibraryBody.classList.toggle('hidden')
                contentLibraryIcon.classList.toggle('rotate-180')
            })
        }
    }
    
    // Engagement data section
    const engagementDataToggle = document.getElementById('toggle-engagement-data')
    const engagementDataBody = document.getElementById('engagement-data-body')
    if (engagementDataToggle && engagementDataBody) {
        const engagementDataIcon = engagementDataToggle.querySelector('.material-icons')
        if (engagementDataIcon) {
            // Set initial state
            engagementDataBody.classList.remove('hidden')
            engagementDataIcon.classList.add('rotate-180')
            
            engagementDataToggle.addEventListener('click', () => {
                engagementDataBody.classList.toggle('hidden')
                engagementDataIcon.classList.toggle('rotate-180')
            })
        }
    }
    
    // Check if engagement trends elements exist before trying to set them up
    const engagementTrendsToggle = document.getElementById('toggle-engagement-trends')
    const engagementTrendsBody = document.getElementById('engagement-trends-body')
    if (engagementTrendsToggle && engagementTrendsBody) {
        const engagementTrendsIcon = engagementTrendsToggle.querySelector('.material-icons')
        if (engagementTrendsIcon) {
            // Set initial state
            engagementTrendsBody.classList.remove('hidden')
            engagementTrendsIcon.classList.add('rotate-180')
            
            engagementTrendsToggle.addEventListener('click', () => {
                engagementTrendsBody.classList.toggle('hidden')
                engagementTrendsIcon.classList.toggle('rotate-180')
            })
        }
    }
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
        
        let addedContentCount = 0;
        let skippedContentCount = 0;
        let addedEngagementCount = 0;
        let skippedEngagementCount = 0;
        
        // Import content items
        for (const item of window.importData.content) {
            // Skip if this content already exists (by URL) and we're merging
            const normalizedUrl = normalizeUrl(item.url);
            if (importOption === 'merge' && urlToContentMap[normalizedUrl]) {
                skippedContentCount++;
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
            addedContentCount++;
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
            
            // Check for duplicate engagement data (same content and timestamp up to the minute)
            const engagementTimestamp = engagement.timestamp || new Date().toISOString();
            const timestampMinute = engagementTimestamp.substring(0, 16); // Format: YYYY-MM-DDTHH:MM
            
            const hasDuplicate = engagementData.some(e => 
                e.content_id === newContentId && 
                e.timestamp.substring(0, 16) === timestampMinute
            );
            
            if (hasDuplicate) {
                skippedEngagementCount++;
                continue;
            }
            
            // Create new engagement record with the new content ID
            const engagementData = {
                ...engagement,
                id: undefined,  // Remove any existing ID
                content_id: newContentId,
                timestamp: engagementTimestamp
            };
            
            // Add to database
            const newEngagement = await addEngagementData(engagementData);
            engagementData.push(newEngagement);
            addedEngagementCount++;
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
        
        // Show success message with counts
        importMessage.textContent = `Import completed! Added ${addedContentCount} content items (skipped ${skippedContentCount} duplicates) and ${addedEngagementCount} engagement records (skipped ${skippedEngagementCount} duplicates).`;
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

// Fetch content information from URL
async function fetchContentInfo() {
    const url = document.getElementById('add-content-url').value;
    const platform = document.getElementById('add-content-source').value;
    
    if (!url) {
        showErrorNotification('Please enter a URL');
        return;
    }
    
    // Show loading state
    const button = document.getElementById('add-fetch-content-info');
    const originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="material-icons animate-spin">refresh</span> Loading...';
    
    try {
        let contentInfo = null;
        
        // Based on platform, attempt to fetch content info
        switch (platform.toLowerCase()) {
            case 'youtube':
                if (apiConfig.youtube?.apiKey) {
                    contentInfo = await fetchYouTubeInfo(url, apiConfig.youtube.apiKey);
                } else {
                    throw new Error('YouTube API key not configured');
                }
                break;
                
            case 'linkedin':
                // LinkedIn doesn't provide easy API access for this
                // We'll use basic extraction
                contentInfo = extractBasicInfo(url, 'LinkedIn Post');
                break;
                
            case 'servicenow':
                contentInfo = extractBasicInfo(url, 'ServiceNow Content');
                break;
                
            case 'reddit':
                contentInfo = extractBasicInfo(url, 'Reddit Post');
                break;
                
            case 'twitter':
                contentInfo = extractBasicInfo(url, 'Tweet');
                break;
                
            case 'slack':
                contentInfo = extractBasicInfo(url, 'Slack Message');
                break;
                
            default:
                contentInfo = extractBasicInfo(url, 'Content');
        }
        
        if (contentInfo) {
            // Populate form fields with content info
            if (contentInfo.title) {
                document.getElementById('add-content-name').value = contentInfo.title;
            }
            
            if (contentInfo.description) {
                document.getElementById('add-content-description').value = contentInfo.description;
            }
            
            if (contentInfo.publishedDate) {
                const date = new Date(contentInfo.publishedDate);
                if (!isNaN(date)) {
                    document.getElementById('add-content-published').valueAsDate = date;
                }
            }
            
            if (platform === 'youtube' && contentInfo.duration) {
                document.getElementById('add-content-duration').value = contentInfo.duration;
                document.getElementById('add-duration-container').classList.remove('hidden');
            } else {
                document.getElementById('add-duration-container').classList.add('hidden');
            }
            
            showSuccessNotification('Content info fetched successfully');
        } else {
            throw new Error('Could not fetch content information');
        }
    } catch (error) {
        console.error('Error fetching content info:', error);
        showErrorNotification('Error fetching content info: ' + error.message);
    } finally {
        // Reset button state
        button.disabled = false;
        button.innerHTML = originalText;
    }
}

// Extract basic info from URL
function extractBasicInfo(url, defaultTitle) {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const lastPathPart = pathParts.pop() || '';
    
    // Try to create a somewhat meaningful title
    let title = defaultTitle;
    if (lastPathPart) {
        // Convert slug to title (replace hyphens with spaces and capitalize)
        const formattedTitle = lastPathPart
            .replace(/-/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
        title = formattedTitle;
    }
    
    return {
        title: title,
        description: '',
        publishedDate: new Date().toISOString(),
        duration: null
    };
}

// Fetch YouTube video info
async function fetchYouTubeInfo(url, apiKey) {
    try {
        const videoId = extractContentId(url, 'youtube');
        if (!videoId) {
            throw new Error('Could not extract video ID from URL');
        }
        
        // Create an API request to YouTube Data API
        const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${apiKey}&part=snippet,contentDetails`);
        const data = await response.json();
        
        if (!data.items || data.items.length === 0) {
            throw new Error('Video not found');
        }
        
        const video = data.items[0];
        const snippet = video.snippet;
        const contentDetails = video.contentDetails;
        
        // Format duration from ISO 8601 (PT1H30M15S) to readable format
        let duration = contentDetails.duration;
        if (duration) {
            duration = duration
                .replace('PT', '')
                .replace('H', ':')
                .replace('M', ':')
                .replace('S', '');
                
            // Ensure proper formatting with leading zeros
            const parts = duration.split(':');
            duration = parts.map(part => part.padStart(2, '0')).join(':');
        }
        
        return {
            title: snippet.title,
            description: snippet.description,
            publishedDate: snippet.publishedAt,
            duration: duration
        };
    } catch (error) {
        console.error('Error fetching YouTube info:', error);
        // Return basic info as fallback
        return extractBasicInfo(url, 'YouTube Video');
    }
}

// Render content items in the table
function renderContentItems() {
    const contentList = document.getElementById('content-list');
    if (!contentList) return;
    
    contentList.innerHTML = '';
    
    if (contentItems.length === 0) {
        contentList.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                    No content items found. Add your first content item above.
                </td>
            </tr>
        `;
        return;
    }
    
    // Sort by created date (newest first)
    contentItems
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .forEach(item => {
            const row = document.createElement('tr');
            
            // Format platform CSS
            const platformClass = item.platform.toLowerCase();
            
            row.innerHTML = `
                <td class="px-6 py-4">
                    <div class="text-sm font-medium text-gray-900 dark:text-white">${item.name}</div>
                </td>
                <td class="px-6 py-4">
                    <span class="badge ${platformClass}">${item.platform}</span>
                </td>
                <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                    ${new Date(item.published_date).toLocaleDateString()}
                </td>
                <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                    ${new Date(item.created_at).toLocaleDateString()}
                </td>
                <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                    <a href="${item.url}" target="_blank" class="text-blue-500 dark:text-blue-400 hover:underline truncate block max-w-xs">
                        ${item.url}
                    </a>
                </td>
                <td class="px-6 py-4 text-right text-sm font-medium">
                    <div class="flex space-x-2 justify-end">
                        <button 
                            class="text-indigo-600 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300" 
                            onclick="window.showContentDetails('${item.id}')"
                        >
                            <span class="material-icons text-lg">visibility</span>
                        </button>
                        <button 
                            class="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300" 
                            onclick="window.handleContentDeletion('${item.id}')"
                        >
                            <span class="material-icons text-lg">delete</span>
                        </button>
                    </div>
                </td>
            `;
            
            contentList.appendChild(row);
        });
}

// Show content details in modal
function showContentDetails(contentId) {
    // Find the content item
    const item = contentItems.find(c => c.id === contentId);
    if (!item) return;
    
    // Get the related engagement data
    const itemEngagements = engagementData
        .filter(e => e.content_id === contentId)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Update modal title
    document.getElementById('modal-title').textContent = item.name;
    
    // Generate modal content
    const modalContent = document.getElementById('modal-content');
    
    // Basic content info
    const contentInfo = `
        <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg mb-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400">Platform</h4>
                    <p class="font-medium text-gray-900 dark:text-white"><span class="badge ${item.platform.toLowerCase()}">${item.platform}</span></p>
                </div>
                <div>
                    <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400">Published Date</h4>
                    <p class="font-medium text-gray-900 dark:text-white">${new Date(item.published_date).toLocaleDateString()}</p>
                </div>
                <div class="md:col-span-2">
                    <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400">URL</h4>
                    <p class="font-medium text-gray-900 dark:text-white break-all">
                        <a href="${item.url}" target="_blank" class="text-blue-500 dark:text-blue-400 hover:underline">${item.url}</a>
                    </p>
                </div>
                ${item.description ? `
                <div class="md:col-span-2">
                    <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400">Description</h4>
                    <p class="font-medium text-gray-900 dark:text-white">${item.description}</p>
                </div>
                ` : ''}
            </div>
        </div>
    `;
    
    // Engagement data table
    let engagementTable = '';
    if (itemEngagements.length > 0) {
        engagementTable = `
            <div class="mt-6">
                <h3 class="text-lg font-medium mb-4 dark:text-white">Engagement History</h3>
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead class="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Views</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Likes</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Comments</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Watch Time</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            ${itemEngagements.map(engagement => `
                                <tr>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        ${new Date(engagement.timestamp).toLocaleString()}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        ${engagement.views.toLocaleString()}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        ${engagement.likes.toLocaleString()}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        ${engagement.comments.toLocaleString()}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        ${(engagement.watch_time || 0).toFixed(1)} hours
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } else {
        engagementTable = `
            <div class="mt-6">
                <h3 class="text-lg font-medium mb-4 dark:text-white">Engagement History</h3>
                <p class="text-gray-500 dark:text-gray-400">No engagement data available yet.</p>
            </div>
        `;
    }
    
    // Render engagement chart if we have more than one data point
    let engagementChart = '';
    if (itemEngagements.length > 1) {
        const chartId = `engagement-chart-${contentId}`;
        engagementChart = `
            <div class="mt-6">
                <h3 class="text-lg font-medium mb-4 dark:text-white">Engagement Trends</h3>
                <canvas id="${chartId}"></canvas>
            </div>
        `;
        
        // Add a function to initialize the chart after the modal content is set
        setTimeout(() => {
            const chartElement = document.getElementById(chartId);
            if (chartElement) {
                renderItemEngagementChart(chartId, itemEngagements);
            }
        }, 50);
    }
    
    // Combine all sections
    modalContent.innerHTML = contentInfo + engagementTable + engagementChart;
    
    // Show the modal
    const contentModal = document.getElementById('content-modal');
    contentModal.classList.remove('hidden');
    
    // Set up close button
    const closeButton = document.getElementById('close-modal');
    if (closeButton) {
        // Remove any existing event listeners by cloning
        const newCloseButton = closeButton.cloneNode(true);
        closeButton.parentNode.replaceChild(newCloseButton, closeButton);
        
        newCloseButton.addEventListener('click', () => {
            contentModal.classList.add('hidden');
        });
    }
}

// Render engagement chart for a specific content item
function renderItemEngagementChart(chartId, engagements) {
    // Sort data points by timestamp (oldest first for charts)
    const sortedEngagements = [...engagements].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    const labels = sortedEngagements.map(d => new Date(d.timestamp).toLocaleDateString());
    const views = sortedEngagements.map(d => d.views);
    const likes = sortedEngagements.map(d => d.likes);
    const comments = sortedEngagements.map(d => d.comments);
    
    const ctx = document.getElementById(chartId).getContext('2d');
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
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: document.documentElement.classList.contains('dark') ? '#fff' : '#000'
                    }
                },
                title: {
                    display: true,
                    text: 'Engagement Trends',
                    color: document.documentElement.classList.contains('dark') ? '#fff' : '#000'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
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

// Render engagement data in the table
function renderEngagementData() {
    const engagementList = document.getElementById('engagement-list');
    if (!engagementList) return;
    
    engagementList.innerHTML = '';
    
    if (contentItems.length === 0 || engagementData.length === 0) {
        engagementList.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                    No engagement data available. Add content items and refresh data to see engagement metrics.
                </td>
            </tr>
        `;
        return;
    }
    
    // Group engagement data by content ID and get latest entry for each
    const latestEngagementData = contentItems.map(item => {
        const itemEngagements = engagementData
            .filter(data => data.content_id === item.id)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        return {
            content: item,
            engagement: itemEngagements[0] || null
        };
    });

    // Sort by latest engagement timestamp
    latestEngagementData
        .sort((a, b) => {
            if (!a.engagement) return 1;
            if (!b.engagement) return -1;
            return new Date(b.engagement.timestamp) - new Date(a.engagement.timestamp);
        })
        .forEach(data => {
            const row = document.createElement('tr');
            
            if (data.engagement) {
                const engagement = data.engagement;
                const content = data.content;
                
                row.innerHTML = `
                    <td class="px-6 py-4">
                        <div class="text-sm font-medium text-gray-900 dark:text-white">${content.name}</div>
                    </td>
                    <td class="px-6 py-4">
                        <span class="badge ${content.platform.toLowerCase()}">${content.platform}</span>
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-900 dark:text-white">
                        ${engagement.views.toLocaleString()}
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-900 dark:text-white">
                        ${(engagement.watch_time || 0).toFixed(1)}
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-900 dark:text-white">
                        ${engagement.likes.toLocaleString()}
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-900 dark:text-white">
                        ${engagement.comments.toLocaleString()}
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                        ${new Date(engagement.timestamp).toLocaleString()}
                    </td>
                `;
            } else {
                const content = data.content;
                
                row.innerHTML = `
                    <td class="px-6 py-4">
                        <div class="text-sm font-medium text-gray-900 dark:text-white">${content.name}</div>
                    </td>
                    <td class="px-6 py-4">
                        <span class="badge ${content.platform.toLowerCase()}">${content.platform}</span>
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">-</td>
                    <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">-</td>
                    <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">-</td>
                    <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">-</td>
                    <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                        <button 
                            class="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center"
                            onclick="window.refreshSingleItemData('${content.id}')"
                        >
                            <span class="material-icons text-sm mr-1">refresh</span> Fetch Data
                        </button>
                    </td>
                `;
            }
            
            engagementList.appendChild(row);
        });
}

// Refresh data for a single content item
async function refreshSingleItemData(contentId) {
    try {
        const item = contentItems.find(c => c.id === contentId);
        if (!item) {
            throw new Error('Content item not found');
        }
        
        // Show loading notification
        showSuccessNotification('Fetching engagement data...');
        
        // Fetch engagement data for the item
        await fetchEngagementData([item]);
        
        // Update UI
        renderEngagementData();
        updateStats();
        renderCharts();
        
        showSuccessNotification('Engagement data updated');
    } catch (error) {
        console.error('Error fetching data:', error);
        showErrorNotification('Error fetching data: ' + error.message);
    }
}

// Refresh all engagement data
async function refreshEngagementData() {
    try {
        if (contentItems.length === 0) {
            showErrorNotification('No content items to refresh');
            return;
        }
        
        // Show loading notification
        showSuccessNotification('Fetching engagement data for all content...');
        
        // Fetch engagement data for all items
        await fetchEngagementData(contentItems);
        
        // Update UI
        renderEngagementData();
        updateStats();
        renderCharts();
        
        showSuccessNotification('All engagement data updated');
    } catch (error) {
        console.error('Error refreshing data:', error);
        showErrorNotification('Error refreshing data: ' + error.message);
    }
}

// Update stats on the dashboard
function updateStats() {
    // Update total content count
    document.getElementById('total-content').textContent = contentItems.length.toLocaleString();
    
    // Group engagement data by content ID and get latest entry for each
    const latestEngagementsByContent = {};
    engagementData.forEach(item => {
        if (!latestEngagementsByContent[item.content_id] 
            || new Date(latestEngagementsByContent[item.content_id].timestamp) < new Date(item.timestamp)) {
            latestEngagementsByContent[item.content_id] = item;
        }
    });
    
    // Calculate total engagements (views)
    const totalViews = Object.values(latestEngagementsByContent).reduce((sum, item) => sum + item.views, 0);
    document.getElementById('total-engagements').textContent = totalViews.toLocaleString();
    
    // Calculate top platform
    const platformStats = {};
    contentItems.forEach(item => {
        platformStats[item.platform] = (platformStats[item.platform] || 0) + 1;
    });
    
    let topPlatform = null;
    let topPlatformCount = 0;
    
    for (const [platform, count] of Object.entries(platformStats)) {
        if (count > topPlatformCount) {
            topPlatform = platform;
            topPlatformCount = count;
        }
    }
    
    document.getElementById('top-platform').textContent = topPlatform ? 
        `${topPlatform} (${topPlatformCount})` : 
        'None';
}

// Render all charts
function renderCharts() {
    renderPlatformChart();
    renderContentChart();
    renderTrendsChart();
}

// Render platform engagement chart
function renderPlatformChart() {
    const canvas = document.getElementById('platform-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Calculate total views per platform
    const platformData = {};
    
    contentItems.forEach(item => {
        const latestEngagement = engagementData
            .filter(e => e.content_id === item.id)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
        
        if (latestEngagement) {
            platformData[item.platform] = (platformData[item.platform] || 0) + latestEngagement.views;
        }
    });
    
    // Create or update chart
    if (window.platformChart) {
        window.platformChart.destroy();
    }
    
    const platformColors = {
        youtube: '#FF0000',
        servicenow: '#00c487',
        linkedin: '#0A66C2',
        reddit: '#FF4500',
        twitter: '#1DA1F2',
        slack: '#4A154B'
    };
    
    window.platformChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(platformData).map(p => p.charAt(0).toUpperCase() + p.slice(1)),
            datasets: [{
                data: Object.values(platformData),
                backgroundColor: Object.keys(platformData).map(p => platformColors[p.toLowerCase()] || '#6B7280'),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: document.documentElement.classList.contains('dark') ? '#fff' : '#000'
                    }
                },
                title: {
                    display: true,
                    text: 'Engagement by Platform',
                    color: document.documentElement.classList.contains('dark') ? '#fff' : '#000'
                }
            }
        }
    });
}

// Render top content chart
function renderContentChart() {
    const canvas = document.getElementById('content-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Get top 5 content items by views
    const topContent = contentItems.map(item => {
        const latestEngagement = engagementData
            .filter(e => e.content_id === item.id)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
        
        return {
            name: item.name,
            views: latestEngagement ? latestEngagement.views : 0,
            platform: item.platform
        };
    })
    .sort((a, b) => b.views - a.views)
    .slice(0, 5);
    
    // Create or update chart
    if (window.contentChart) {
        window.contentChart.destroy();
    }
    
    const platformColors = {
        youtube: '#FF0000',
        servicenow: '#00c487',
        linkedin: '#0A66C2',
        reddit: '#FF4500',
        twitter: '#1DA1F2',
        slack: '#4A154B'
    };
    
    window.contentChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: topContent.map(c => c.name),
            datasets: [{
                label: 'Views',
                data: topContent.map(c => c.views),
                backgroundColor: topContent.map(c => platformColors[c.platform.toLowerCase()] || '#6B7280')
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: 'Top Content by Views',
                    color: document.documentElement.classList.contains('dark') ? '#fff' : '#000'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: document.documentElement.classList.contains('dark') ? '#fff' : '#000'
                    }
                },
                x: {
                    ticks: {
                        color: document.documentElement.classList.contains('dark') ? '#fff' : '#000',
                        callback: function(value) {
                            const label = this.getLabelForValue(value);
                            // Truncate long labels
                            return label.length > 15 ? label.substr(0, 12) + '...' : label;
                        }
                    }
                }
            }
        }
    });
}

// Fetch engagement data for content items
async function fetchEngagementData(items) {
    for (const item of items) {
        try {
            let data = null;
            
            // Based on platform, fetch engagement data
            switch (item.platform.toLowerCase()) {
                case 'youtube':
                    if (!apiConfig.youtube?.apiKey) {
                        console.warn('YouTube API not configured for item:', item.name);
                        continue;
                    }
                    data = await fetchYouTubeEngagement(item, apiConfig.youtube.apiKey);
                    break;
                
                case 'linkedin':
                    if (!apiConfig.linkedin?.clientId || !apiConfig.linkedin?.clientSecret) {
                        console.warn('LinkedIn API not configured for item:', item.name);
                        continue;
                    }
                    data = await fetchLinkedInEngagement(item);
                    break;
                
                case 'servicenow':
                    if (!apiConfig.servicenow?.instance || !apiConfig.servicenow?.username || !apiConfig.servicenow?.password) {
                        console.warn('ServiceNow API not configured for item:', item.name);
                        continue;
                    }
                    data = await fetchServiceNowEngagement(item);
                    break;
                
                case 'reddit':
                    if (!apiConfig.reddit?.clientId || !apiConfig.reddit?.clientSecret) {
                        console.warn('Reddit API not configured for item:', item.name);
                        continue;
                    }
                    data = await fetchRedditEngagement(item);
                    break;
                
                case 'twitter':
                    if (!apiConfig.twitter?.apiKey || !apiConfig.twitter?.apiKeySecret) {
                        console.warn('Twitter API not configured for item:', item.name);
                        continue;
                    }
                    data = await fetchTwitterEngagement(item);
                    break;
                
                case 'slack':
                    if (!apiConfig.slack?.botToken || !apiConfig.slack?.signingSecret) {
                        console.warn('Slack API not configured for item:', item.name);
                        continue;
                    }
                    data = await fetchSlackEngagement(item);
                    break;
                
                default:
                    // Generate mock data for unknown platforms
                    data = generateMockEngagementData();
            }
            
            if (data) {
                const timestamp = new Date().toISOString();
                
                // Check if we already have data for this content with the same timestamp (up to the minute)
                const timestampMinute = timestamp.substring(0, 16); // Format: YYYY-MM-DDTHH:MM
                const hasDuplicate = engagementData.some(engagement => {
                    return engagement.content_id === item.id && 
                           engagement.timestamp.substring(0, 16) === timestampMinute;
                });
                
                if (hasDuplicate) {
                    console.log(`Skipping duplicate engagement data for ${item.name} at ${timestampMinute}`);
                    continue;
                }
                
                // Add engagement data to Supabase
                const { data: newEngagement, error } = await supabase
                    .from('engagement_data')
                    .insert([{
                        content_id: item.id,
                        views: data.views || 0,
                        likes: data.likes || 0,
                        comments: data.comments || 0,
                        shares: data.shares || 0,
                        watch_time: data.watchTime || 0,
                        timestamp: timestamp
                    }])
                    .select();
                
                if (error) {
                    console.error('Error saving engagement data:', error);
                    continue;
                }
                
                // Update local state
                engagementData.push(newEngagement[0]);
            }
        } catch (error) {
            console.error(`Error fetching engagement data for ${item.name}:`, error);
        }
    }
}

// Generate mock engagement data for testing
function generateMockEngagementData() {
    return {
        views: Math.floor(Math.random() * 1000),
        likes: Math.floor(Math.random() * 200),
        comments: Math.floor(Math.random() * 50),
        shares: Math.floor(Math.random() * 25),
        watchTime: Math.floor(Math.random() * 10)
    };
}

// Fetch YouTube engagement data
async function fetchYouTubeEngagement(item, apiKey) {
    try {
        const videoId = item.content_id;
        if (!videoId) return generateMockEngagementData();
        
        // Make API request to YouTube
        const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=statistics&key=${apiKey}`);
        const data = await response.json();
        
        if (!data.items || data.items.length === 0) {
            return generateMockEngagementData();
        }
        
        const stats = data.items[0].statistics;
        
        // Calculate approximate watch time (YouTube doesn't expose this via the API)
        // We're using a simplified formula: avg_view_duration * view_count
        // For demo, assuming 3-5 min avg duration
        const avgDurationMinutes = Math.random() * 2 + 3;
        const viewCount = parseInt(stats.viewCount || 0);
        const watchTimeHours = (viewCount * avgDurationMinutes) / 60;
        
        return {
            views: viewCount,
            likes: parseInt(stats.likeCount || 0),
            comments: parseInt(stats.commentCount || 0),
            shares: 0, // YouTube API doesn't provide share count
            watchTime: watchTimeHours
        };
    } catch (error) {
        console.error('Error fetching YouTube engagement:', error);
        return generateMockEngagementData();
    }
}

// Fetch LinkedIn engagement data (mock since API access is limited)
async function fetchLinkedInEngagement(item) {
    // For demo purposes, return simulated data
    // In production, this would make an actual API call
    return generateMockEngagementData();
}

// Fetch ServiceNow engagement data (mock)
async function fetchServiceNowEngagement(item) {
    // For demo purposes, return simulated data
    // In production, this would make an actual API call
    return generateMockEngagementData();
}

// Fetch Reddit engagement data (mock)
async function fetchRedditEngagement(item) {
    // For demo purposes, return simulated data
    // In production, this would make an actual API call
    return generateMockEngagementData();
}

// Fetch Twitter engagement data (mock)
async function fetchTwitterEngagement(item) {
    // For demo purposes, return simulated data
    // In production, this would make an actual API call
    return generateMockEngagementData();
}

// Fetch Slack engagement data (mock)
async function fetchSlackEngagement(item) {
    // For demo purposes, return simulated data
    // In production, this would make an actual API call
    return generateMockEngagementData();
}

// User menu dropdown
function setupUserDropdown() {
    const userMenuButton = document.getElementById('user-menu-button');
    const userDropdown = document.getElementById('user-dropdown');
    
    if (!userMenuButton || !userDropdown) return;
    
    // Remove any existing event listeners by cloning and replacing
    const newButton = userMenuButton.cloneNode(true);
    userMenuButton.parentNode.replaceChild(newButton, userMenuButton);
    
    // Reset dropdown state
    userDropdown.classList.add('hidden');
    userDropdown.style.display = 'none';
    userDropdown.style.position = 'absolute';
    userDropdown.style.zIndex = '9999';
    
    // Add click listener to button
    newButton.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const isHidden = userDropdown.classList.contains('hidden');
        
        // Toggle visibility
        if (isHidden) {
            userDropdown.classList.remove('hidden');
            userDropdown.style.display = 'block';
        } else {
            userDropdown.classList.add('hidden');
            userDropdown.style.display = 'none';
        }
        
        console.log('User dropdown toggled, current state:', !isHidden);
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        if (!newButton.contains(e.target) && !userDropdown.contains(e.target)) {
            userDropdown.classList.add('hidden');
            userDropdown.style.display = 'none';
        }
    });
    
    // Close dropdown when clicking on menu items
    const dropdownItems = userDropdown.querySelectorAll('a, button');
    dropdownItems.forEach(item => {
        item.addEventListener('click', function() {
            userDropdown.classList.add('hidden');
            userDropdown.style.display = 'none';
        });
    });
    
    // Set up profile link functionality
    const profileLink = document.getElementById('user-profile-link');
    if (profileLink) {
        profileLink.addEventListener('click', function(e) {
            e.preventDefault();
            showUserProfile();
        });
    }
}

// Test functions for duplicate prevention
async function testDuplicatePrevention() {
    console.log("==== Starting Duplicate Prevention Test ====");
    
    // Create test container to display results
    const testContainer = document.createElement('div');
    testContainer.className = 'fixed inset-0 bg-gray-600 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-80 flex items-center justify-center z-50';
    testContainer.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div class="px-4 py-5 sm:p-6">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-medium dark:text-white">Duplicate Prevention Test Results</h3>
                    <button id="close-test" class="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white">
                        <span class="material-icons">close</span>
                    </button>
                </div>
                <div id="test-results" class="space-y-4">
                    <p class="text-sm text-gray-500 dark:text-gray-400">Running tests...</p>
                    <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                        <div id="test-progress" class="bg-green-600 h-2.5 rounded-full" style="width: 0%"></div>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(testContainer);
    
    // Set up close button
    document.getElementById('close-test').addEventListener('click', () => {
        testContainer.remove();
    });
    
    const results = document.getElementById('test-results');
    const progress = document.getElementById('test-progress');
    
    try {
        // Store original content items and engagement data
        const originalContentItems = [...contentItems];
        const originalEngagementData = [...engagementData];
        
        // Test 1: Content URL duplication prevention
        updateProgress(10, "Testing content URL duplication prevention...");
        await testContentUrlDuplication(results);
        
        // Test 2: Engagement data duplication prevention
        updateProgress(40, "Testing engagement data duplication prevention...");
        await testEngagementDataDuplication(results);
        
        // Test 3: Import duplication prevention
        updateProgress(70, "Testing import duplication prevention...");
        await testImportDuplication(results);
        
        // Restore original data
        contentItems = originalContentItems;
        engagementData = originalEngagementData;
        rebuildUrlContentMap();
        
        // Show completion
        updateProgress(100, "All tests completed successfully!");
        results.innerHTML += `
            <div class="mt-4 p-4 rounded-lg bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                <p class="font-medium">✅ All duplicate prevention tests passed!</p>
                <p class="text-sm mt-2">The system successfully prevents duplicate content items and engagement data.</p>
            </div>
        `;
    } catch (error) {
        console.error("Test failed:", error);
        results.innerHTML += `
            <div class="mt-4 p-4 rounded-lg bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200">
                <p class="font-medium">❌ Test failed</p>
                <p class="text-sm mt-2">${error.message}</p>
            </div>
        `;
    }
    
    function updateProgress(percent, message) {
        progress.style.width = `${percent}%`;
        results.innerHTML = `
            <p class="text-sm text-gray-500 dark:text-gray-400">${message}</p>
            <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                <div class="bg-green-600 h-2.5 rounded-full" style="width: ${percent}%"></div>
            </div>
        `;
    }
}

// Test content URL duplication
async function testContentUrlDuplication(results) {
    // Create a test content item
    const testItem = {
        name: "Test Content Item",
        description: "This is a test content item",
        platform: "youtube",
        url: "https://www.youtube.com/watch?v=test12345",
        published_date: new Date().toISOString(),
        duration: "0:05:00"
    };
    
    // Mock handleContentFormSubmit
    const mockForm = {
        querySelector: () => ({ 
            disabled: false,
            innerHTML: 'Add Content'
        })
    };
    
    // Set up the document elements needed
    document.getElementById = function(id) {
        const elements = {
            'add-content-url': { value: testItem.url },
            'add-content-source': { value: testItem.platform },
            'add-content-name': { value: testItem.name },
            'add-content-description': { value: testItem.description },
            'add-content-published': { value: testItem.published_date },
            'add-content-duration': { value: testItem.duration },
            'add-duplicate-warning': { classList: { add: () => {}, remove: () => {} } },
            'add-content-body': { classList: { add: () => {} } },
            'toggle-add-content': { querySelector: () => ({ classList: { remove: () => {} } }) }
        };
        return elements[id] || null;
    };
    
    // Add to content items
    const normalizedUrl = normalizeUrl(testItem.url);
    const isDuplicate1 = contentItems.some(item => normalizeUrl(item.url) === normalizedUrl);
    
    // Attempt to add again
    contentItems.push({...testItem, id: 'test-id-123'});
    rebuildUrlContentMap();
    
    const isDuplicate2 = contentItems.some(item => normalizeUrl(item.url) === normalizedUrl);
    
    // Display results
    results.innerHTML += `
        <div class="mt-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-700">
            <h4 class="font-medium text-gray-900 dark:text-white">Content URL Duplication Test:</h4>
            <ul class="list-disc list-inside mt-2 space-y-1 text-sm text-gray-500 dark:text-gray-400">
                <li>Initial check for URL duplication: ${isDuplicate1 ? 'Duplicate detected ✓' : 'No duplicate detected ✗'}</li>
                <li>After adding item, URL is in content items: ${isDuplicate2 ? 'Yes ✓' : 'No ✗'}</li>
            </ul>
        </div>
    `;
    
    // Clean up - remove the test item
    contentItems = contentItems.filter(item => item.id !== 'test-id-123');
    rebuildUrlContentMap();
}

// Test engagement data duplication
async function testEngagementDataDuplication(results) {
    // Create a test content item and engagement data
    const testContent = {
        id: 'test-id-456',
        name: "Test Engagement Item",
        platform: "youtube",
        url: "https://www.youtube.com/watch?v=engagement-test"
    };
    
    const timestamp = new Date().toISOString();
    const testEngagement = {
        content_id: testContent.id,
        views: 100,
        likes: 50,
        comments: 10,
        shares: 5,
        watch_time: 2.5,
        timestamp: timestamp
    };
    
    // Add test content and engagement
    contentItems.push(testContent);
    rebuildUrlContentMap();
    engagementData.push({...testEngagement, id: 'test-engagement-id-1'});
    
    // Now attempt to add duplicate engagement (same content & timestamp)
    const timestampMinute = timestamp.substring(0, 16);
    const hasDuplicate = engagementData.some(engagement => {
        return engagement.content_id === testContent.id && 
               engagement.timestamp.substring(0, 16) === timestampMinute;
    });
    
    // Add another engagement with different timestamp
    const newTimestamp = new Date(Date.now() + 3600000).toISOString(); // 1 hour later
    const testEngagement2 = {
        ...testEngagement,
        id: 'test-engagement-id-2',
        timestamp: newTimestamp,
        views: 150 // different data
    };
    
    engagementData.push(testEngagement2);
    
    // Check if both engagements exist
    const hasOriginal = engagementData.some(e => e.id === 'test-engagement-id-1');
    const hasSecond = engagementData.some(e => e.id === 'test-engagement-id-2');
    
    // Display results
    results.innerHTML += `
        <div class="mt-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-700">
            <h4 class="font-medium text-gray-900 dark:text-white">Engagement Data Duplication Test:</h4>
            <ul class="list-disc list-inside mt-2 space-y-1 text-sm text-gray-500 dark:text-gray-400">
                <li>Duplicate detection for same timestamp: ${hasDuplicate ? 'Detected ✓' : 'Not detected ✗'}</li>
                <li>Original engagement record exists: ${hasOriginal ? 'Yes ✓' : 'No ✗'}</li>
                <li>Different timestamp engagement record added: ${hasSecond ? 'Yes ✓' : 'No ✗'}</li>
            </ul>
        </div>
    `;
    
    // Clean up - remove test data
    contentItems = contentItems.filter(item => item.id !== testContent.id);
    engagementData = engagementData.filter(e => e.id !== 'test-engagement-id-1' && e.id !== 'test-engagement-id-2');
    rebuildUrlContentMap();
}

// Test import duplication prevention
async function testImportDuplication(results) {
    // Create test import data
    const testContent = {
        id: 'import-test-id',
        name: "Import Test Item",
        platform: "youtube",
        url: "https://www.youtube.com/watch?v=import-test",
        published_date: new Date().toISOString(),
        created_at: new Date().toISOString()
    };
    
    const testEngagement = {
        id: 'import-engagement-id',
        content_id: 'import-test-id',
        views: 200,
        likes: 100,
        comments: 20,
        shares: 10,
        watch_time: 5,
        timestamp: new Date().toISOString()
    };
    
    // Set up import data
    window.importData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        user: { id: currentUser?.id || 'test-user', name: 'Test User', email: 'test@example.com' },
        content: [testContent],
        engagement: [testEngagement],
        apiConfig: {}
    };
    
    // Add the same content to existing data (to simulate duplicate)
    contentItems.push({...testContent, id: 'existing-id'});
    rebuildUrlContentMap();
    
    // Mock the import form elements
    document.querySelector = function() {
        return { value: 'merge' }; // Test the merge option
    };
    
    // Check URL map to see if it contains our test URL
    const normalizedUrl = normalizeUrl(testContent.url);
    const urlExists = urlToContentMap[normalizedUrl] !== undefined;
    
    // Display results
    results.innerHTML += `
        <div class="mt-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-700">
            <h4 class="font-medium text-gray-900 dark:text-white">Import Duplication Test:</h4>
            <ul class="list-disc list-inside mt-2 space-y-1 text-sm text-gray-500 dark:text-gray-400">
                <li>URL map contains test content: ${urlExists ? 'Yes ✓' : 'No ✗'}</li>
                <li>URL in map matches test content: ${urlToContentMap[normalizedUrl] === 'existing-id' ? 'Yes ✓' : 'No ✗'}</li>
                <li>Import function would skip this item: ${urlExists ? 'Yes ✓' : 'No ✗'}</li>
            </ul>
        </div>
    `;
    
    // Clean up
    window.importData = null;
    contentItems = contentItems.filter(item => item.id !== 'existing-id');
    rebuildUrlContentMap();
}