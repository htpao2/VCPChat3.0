// modules/ipc/settingsHandlers.refactored.js
const { ipcMain, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const settingsService = require('../../src/services/settingsService');

/**
 * Initializes settings and theme related IPC handlers using the settingsService.
 * @param {object} paths - An object containing required paths.
 */
function initialize(paths) {
    // Initialize the service
    settingsService.initialize(paths);
    const { USER_AVATAR_FILE } = paths;

    // A helper to wrap service calls and handle errors
    const wrapServiceCall = (serviceFn) => async (event, ...args) => {
        try {
            const result = await serviceFn(...args);
            return result;
        } catch (error) {
            console.error(`Error in settings service call ${serviceFn.name}:`, error);
            return { error: error.message };
        }
    };

    // Handlers that are now simple wrappers around the service
    ipcMain.handle('save-settings', wrapServiceCall(settingsService.saveSettings));
    ipcMain.handle('save-avatar-color', wrapServiceCall(settingsService.saveAvatarColor));

    // The 'load-settings' handler needs special handling to convert the service's response
    // into a file:// URL that Electron's renderer process can use.
    ipcMain.handle('load-settings', async () => {
        try {
            const settings = await settingsService.loadSettings();

            // The service returns a generic 'local-path://' marker.
            // This IPC handler is responsible for converting it to the Electron-specific format.
            if (settings.userAvatarUrl && settings.userAvatarUrl.startsWith('local-path://')) {
                 if (await fs.pathExists(USER_AVATAR_FILE)) {
                    // Prepend with file:// protocol and add a timestamp to prevent caching
                    settings.userAvatarUrl = `file://${USER_AVATAR_FILE}?t=${Date.now()}`;
                } else {
                    settings.userAvatarUrl = null;
                }
            }
            return settings;
        } catch (error) {
            console.error('加载设置失败:', error);
            return {
                error: error.message,
                sidebarWidth: 260,
                notificationsSidebarWidth: 300,
                userAvatarUrl: null
            };
        }
    });


    // Theme control is purely an Electron UI concern, so it stays in the IPC handler.
    ipcMain.on('set-theme', (event, theme) => {
        if (theme === 'light' || theme === 'dark') {
            nativeTheme.themeSource = theme;
            console.log(`[Main] Theme source explicitly set to: ${theme}`);
        }
    });
}

module.exports = {
    initialize
};
