// mobile/app.js

document.addEventListener('DOMContentLoaded', () => {
    console.log('VCP Mobile PoC Initialized');

    const agentListContainer = document.getElementById('agent-list');
    const topicsListContainer = document.getElementById('topics-list');
    const messagesContainer = document.getElementById('messages-container');
    const launchDiceRollerBtn = document.getElementById('launch-dice-roller');
    const ttsServerUrlInput = document.getElementById('tts-server-url');
    const startVoiceChatBtn = document.getElementById('start-voice-chat');

    const api = window.electronAPI;
    const ttsApi = window.ttsService;
    const renderer = window.rendererService;

    let currentAgentId = null;
    let currentTopicId = null;
    let currentHistory = [];

    if (!api || !ttsApi || !renderer) {
        let error = '';
        if (!api) error += 'electronAPI not found. ';
        if (!ttsApi) error += 'ttsService not found. ';
        if (!renderer) error += 'rendererService not found. ';
        agentListContainer.innerHTML = `<p style="color: red;">Error: ${error} Is this running in Electron and is preload.js correct?</p>`;
        return;
    }

    const loadAgents = async () => {
        try {
            const agents = await api.getAgents();
            if (agents.error) throw new Error(agents.error);

            agentListContainer.innerHTML = '<h3>Agents</h3>';
            agents.forEach(agent => {
                const agentEl = document.createElement('button');
                agentEl.innerText = agent.name;
                agentEl.onclick = () => loadTopics(agent.id);
                agentListContainer.appendChild(agentEl);
            });
            if (agents.length > 0) {
                loadTopics(agents[0].id);
            }
        } catch (error) {
            agentListContainer.innerHTML = `<p style="color: red;">Error loading agents: ${error.message}</p>`;
        }
    };

    const loadTopics = async (agentId) => {
        try {
            currentAgentId = agentId;
            const topics = await api.getAgentTopics(agentId);
            if (topics.error) throw new Error(topics.error);

            topicsListContainer.innerHTML = '<h3>Topics</h3>';
            topics.forEach(topic => {
                const topicEl = document.createElement('div');
                topicEl.className = 'topic';
                topicEl.innerText = topic.name;
                topicEl.onclick = () => loadMessages(agentId, topic.id);
                topicsListContainer.appendChild(topicEl);
            });
            if (topics.length > 0) {
                loadMessages(agentId, topics[0].id);
            }
        } catch (error) {
            topicsListContainer.innerHTML = `<p style="color: red;">Error loading topics: ${error.message}</p>`;
        }
    };

    const renderMessages = () => {
        messagesContainer.innerHTML = '<h3>Messages</h3>';
        currentHistory.forEach(msg => {
            const msgEl = document.createElement('div');
            msgEl.className = `message ${msg.role}`;

            // Use the renderer service instead of innerText
            const contentContainer = renderer.renderContent(msg.content);
            msgEl.appendChild(contentContainer);

            if (msg.role === 'assistant') {
                const readBtn = document.createElement('button');
                readBtn.innerText = '🔊';
                readBtn.style.marginLeft = '10px';
                readBtn.onclick = () => readMessageAloud(msg.content);
                msgEl.appendChild(readBtn);
            }

            messagesContainer.appendChild(msgEl);
        });
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    const loadMessages = async (agentId, topicId) => {
        try {
            currentTopicId = topicId;
            // Using dummy data to test the renderer
            const messages = [
                { role: 'user', content: 'Can you show me some Markdown and Math?' },
                { role: 'assistant', content: `Of course! \n\nHere is some **bold text** and a list:\n* Item 1\n* Item 2\n\nHere is a math formula: $E = mc^2$\n\nAnd a code block:\n\`\`\`javascript\nconsole.log("Hello, World!");\n\`\`\`` }
            ];
            currentHistory = messages;
            renderMessages();
        } catch (error) {
            messagesContainer.innerHTML = `<p style="color: red;">Error loading messages: ${error.message}</p>`;
        }
    };

    const readMessageAloud = async (text) => {
        // ... (same as before)
    };

    const handleSimulatedVoiceChat = async () => {
        // ... (same as before)
    };

    launchDiceRollerBtn.addEventListener('click', () => {
        api.openDiceWindow();
    });

    startVoiceChatBtn.addEventListener('click', handleSimulatedVoiceChat);

    // Initial load
    loadAgents();
});
