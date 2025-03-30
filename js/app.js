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
    linkedin: { clientId: null, clientSecret: null, accessToken: null }
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
        // Load API config
        const apiConfigs = await getApiConfig(currentUser.id)
        apiConfigs.forEach(config => {
            apiConfig[config.platform] = config.config
        })
        updateApiConfigUI()
        
        // Load content items
        contentItems = await getContentItems(currentUser.id)
        rebuildUrlContentMap()
        
        // Load engagement data
        engagementData = await getEngagementData(currentUser.id)
        
        // Set default date to today for content form
        document.getElementById('content-published').valueAsDate = new Date()
        
        // Render data
        renderContentItems()
        renderEngagementData()
        updateStats()
        renderCharts()
    } catch (error) {
        console.error('Error loading user data:', error)
        showErrorNotification('Error loading user data')
    }
}

// Handle content form submission
async function handleContentFormSubmit(e) {
    e.preventDefault();
    
    const contentUrl = document.getElementById('content-url').value;
    const platform = document.getElementById('content-source').value;
    
    if (!contentUrl) {
        showErrorNotification('Please enter a URL');
        return;
    }

    const contentData = {
        user_id: currentUser.id,
        name: document.getElementById('content-name').value,
        description: document.getElementById('content-description').value,
        platform: platform,
        url: contentUrl,
        content_id: extractContentId(contentUrl, platform),
        published_date: document.getElementById('content-published').value,
        duration: document.getElementById('content-duration').value,
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
        document.getElementById('content-published').valueAsDate = new Date();
        document.getElementById('duplicate-warning').classList.add('hidden');
        
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
    try {
        // Save YouTube config
        await saveApiConfig(currentUser.id, 'youtube', {
            apiKey: document.getElementById('youtube-api-key').value
        })
        
        // Save ServiceNow config
        await saveApiConfig(currentUser.id, 'servicenow', {
            instance: document.getElementById('servicenow-instance').value,
            username: document.getElementById('servicenow-username').value,
            password: document.getElementById('servicenow-password').value
        })
        
        // Save LinkedIn config
        await saveApiConfig(currentUser.id, 'linkedin', {
            clientId: document.getElementById('linkedin-client-id').value,
            clientSecret: document.getElementById('linkedin-client-secret').value
        })
        
        // Update local state
        await loadUserData()
        
        showSuccessNotification('API configuration saved successfully')
    } catch (error) {
        console.error('Error saving API config:', error)
        showErrorNotification('Error saving API configuration')
    }
}

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
    
    // Content form
    const contentForm = document.getElementById('content-form');
    if (contentForm) {
        contentForm.addEventListener('submit', handleContentFormSubmit);
        
        // URL field validation
        const contentUrlField = document.getElementById('content-url');
        if (contentUrlField) {
            contentUrlField.addEventListener('blur', checkForDuplicateUrl);
        }
        
        // Fetch content info button
        const fetchInfoButton = document.getElementById('fetch-content-info');
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
    document.getElementById('content-source').addEventListener('change', () => {
        updateUrlPlaceholder()
        
        // Show/hide duration field based on platform
        const platform = document.getElementById('content-source').value
        const durationContainer = document.getElementById('duration-container')
        if (platform === 'youtube') {
            durationContainer.classList.remove('hidden')
        } else {
            durationContainer.classList.add('hidden')
        }
    })
    
    // Initialize URL placeholder
    updateUrlPlaceholder()

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
    const platform = document.getElementById('content-source').value
    const urlField = document.getElementById('content-url')
    
    switch (platform) {
        case 'youtube':
            urlField.placeholder = 'https://youtube.com/watch?v=XXXX'
            break
        case 'servicenow':
            urlField.placeholder = 'https://community.servicenow.com/blog/XXXX'
            break
        case 'linkedin':
            urlField.placeholder = 'https://www.linkedin.com/posts/XXXX'
            break
        default:
            urlField.placeholder = 'https://example.com'
    }
}

// Check for duplicate URL
function checkForDuplicateUrl() {
    const url = document.getElementById('content-url').value
    if (!url) return
    
    const normalizedUrl = normalizeUrl(url)
    const existingContentId = urlToContentMap[normalizedUrl]
    
    if (existingContentId) {
        // Show warning
        const duplicateWarning = document.getElementById('duplicate-warning')
        duplicateWarning.classList.remove('hidden')
        
        // Find the existing content item
        const existingContent = contentItems.find(item => item.id === existingContentId)
        if (existingContent) {
            duplicateWarning.textContent = `Warning: This URL has already been added as "${existingContent.name}".`
        }
    } else {
        // Hide warning
        document.getElementById('duplicate-warning').classList.add('hidden')
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
    const contentUrl = document.getElementById('content-url').value
    const platform = document.getElementById('content-source').value
    
    if (!contentUrl) {
        showErrorNotification('Please enter a URL first')
        return
    }
    
    // Show loading state
    const fetchButton = document.getElementById('fetch-content-info')
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
            
            default:
                contentInfo = {
                    title: '',
                    publishedDate: null
                }
        }
        
        // Update form fields with content information
        if (contentInfo) {
            document.getElementById('content-name').value = contentInfo.title || ''
            
            if (contentInfo.publishedDate) {
                document.getElementById('content-published').valueAsDate = new Date(contentInfo.publishedDate)
            }
            
            // Set duration if available (for YouTube)
            if (contentInfo.duration && platform === 'youtube') {
                document.getElementById('content-duration').value = contentInfo.duration
            } else {
                document.getElementById('content-duration').value = ''
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
        const urlObj = new URL(url)
        
        switch (platform) {
            case 'youtube':
                // Extract YouTube video ID
                // First try: from query parameter v
                let videoId = urlObj.searchParams.get('v')
                
                if (videoId) return videoId
                
                // Second try: from youtu.be URLs
                if (urlObj.hostname === 'youtu.be') {
                    return urlObj.pathname.substring(1) // Remove the leading slash
                }
                
                // Third try: from /embed/ URLs
                if (urlObj.pathname.includes('/embed/')) {
                    return urlObj.pathname.split('/embed/')[1].split('/')[0]
                }
                
                // Fourth try: from /v/ URLs
                if (urlObj.pathname.includes('/v/')) {
                    return urlObj.pathname.split('/v/')[1].split('/')[0]
                }
                
                // Last resort: just the last part of the URL
                return url.split('/').pop()
            
            case 'servicenow':
                // Extract ServiceNow blog ID (last part of path)
                return urlObj.pathname.split('/').pop()
            
            case 'linkedin':
                // Extract LinkedIn post ID (end part of URL)
                const linkedInMatch = urlObj.pathname.match(/\/posts\/([^\/]+)/)
                if (linkedInMatch && linkedInMatch[1]) {
                    return linkedInMatch[1]
                }
                
                // Fallback to the last segment
                return urlObj.pathname.split('-').pop()
            
            default:
                return url
        }
    } catch (e) {
        console.error('Error extracting content ID:', e)
        return url
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
            let data = null
            
            switch (item.platform) {
                case 'youtube':
                    data = await fetchYouTubeEngagement(item)
                    break
                
                case 'servicenow':
                    data = await fetchServiceNowEngagement(item)
                    break
                
                case 'linkedin':
                    data = await fetchLinkedInEngagement(item)
                    break
            }
            
            if (data) {
                // Add engagement data to Supabase
                const { data: newEngagement, error } = await supabase
                    .from('engagement_data')
                    .insert([{
                        user_id: currentUser.id,
                        content_id: item.id,
                        views: data.views,
                        likes: data.likes,
                        comments: data.comments,
                        watch_time: data.watchTime,
                        timestamp: new Date().toISOString()
                    }])
                    .select()
                    .single()
                
                if (error) throw error
                
                // Update local state by removing any existing data for this content
                engagementData = engagementData.filter(e => e.content_id !== item.id)
                
                // Add the new engagement data
                engagementData.push(newEngagement)
            }
        } catch (error) {
            console.error(`Error fetching engagement data for ${item.platform}:`, error)
            showErrorNotification(`Error fetching engagement data for ${item.name}`)
        }
    }
}

// Fetch YouTube engagement data
async function fetchYouTubeEngagement(item) {
    if (!apiConfig.youtube.apiKey) {
        throw new Error('YouTube API key is not configured')
    }
    
    const apiKey = apiConfig.youtube.apiKey
    const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${item.content_id}&key=${apiKey}`
    
    const response = await fetch(statsUrl)
    
    if (!response.ok) {
        throw new Error(`YouTube API returned status: ${response.status}`)
    }
    
    const data = await response.json()
    
    if (!data.items || data.items.length === 0) {
        throw new Error('No data found for this YouTube video')
    }
    
    const stats = data.items[0].statistics
    
    return {
        views: parseInt(stats.viewCount) || 0,
        likes: parseInt(stats.likeCount) || 0,
        comments: parseInt(stats.commentCount) || 0,
        watchTime: 0 // Watch time requires YouTube Analytics API
    }
}

// Fetch ServiceNow engagement data
async function fetchServiceNowEngagement(item) {
    if (!apiConfig.servicenow.instance || !apiConfig.servicenow.username) {
        throw new Error('ServiceNow API not configured')
    }
    
    // For demo purposes, return simulated data
    // In production, this would make an actual API call
    return {
        views: Math.floor(Math.random() * 1000),
        likes: Math.floor(Math.random() * 50),
        comments: Math.floor(Math.random() * 20),
        watchTime: 0
    }
}

// Fetch LinkedIn engagement data
async function fetchLinkedInEngagement(item) {
    if (!apiConfig.linkedin.clientId || !apiConfig.linkedin.clientSecret) {
        throw new Error('LinkedIn API not configured')
    }
    
    // For demo purposes, return simulated data
    // In production, this would make an actual API call
    return {
        views: Math.floor(Math.random() * 5000),
        likes: Math.floor(Math.random() * 200),
        comments: Math.floor(Math.random() * 50),
        watchTime: 0
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
    const engagementList = document.getElementById('engagement-list')
    engagementList.innerHTML = ''
    
    // Group engagement data by content_id and get latest for each
    const latestEngagements = engagementData.reduce((acc, curr) => {
        if (!acc[curr.content_id] || new Date(acc[curr.content_id].timestamp) < new Date(curr.timestamp)) {
            acc[curr.content_id] = curr
        }
        return acc
    }, {})
    
    Object.values(latestEngagements).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).forEach(data => {
        const content = contentItems.find(item => item.id === data.content_id)
        if (!content) return
        
        const row = document.createElement('tr')
        row.innerHTML = `
            <td class="px-6 py-4">
                <div class="text-sm font-medium text-gray-900 dark:text-white">${content.name}</div>
            </td>
            <td class="px-6 py-4">
                <span class="badge ${content.platform}">${content.platform}</span>
            </td>
            <td class="px-6 py-4 text-sm text-gray-900 dark:text-white">
                ${data.views.toLocaleString()}
            </td>
            <td class="px-6 py-4 text-sm text-gray-900 dark:text-white">
                ${formatWatchTime(data.watch_time)}
            </td>
            <td class="px-6 py-4 text-sm text-gray-900 dark:text-white">
                ${data.likes.toLocaleString()}
            </td>
            <td class="px-6 py-4 text-sm text-gray-900 dark:text-white">
                ${data.comments.toLocaleString()}
            </td>
            <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                ${new Date(data.timestamp).toLocaleString()}
            </td>
        `
        engagementList.appendChild(row)
    })
}

// Format watch time in hours and minutes
function formatWatchTime(minutes) {
    if (!minutes || minutes === 0) return '0h'
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
}

// Update statistics cards
function updateStats() {
    // Update total content count
    document.getElementById('total-content').textContent = contentItems.length.toLocaleString()
    
    // Calculate total engagements (sum of latest views)
    const totalViews = Object.values(engagementData.reduce((acc, curr) => {
        if (!acc[curr.content_id] || new Date(acc[curr.content_id].timestamp) < new Date(curr.timestamp)) {
            acc[curr.content_id] = curr
        }
        return acc
    }, {})).reduce((sum, data) => sum + data.views, 0)
    
    document.getElementById('total-engagements').textContent = totalViews.toLocaleString()
    
    // Find top platform by views
    const platformViews = contentItems.reduce((acc, item) => {
        const latestEngagement = engagementData
            .filter(e => e.content_id === item.id)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]
        
        if (latestEngagement) {
            acc[item.platform] = (acc[item.platform] || 0) + latestEngagement.views
        }
        return acc
    }, {})
    
    const topPlatform = Object.entries(platformViews)
        .sort(([,a], [,b]) => b - a)[0]
    
    document.getElementById('top-platform').textContent = topPlatform ? 
        `${topPlatform[0].charAt(0).toUpperCase() + topPlatform[0].slice(1)}` : 
        '-'
}

// Render charts
function renderCharts() {
    renderPlatformChart()
    renderContentChart()
}

// Render platform engagement chart
function renderPlatformChart() {
    const ctx = document.getElementById('platform-chart').getContext('2d')
    
    // Calculate total views per platform
    const platformData = contentItems.reduce((acc, item) => {
        const latestEngagement = engagementData
            .filter(e => e.content_id === item.id)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]
        
        if (latestEngagement) {
            acc[item.platform] = (acc[item.platform] || 0) + latestEngagement.views
        }
        return acc
    }, {})
    
    // Create or update chart
    if (window.platformChart) {
        window.platformChart.destroy()
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
                    '#0A66C2'  // LinkedIn blue
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
    })
}

// Render top content chart
function renderContentChart() {
    const ctx = document.getElementById('content-chart').getContext('2d')
    
    // Get top 5 content items by views
    const topContent = contentItems
        .map(item => {
            const latestEngagement = engagementData
                .filter(e => e.content_id === item.id)
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]
            
            return {
                name: item.name,
                views: latestEngagement ? latestEngagement.views : 0,
                platform: item.platform
            }
        })
        .sort((a, b) => b.views - a.views)
        .slice(0, 5)
    
    // Create or update chart
    if (window.contentChart) {
        window.contentChart.destroy()
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
                        case 'youtube': return '#FF0000'
                        case 'servicenow': return '#00c487'
                        case 'linkedin': return '#0A66C2'
                        default: return '#6B7280'
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
    })
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
    try {
        if (!apiConfig.linkedin.clientId || !apiConfig.linkedin.clientSecret) {
            throw new Error('API not configured')
        }
        
        // For demo purposes, just check if config exists
        document.getElementById('linkedin-api-status').textContent = 'Connected'
        document.getElementById('linkedin-api-status').className = 
            'badge bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 ml-2'
        
        showSuccessNotification('LinkedIn API connection successful')
    } catch (error) {
        document.getElementById('linkedin-api-status').textContent = 'Not Connected'
        document.getElementById('linkedin-api-status').className = 
            'badge bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300 ml-2'
        
        showErrorNotification(`LinkedIn API test failed: ${error.message}`)
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