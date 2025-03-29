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
        const user = await signIn(email, password)
        await loginUser(user)
        
        // Clear form and error
        e.target.reset()
        document.getElementById('login-error').classList.add('hidden')
    } catch (error) {
        document.getElementById('login-error').textContent = error.message
        document.getElementById('login-error').classList.remove('hidden')
    }
}

// Handle registration
async function handleRegister(e) {
    e.preventDefault()
    
    const name = document.getElementById('register-name').value
    const email = document.getElementById('register-email').value
    const password = document.getElementById('register-password').value
    const confirmPassword = document.getElementById('register-confirm-password').value
    
    if (password !== confirmPassword) {
        document.getElementById('register-error').textContent = 'Passwords do not match'
        document.getElementById('register-error').classList.remove('hidden')
        return
    }
    
    try {
        await signUp(email, password, name)
        
        // Show success message and switch to login
        const registerError = document.getElementById('register-error')
        registerError.textContent = 'Account created successfully! Please log in.'
        registerError.classList.remove('hidden')
        registerError.classList.add('text-green-500')
        
        // Switch to login tab
        document.getElementById('login-tab').click()
    } catch (error) {
        document.getElementById('register-error').textContent = error.message
        document.getElementById('register-error').classList.remove('hidden')
    }
}

// Login user and load their data
async function loginUser(user) {
    currentUser = user
    
    // Update UI
    document.getElementById('current-user-name').textContent = user.user_metadata.name
    document.getElementById('auth-content').style.display = 'none'
    document.getElementById('main-content').style.display = 'block'
    
    // Load user data
    await loadUserData()
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
    e.preventDefault()
    
    const contentData = {
        user_id: currentUser.id,
        name: document.getElementById('content-name').value,
        description: document.getElementById('content-description').value,
        platform: document.getElementById('content-source').value,
        url: document.getElementById('content-url').value,
        content_id: extractContentId(contentUrl, platform),
        published_date: document.getElementById('content-published').value,
        duration: document.getElementById('content-duration').value,
        created_at: new Date().toISOString()
    }
    
    try {
        // Add content to Supabase
        const newContent = await addContent(contentData)
        
        // Update local state
        contentItems.push(newContent)
        rebuildUrlContentMap()
        
        // Fetch initial engagement data
        await fetchEngagementData([newContent])
        
        // Update UI
        renderContentItems()
        renderEngagementData()
        updateStats()
        renderCharts()
        
        // Reset form
        e.target.reset()
        document.getElementById('content-published').valueAsDate = new Date()
        document.getElementById('duplicate-warning').classList.add('hidden')
        
        showSuccessNotification('Content added successfully')
    } catch (error) {
        console.error('Error adding content:', error)
        showErrorNotification('Error adding content')
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
    const userMenuButton = document.getElementById('user-menu-button')
    const userDropdown = document.getElementById('user-dropdown')
    
    userMenuButton.addEventListener('click', () => {
        userDropdown.classList.toggle('hidden')
    })
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!userMenuButton.contains(e.target) && !userDropdown.contains(e.target)) {
            userDropdown.classList.add('hidden')
        }
    })
    
    // Logout button
    document.getElementById('logout-button').addEventListener('click', async () => {
        try {
            await signOut()
            currentUser = null
            showAuthScreen()
        } catch (error) {
            console.error('Error signing out:', error)
            showErrorNotification('Error signing out')
        }
    })
    
    // Content form
    const contentForm = document.getElementById('content-form')
    const contentUrlField = document.getElementById('content-url')
    
    contentForm.addEventListener('submit', handleContentFormSubmit)
    contentUrlField.addEventListener('blur', checkForDuplicateUrl)
    document.getElementById('fetch-content-info').addEventListener('click', fetchContentInfo)
    
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

// Initialize the app when the page loads
window.addEventListener('DOMContentLoaded', initApp) 