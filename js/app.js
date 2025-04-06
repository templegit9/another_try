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
    
    userMenuButton.addEventListener('click', () => {
        userDropdown.classList.toggle('hidden');
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!userMenuButton.contains(e.target) && !userDropdown.contains(e.target)) {
            userDropdown.classList.add('hidden');
        }
    });
    
    // Logout button
    document.getElementById('logout-button').addEventListener('click', async () => {
        try {
            await signOut();
            currentUser = null;
            showAuthScreen();
        } catch (error) {
            console.error('Error signing out:', error);
            showErrorNotification('Error signing out');
        }
    });
    
    // Export/Import data
    document.getElementById('export-data-dropdown').addEventListener('click', exportData);
    document.getElementById('import-data-dropdown').addEventListener('click', showImportModal);
    document.getElementById('close-import-modal').addEventListener('click', () => {
        document.getElementById('import-modal').classList.add('hidden');
        document.getElementById('file-info').classList.add('hidden');
        document.getElementById('import-preview').classList.add('hidden');
        document.getElementById('import-data-btn').disabled = true;
        document.getElementById('import-message').classList.add('hidden');
        document.getElementById('import-error').classList.add('hidden');
    });
    document.getElementById('import-file').addEventListener('change', handleFileSelection);
    document.getElementById('import-data-btn').addEventListener('click', importData);
    
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
    document.getElementById('refresh-data').addEventListener('click', refreshEngagementData)
    document.getElementById('refresh-all-data').addEventListener('click', refreshEngagementData)
    
    // Settings and modals
    const apiSettingsSection = document.getElementById('api-settings')
    const showSettingsBtn = document.getElementById('show-settings-link')
    const hideSettingsBtn = document.getElementById('hide-settings')
    
    showSettingsBtn.addEventListener('click', () => {
        apiSettingsSection.classList.remove('hidden')
        userDropdown.classList.add('hidden')
    })
    
    hideSettingsBtn.addEventListener('click', () => {
        apiSettingsSection.classList.add('hidden')
    })
    
    // API testing buttons
    document.getElementById('test-youtube-api').addEventListener('click', testYouTubeApi)
    document.getElementById('test-servicenow-api').addEventListener('click', testServiceNowApi)
    document.getElementById('test-linkedin-api').addEventListener('click', testLinkedInApi)
    
    // Modal close buttons
    document.getElementById('close-modal').addEventListener('click', () => {
        document.getElementById('content-modal').classList.add('hidden')
    })
    
    // User profile
    document.getElementById('user-profile-link').addEventListener('click', showUserProfile)
    document.getElementById('close-profile-modal').addEventListener('click', () => {
        document.getElementById('profile-modal').classList.add('hidden')
    })
    document.getElementById('save-profile').addEventListener('click', saveUserProfile)
    document.getElementById('delete-account').addEventListener('click', confirmDeleteAccount)
    
    // Dark mode toggle
    const darkModeToggle = document.getElementById('dark-mode-toggle')
    if (darkModeToggle) {
        darkModeToggle.addEventListener('change', toggleDarkMode)
        
        // Set initial state based on saved preference
        if (document.documentElement.classList.contains('dark')) {
            darkModeToggle.checked = true
        }
    }
    
    // Platform selection change
    document.getElementById('add-content-source').addEventListener('change', () => {
        updateUrlPlaceholder();
        
        // Show/hide duration field based on platform
        const platform = document.getElementById('add-content-source').value;
        const durationContainer = document.getElementById('add-duration-container');
        if (platform === 'youtube') {
            durationContainer.classList.remove('hidden');
        } else {
            durationContainer.classList.add('hidden');
        }
    });
    
    // Initialize URL placeholder
    updateUrlPlaceholder();
    
    // Forgot Password Modal Elements
    const forgotPasswordModal = document.getElementById('forgot-password-modal');
    const forgotPasswordLink = document.getElementById('forgot-password-link');
    const closeForgotPasswordModal = document.getElementById('close-forgot-password-modal');
    const forgotPasswordForm = document.getElementById('forgot-password-form');
    const resetMessage = document.getElementById('reset-message');

    // Forgot Password Event Listeners
    forgotPasswordLink.addEventListener('click', () => {
        forgotPasswordModal.classList.remove('hidden');
    });

    closeForgotPasswordModal.addEventListener('click', () => {
        forgotPasswordModal.classList.add('hidden');
        resetMessage.classList.add('hidden');
        forgotPasswordForm.reset();
    });

    forgotPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('reset-email').value.trim();
        
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password.html`
            });

            if (error) throw error;

            // Show success message
            resetMessage.textContent = 'Password reset link sent! Please check your email.';
            resetMessage.classList.remove('hidden', 'text-red-500', 'text-green-500');
            resetMessage.classList.add('text-green-500');
            
            // Reset form and close modal after 3 seconds
            setTimeout(() => {
                forgotPasswordForm.reset();
                forgotPasswordModal.classList.add('hidden');
                resetMessage.classList.add('hidden');
            }, 3000);
        } catch (error) {
            console.error('Error sending reset password email:', error);
            resetMessage.textContent = error.message || 'Failed to send reset link. Please try again.';
            resetMessage.classList.remove('hidden', 'text-red-500', 'text-green-500');
            resetMessage.classList.add('text-red-500');
        }
    });
}

// Update URL placeholder based on selected platform
function updateUrlPlaceholder() {
    const platform = document.getElementById('add-content-source').value;
    const urlField = document.getElementById('add-content-url');
    
    switch (platform) {
        case 'youtube':
            urlField.placeholder = 'https://youtube.com/watch?v=XXXX';
            break;
        case 'servicenow':
            urlField.placeholder = 'https://community.servicenow.com/blog/XXXX';
            break;
        case 'linkedin':
            urlField.placeholder = 'https://www.linkedin.com/posts/XXXX';
            break;
        case 'reddit':
            urlField.placeholder = 'https://www.reddit.com/XXXX';
            break;
        case 'twitter':
            urlField.placeholder = 'https://twitter.com/XXXX';
            break;
        case 'slack':
            urlField.placeholder = 'https://slack.com/XXXX';
            break;
        default:
            urlField.placeholder = 'https://example.com';
    }
}

// Check for duplicate URL
function checkForDuplicateUrl() {
    const url = document.getElementById('add-content-url').value;
    if (!url) return;
    
    const normalizedUrl = normalizeUrl(url);
    const existingContentId = urlToContentMap[normalizedUrl];
    
    if (existingContentId) {
        // Show warning
        const duplicateWarning = document.getElementById('add-duplicate-warning');
        duplicateWarning.classList.remove('hidden');
        
        // Find the existing content item
        const existingContent = contentItems.find(item => item.id === existingContentId);
        if (existingContent) {
            duplicateWarning.textContent = `Warning: This URL has already been added as "${existingContent.name}".`;
        }
    } else {
        // Hide warning
        document.getElementById('add-duplicate-warning').classList.add('hidden');
    }
}

// Normalize URL (remove tracking parameters, fragments, etc.)
function normalizeUrl(url) {
    try {
        const urlObj = new URL(url)
        // Remove common tracking parameters
        urlObj.searchParams.delete('utm_source')
        urlObj.searchParams.delete('utm_medium')
        urlObj.searchParams.delete('utm_campaign')
        urlObj.searchParams.delete('utm_content')
        urlObj.searchParams.delete('utm_term')
        urlObj.searchParams.delete('feature')
        // Remove hash
        urlObj.hash = ''
        return urlObj.toString()
    } catch (e) {
        // If URL parsing fails, return original
        return url
    }
}

// Fetch content information based on URL
async function fetchContentInfo() {
    const contentUrl = document.getElementById('add-content-url').value
    const platform = document.getElementById('add-content-source').value
    
    if (!contentUrl) {
        showErrorNotification('Please enter a URL first')
        return
    }
    
    // Show loading state
    const fetchButton = document.getElementById('add-fetch-content-info')
    fetchButton.disabled = true
    fetchButton.innerHTML = '<span class="material-icons animate-spin">refresh</span> Loading...'
    
    try {
        // Extract content ID from URL
        const contentId = extractContentId(contentUrl, platform)
        
        // Fetch content information based on platform
        let contentInfo = null
        
        switch (platform) {
            case 'youtube':
                contentInfo = await fetchYouTubeContentInfo(contentId)
                break
            
            case 'servicenow':
                contentInfo = await fetchServiceNowContentInfo(contentId)
                break
            
            case 'linkedin':
                contentInfo = await fetchLinkedInContentInfo(contentId)
                break
            
            case 'reddit':
                contentInfo = await fetchRedditContentInfo(contentId)
                break
            
            case 'twitter':
                contentInfo = await fetchTwitterContentInfo(contentId)
                break
            
            case 'slack':
                contentInfo = await fetchSlackContentInfo(contentId)
                break
            
            default:
                contentInfo = {
                    title: '',
                    publishedDate: null
                }
        }
        
        // Update form fields with content information
        if (contentInfo) {
            document.getElementById('add-content-name').value = contentInfo.title || ''
            
            if (contentInfo.publishedDate) {
                document.getElementById('add-content-published').valueAsDate = new Date(contentInfo.publishedDate)
            }
            
            // Set duration if available (for YouTube)
            if (contentInfo.duration && platform === 'youtube') {
                document.getElementById('add-content-duration').value = contentInfo.duration
            } else {
                document.getElementById('add-content-duration').value = ''
            }
        }
        
        showSuccessNotification('Content information fetched successfully')
    } catch (error) {
        console.error('Error fetching content info:', error)
        showErrorNotification(`Error fetching content info: ${error.message}`)
    } finally {
        // Reset button state
        fetchButton.disabled = false
        fetchButton.innerHTML = '<span class="material-icons mr-1">cloud_download</span> Get Info'
    }
}

// Extract content ID from URL based on platform
function extractContentId(url, platform) {
    try {
        const urlObj = new URL(url);
        
        switch (platform) {
            case 'youtube': {
                // Handle both youtube.com/watch?v=ID and youtu.be/ID formats
                const videoId = urlObj.searchParams.get('v') || urlObj.pathname.slice(1);
                if (!videoId) throw new Error('Invalid YouTube URL');
                return videoId;
            }
            
            case 'servicenow': {
                // Extract article ID from ServiceNow URL
                const match = urlObj.pathname.match(/kb_article\.do\?sys_id=([^&]+)/);
                if (!match) throw new Error('Invalid ServiceNow URL');
                return match[1];
            }
            
            case 'linkedin': {
                // Extract post ID from LinkedIn URL
                const match = urlObj.pathname.match(/\/posts\/([^?/]+)/);
                if (!match) throw new Error('Invalid LinkedIn URL');
                return match[1];
            }
            
            case 'reddit': {
                // Handle various Reddit URL formats
                const match = urlObj.pathname.match(/\/comments\/([a-z0-9]+)/i);
                if (!match) throw new Error('Invalid Reddit URL');
                return match[1];
            }
            
            case 'twitter': {
                // Handle both twitter.com and x.com URLs
                const match = urlObj.pathname.match(/\/[^/]+\/status\/(\d+)/);
                if (!match) throw new Error('Invalid Twitter URL');
                return match[1];
            }
            
            case 'slack': {
                // Extract channel ID and message timestamp from Slack URL
                const match = urlObj.pathname.match(/\/archives\/([A-Z0-9]+)\/p(\d+)/i);
                if (!match) throw new Error('Invalid Slack URL');
                return `${match[1]}:${match[2]}`;
            }
            
            default:
                throw new Error(`Unsupported platform: ${platform}`);
        }
    } catch (error) {
        throw new Error(`Failed to extract content ID: ${error.message}`);
    }
}

// Fetch YouTube video information
async function fetchYouTubeContentInfo(videoId) {
    if (!apiConfig.youtube.apiKey) {
        throw new Error('YouTube API key is not configured. Please add an API key in Settings.')
    }
    
    const apiKey = apiConfig.youtube.apiKey
    const videoInfoUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${apiKey}`
    
    const response = await fetch(videoInfoUrl)
    
    if (!response.ok) {
        throw new Error(`YouTube API returned status: ${response.status}`)
    }
    
    const data = await response.json()
    
    if (!data.items || data.items.length === 0) {
        throw new Error('No data found for this YouTube video')
    }
    
    const snippet = data.items[0].snippet
    const contentDetails = data.items[0].contentDetails
    
    // Parse ISO 8601 duration format
    let duration = ''
    if (contentDetails && contentDetails.duration) {
        duration = formatYouTubeDuration(contentDetails.duration)
    }
    
    return {
        title: snippet.title,
        publishedDate: new Date(snippet.publishedAt),
        duration: duration
    }
}

// Format YouTube duration from ISO 8601 to readable format
function formatYouTubeDuration(isoDuration) {
    const match = isoDuration.match(/PT(\d+H)?(\d+M)?(\d+S)?/)
    
    const hours = (match[1] && match[1].replace('H', '')) || 0
    const minutes = (match[2] && match[2].replace('M', '')) || 0
    const seconds = (match[3] && match[3].replace('S', '')) || 0
    
    let formatted = ''
    
    if (hours > 0) {
        formatted += `${hours}:`
        formatted += `${minutes.toString().padStart(2, '0')}:`
    } else {
        formatted += `${minutes}:`
    }
    
    formatted += seconds.toString().padStart(2, '0')
    
    return formatted
}

// Fetch ServiceNow content information
async function fetchServiceNowContentInfo(blogId) {
    if (!apiConfig.servicenow.instance || !apiConfig.servicenow.username) {
        throw new Error('ServiceNow API not configured. Please configure it in Settings.')
    }
    
    // For demo purposes, return simulated data
    // In production, this would make an actual API call
    return {
        title: `ServiceNow Blog: ${blogId}`,
        publishedDate: new Date()
    }
}

// Fetch LinkedIn content information
async function fetchLinkedInContentInfo(postId) {
    if (!apiConfig.linkedin.clientId || !apiConfig.linkedin.clientSecret) {
        throw new Error('LinkedIn API not configured. Please configure it in Settings.')
    }
    
    // For demo purposes, return simulated data
    // In production, this would make an actual API call
    return {
        title: `LinkedIn Post: ${postId}`,
        publishedDate: new Date()
    }
}

// Fetch Reddit content information
async function fetchRedditContentInfo(postId) {
    if (!apiConfig.reddit?.clientId || !apiConfig.reddit?.clientSecret) {
        throw new Error('Reddit API not configured');
    }

    try {
        const response = await fetch(`https://www.reddit.com/api/info.json?id=t3_${postId}`, {
            headers: {
                'Authorization': `Bearer ${apiConfig.reddit.clientId}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch Reddit post info');
        }

        const data = await response.json();
        const post = data.data.children[0].data;

        return {
            title: post.title,
            url: `https://reddit.com${post.permalink}`,
            type: 'reddit',
            timestamp: new Date(post.created_utc * 1000).toISOString()
        };
    } catch (error) {
        console.error('Error fetching Reddit content info:', error);
        throw error;
    }
}

// Fetch Twitter content information
async function fetchTwitterContentInfo(tweetId) {
    if (!apiConfig.twitter?.bearerToken) {
        throw new Error('Twitter API not configured');
    }

    try {
        const response = await fetch(`https://api.twitter.com/2/tweets/${tweetId}/public_metrics`, {
            headers: {
                'Authorization': `Bearer ${apiConfig.twitter.bearerToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch tweet info');
        }

        const data = await response.json();
        const metrics = data.data;

        // Calculate estimated watch time based on video duration or reading time
        const avgReadTimeSeconds = 30; // Average time spent reading a tweet
        const watchTimeHours = (avgReadTimeSeconds * metrics.impression_count) / 3600;

        return {
            title: metrics.impression_count.toLocaleString() + ' views',
            url: `https://twitter.com/user/status/${tweetId}`,
            type: 'twitter',
            timestamp: new Date(metrics.created_at).toISOString()
        };
    } catch (error) {
        console.error('Error fetching Twitter content info:', error);
        throw error;
    }
}

// Fetch Slack content information
async function fetchSlackContentInfo(messageId, channelId) {
    if (!apiConfig.slack?.botToken) {
        throw new Error('Slack API not configured');
    }

    try {
        const response = await fetch('https://slack.com/api/conversations.history', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiConfig.slack.botToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                channel: channelId,
                latest: messageId,
                limit: 1,
                inclusive: true
            })
        });

        if (!response.ok) {
            throw new Error('Failed to fetch Slack message info');
        }

        const data = await response.json();
        const message = data.messages[0];

        return {
            title: message.text.substring(0, 100) + '...',
            url: `https://slack.com/archives/${channelId}/p${messageId}`,
            type: 'slack',
            timestamp: new Date(message.ts * 1000).toISOString()
        };
    } catch (error) {
        console.error('Error fetching Slack content info:', error);
        throw error;
    }
}

// Refresh engagement data for content items
async function refreshEngagementData(e) {
    if (e) e.preventDefault()
    
    // Show loading state
    const refreshButton = e ? e.target : document.getElementById('refresh-data')
    const originalText = refreshButton.innerHTML
    refreshButton.disabled = true
    refreshButton.innerHTML = '<span class="material-icons animate-spin">refresh</span> Refreshing...'
    
    try {
        // Get content items to refresh
        const itemsToRefresh = e && e.target.id === 'refresh-all-data' ? 
            contentItems : // Refresh all items
            contentItems.slice(0, 5) // Refresh only latest 5 items
        
        if (itemsToRefresh.length === 0) {
            showErrorNotification('No content items to refresh')
            return
        }
        
        // Fetch engagement data for each item
        await fetchEngagementData(itemsToRefresh)
        
        // Update UI
        renderEngagementData()
        updateStats()
        renderCharts()
        
        showSuccessNotification('Engagement data refreshed successfully')
    } catch (error) {
        console.error('Error refreshing engagement data:', error)
        showErrorNotification('Error refreshing engagement data')
    } finally {
        // Reset button state
        refreshButton.disabled = false
        refreshButton.innerHTML = originalText
    }
}

// Fetch engagement data for content items
async function fetchEngagementData(items) {
    for (const item of items) {
        try {
            let data = null;
            
            switch (item.platform) {
                case 'youtube':
                    if (!apiConfig.youtube.apiKey) {
                        console.warn('YouTube API key not configured for item:', item.name);
                        continue;
                    }
                    data = await fetchYouTubeEngagement(item);
                    break;
                
                case 'servicenow':
                    if (!apiConfig.servicenow.instance || !apiConfig.servicenow.username) {
                        console.warn('ServiceNow API not configured for item:', item.name);
                        continue;
                    }
                    data = await fetchServiceNowEngagement(item);
                    break;
                
                case 'linkedin':
                    if (!apiConfig.linkedin.clientId || !apiConfig.linkedin.clientSecret) {
                        console.warn('LinkedIn API not configured for item:', item.name);
                        continue;
                    }
                    data = await fetchLinkedInEngagement(item);
                    break;
                
                case 'reddit':
                    if (!apiConfig.reddit.clientId || !apiConfig.reddit.clientSecret) {
                        console.warn('Reddit API not configured for item:', item.name);
                        continue;
                    }
                    data = await fetchRedditEngagement(item);
                    break;
                
                case 'twitter':
                    if (!apiConfig.twitter.apiKey || !apiConfig.twitter.apiKeySecret) {
                        console.warn('Twitter API not configured for item:', item.name);
                        continue;
                    }
                    data = await fetchTwitterEngagement(item);
                    break;
                
                case 'slack':
                    if (!apiConfig.slack.botToken || !apiConfig.slack.signingSecret) {
                        console.warn('Slack API not configured for item:', item.name);
                        continue;
                    }
                    data = await fetchSlackEngagement(item);
                    break;
            }
            
            if (data) {
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
                        timestamp: new Date().toISOString()
                    }])
                    .select(`
                        id,
                        content_id,
                        views,
                        likes,
                        comments,
                        shares,
                        watch_time,
                        timestamp
                    `)
                    .single();
                
                if (error) {
                    console.error('Error saving engagement data:', error);
                    continue;
                }
                
                // Update local state
                engagementData = engagementData.filter(e => e.content_id !== item.id);
                if (newEngagement) {
                    engagementData.push(newEngagement);
                }
            }
        } catch (error) {
            console.error(`Error fetching engagement data for ${item.platform}:`, error);
            showErrorNotification(`Error fetching data for "${item.name}": ${error.message}`);
        }
    }
}

// Fetch YouTube engagement data
async function fetchYouTubeEngagement(item) {
    if (!apiConfig.youtube.apiKey) {
        throw new Error('YouTube API key is not configured')
    }
    
    const apiKey = apiConfig.youtube.apiKey
    const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails&id=${item.content_id}&key=${apiKey}`
    
    const response = await fetch(statsUrl)
    
    if (!response.ok) {
        throw new Error(`YouTube API returned status: ${response.status}`)
    }
    
    const data = await response.json()
    
    if (!data.items || data.items.length === 0) {
        throw new Error('No data found for this YouTube video')
    }
    
    const stats = data.items[0].statistics
    const contentDetails = data.items[0].contentDetails
    
    // Calculate estimated watch time in hours based on views and duration
    // Using industry average retention rate of ~50% for YouTube videos
    let watchTimeHours = 0
    if (contentDetails && contentDetails.duration && stats.viewCount) {
        const durationInSeconds = parseDuration(contentDetails.duration)
        // Assume average viewer watches 50% of the video
        const averageViewDurationSeconds = durationInSeconds * 0.5
        const totalWatchTimeSeconds = averageViewDurationSeconds * parseInt(stats.viewCount)
        watchTimeHours = totalWatchTimeSeconds / 3600 // Convert to hours
    }
    
    return {
        views: parseInt(stats.viewCount) || 0,
        likes: parseInt(stats.likeCount) || 0,
        comments: parseInt(stats.commentCount) || 0,
        watchTime: watchTimeHours
    }
}

// Helper function to parse YouTube duration format (PT1H2M10S) into seconds
function parseDuration(duration) {
    const matches = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
    const hours = parseInt(matches[1] || 0)
    const minutes = parseInt(matches[2] || 0)
    const seconds = parseInt(matches[3] || 0)
    return hours * 3600 + minutes * 60 + seconds
}

// Fetch ServiceNow engagement data
async function fetchServiceNowEngagement(item) {
    if (!apiConfig.servicenow.instance || !apiConfig.servicenow.username) {
        throw new Error('ServiceNow API not configured')
    }
    
    // For demo purposes, return simulated data with estimated watch time
    // In production, this would make an actual API call
    const views = Math.floor(Math.random() * 1000)
    // Estimate 5-15 minutes per view for articles
    const avgReadTimeMinutes = Math.random() * 10 + 5
    const watchTimeHours = (views * avgReadTimeMinutes) / 60
    
    return {
        views: views,
        likes: Math.floor(Math.random() * 50),
        comments: Math.floor(Math.random() * 20),
        watchTime: watchTimeHours
    }
}

// Fetch LinkedIn engagement data
async function fetchLinkedInEngagement(item) {
    if (!apiConfig.linkedin.clientId || !apiConfig.linkedin.clientSecret) {
        throw new Error('LinkedIn API not configured')
    }
    
    // For demo purposes, return simulated data with estimated watch time
    // In production, this would make an actual API call
    const views = Math.floor(Math.random() * 5000)
    // Estimate 2-5 minutes per view for posts
    const avgReadTimeMinutes = Math.random() * 3 + 2
    const watchTimeHours = (views * avgReadTimeMinutes) / 60
    
    return {
        views: views,
        likes: Math.floor(Math.random() * 200),
        comments: Math.floor(Math.random() * 50),
        watchTime: watchTimeHours
    }
}

// Fetch Reddit engagement data
async function fetchRedditEngagement(item) {
    if (!apiConfig.reddit.clientId || !apiConfig.reddit.clientSecret) {
        throw new Error('Reddit API not configured')
    }
    
    // For demo purposes, return simulated data with estimated watch time
    // In production, this would make an actual API call
    const views = Math.floor(Math.random() * 1000)
    // Estimate 2-5 minutes per view for posts
    const avgReadTimeMinutes = Math.random() * 3 + 2
    const watchTimeHours = (views * avgReadTimeMinutes) / 60
    
    return {
        views: views,
        likes: Math.floor(Math.random() * 200),
        comments: Math.floor(Math.random() * 50),
        watchTime: watchTimeHours
    }
}

// Fetch Twitter engagement data
async function fetchTwitterEngagement(item) {
    if (!apiConfig.twitter.apiKey || !apiConfig.twitter.apiKeySecret) {
        throw new Error('Twitter API not configured')
    }
    
    // For demo purposes, return simulated data with estimated watch time
    // In production, this would make an actual API call
    const views = Math.floor(Math.random() * 1000)
    // Estimate 2-5 minutes per view for tweets
    const avgReadTimeMinutes = Math.random() * 3 + 2
    const watchTimeHours = (views * avgReadTimeMinutes) / 60
    
    return {
        views: views,
        likes: Math.floor(Math.random() * 200),
        comments: Math.floor(Math.random() * 50),
        watchTime: watchTimeHours
    }
}

// Fetch Slack engagement data
async function fetchSlackEngagement(item) {
    if (!apiConfig.slack.botToken || !apiConfig.slack.signingSecret) {
        throw new Error('Slack API not configured')
    }
    
    // For demo purposes, return simulated data with estimated watch time
    // In production, this would make an actual API call
    const views = Math.floor(Math.random() * 1000)
    // Estimate 2-5 minutes per view for messages
    const avgReadTimeMinutes = Math.random() * 3 + 2
    const watchTimeHours = (views * avgReadTimeMinutes) / 60
    
    return {
        views: views,
        likes: Math.floor(Math.random() * 200),
        comments: Math.floor(Math.random() * 50),
        watchTime: watchTimeHours
    }
}

// Render content items in the table
function renderContentItems() {
    const contentList = document.getElementById('content-list')
    contentList.innerHTML = ''
    
    contentItems.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).forEach(item => {
        const row = document.createElement('tr')
        row.innerHTML = `
            <td class="px-6 py-4">
                <div class="text-sm font-medium text-gray-900 dark:text-white">${item.name}</div>
                ${item.description ? `<div class="text-sm text-gray-500 dark:text-gray-400">${item.description}</div>` : ''}
            </td>
            <td class="px-6 py-4">
                <span class="badge ${item.platform}">${item.platform}</span>
            </td>
            <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                ${new Date(item.published_date).toLocaleDateString()}
            </td>
            <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                ${new Date(item.created_at).toLocaleDateString()}
            </td>
            <td class="px-6 py-4">
                <a href="${item.url}" target="_blank" class="text-blue-600 dark:text-blue-400 hover:underline text-sm">
                    ${item.url}
                </a>
            </td>
            <td class="px-6 py-4 text-right text-sm font-medium">
                <button onclick="handleContentDeletion(${item.id})" class="text-red-600 dark:text-red-400 hover:text-red-900">
                    <span class="material-icons">delete</span>
                </button>
            </td>
        `
        contentList.appendChild(row)
    })
}

// Render engagement data in the table
function renderEngagementData() {
    const engagementList = document.getElementById('engagement-list');
    if (!engagementList) return;
    
    engagementList.innerHTML = '';
    
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
        .forEach(({ content, engagement }) => {
            const row = document.createElement('tr');
            
            const watchTimeStr = engagement?.watch_time ? formatWatchTime(engagement.watch_time) : '-';
            const lastUpdated = engagement ? new Date(engagement.timestamp).toLocaleString() : '-';
            
            row.innerHTML = `
                <td class="px-6 py-4">
                    <div class="text-sm font-medium text-gray-900 dark:text-white">${content.name}</div>
                    ${content.description ? `<div class="text-sm text-gray-500 dark:text-gray-400">${content.description}</div>` : ''}
                </td>
                <td class="px-6 py-4">
                    <span class="badge ${content.platform}">${content.platform}</span>
                </td>
                <td class="px-6 py-4 text-sm text-gray-900 dark:text-white">
                    ${engagement ? engagement.views.toLocaleString() : '-'}
                </td>
                <td class="px-6 py-4 text-sm text-gray-900 dark:text-white">
                    ${watchTimeStr}
                </td>
                <td class="px-6 py-4 text-sm text-gray-900 dark:text-white">
                    ${engagement ? engagement.likes.toLocaleString() : '-'}
                </td>
                <td class="px-6 py-4 text-sm text-gray-900 dark:text-white">
                    ${engagement ? engagement.comments.toLocaleString() : '-'}
                </td>
                <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                    ${lastUpdated}
                </td>
            `;
            
            engagementList.appendChild(row);
        });
}

// Helper function to format watch time
function formatWatchTime(hours) {
    if (!hours) return '-';
    const wholeHours = Math.floor(hours);
    const minutes = Math.round((hours - wholeHours) * 60);
    return `${wholeHours}h ${minutes}m`;
}

function renderPlatformSpecificMetrics(contentItem, latestData) {
    switch (contentItem.type) {
        case 'reddit':
            return `
                <div class="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <h4 class="text-sm font-medium mb-2 dark:text-white">Reddit-Specific Metrics</h4>
                    <div class="grid grid-cols-2 gap-4">
                        ${renderMetricCard('Upvote Ratio', (latestData.likes / (latestData.likes + latestData.dislikes) * 100).toFixed(1) + '%', 'trending_up')}
                        ${renderMetricCard('Awards', latestData.awards || 0, 'stars')}
                    </div>
                </div>
            `;
        
        case 'twitter':
            return `
                <div class="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <h4 class="text-sm font-medium mb-2 dark:text-white">Twitter-Specific Metrics</h4>
                    <div class="grid grid-cols-2 gap-4">
                        ${renderMetricCard('Retweets', latestData.shares, 'repeat')}
                        ${renderMetricCard('Quote Tweets', latestData.quotes || 0, 'format_quote')}
                    </div>
                </div>
            `;
        
        case 'slack':
            return `
                <div class="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <h4 class="text-sm font-medium mb-2 dark:text-white">Slack-Specific Metrics</h4>
                    <div class="grid grid-cols-2 gap-4">
                        ${renderMetricCard('Thread Participants', latestData.thread_participants || 0, 'group')}
                        ${renderMetricCard('Reactions', latestData.reactions || 0, 'emoji_emotions')}
                    </div>
                </div>
            `;
        
        default:
            return '';
    }
}

function renderMetricCard(label, value, icon) {
    return `
        <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <div class="flex items-center mb-2">
                <span class="material-icons text-gray-500 dark:text-gray-400 mr-2">${icon}</span>
                <span class="text-sm font-medium text-gray-500 dark:text-gray-400">${label}</span>
            </div>
            <div class="text-2xl font-bold text-gray-900 dark:text-white">
                ${typeof value === 'number' ? value.toLocaleString() : value}
            </div>
        </div>
    `;
}

function renderWatchTimeMetric(watchTime) {
    if (typeof watchTime !== 'number') return '';
    
    const hours = Math.floor(watchTime);
    const minutes = Math.round((watchTime - hours) * 60);
    
    return `
        <div class="mt-4 bg-green-50 dark:bg-green-900 rounded-lg p-4">
            <div class="flex items-center mb-2">
                <span class="material-icons text-green-600 dark:text-green-400 mr-2">timer</span>
                <span class="text-sm font-medium text-green-600 dark:text-green-400">Total Watch Time</span>
            </div>
            <div class="text-2xl font-bold text-green-700 dark:text-green-300">
                ${hours}h ${minutes}m
            </div>
        </div>
    `;
}

// Update statistics cards
function updateStats() {
    // Helper function to safely update element text content
    const safeSetTextContent = (id, value) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    };

    // Calculate total content count
    safeSetTextContent('total-content', contentItems.length.toLocaleString());

    // Calculate total views
    const totalViews = engagementData.reduce((sum, data) => sum + (data.views || 0), 0);
    safeSetTextContent('total-engagements', totalViews.toLocaleString());
    safeSetTextContent('total-views', totalViews.toLocaleString());

    // Calculate total watch time
    const totalWatchTime = engagementData.reduce((sum, data) => sum + (data.watch_time || 0), 0);
    const hours = Math.floor(totalWatchTime);
    const minutes = Math.round((totalWatchTime - hours) * 60);
    safeSetTextContent('total-watch-time', `${hours}h ${minutes}m`);

    // Calculate total engagement (likes + comments + shares)
    const totalEngagement = engagementData.reduce((sum, data) => 
        sum + (data.likes || 0) + (data.comments || 0) + (data.shares || 0), 0);
    safeSetTextContent('total-engagement', totalEngagement.toLocaleString());

    // Find top platform by views
    const platformViews = contentItems.reduce((acc, item) => {
        const latestEngagement = engagementData
            .filter(e => e.content_id === item.id)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
        
        if (latestEngagement) {
            acc[item.type] = (acc[item.type] || 0) + latestEngagement.views;
        }
        return acc;
    }, {});

    const platformLabels = {
        youtube: 'YouTube',
        servicenow: 'ServiceNow',
        linkedin: 'LinkedIn',
        reddit: 'Reddit',
        twitter: 'Twitter',
        slack: 'Slack'
    };

    const topPlatform = Object.entries(platformViews)
        .sort(([,a], [,b]) => b - a)[0];
    
    safeSetTextContent('top-platform', topPlatform ? platformLabels[topPlatform[0]] : '-');

    // Update profile stats if profile is open
    const profileContentCount = document.getElementById('profile-content-count');
    const profileViewsCount = document.getElementById('profile-views-count');
    if (profileContentCount && profileViewsCount) {
        profileContentCount.textContent = contentItems.length.toLocaleString();
        profileViewsCount.textContent = totalViews.toLocaleString();
    }

    // Safely update charts
    try {
        renderCharts();
    } catch (error) {
        console.warn('Error rendering charts:', error);
    }
}

// Render charts
function renderCharts() {
    const platformChartCanvas = document.getElementById('platform-chart');
    const contentChartCanvas = document.getElementById('content-chart');
    const trendsChartCanvas = document.getElementById('trends-chart');

    if (platformChartCanvas) {
        try {
            renderPlatformChart();
        } catch (error) {
            console.warn('Error rendering platform chart:', error);
        }
    }

    if (contentChartCanvas) {
        try {
            renderContentChart();
        } catch (error) {
            console.warn('Error rendering content chart:', error);
        }
    }

    if (trendsChartCanvas) {
        try {
            renderTrendsChart();
        } catch (error) {
            console.warn('Error rendering trends chart:', error);
        }
    }
}

// Render platform engagement chart
function renderPlatformChart() {
    const canvas = document.getElementById('platform-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Calculate total views per platform
    const platformData = contentItems.reduce((acc, item) => {
        const latestEngagement = engagementData
            .filter(e => e.content_id === item.id)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
        
        if (latestEngagement) {
            acc[item.platform] = (acc[item.platform] || 0) + latestEngagement.views;
        }
        return acc;
    }, {});
    
    // Create or update chart
    if (window.platformChart) {
        window.platformChart.destroy();
    }
    
    window.platformChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(platformData).map(p => p.charAt(0).toUpperCase() + p.slice(1)),
            datasets: [{
                data: Object.values(platformData),
                backgroundColor: [
                    '#FF0000', // YouTube red
                    '#00c487', // ServiceNow green
                    '#0A66C2', // LinkedIn blue
                    '#FF4500', // Reddit orange
                    '#1DA1F2', // Twitter blue
                    '#4A154B'  // Slack purple
                ]
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: document.documentElement.classList.contains('dark') ? '#fff' : '#000'
                    }
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
    const topContent = contentItems
        .map(item => {
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
    
    window.contentChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: topContent.map(c => c.name),
            datasets: [{
                label: 'Views',
                data: topContent.map(c => c.views),
                backgroundColor: topContent.map(c => {
                    switch (c.platform) {
                        case 'youtube': return '#FF0000';
                        case 'servicenow': return '#00c487';
                        case 'linkedin': return '#0A66C2';
                        case 'reddit': return '#FF4500';
                        case 'twitter': return '#1DA1F2';
                        case 'slack': return '#4A154B';
                        default: return '#6B7280';
                    }
                })
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: false
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

// Update charts for dark mode
function updateChartsForColorMode() {
    if (window.platformChart) {
        window.platformChart.options.plugins.legend.labels.color = 
            document.documentElement.classList.contains('dark') ? '#fff' : '#000'
        window.platformChart.update()
    }
    
    if (window.contentChart) {
        window.contentChart.options.scales.y.ticks.color = 
        window.contentChart.options.scales.x.ticks.color = 
            document.documentElement.classList.contains('dark') ? '#fff' : '#000'
        window.contentChart.update()
    }
}

// Test API connections
async function testYouTubeApi() {
    try {
        if (!apiConfig.youtube.apiKey) {
            throw new Error('API key not configured')
        }
        
        const response = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=snippet&chart=mostPopular&maxResults=1&key=${apiConfig.youtube.apiKey}`
        )
        
        if (!response.ok) {
            throw new Error(`API returned status: ${response.status}`)
        }
        
        document.getElementById('youtube-api-status').textContent = 'Connected'
        document.getElementById('youtube-api-status').className = 
            'badge bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 ml-2'
        
        showSuccessNotification('YouTube API connection successful')
    } catch (error) {
        document.getElementById('youtube-api-status').textContent = 'Not Connected'
        document.getElementById('youtube-api-status').className = 
            'badge bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300 ml-2'
        
        showErrorNotification(`YouTube API test failed: ${error.message}`)
    }
}

async function testServiceNowApi() {
    try {
        if (!apiConfig.servicenow.instance || !apiConfig.servicenow.username) {
            throw new Error('API not configured')
        }
        
        // For demo purposes, just check if config exists
        document.getElementById('servicenow-api-status').textContent = 'Connected'
        document.getElementById('servicenow-api-status').className = 
            'badge bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 ml-2'
        
        showSuccessNotification('ServiceNow API connection successful')
    } catch (error) {
        document.getElementById('servicenow-api-status').textContent = 'Not Connected'
        document.getElementById('servicenow-api-status').className = 
            'badge bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300 ml-2'
        
        showErrorNotification(`ServiceNow API test failed: ${error.message}`)
    }
}

async function testLinkedInApi() {
    const clientId = document.getElementById('linkedin-client-id').value.trim();
    const clientSecret = document.getElementById('linkedin-client-secret').value.trim();
    
    try {
        // Check if both fields are filled
        if (!clientId || !clientSecret) {
            throw new Error('Please fill in both Client ID and Client Secret');
        }

        // Validate format of Client ID (12 characters)
        if (clientId.length !== 12) {
            throw new Error('Client ID should be 12 characters long');
        }

        // Validate format of Client Secret (16 characters)
        if (clientSecret.length !== 16) {
            throw new Error('Client Secret should be 16 characters long');
        }

        // Update status to testing
        const statusElement = document.getElementById('linkedin-api-status');
        statusElement.textContent = 'Testing...';
        statusElement.className = 'badge bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300 ml-2';

        // Test LinkedIn OAuth endpoint
        const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                'grant_type': 'client_credentials',
                'client_id': clientId,
                'client_secret': clientSecret
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error_description || 'Failed to authenticate with LinkedIn');
        }

        // Update status to success
        statusElement.textContent = 'Connected';
        statusElement.className = 'badge bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 ml-2';
        
        // Save the configuration
        apiConfig.linkedin = {
            clientId: clientId,
            clientSecret: clientSecret
        };
        
        showSuccessNotification('LinkedIn API connection successful');
    } catch (error) {
        // Update status to error
        const statusElement = document.getElementById('linkedin-api-status');
        statusElement.textContent = 'Not Connected';
        statusElement.className = 'badge bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300 ml-2';
        
        showErrorNotification(`LinkedIn API test failed: ${error.message}`);
        console.error('LinkedIn API test error:', error);
    }
}

// Update the LinkedIn API configuration save handler
function saveLinkedInConfig() {
    const clientId = document.getElementById('linkedin-client-id').value.trim();
    const clientSecret = document.getElementById('linkedin-client-secret').value.trim();
    
    // Basic validation
    if (!clientId || !clientSecret) {
        showErrorNotification('Please fill in both LinkedIn Client ID and Client Secret');
        return false;
    }
    
    // Update the global apiConfig
    apiConfig.linkedin = {
        clientId: clientId,
        clientSecret: clientSecret
    };
    
    return true;
}

// Add event listener for LinkedIn config changes
document.addEventListener('DOMContentLoaded', () => {
    const linkedinClientId = document.getElementById('linkedin-client-id');
    const linkedinClientSecret = document.getElementById('linkedin-client-secret');
    
    if (linkedinClientId && linkedinClientSecret) {
        linkedinClientId.addEventListener('change', () => {
            const statusElement = document.getElementById('linkedin-api-status');
            statusElement.textContent = 'Not Tested';
            statusElement.className = 'badge bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300 ml-2';
        });
        
        linkedinClientSecret.addEventListener('change', () => {
            const statusElement = document.getElementById('linkedin-api-status');
            statusElement.textContent = 'Not Tested';
            statusElement.className = 'badge bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300 ml-2';
        });
    }
});

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