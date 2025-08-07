// server.js - API Server for the VCP Mobile App

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');

// Import our refactored services
const chatService = require('./src/services/chatService');
const settingsService = require('./src/services/settingsService');
const ttsService = require('./src/services/ttsService');
const voiceService = require('./src/services/voiceService');
const agentService = require('./src/services/agentService');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increase limit for potential base64 uploads

// --- Initialization ---
console.log('Initializing API server...');

const paths = {
    APP_DATA_ROOT_IN_PROJECT: path.join(__dirname, 'AppData'),
    AGENT_DIR: path.join(__dirname, 'AppData', 'Agents'),
    USER_DATA_DIR: path.join(__dirname, 'AppData', 'UserData'),
    SETTINGS_FILE: path.join(__dirname, 'AppData', 'settings.json'),
};

try {
    chatService.initialize(paths);
    settingsService.initialize(paths);
    ttsService.initialize(paths);
    voiceService.initialize(paths);
    agentService.initialize(paths);
    console.log('All services initialized successfully.');
} catch (e) {
    console.error("Failed to initialize services:", e);
    process.exit(1);
}

// --- API Endpoints ---

// Local Data Endpoints
app.get('/api/agents', async (req, res) => {
    try {
        const agents = await agentService.getAgents();
        res.json(agents);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/agents/:agentId/topics', async (req, res) => {
    try {
        const topics = await chatService.getAgentTopics(req.params.agentId);
        res.json(topics);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/agents/:agentId/topics/:topicId/history', async (req, res) => {
    try {
        const history = await chatService.getChatHistory(req.params.agentId, req.params.topicId);
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Logic / Proxy Endpoints

// TTS Endpoint
app.post('/api/tts/speak', async (req, res) => {
    try {
        const { text, voice, speed, ttsServerUrl } = req.body;
        const audioBuffer = await ttsService.speak({ text, voice, speed }, ttsServerUrl);
        if (audioBuffer) {
            res.setHeader('Content-Type', 'audio/mpeg');
            res.send(audioBuffer);
        } else {
            res.status(500).json({ error: 'TTS synthesis failed.' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// VCP Chat Proxy Endpoint
app.post('/api/vcp/chat', async (req, res) => {
    try {
        const { messages, modelConfig, vcpUrl, vcpApiKey } = req.body;

        const response = await fetch(vcpUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${vcpApiKey}`
            },
            body: JSON.stringify({
                messages,
                ...modelConfig,
                stream: true // We will handle the stream on the server
            })
        });

        if (!response.ok) {
            throw new Error(`VCP server returned an error: ${response.status} ${await response.text()}`);
        }

        // Pipe the stream from the VCP server directly to the client
        res.setHeader('Content-Type', 'text/event-stream');
        response.body.pipe(res);

    } catch (error) {
        console.error("VCP Chat Proxy Error:", error);
        res.status(500).json({ error: error.message });
    }
});


// --- Server Start ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`VCP Mobile API server listening on http://localhost:${PORT}`);
});
