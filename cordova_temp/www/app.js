// mobile/app.js - Final version using the API server

document.addEventListener('DOMContentLoaded', () => {
    console.log('VCP Mobile PoC Initialized');

    // UI Elements
    const agentListContainer = document.getElementById('agent-list');
    const topicsListContainer = document.getElementById('topics-list');
    const messagesContainer = document.getElementById('messages-container');
    const launchDiceRollerBtn = document.getElementById('launch-dice-roller');
    const ttsServerUrlInput = document.getElementById('tts-server-url');
    const startVoiceChatBtn = document.getElementById('start-voice-chat');
    const apiServerUrlInput = document.getElementById('api-server-url');

    // State
    let currentAgentId = null;
    let currentTopicId = null;
    let currentHistory = [];
    let agents = [];

    const getApiBase = () => apiServerUrlInput.value;

    const loadAgents = async () => {
        try {
            const response = await fetch(`${getApiBase()}/api/agents`);
            if (!response.ok) throw new Error(`Server returned ${response.status}`);
            agents = await response.json();

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
            const response = await fetch(`${getApiBase()}/api/agents/${agentId}/topics`);
            if (!response.ok) throw new Error(`Server returned ${response.status}`);
            const topics = await response.json();

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
        // This function now just renders the state, it doesn't fetch.
        messagesContainer.innerHTML = '<h3>Messages</h3>';
        currentHistory.forEach(msg => {
            const msgEl = document.createElement('div');
            msgEl.className = `message ${msg.role}`;

            // For simplicity, we'll just show plain text for now.
            // The rendererService logic can be re-added here.
            msgEl.innerText = msg.content;

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
            const response = await fetch(`${getApiBase()}/api/agents/${agentId}/topics/${topicId}/history`);
            if (!response.ok) throw new Error(`Server returned ${response.status}`);
            currentHistory = await response.json();
            renderMessages();
        } catch (error) {
            messagesContainer.innerHTML = `<p style="color: red;">Error loading messages: ${error.message}</p>`;
        }
    };

    const readMessageAloud = async (text) => {
        try {
            const ttsServerUrl = ttsServerUrlInput.value;
            if (!ttsServerUrl) return alert('Please enter the TTS Server URL.');

            const response = await fetch(`${getApiBase()}/api/tts/speak`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, voice: '默认', speed: 1.0, ttsServerUrl })
            });

            if (!response.ok) throw new Error(`TTS server returned ${response.status}`);

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            audio.play();

        } catch (error) {
            alert(`Error playing TTS: ${error.message}`);
        }
    };

    // The dice roller button can't work without Electron, so we disable it.
    launchDiceRollerBtn.disabled = true;
    launchDiceRollerBtn.innerText = "Dice Roller (Desktop Only)";

    // Add event listener to reload data when the server URL is changed.
    apiServerUrlInput.addEventListener('change', loadAgents);

    const handleSimulatedVoiceChat = async () => {
        if (!currentAgentId) {
            alert("Please select an agent first.");
            return;
        }

        const userInput = prompt("Simulating voice input. Please type your message:");
        if (!userInput) return;

        // Immediately add the user's message to the UI
        currentHistory.push({ role: 'user', content: userInput });
        renderMessages();

        // Add a temporary "thinking" message to the UI
        const thinkingMessage = { role: 'assistant', content: '...' };
        currentHistory.push(thinkingMessage);
        renderMessages();

        try {
            // Call the new API endpoint on our server
            const response = await fetch(`${getApiBase()}/api/voice/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    agentId: currentAgentId,
                    history: currentHistory.slice(0, -1) // Send history before the "thinking" message
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || `Server returned ${response.status}`);
            }

            const data = await response.json();
            // Replace the "thinking" message with the actual reply
            thinkingMessage.content = data.reply;
            renderMessages();

        } catch(error) {
            // Update the "thinking" message to show the error
            thinkingMessage.content = `Error: ${error.message}`;
            renderMessages();
        }
    };

    startVoiceChatBtn.addEventListener('click', handleSimulatedVoiceChat);

    // Initial load
    loadAgents();
});
