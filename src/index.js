// src/index.js - Headless Entry Point for VCP Services

const chatService = require('./services/chatService');
const settingsService = require('./services/settingsService');
// Import other services here as they are refactored
// const agentService = require('./services/agentService');

// This is the main object that will hold all our services
const services = {
    chatService,
    settingsService,
    // agentService,
};

/**
 * Initializes all backend services.
 * This function must be called before any service methods are used.
 * @param {object} config - A configuration object containing necessary parameters.
 * @param {object} config.paths - An object with required paths (e.g., AGENT_DIR, USER_DATA_DIR).
 */
function initialize(config) {
    console.log('Initializing VCP Services...');

    if (!config || !config.paths) {
        throw new Error('Service initialization requires a configuration object with paths.');
    }

    // Initialize each service with the required context
    // The context for each service might be slightly different, so we pass what's needed.
    settingsService.initialize(config.paths);
    chatService.initialize(config.paths);
    // agentService.initialize(config.paths);

    console.log('VCP Services Initialized.');
}

// To make this accessible in a browser/webview context for the mobile app,
// we can attach it to the window object. A bundler like Webpack or Browserify
// would be a more robust solution, but for this PoC, this is sufficient.
function attachToWindow(window) {
    if (!window) {
        console.warn('No window object provided; services will not be attached globally.');
        return;
    }
    window.VCP_SERVICES = {
        initialize,
        ...services,
    };
}

module.exports = {
    initialize,
    attachToWindow,
    ...services,
};
