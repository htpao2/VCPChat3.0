// src/services/agentService.js
const fs = require('fs-extra');
const path = require('path');

let AGENT_DIR;
let SETTINGS_FILE;

function initialize(paths) {
    AGENT_DIR = paths.AGENT_DIR;
    SETTINGS_FILE = paths.SETTINGS_FILE;
}

/**
 * Gets a list of all available agents and their configurations.
 * @returns {Promise<Array>} A list of agent objects.
 */
async function getAgents() {
    const agentFolders = await fs.readdir(AGENT_DIR);
    let agents = [];
    for (const folderName of agentFolders) {
        const agentPath = path.join(AGENT_DIR, folderName);
        const stat = await fs.stat(agentPath);
        if (stat.isDirectory()) {
            const configPath = path.join(agentPath, 'config.json');
            if (await fs.pathExists(configPath)) {
                const config = await fs.readJson(configPath);
                // In a server context, file:// URLs are not useful.
                // The client will be responsible for constructing the full URL to an avatar if needed.
                config.id = folderName;
                agents.push(config);
            }
        }
    }

    // Sort agents based on the order defined in settings.json
    let settings = {};
    if (await fs.pathExists(SETTINGS_FILE)) {
        settings = await fs.readJson(SETTINGS_FILE);
    }
    if (settings.agentOrder && Array.isArray(settings.agentOrder)) {
        const orderedAgents = [];
        const agentMap = new Map(agents.map(agent => [agent.id, agent]));
        settings.agentOrder.forEach(id => {
            if (agentMap.has(id)) {
                orderedAgents.push(agentMap.get(id));
                agentMap.delete(id);
            }
        });
        orderedAgents.push(...agentMap.values());
        agents = orderedAgents;
    } else {
        agents.sort((a, b) => a.name.localeCompare(b.name));
    }

    return agents;
}

module.exports = {
    initialize,
    getAgents,
};
