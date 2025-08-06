// src/services/settingsService.js
const fs = require('fs-extra');
const path = require('path');

let SETTINGS_FILE;
let USER_AVATAR_FILE;
let AGENT_DIR;

function initialize(paths) {
    SETTINGS_FILE = paths.SETTINGS_FILE;
    USER_AVATAR_FILE = paths.USER_AVATAR_FILE;
    AGENT_DIR = paths.AGENT_DIR;
}

async function loadSettings() {
    let settings = {};
    if (await fs.pathExists(SETTINGS_FILE)) {
        settings = await fs.readJson(SETTINGS_FILE);
    }
    // Check for user avatar
    if (await fs.pathExists(USER_AVATAR_FILE)) {
        // In a headless context, we can't use file:// protocol.
        // We'll just return the path or a flag indicating it exists.
        // For now, let's return a special marker.
        settings.userAvatarUrl = `local-path://${USER_AVATAR_FILE}`;
    } else {
        settings.userAvatarUrl = null;
    }
    return settings;
}

async function saveSettings(settings) {
    // userAvatarUrl is a derived property, don't save it.
    const { userAvatarUrl, ...settingsToSave } = settings;
    await fs.writeJson(SETTINGS_FILE, settingsToSave, { spaces: 2 });
    return { success: true };
}

async function saveAvatarColor({ type, id, color }) {
    if (type === 'user') {
        const settings = await fs.pathExists(SETTINGS_FILE) ? await fs.readJson(SETTINGS_FILE) : {};
        settings.userAvatarCalculatedColor = color;
        await fs.writeJson(SETTINGS_FILE, settings, { spaces: 2 });
        console.log(`[Service] User avatar color saved: ${color}`);
        return { success: true };
    } else if (type === 'agent' && id) {
        const configPath = path.join(AGENT_DIR, id, 'config.json');
        if (await fs.pathExists(configPath)) {
            const agentConfig = await fs.readJson(configPath);
            agentConfig.avatarCalculatedColor = color;
            await fs.writeJson(configPath, agentConfig, { spaces: 2 });
            console.log(`[Service] Agent ${id} avatar color saved: ${color}`);
            return { success: true };
        } else {
            throw new Error(`Agent config for ${id} not found.`);
        }
    }
    throw new Error('Invalid type or missing ID for saving avatar color.');
}

module.exports = {
    initialize,
    loadSettings,
    saveSettings,
    saveAvatarColor,
};
