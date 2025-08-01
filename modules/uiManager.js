/**
 * uiManager.js
 * 
 * Manages general UI functionalities like the title bar, resizers, theme, and clock.
 */
const uiManager = (() => {
    // --- Private Variables ---
    let globalSettingsRef = { get: () => ({}) }; // Reference to global settings
    let electronAPI = null;

    // DOM Elements (will be initialized in init)
    let leftSidebar, rightNotificationsSidebar, resizerLeft, resizerRight;
    let minimizeBtn, maximizeBtn, restoreBtn, closeBtn, settingsBtn;
    let themeToggleBtn;
    let digitalClockElement, dateDisplayElement, notificationTitleElement;
    let sidebarTabButtons, sidebarTabContents;


    // --- Private Functions ---

    /**
     * Sets up the custom title bar controls (minimize, maximize, close).
     */
    function setupTitleBarControls() {
        if (minimizeBtn) minimizeBtn.addEventListener('click', () => electronAPI.minimizeWindow());
        if (maximizeBtn) maximizeBtn.addEventListener('click', () => electronAPI.maximizeWindow());
        if (restoreBtn) restoreBtn.addEventListener('click', () => electronAPI.unmaximizeWindow());
        if (closeBtn) closeBtn.addEventListener('click', () => electronAPI.closeWindow());
        // if (settingsBtn) settingsBtn.addEventListener('click', () => electronAPI.openDevTools()); // This is now handled by the theme module

        if (electronAPI && typeof electronAPI.onWindowMaximized === 'function') {
            electronAPI.onWindowMaximized(() => {
                if (maximizeBtn) maximizeBtn.style.display = 'none';
                if (restoreBtn) restoreBtn.style.display = 'flex';
            });
        }
        if (electronAPI && typeof electronAPI.onWindowUnmaximized === 'function') {
            electronAPI.onWindowUnmaximized(() => {
                if (maximizeBtn) maximizeBtn.style.display = 'flex';
                if (restoreBtn) restoreBtn.style.display = 'none';
            });
        }
    }

    /**
     * Initializes the resizable sidebars.
     */
    function initializeResizers() {
        let isResizingLeft = false;
        let isResizingRight = false;
        let startX = 0;

        if (resizerLeft && leftSidebar) {
            resizerLeft.addEventListener('mousedown', (e) => {
                isResizingLeft = true;
                startX = e.clientX;
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
                if (leftSidebar) leftSidebar.style.transition = 'none';
            });
        }

        if (resizerRight && rightNotificationsSidebar) {
            resizerRight.addEventListener('mousedown', (e) => {
                if (!rightNotificationsSidebar.classList.contains('active')) {
                    electronAPI.sendToggleNotificationsSidebar();
                    requestAnimationFrame(() => {
                        isResizingRight = true;
                        startX = e.clientX;
                        document.body.style.cursor = 'col-resize';
                        document.body.style.userSelect = 'none';
                        rightNotificationsSidebar.style.transition = 'none';
                    });
                } else {
                    isResizingRight = true;
                    startX = e.clientX;
                    document.body.style.cursor = 'col-resize';
                    document.body.style.userSelect = 'none';
                    rightNotificationsSidebar.style.transition = 'none';
                }
            });
        }

        document.addEventListener('mousemove', (e) => {
            if (isResizingLeft && leftSidebar) {
                const deltaX = e.clientX - startX;
                const currentWidth = leftSidebar.offsetWidth;
                let newWidth = currentWidth + deltaX;
                newWidth = Math.max(parseInt(getComputedStyle(leftSidebar).minWidth, 10) || 180, Math.min(newWidth, parseInt(getComputedStyle(leftSidebar).maxWidth, 10) || 600));
                leftSidebar.style.width = `${newWidth}px`;
                startX = e.clientX;
            }
            if (isResizingRight && rightNotificationsSidebar && rightNotificationsSidebar.classList.contains('active')) {
                const deltaX = e.clientX - startX;
                const currentWidth = rightNotificationsSidebar.offsetWidth;
                let newWidth = currentWidth - deltaX;
                newWidth = Math.max(parseInt(getComputedStyle(rightNotificationsSidebar).minWidth, 10) || 220, Math.min(newWidth, parseInt(getComputedStyle(rightNotificationsSidebar).maxWidth, 10) || 600));
                rightNotificationsSidebar.style.width = `${newWidth}px`;
                startX = e.clientX;
            }
        });

        document.addEventListener('mouseup', async () => {
            let settingsChanged = false;
            const currentSettings = globalSettingsRef.get();

            if (isResizingLeft && leftSidebar) {
                leftSidebar.style.transition = '';
                const newSidebarWidth = leftSidebar.offsetWidth;
                if (currentSettings.sidebarWidth !== newSidebarWidth) {
                    currentSettings.sidebarWidth = newSidebarWidth;
                    settingsChanged = true;
                }
            }
            if (isResizingRight && rightNotificationsSidebar && rightNotificationsSidebar.classList.contains('active')) {
                rightNotificationsSidebar.style.transition = '';
                const newNotificationsWidth = rightNotificationsSidebar.offsetWidth;
                if (currentSettings.notificationsSidebarWidth !== newNotificationsWidth) {
                    currentSettings.notificationsSidebarWidth = newNotificationsWidth;
                    settingsChanged = true;
                }
            }

            isResizingLeft = false;
            isResizingRight = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            if (settingsChanged) {
                try {
                    await electronAPI.saveSettings(currentSettings);
                    console.log('Sidebar widths saved to settings.');
                } catch (error) {
                    console.error('Failed to save sidebar widths:', error);
                }
            }
        });
    }

    /**
     * Applies the specified theme (light/dark) to the document body.
     * @param {string} theme - The theme to apply ('light' or 'dark').
     */
    function applyTheme(theme) {
        const isLightTheme = theme === 'light';
        document.body.classList.toggle('light-theme', isLightTheme);

        const sunIcon = document.getElementById('sun-icon');
        const moonIcon = document.getElementById('moon-icon');

        if (sunIcon) sunIcon.style.display = isLightTheme ? 'none' : 'inline-block';
        if (moonIcon) moonIcon.style.display = isLightTheme ? 'inline-block' : 'none';
    }

    /**
     * Loads the theme preference from localStorage or follows the system theme.
     */
    function loadAndApplyThemePreference() {
        electronAPI.onThemeUpdated(applyTheme);

        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            console.log(`[Theme] Found saved theme: ${savedTheme}. Applying and notifying main process.`);
            applyTheme(savedTheme);
            electronAPI.setTheme(savedTheme);
        } else {
            console.log("[Theme] No saved theme found. Will follow system theme.");
        }
    }

    /**
     * Updates the digital clock and date display.
     */
    function updateDateTimeDisplay() {
        const now = new Date();
        if (digitalClockElement) {
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            if (!digitalClockElement.querySelector('.colon')) {
                digitalClockElement.innerHTML = `<span class="hours">${hours}</span><span class="colon">:</span><span class="minutes">${minutes}</span>`;
            } else {
                const hoursSpan = digitalClockElement.querySelector('.hours');
                const minutesSpan = digitalClockElement.querySelector('.minutes');
                if (hoursSpan) hoursSpan.textContent = hours;
                if (minutesSpan) minutesSpan.textContent = minutes;
            }
        }
        if (dateDisplayElement) {
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const dayOfWeek = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()];
            dateDisplayElement.textContent = `${month}-${day} ${dayOfWeek}`;
        }
    }

    /**
     * Initializes the digital clock display.
     */
    function initializeDigitalClock() {
        if (digitalClockElement && notificationTitleElement && dateDisplayElement) {
            notificationTitleElement.style.display = 'none';
            updateDateTimeDisplay();
            setInterval(updateDateTimeDisplay, 1000);
        } else {
            console.error('Digital clock, notification title, or date display element not found.');
        }
    }

    /**
     * Sets up the sidebar tabs functionality.
     */
    function setupSidebarTabs() {
        if (sidebarTabButtons) {
            sidebarTabButtons.forEach(button => {
                button.addEventListener('click', () => {
                    switchToTab(button.dataset.tab);
                });
            });
            // Default to 'agents' tab (or your preferred default)
            switchToTab('agents');
        }
    }

    /**
     * Switches to the specified tab.
     * @param {string} targetTab - The tab to switch to.
     */
    function switchToTab(targetTab) {
        if (sidebarTabButtons) {
            sidebarTabButtons.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tab === targetTab);
            });
        }
        if (sidebarTabContents) {
            sidebarTabContents.forEach(content => {
                const isActive = content.id === `tabContent${targetTab.charAt(0).toUpperCase() + targetTab.slice(1)}`;
                content.classList.toggle('active', isActive);
                if (isActive) {
                    if (targetTab === 'topics') {
                        if (window.topicListManager) {
                            window.topicListManager.loadTopicList(); // This might create/re-render the topic list and search input
                            window.topicListManager.setupTopicSearch(); // Explicitly set up search listeners after the tab is active and list loaded
                        }
                    } else if (targetTab === 'settings') {
                        if (window.settingsManager) {
                            window.settingsManager.displaySettingsForItem();
                        }
                    } else if (targetTab === 'agents') { // Assuming 'agents' is the ID for the items list tab content
                        // The items list (agents & groups) is always visible in a way,
                        // but this ensures other tab contents are hidden.
                        // loadItems() is usually called on init or after create/delete.
                    }
                }
            });
        }
    }


    // --- Public API ---
    return {
        init: (options) => {
            electronAPI = options.electronAPI;
            globalSettingsRef = options.refs.globalSettingsRef;

            // Assign DOM elements from options.elements
            leftSidebar = options.elements.leftSidebar;
            rightNotificationsSidebar = options.elements.rightNotificationsSidebar;
            resizerLeft = options.elements.resizerLeft;
            resizerRight = options.elements.resizerRight;
            minimizeBtn = options.elements.minimizeBtn;
            maximizeBtn = options.elements.maximizeBtn;
            restoreBtn = options.elements.restoreBtn;
            closeBtn = options.elements.closeBtn;
            settingsBtn = options.elements.settingsBtn;
            themeToggleBtn = options.elements.themeToggleBtn;
            digitalClockElement = options.elements.digitalClockElement;
            dateDisplayElement = options.elements.dateDisplayElement;
            notificationTitleElement = options.elements.notificationTitleElement;
            sidebarTabButtons = options.elements.sidebarTabButtons;
            sidebarTabContents = options.elements.sidebarTabContents;

            // Initialize all features
            setupTitleBarControls();
            initializeResizers();
            loadAndApplyThemePreference();
            initializeDigitalClock();
            setupSidebarTabs();

            // Setup theme toggle button listener
            if (themeToggleBtn) {
                themeToggleBtn.addEventListener('click', () => {
                    const isCurrentlyLight = document.body.classList.contains('light-theme');
                    const newTheme = isCurrentlyLight ? 'dark' : 'light';
                    localStorage.setItem('theme', newTheme);
                    electronAPI.setTheme(newTheme);
                });
            }

            console.log('uiManager initialized.');
        },
        applyTheme: applyTheme, // Expose applyTheme if needed externally
        switchToTab: switchToTab // Expose switchToTab for external use
    };
})();

// Expose to window
window.uiManager = uiManager;