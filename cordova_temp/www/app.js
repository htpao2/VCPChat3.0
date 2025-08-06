// mobile/app.js

document.addEventListener('DOMContentLoaded', () => {
    console.log('VCP Mobile PoC Initialized');

    const agentListContainer = document.getElementById('agent-list');
    const topicsListContainer = document.getElementById('topics-list');
    const messagesContainer = document.getElementById('messages-container');
    const launchDiceRollerBtn = document.getElementById('launch-dice-roller');
    const ttsServerUrlInput = document.getElementById('tts-server-url');

    // This is a PoC, so we are using the globally exposed APIs from preload.js
    const api = window.electronAPI;
    const ttsApi = window.ttsService;

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
        } catch (error) {
            agentListContainer.innerHTML = `<p style="color: red;">Error loading agents: ${error.message}</p>`;
        }
    };

    const loadTopics = async (agentId) => {
        try {
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
        } catch (error) {
            topicsListContainer.innerHTML = `<p style="color: red;">Error loading topics: ${error.message}</p>`;
        }
    };

    const loadMessages = async (agentId, topicId) => {
        try {
            const messages = await api.getChatHistory(agentId, topicId);
            if (messages.error) throw new Error(messages.error);

            messagesContainer.innerHTML = '<h3>Messages</h3>';
            messages.forEach(msg => {
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
            console.log(`Requesting TTS for: "${text}" from ${ttsServerUrl}`);

            // For this PoC, we'll use a default voice.
            // A real app would fetch models and let the user choose.
            const options = {
                text: text,
                voice: '默认', // Using a default voice
                speed: 1.0
            };

            const audioBuffer = await ttsApi.speak(options, ttsServerUrl);

            if (audioBuffer && audioBuffer.type === 'Buffer' && audioBuffer.data) {
                // The buffer from the backend is an object { type: 'Buffer', data: [...] }
                const blob = new Blob([new Uint8Array(audioBuffer.data)], { type: 'audio/mpeg' });
                const audioUrl = URL.createObjectURL(blob);
                const audio = new Audio(audioUrl);
                audio.play();
                console.log('Playing TTS audio.');
            } else {
                throw new Error('Received invalid audio data from TTS service.');
            }

        } catch (error) {
            console.error('Failed to read message aloud:', error);
            alert(`Error playing TTS: ${error.message}`);
        }
    };

    launchDiceRollerBtn.addEventListener('click', () => {
        api.openDiceWindow();
    });

    // Initial load
    loadAgents();
});
