// mobile/app.js

document.addEventListener('DOMContentLoaded', () => {
    console.log('VCP Mobile PoC Initialized');

    const agentListContainer = document.getElementById('agent-list');
    const topicsListContainer = document.getElementById('topics-list');
    const messagesContainer = document.getElementById('messages-container');
    const launchDiceRollerBtn = document.getElementById('launch-dice-roller');

    // Check if the electronAPI is exposed
    if (!window.electronAPI) {
        agentListContainer.innerHTML = '<p style="color: red;">Error: electronAPI not found. Is this running in Electron?</p>';
        return;
    }

    const loadAgents = async () => {
        try {
            // Use the existing electronAPI, which now calls our refactored service indirectly.
            const agents = await window.electronAPI.getAgents();
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
            console.log(`Loading topics for agent: ${agentId}`);
            const topics = await window.electronAPI.getAgentTopics(agentId);
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
            console.log(`Loading messages for agent ${agentId}, topic ${topicId}`);
            const messages = await window.electronAPI.getChatHistory(agentId, topicId);
            if (messages.error) throw new Error(messages.error);

            messagesContainer.innerHTML = '<h3>Messages</h3>';
            messages.forEach(msg => {
                const msgEl = document.createElement('div');
                msgEl.className = `message ${msg.role}`;
                msgEl.innerText = msg.content;
                messagesContainer.appendChild(msgEl);
            });
        } catch (error) {
            messagesContainer.innerHTML = `<p style="color: red;">Error loading messages: ${error.message}</p>`;
        }
    };

    launchDiceRollerBtn.addEventListener('click', () => {
        console.log('Launch Dice Roller clicked');
        // This would invoke the main process to open the dice window
        window.electronAPI.openDiceWindow();
    });

    // Initial load
    loadAgents();
});
