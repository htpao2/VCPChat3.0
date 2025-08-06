// modules/ipc/chatHandlers.refactored.js
const { ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const chatService = require('../../src/services/chatService');
const fileManager = require('../fileManager');

/**
 * Initializes chat and topic related IPC handlers using the chatService.
 * @param {BrowserWindow} mainWindow The main window instance.
 * @param {object} context - An object containing necessary context.
 */
function initialize(mainWindow, context) {
    // Initialize the service with the same context
    chatService.initialize(context);

    // A helper to wrap service calls, handle errors, and return them in a way IPC can manage.
    const wrapServiceCall = (serviceFn) => async (event, ...args) => {
        try {
            const result = await serviceFn(...args);
            return result;
        } catch (error) {
            console.error(`Error in chat service call ${serviceFn.name}:`, error);
            return { error: error.message };
        }
    };

    // Replace handlers with wrapped service calls
    ipcMain.handle('save-topic-order', wrapServiceCall(chatService.saveTopicOrder));
    ipcMain.handle('save-group-topic-order', wrapServiceCall(chatService.saveGroupTopicOrder));

    ipcMain.handle('search-topics-by-content', async (event, ...args) => {
        try {
            const matchedTopicIds = await chatService.searchTopicsByContent(...args);
            return { success: true, matchedTopicIds };
        } catch (error) {
            return { success: false, error: error.message, matchedTopicIds: [] };
        }
    });

    ipcMain.handle('save-agent-topic-title', wrapServiceCall(chatService.saveAgentTopicTitle));
    ipcMain.handle('get-chat-history', wrapServiceCall(chatService.getChatHistory));
    ipcMain.handle('save-chat-history', wrapServiceCall(chatService.saveChatHistory));
    ipcMain.handle('get-agent-topics', wrapServiceCall(chatService.getAgentTopics));
    ipcMain.handle('create-new-topic-for-agent', wrapServiceCall(chatService.createNewTopicForAgent));
    ipcMain.handle('delete-topic', wrapServiceCall(chatService.deleteTopic));

    ipcMain.handle('get-original-message-content', async (event, ...args) => {
         try {
            const content = await chatService.getOriginalMessageContent(...args);
            return { success: true, content };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('handle-file-paste', async (event, agentId, topicId, fileData) => {
        try {
            const storedFileObject = await chatService.handleFilePaste(agentId, topicId, fileData);
            return { success: true, attachment: storedFileObject };
        } catch (error) {
            return { error: error.message };
        }
    });

    ipcMain.handle('handle-text-paste-as-file', async (event, agentId, topicId, textContent) => {
        try {
            const storedFileObject = await chatService.handleTextPasteAsFile(agentId, topicId, textContent);
            return { success: true, attachment: storedFileObject };
        } catch (error) {
            return { error: `长文本转存为文件失败: ${error.message}` };
        }
    });

    // --- Electron-Dependent Handlers ---
    // These handlers remain here because they rely on Electron-specific modules or logic.

    ipcMain.handle('select-files-to-send', async (event, agentId, topicId) => {
        if (!agentId || !topicId) {
            return { error: "Agent ID and Topic ID are required." };
        }
        const result = await dialog.showOpenDialog(mainWindow, {
            title: '选择要发送的文件',
            properties: ['openFile', 'multiSelections']
        });

        if (!result.canceled && result.filePaths.length > 0) {
            const storedFilesInfo = [];
            for (const filePath of result.filePaths) {
                try {
                    const originalName = path.basename(filePath);
                    const storedFile = await fileManager.storeFile(filePath, originalName, agentId, topicId, 'application/octet-stream');
                    storedFilesInfo.push(storedFile);
                } catch (error) {
                    storedFilesInfo.push({ name: path.basename(filePath), error: error.message });
                }
            }
            return { success: true, attachments: storedFilesInfo };
        }
        return { success: false, attachments: [] };
    });

    // The 'send-to-vcp' handler is highly complex and tied to the Electron event system for streaming.
    // It remains here to ensure the desktop app continues to function.
    ipcMain.handle('send-to-vcp', async (event, vcpUrl, vcpApiKey, messages, modelConfig, messageId, isGroupCall = false, contextData = null) => {
        const { APP_DATA_ROOT_IN_PROJECT } = context;
        const streamChannel = 'vcp-stream-event';

        try {
            const settingsPath = path.join(APP_DATA_ROOT_IN_PROJECT, 'settings.json');
            const settings = fs.existsSync(settingsPath) ? await fs.readJson(settingsPath) : {};
            let finalVcpUrl = vcpUrl;
            if (settings.enableVcpToolInjection) {
                const urlObject = new URL(vcpUrl);
                urlObject.pathname = '/v1/chatvcp/completions';
                finalVcpUrl = urlObject.toString();
            }

            const response = await fetch(finalVcpUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${vcpApiKey}` },
                body: JSON.stringify({ messages, ...modelConfig, stream: modelConfig.stream === true, requestId: messageId })
            });

            if (!response.ok) throw new Error(`VCP Request Failed: ${response.status} ${await response.text()}`);

            if (modelConfig.stream === true) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                (async () => {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) {
                            event.sender.send(streamChannel, { type: 'end', messageId: messageId, context: contextData });
                            break;
                        }
                        const buffer = decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                const jsonData = line.substring(5).trim();
                                if (jsonData === '[DONE]') {
                                    event.sender.send(streamChannel, { type: 'end', messageId: messageId, context: contextData });
                                    return;
                                }
                                if(jsonData) {
                                    try {
                                        event.sender.send(streamChannel, { type: 'data', chunk: JSON.parse(jsonData), messageId: messageId, context: contextData });
                                    } catch(e) { /* ignore parse error */ }
                                }
                            }
                        }
                    }
                })();
                return { streamingStarted: true };
            } else {
                return await response.json();
            }
        } catch (error) {
            event.sender.send(streamChannel, { type: 'error', error: error.message, messageId: messageId, context: contextData });
            return { streamError: true, error: 'VCP Request Failed' };
        }
    });
}

module.exports = {
    initialize
};
