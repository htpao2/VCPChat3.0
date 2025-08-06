// src/services/chatService.js
const fs = require('fs-extra');
const path = require('path');
const fileManager = require('../../modules/fileManager'); // Adjust path

// Context that will be initialized
let AGENT_DIR;
let USER_DATA_DIR;
let APP_DATA_ROOT_IN_PROJECT;
let NOTES_AGENT_ID;
let getMusicState; // This might be complex to handle headlessly

function initialize(context) {
    AGENT_DIR = context.AGENT_DIR;
    USER_DATA_DIR = context.USER_DATA_DIR;
    APP_DATA_ROOT_IN_PROJECT = context.APP_DATA_ROOT_IN_PROJECT;
    NOTES_AGENT_ID = context.NOTES_AGENT_ID;
    getMusicState = context.getMusicState;
}

async function saveTopicOrder(agentId, orderedTopicIds) {
    if (!agentId || !Array.isArray(orderedTopicIds)) {
        throw new Error('无效的 agentId 或 topic IDs');
    }
    const agentConfigPath = path.join(AGENT_DIR, agentId, 'config.json');
    const agentConfig = await fs.readJson(agentConfigPath);
    if (!Array.isArray(agentConfig.topics)) agentConfig.topics = [];

    const newTopicsArray = [];
    const topicMap = new Map(agentConfig.topics.map(topic => [topic.id, topic]));

    orderedTopicIds.forEach(id => {
        if (topicMap.has(id)) {
            newTopicsArray.push(topicMap.get(id));
            topicMap.delete(id);
        }
    });

    newTopicsArray.push(...topicMap.values());
    agentConfig.topics = newTopicsArray;

    await fs.writeJson(agentConfigPath, agentConfig, { spaces: 2 });
    return { success: true };
}

async function saveGroupTopicOrder(groupId, orderedTopicIds) {
    if (!groupId || !Array.isArray(orderedTopicIds)) {
        throw new Error('无效的 groupId 或 topic IDs');
    }
    const groupConfigPath = path.join(APP_DATA_ROOT_IN_PROJECT, 'AgentGroups', groupId, 'config.json');
    const groupConfig = await fs.readJson(groupConfigPath);
    if (!Array.isArray(groupConfig.topics)) groupConfig.topics = [];

    const newTopicsArray = [];
    const topicMap = new Map(groupConfig.topics.map(topic => [topic.id, topic]));

    orderedTopicIds.forEach(id => {
        if (topicMap.has(id)) {
            newTopicsArray.push(topicMap.get(id));
            topicMap.delete(id);
        }
    });

    newTopicsArray.push(...topicMap.values());
    groupConfig.topics = newTopicsArray;

    await fs.writeJson(groupConfigPath, groupConfig, { spaces: 2 });
    return { success: true };
}

async function searchTopicsByContent(itemId, itemType, searchTerm) {
    if (!itemId || !itemType || typeof searchTerm !== 'string' || searchTerm.trim() === '') {
        throw new Error('Invalid arguments for topic content search.');
    }
    const searchTermLower = searchTerm.toLowerCase();
    const matchedTopicIds = [];

    let itemConfig;
    let basePath = itemType === 'agent' ? AGENT_DIR : path.join(APP_DATA_ROOT_IN_PROJECT, 'AgentGroups');
    const configPath = path.join(basePath, itemId, 'config.json');

    if (await fs.pathExists(configPath)) {
        itemConfig = await fs.readJson(configPath);
    }

    if (!itemConfig || !itemConfig.topics || !Array.isArray(itemConfig.topics)) {
        return [];
    }

    for (const topic of itemConfig.topics) {
        const historyFilePath = path.join(USER_DATA_DIR, itemId, 'topics', topic.id, 'history.json');
        if (await fs.pathExists(historyFilePath)) {
            try {
                const history = await fs.readJson(historyFilePath);
                if (Array.isArray(history)) {
                    for (const message of history) {
                        if (message.content && typeof message.content === 'string' && message.content.toLowerCase().includes(searchTermLower)) {
                            matchedTopicIds.push(topic.id);
                            break;
                        }
                    }
                }
            } catch (e) {
                console.error(`Error reading history for ${itemType} ${itemId}, topic ${topic.id}:`, e);
            }
        }
    }
    return [...new Set(matchedTopicIds)];
}

async function saveAgentTopicTitle(agentId, topicId, newTitle) {
    if (!topicId || !newTitle) throw new Error("保存话题标题失败: topicId 或 newTitle 未提供。");
    const configPath = path.join(AGENT_DIR, agentId, 'config.json');
    if (!await fs.pathExists(configPath)) throw new Error(`保存话题标题失败: Agent ${agentId} 的配置文件不存在。`);

    let config = await fs.readJson(configPath);
    if (!config.topics || !Array.isArray(config.topics)) throw new Error(`保存话题标题失败: Agent ${agentId} 没有话题列表。`);

    const topicIndex = config.topics.findIndex(t => t.id === topicId);
    if (topicIndex === -1) throw new Error(`保存话题标题失败: Agent ${agentId} 中未找到 ID 为 ${topicId} 的话题。`);

    config.topics[topicIndex].name = newTitle;
    await fs.writeJson(configPath, config, { spaces: 2 });
    return config.topics;
}

async function getChatHistory(agentId, topicId) {
    if (!topicId) throw new Error(`获取Agent ${agentId} 聊天历史失败: topicId 未提供。`);
    const historyFile = path.join(USER_DATA_DIR, agentId, 'topics', topicId, 'history.json');
    await fs.ensureDir(path.dirname(historyFile));
    if (await fs.pathExists(historyFile)) {
        return await fs.readJson(historyFile);
    }
    return [];
}

async function saveChatHistory(agentId, topicId, history) {
    if (!topicId) throw new Error(`保存Agent ${agentId} 聊天历史失败: topicId 未提供。`);
    const historyDir = path.join(USER_DATA_DIR, agentId, 'topics', topicId);
    await fs.ensureDir(historyDir);
    const historyFile = path.join(historyDir, 'history.json');
    await fs.writeJson(historyFile, history, { spaces: 2 });
    return { success: true };
}

async function getAgentTopics(agentId) {
    const configPath = path.join(AGENT_DIR, agentId, 'config.json');
    if (await fs.pathExists(configPath)) {
        const config = await fs.readJson(configPath);
        if (config.topics && Array.isArray(config.topics) && config.topics.length > 0) {
            return config.topics;
        } else {
            const defaultTopics = [{ id: "default", name: "主要对话", createdAt: Date.now() }];
            config.topics = defaultTopics;
            await fs.writeJson(configPath, config, { spaces: 2 });
            return defaultTopics;
        }
    }
    return [{ id: "default", name: "主要对话", createdAt: Date.now() }];
}

async function createNewTopicForAgent(agentId, topicName) {
    const configPath = path.join(AGENT_DIR, agentId, 'config.json');
    if (!await fs.pathExists(configPath)) throw new Error(`Agent ${agentId} 的配置文件不存在。`);

    const config = await fs.readJson(configPath);
    if (!config.topics || !Array.isArray(config.topics)) config.topics = [];

    const newTopicId = `topic_${Date.now()}`;
    const newTopic = { id: newTopicId, name: topicName || `新话题 ${config.topics.length + 1}`, createdAt: Date.now() };
    config.topics.push(newTopic);
    await fs.writeJson(configPath, config, { spaces: 2 });

    const topicHistoryDir = path.join(USER_DATA_DIR, agentId, 'topics', newTopicId);
    await fs.ensureDir(topicHistoryDir);
    await fs.writeJson(path.join(topicHistoryDir, 'history.json'), [], { spaces: 2 });

    return { topicId: newTopicId, topicName: newTopic.name, topics: config.topics };
}

async function deleteTopic(agentId, topicIdToDelete) {
    const configPath = path.join(AGENT_DIR, agentId, 'config.json');
    if (!await fs.pathExists(configPath)) throw new Error(`Agent ${agentId} 的配置文件不存在。`);

    let config = await fs.readJson(configPath);
    if (!config.topics || !Array.isArray(config.topics)) throw new Error(`Agent ${agentId} 没有话题列表可供删除。`);

    const initialTopicCount = config.topics.length;
    config.topics = config.topics.filter(topic => topic.id !== topicIdToDelete);

    if (config.topics.length === initialTopicCount) throw new Error(`未找到要删除的话题 ID: ${topicIdToDelete}`);

    if (config.topics.length === 0) {
        const defaultTopic = { id: "default", name: "主要对话", createdAt: Date.now() };
        config.topics.push(defaultTopic);
        const defaultTopicHistoryDir = path.join(USER_DATA_DIR, agentId, 'topics', defaultTopic.id);
        await fs.ensureDir(defaultTopicHistoryDir);
        await fs.writeJson(path.join(defaultTopicHistoryDir, 'history.json'), [], { spaces: 2 });
    }

    await fs.writeJson(configPath, config, { spaces: 2 });

    const topicDataDir = path.join(USER_DATA_DIR, agentId, 'topics', topicIdToDelete);
    if (await fs.pathExists(topicDataDir)) await fs.remove(topicDataDir);

    return config.topics;
}

// Note: File handling functions might need browser-specific counterparts (e.g., using FormData)
// For now, we replicate the logic that uses file paths or buffers.

async function handleFilePaste(agentId, topicId, fileData) {
    if (!topicId) throw new Error("处理文件粘贴失败: topicId 未提供。");

    let storedFileObject;
    if (fileData.type === 'path') {
        const originalFileName = path.basename(fileData.path);
        const ext = path.extname(fileData.path).toLowerCase();
        let fileTypeHint = 'application/octet-stream';
        // ... (mime type guessing logic)
        storedFileObject = await fileManager.storeFile(fileData.path, originalFileName, agentId, topicId, fileTypeHint);
    } else if (fileData.type === 'base64') {
        const originalFileName = `pasted_image_${Date.now()}.${fileData.extension || 'png'}`;
        const buffer = Buffer.from(fileData.data, 'base64');
        const fileTypeHint = `image/${fileData.extension || 'png'}`;
        storedFileObject = await fileManager.storeFile(buffer, originalFileName, agentId, topicId, fileTypeHint);
    } else {
        throw new Error('不支持的文件粘贴类型');
    }
    return storedFileObject;
}

async function handleTextPasteAsFile(agentId, topicId, textContent) {
    if (!agentId || !topicId) throw new Error("处理长文本粘贴失败: agentId 或 topicId 未提供。");
    if (typeof textContent !== 'string') throw new Error("处理长文本粘贴失败: 无效的文本内容。");

    const originalFileName = `pasted_text_${Date.now()}.txt`;
    const buffer = Buffer.from(textContent, 'utf8');
    const storedFileObject = await fileManager.storeFile(buffer, originalFileName, agentId, topicId, 'text/plain');
    return storedFileObject;
}

async function getOriginalMessageContent(itemId, itemType, topicId, messageId) {
    if (!itemId || !itemType || !topicId || !messageId) {
        throw new Error('无效的参数');
    }

    let historyFile;
    if (itemType === 'agent') {
        historyFile = path.join(USER_DATA_DIR, itemId, 'topics', topicId, 'history.json');
    } else if (itemType === 'group') {
        historyFile = path.join(USER_DATA_DIR, itemId, 'topics', topicId, 'history.json');
    } else {
        throw new Error('不支持的项目类型');
    }

    if (await fs.pathExists(historyFile)) {
        const history = await fs.readJson(historyFile);
        const message = history.find(m => m.id === messageId);
        if (message) {
            return message.content;
        } else {
            throw new Error('在历史记录中未找到该消息');
        }
    } else {
        throw new Error('聊天历史文件不存在');
    }
}

// The VCP communication functions are highly dependent on the environment (fetch, streams, etc.)
// They can be kept here but might need adaptation for mobile (e.g. using a different fetch implementation)
// The `send-to-vcp` stream handling is tightly coupled to Electron's event sender.
// A mobile implementation would need a different mechanism (e.g., callbacks, EventSource).

module.exports = {
    initialize,
    saveTopicOrder,
    saveGroupTopicOrder,
    searchTopicsByContent,
    saveAgentTopicTitle,
    getChatHistory,
    saveChatHistory,
    getAgentTopics,
    createNewTopicForAgent,
    deleteTopic,
    handleFilePaste,
    handleTextPasteAsFile,
    getOriginalMessageContent,
    // Functions like `send-to-vcp` and file dialogs will be handled differently.
    // The core data management logic is what we've extracted.
};
