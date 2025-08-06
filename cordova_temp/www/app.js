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

    let currentAgentId = null;
    let currentTopicId = null;
    let currentHistory = [];

    if (!api) {
        agentListContainer.innerHTML = '<p style="color: red;">Error: electronAPI not found. Is this running in Electron?</p>';
        return;
    }
     if (!ttsApi) {
        agentListContainer.innerHTML += '<p style="color: red;">Error: ttsService not found. Check preload.js.</p>';
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
            // Select the first agent by default
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
            // Select the first topic by default
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

            const textEl = document.createElement('span');
            textEl.innerText = msg.content;
            msgEl.appendChild(textEl);

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
            const messages = await api.getChatHistory(agentId, topicId);
            if (messages.error) throw new Error(messages.error);
            currentHistory = messages;
            renderMessages();
        } catch (error) {
            messagesContainer.innerHTML = `<p style="color: red;">Error loading messages: ${error.message}</p>`;
        }
    };

    const readMessageAloud = async (text) => {
        try {
            const ttsServerUrl = ttsServerUrlInput.value;
            if (!ttsServerUrl) {
                alert('Please enter the TTS Server URL.');
                return;
            }

            const options = { text, voice: '默认', speed: 1.0 };
            const audioBuffer = await ttsApi.speak(options, ttsServerUrl);

            if (audioBuffer && audioBuffer.type === 'Buffer' && audioBuffer.data) {
                const blob = new Blob([new Uint8Array(audioBuffer.data)], { type: 'audio/mpeg' });
                const audioUrl = URL.createObjectURL(blob);
                const audio = new Audio(audioUrl);
                audio.play();
            } else {
                throw new Error('Received invalid audio data from TTS service.');
            }
        } catch (error) {
            alert(`Error playing TTS: ${error.message}`);
        }
    };

    const handleSimulatedVoiceChat = async () => {
        if (!currentAgentId) {
            alert("Please select an agent first.");
            return;
        }

        const userInput = prompt("Simulating voice input. Please type your message:");
        if (!userInput) return;

        // Add user message to history and re-render
        currentHistory.push({ role: 'user', content: userInput });
        renderMessages();

        // Add a temporary "thinking" message
        const thinkingMessage = { role: 'assistant', content: '...' };
        currentHistory.push(thinkingMessage);
        renderMessages();

        try {
            // We need to use the IPC call for this, as the service is in the main process
            // The handler in chatHandlers.refactored.js will call our new voiceService
            api.sendVoiceChatMessage({
                agentId: currentAgentId,
                history: currentHistory.slice(0, -1), // Send history without the "thinking" message
                thinkingMessageId: null // Not needed for this PoC
            });

            // Listen for the reply
            api.onVoiceChatReply(({ fullText, error }) => {
                if (error) {
                    thinkingMessage.content = `Error: ${error}`;
                } else {
                    thinkingMessage.content = fullText;
                }
                // Re-render the final history
                renderMessages();
            });

        } catch(error) {
            thinkingMessage.content = `Error: ${error.message}`;
            renderMessages();
        }
    };

    launchDiceRollerBtn.addEventListener('click', () => {
        api.openDiceWindow();
    });

    startVoiceChatBtn.addEventListener('click', handleSimulatedVoiceChat);

    // Initial load
    loadAgents();
});
