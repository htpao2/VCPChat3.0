// modules/ipc/sovitsHandlers.refactored.js
const { ipcMain } = require('electron');
const SovitsTTS = require('../SovitsTTS'); // The original class still manages the queue for the desktop app
const ttsService = require('../../src/services/ttsService');

let sovitsTTSInstance = null;
let internalMainWindow = null;

// This is a temporary bridge. The long-term goal would be for the SovitsTTS class itself to use the ttsService.
// For now, we will inject the service's functionality into the old class structure.
function patchSovitsTTS_to_use_service() {
    SovitsTTS.prototype.getModels = function(forceRefresh = false) {
        // The desktop app assumes a hardcoded local server.
        const ttsServerUrl = "http://127.0.0.1:8000";
        return ttsService.getModels(forceRefresh, ttsServerUrl);
    };

    SovitsTTS.prototype.textToSpeech = function(text, voice, speed) {
        const ttsServerUrl = "http://127.0.0.1:8000";
        return ttsService.speak({ text, voice, speed }, ttsServerUrl);
    };
}


function initialize(mainWindow, context) { // Added context
    if (!mainWindow) {
        console.error("SovitsTTS needs the main window to initialize.");
        return;
    }
    internalMainWindow = mainWindow;

    // Initialize the service with the correct paths
    ttsService.initialize(context);

    // Patch the old class to use the new service
    patchSovitsTTS_to_use_service();

    // Now, create an instance of the patched class
    sovitsTTSInstance = new SovitsTTS();

    ipcMain.handle('sovits-get-models', async (event, forceRefresh) => {
        if (!sovitsTTSInstance) return null;
        return await sovitsTTSInstance.getModels(forceRefresh);
    });

    ipcMain.on('sovits-speak', (event, options) => {
        if (!sovitsTTSInstance) return;
        sovitsTTSInstance.stop();
        sovitsTTSInstance.speak(options, event.sender);
    });

    ipcMain.on('sovits-stop', () => {
        if (sovitsTTSInstance) {
            sovitsTTSInstance.stop();
        }
        if (internalMainWindow && !internalMainWindow.isDestroyed()) {
            internalMainWindow.webContents.send('stop-tts-audio');
        }
    });

    console.log('Refactored SovitsTTS IPC handlers initialized.');
}

module.exports = {
    initialize
};
