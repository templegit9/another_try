// Test file for collapsible sections
document.addEventListener('DOMContentLoaded', () => {
    console.log('Running collapsible sections test...');
    
    // Create test elements
    const testContainer = document.createElement('div');
    testContainer.id = 'test-container';
    testContainer.style.padding = '20px';
    document.body.appendChild(testContainer);
    
    // Create test sections
    const sections = [
        { id: 'test-section-1', title: 'Test Section 1' },
        { id: 'test-section-2', title: 'Test Section 2' },
        { id: 'test-section-3', title: 'Test Section 3' }
    ];
    
    sections.forEach(section => {
        // Create toggle button
        const toggle = document.createElement('div');
        toggle.id = `toggle-${section.id}`;
        toggle.className = 'flex items-center cursor-pointer mb-2';
        toggle.innerHTML = `
            <h3 class="text-lg font-medium">${section.title}</h3>
            <span class="material-icons text-gray-500 ml-2 transform transition-transform duration-200">expand_more</span>
        `;
        
        // Create content body
        const body = document.createElement('div');
        body.id = `${section.id}-body`;
        body.className = 'transition-all duration-300 overflow-hidden';
        body.innerHTML = `<div class="p-4 bg-gray-100">Content for ${section.title}</div>`;
        
        // Add to container
        testContainer.appendChild(toggle);
        testContainer.appendChild(body);
    });
    
    // Add test results container
    const resultsContainer = document.createElement('div');
    resultsContainer.id = 'test-results';
    resultsContainer.style.marginTop = '20px';
    resultsContainer.style.padding = '10px';
    resultsContainer.style.border = '1px solid #ccc';
    testContainer.appendChild(resultsContainer);
    
    // Current implementation (potentially problematic)
    function currentImplementation() {
        const sections = [
            { toggleId: 'toggle-test-section-1', bodyId: 'test-section-1-body' },
            { toggleId: 'toggle-test-section-2', bodyId: 'test-section-2-body' },
            { toggleId: 'toggle-test-section-3', bodyId: 'test-section-3-body' }
        ];

        sections.forEach(section => {
            const toggle = document.getElementById(section.toggleId);
            const body = document.getElementById(section.bodyId);
            
            if (toggle && body) {
                // Set initial state
                body.style.maxHeight = '0';
                body.style.overflow = 'hidden';
                body.style.transition = 'max-height 0.3s ease-out';
                
                // Get the icon element
                const icon = toggle.querySelector('.material-icons');
                if (icon) {
                    icon.style.transform = 'rotate(-90deg)';
                    icon.style.transition = 'transform 0.3s ease-out';
                }
                
                // Add click event listener
                toggle.addEventListener('click', () => {
                    const isExpanded = body.style.maxHeight !== '0px';
                    
                    if (isExpanded) {
                        // Collapse
                        body.style.maxHeight = '0';
                        if (icon) {
                            icon.style.transform = 'rotate(-90deg)';
                        }
                    } else {
                        // Expand
                        body.style.maxHeight = body.scrollHeight + 'px';
                        if (icon) {
                            icon.style.transform = 'rotate(0deg)';
                        }
                    }
                });
            }
        });
    }
    
    // Fixed implementation
    function fixedImplementation() {
        const sections = [
            { toggleId: 'toggle-test-section-1', bodyId: 'test-section-1-body' },
            { toggleId: 'toggle-test-section-2', bodyId: 'test-section-2-body' },
            { toggleId: 'toggle-test-section-3', bodyId: 'test-section-3-body' }
        ];

        sections.forEach(section => {
            const toggle = document.getElementById(section.toggleId);
            const body = document.getElementById(section.bodyId);
            
            if (toggle && body) {
                // Set initial state
                body.style.maxHeight = '0px'; // Use '0px' instead of '0'
                body.style.overflow = 'hidden';
                body.style.transition = 'max-height 0.3s ease-out';
                
                // Get the icon element
                const icon = toggle.querySelector('.material-icons');
                if (icon) {
                    icon.style.transform = 'rotate(-90deg)';
                    icon.style.transition = 'transform 0.3s ease-out';
                }
                
                // Add click event listener
                toggle.addEventListener('click', () => {
                    const isExpanded = body.style.maxHeight !== '0px';
                    
                    if (isExpanded) {
                        // Collapse
                        body.style.maxHeight = '0px'; // Use '0px' instead of '0'
                        if (icon) {
                            icon.style.transform = 'rotate(-90deg)';
                        }
                    } else {
                        // Expand
                        body.style.maxHeight = body.scrollHeight + 'px';
                        if (icon) {
                            icon.style.transform = 'rotate(0deg)';
                        }
                    }
                });
            }
        });
    }
    
    // Test the collapsible sections implementation
    function testCollapsibleSections() {
        const results = [];
        
        // Get all toggle elements
        const toggles = document.querySelectorAll('[id^="toggle-"]');
        results.push(`Found ${toggles.length} toggle elements`);
        
        // Get all body elements
        const bodies = document.querySelectorAll('[id$="-body"]');
        results.push(`Found ${bodies.length} body elements`);
        
        // Test current implementation
        results.push('<h3>Testing Current Implementation:</h3>');
        currentImplementation();
        
        // Test each section with current implementation
        toggles.forEach((toggle, index) => {
            const bodyId = toggle.id.replace('toggle-', '') + '-body';
            const body = document.getElementById(bodyId);
            
            if (!body) {
                results.push(`❌ Error: Body element with ID "${bodyId}" not found`);
                return;
            }
            
            // Check initial state
            const initialMaxHeight = body.style.maxHeight;
            results.push(`Section ${index + 1} initial maxHeight: ${initialMaxHeight}`);
            
            // Check icon
            const icon = toggle.querySelector('.material-icons');
            if (!icon) {
                results.push(`❌ Error: Icon element not found in toggle ${toggle.id}`);
                return;
            }
            
            const initialIconTransform = icon.style.transform;
            results.push(`Section ${index + 1} initial icon transform: ${initialIconTransform}`);
            
            // Simulate click
            toggle.click();
            
            // Check expanded state
            const expandedMaxHeight = body.style.maxHeight;
            results.push(`Section ${index + 1} expanded maxHeight: ${expandedMaxHeight}`);
            
            const expandedIconTransform = icon.style.transform;
            results.push(`Section ${index + 1} expanded icon transform: ${expandedIconTransform}`);
            
            // Simulate click again
            toggle.click();
            
            // Check collapsed state
            const collapsedMaxHeight = body.style.maxHeight;
            results.push(`Section ${index + 1} collapsed maxHeight: ${collapsedMaxHeight}`);
            
            const collapsedIconTransform = icon.style.transform;
            results.push(`Section ${index + 1} collapsed icon transform: ${collapsedIconTransform}`);
        });
        
        // Reset elements for fixed implementation test
        toggles.forEach(toggle => {
            toggle.removeEventListener('click', () => {});
        });
        
        bodies.forEach(body => {
            body.style.maxHeight = '';
            body.style.overflow = '';
            body.style.transition = '';
        });
        
        toggles.forEach(toggle => {
            const icon = toggle.querySelector('.material-icons');
            if (icon) {
                icon.style.transform = '';
                icon.style.transition = '';
            }
        });
        
        // Test fixed implementation
        results.push('<h3>Testing Fixed Implementation:</h3>');
        fixedImplementation();
        
        // Test each section with fixed implementation
        toggles.forEach((toggle, index) => {
            const bodyId = toggle.id.replace('toggle-', '') + '-body';
            const body = document.getElementById(bodyId);
            
            if (!body) {
                results.push(`❌ Error: Body element with ID "${bodyId}" not found`);
                return;
            }
            
            // Check initial state
            const initialMaxHeight = body.style.maxHeight;
            results.push(`Section ${index + 1} initial maxHeight: ${initialMaxHeight}`);
            
            // Check icon
            const icon = toggle.querySelector('.material-icons');
            if (!icon) {
                results.push(`❌ Error: Icon element not found in toggle ${toggle.id}`);
                return;
            }
            
            const initialIconTransform = icon.style.transform;
            results.push(`Section ${index + 1} initial icon transform: ${initialIconTransform}`);
            
            // Simulate click
            toggle.click();
            
            // Check expanded state
            const expandedMaxHeight = body.style.maxHeight;
            results.push(`Section ${index + 1} expanded maxHeight: ${expandedMaxHeight}`);
            
            const expandedIconTransform = icon.style.transform;
            results.push(`Section ${index + 1} expanded icon transform: ${expandedIconTransform}`);
            
            // Simulate click again
            toggle.click();
            
            // Check collapsed state
            const collapsedMaxHeight = body.style.maxHeight;
            results.push(`Section ${index + 1} collapsed maxHeight: ${collapsedMaxHeight}`);
            
            const collapsedIconTransform = icon.style.transform;
            results.push(`Section ${index + 1} collapsed icon transform: ${collapsedIconTransform}`);
        });
        
        // Display results
        const resultsElement = document.getElementById('test-results');
        resultsElement.innerHTML = '<h3>Test Results:</h3>' + results.join('');
    }
    
    // Run the test after a short delay to ensure elements are rendered
    setTimeout(testCollapsibleSections, 500);
}); 