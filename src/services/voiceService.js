// src/services/voiceService.js
const fs = require('fs-extra');
const path = require('path');

let AGENT_DIR;
let APP_DATA_ROOT_IN_PROJECT;

function initialize(paths) {
    AGENT_DIR = paths.AGENT_DIR;
    APP_DATA_ROOT_IN_PROJECT = paths.APP_DATA_ROOT_IN_PROJECT;
}

/**
 * Sends a message to the VCP server with a special prompt for voice chat.
 * @param {object} options - The options for sending the message.
 * @param {string} options.agentId - The ID of the agent to use.
 * @param {Array} options.history - The chat history.
 * @param {string} options.vcpServerUrl - The URL of the VCP server.
 * @param {string} options.vcpApiKey - The API key for the VCP server.
 * @returns {Promise<string>} The AI's text response.
 */
async function sendMessage({ agentId, history, vcpServerUrl, vcpApiKey }) {
    if (!agentId || !history || !vcpServerUrl) {
        throw new Error("sendMessage requires agentId, history, and vcpServerUrl.");
    }

    const agentConfigPath = path.join(AGENT_DIR, agentId, 'config.json');
    if (!await fs.pathExists(agentConfigPath)) {
        throw new Error(`Agent config for ${agentId} not found.`);
    }
    const agentConfig = await fs.readJson(agentConfigPath);

    const voiceModePromptInjection = "\n\n当前处于语音模式中，你的回复应当口语化，内容简短直白。由于用户输入同样是语音识别模型构成，注意自主判断、理解其中的同音错别字或者错误语义识别。";
    const systemPrompt = (agentConfig.systemPrompt || '').replace(/\{\{AgentName\}\}/g, agentConfig.name) + voiceModePromptInjection;

    const messagesForVCP = [{ role: 'system', content: systemPrompt }];
    const historyForVCP = history.map(msg => ({ role: msg.role, content: msg.content }));
    messagesForVCP.push(...historyForVCP);

    const modelConfig = {
        model: agentConfig.model,
        temperature: agentConfig.temperature,
        stream: false, // Voice chat is non-streaming
        max_tokens: agentConfig.maxOutputTokens,
        top_p: agentConfig.top_p,
        top_k: agentConfig.top_k
    };

    const response = await fetch(vcpServerUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${vcpApiKey}`
        },
        body: JSON.stringify({
            messages: messagesForVCP,
            ...modelConfig
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`VCP server error: ${response.status} ${errorText}`);
    }

    const responseData = await response.json();
    const fullText = responseData.choices?.[0]?.message?.content || '';
    return fullText;
}

module.exports = {
    initialize,
    sendMessage,
};
