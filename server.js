const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs-extra');
const { EventEmitter } = require('events');
const os = require('os');
const cors = require('cors');

// --- Global IPC Shim ---
const ipcMainShim = new EventEmitter();
const registeredHandlers = new Set();

ipcMainShim.handle = (channel, listener) => {
    if (registeredHandlers.has(channel)) {
        console.warn(`[Server] Handler for ${channel} already registered. Overwriting.`);
        ipcMainShim.removeAllListeners(channel);
    }
    registeredHandlers.add(channel);

    ipcMainShim.on(channel, async (event, ...args) => {
        try {
            const result = await listener(event, ...args);
            if (event.replyCallback) {
                event.replyCallback({ success: true, result });
            }
        } catch (error) {
            console.error(`Error in IPC handle ${channel}:`, error);
            if (event.replyCallback) {
                event.replyCallback({ success: false, error: error.message });
            }
        }
    });
};

// --- Mocking Electron Components ---
let activeSocket = null;

class MockWebContents extends EventEmitter {
    constructor() {
        super();
        this.isDestroyed = () => false;
        this.send = (channel, ...args) => {
            if (activeSocket && activeSocket.connected) {
                activeSocket.emit(channel, ...args);
            }
        };
        this.id = 1;
    }
}

class MockWindow extends EventEmitter {
    constructor() {
        super();
        this.webContents = new MockWebContents();
        this.id = 1;
    }
    isDestroyed() { return false; }
    isVisible() { return true; }
    isMinimized() { return false; }
    focus() {}
    show() {}
    hide() {}
    minimize() {}
    maximize() {}
    unmaximize() {}
    close() {}
    setMenu() {}
    setProgressBar() {}
    setTitle() {}
}

const globalMockWindow = new MockWindow();

// --- Server Setup ---
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    maxHttpBufferSize: 1e8
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname)));
app.use('/AppData', express.static(path.join(__dirname, 'AppData')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'main.html'));
});

// --- MOCK NATIVE MODULES ---
// We must mock native modules that might fail or are irrelevant on the server
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(request) {
    if (request === 'electron') {
        return electronShim;
    }
    if (request === 'node-global-key-listener') {
        class GlobalKeyListener extends EventEmitter {
            constructor() { super(); }
            addListener() {}
            kill() {}
        }
        return { GlobalKeyboardListener: GlobalKeyListener };
    }
    if (request === 'clipboard-event') {
        const emitter = new EventEmitter();
        emitter.startListening = () => {};
        emitter.stopListening = () => {};
        return emitter;
    }
    // Mock pdf-poppler if it causes issues on Linux server
    if (request === 'pdf-poppler') {
        return {
            convert: async () => { throw new Error("PDF conversion not supported on server mode."); }
        };
    }

    return originalRequire.apply(this, arguments);
};

const electronShim = {
    app: {
        getPath: (name) => {
            if (name === 'userData') return path.join(__dirname, 'AppData');
            return path.join(os.tmpdir(), 'vcp-server');
        },
        getAppPath: () => __dirname,
        isPackaged: false,
        name: 'VCP-Server'
    },
    ipcMain: ipcMainShim,
    shell: {
        openExternal: (url) => console.log(`[Server] Open External: ${url}`),
        showItemInFolder: (path) => console.log(`[Server] Show item: ${path}`)
    },
    dialog: {
        showOpenDialog: async () => ({ canceled: true }),
        showSaveDialog: async () => ({ canceled: true })
    },
    nativeTheme: Object.assign(new EventEmitter(), { shouldUseDarkColors: true }),
    BrowserWindow: MockWindow,
    screen: {
        getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } })
    },
    globalShortcut: {
        register: () => {},
        unregister: () => {},
        unregisterAll: () => {}
    },
    clipboard: {
        readText: () => '',
        writeText: () => {}
    }
};

// --- Config & Initialization ---
const PROJECT_ROOT = __dirname;
const APP_DATA_ROOT_IN_PROJECT = path.join(PROJECT_ROOT, 'AppData');
const AGENT_DIR = path.join(APP_DATA_ROOT_IN_PROJECT, 'Agents');
const USER_DATA_DIR = path.join(APP_DATA_ROOT_IN_PROJECT, 'UserData');
const SETTINGS_FILE = path.join(APP_DATA_ROOT_IN_PROJECT, 'settings.json');
const MUSIC_COVER_CACHE_DIR = path.join(APP_DATA_ROOT_IN_PROJECT, 'MusicCoverCache');
const USER_AVATAR_FILE = path.join(USER_DATA_DIR, 'user_avatar.png');

fs.ensureDirSync(APP_DATA_ROOT_IN_PROJECT);
fs.ensureDirSync(AGENT_DIR);
fs.ensureDirSync(USER_DATA_DIR);
fs.ensureDirSync(MUSIC_COVER_CACHE_DIR);

// Load Modules
const fileManager = require('./modules/fileManager');
fileManager.initializeFileManager(USER_DATA_DIR, AGENT_DIR);

const AppSettingsManager = require('./modules/utils/appSettingsManager');
const AgentConfigManager = require('./modules/utils/agentConfigManager');
const appSettingsManager = new AppSettingsManager(SETTINGS_FILE);
const agentConfigManager = new AgentConfigManager(AGENT_DIR);
appSettingsManager.startCleanupTimer();
appSettingsManager.startAutoBackup(USER_DATA_DIR);
agentConfigManager.startCleanupTimer();

const settingsHandlers = require('./modules/ipc/settingsHandlers');
const agentHandlers = require('./modules/ipc/agentHandlers');
const chatHandlers = require('./modules/ipc/chatHandlers');
const fileDialogHandlers = require('./modules/ipc/fileDialogHandlers');
const assistantHandlers = require('./modules/ipc/assistantHandlers');
const themeHandlers = require('./modules/ipc/themeHandlers');
const notesHandlers = require('./modules/ipc/notesHandlers');
const groupChatHandlers = require('./modules/ipc/groupChatHandlers');
const musicHandlers = require('./modules/ipc/musicHandlers');

// --- Initialize Handlers ---
assistantHandlers.initialize = async () => {};
assistantHandlers.getSelectionListenerStatus = () => false;

settingsHandlers.initialize({
    SETTINGS_FILE, USER_AVATAR_FILE, AGENT_DIR,
    settingsManager: appSettingsManager, agentConfigManager
});

agentHandlers.initialize({
    AGENT_DIR, USER_DATA_DIR, SETTINGS_FILE, USER_AVATAR_FILE,
    getSelectionListenerStatus: () => false,
    stopSelectionListener: () => {},
    startSelectionListener: () => {},
    settingsManager: appSettingsManager,
    agentConfigManager
});

const fileWatcher = { watchFile: () => {}, stopWatching: () => {} };

chatHandlers.initialize(globalMockWindow, {
    AGENT_DIR, USER_DATA_DIR, APP_DATA_ROOT_IN_PROJECT,
    NOTES_AGENT_ID: 'notes_attachments_agent',
    getSelectionListenerStatus: () => false,
    stopSelectionListener: () => {},
    startSelectionListener: () => {},
    getMusicState: () => ({ isPlaying: false }),
    fileWatcher,
    agentConfigManager
});

notesHandlers.initialize({ openChildWindows: [], APP_DATA_ROOT_IN_PROJECT, SETTINGS_FILE });

themeHandlers.initialize({
    mainWindow: globalMockWindow, openChildWindows: [],
    projectRoot: PROJECT_ROOT, APP_DATA_ROOT_IN_PROJECT,
    settingsManager: appSettingsManager
});

musicHandlers.initialize({
    mainWindow: globalMockWindow, openChildWindows: [],
    APP_DATA_ROOT_IN_PROJECT,
    startAudioEngine: async () => console.log("[Server] Audio Engine bypassed (Server Mode)"),
    stopAudioEngine: () => {}
});

groupChatHandlers.initialize(globalMockWindow, {
    AGENT_DIR, USER_DATA_DIR,
    getSelectionListenerStatus: () => false,
    stopSelectionListener: () => {},
    startSelectionListener: () => {},
    fileWatcher
});

// --- Socket Connection ---
io.on('connection', (socket) => {
    console.log('[Server] New client connected:', socket.id);
    activeSocket = socket;

    socket.onAny((event, ...args) => {
        let replyCallback = null;
        if (typeof args[args.length - 1] === 'function') {
            replyCallback = args.pop();
        }
        const mockEvent = {
            sender: globalMockWindow.webContents,
            reply: (channel, ...replyArgs) => socket.emit(channel, ...replyArgs),
            replyCallback: replyCallback
        };
        setImmediate(() => {
            ipcMainShim.emit(event, mockEvent, ...args);
        });
    });

    socket.on('disconnect', () => {
        console.log('[Server] Client disconnected:', socket.id);
        if (activeSocket === socket) activeSocket = null;
    });
});

// --- Routes ---
app.get('/stream', (req, res) => {
    const filePath = req.query.path;
    if (!filePath || !fs.existsSync(filePath)) return res.status(404).send('File not found');
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(filePath, { start, end });
        const head = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'audio/mpeg',
        };
        res.writeHead(206, head);
        file.pipe(res);
    } else {
        const head = { 'Content-Length': fileSize, 'Content-Type': 'audio/mpeg' };
        res.writeHead(200, head);
        fs.createReadStream(filePath).pipe(res);
    }
});

app.post('/upload', (req, res) => {
    const filename = req.query.filename || 'uploaded_file';
    const saveDir = path.join(USER_DATA_DIR, 'Uploads');
    fs.ensureDirSync(saveDir);
    const savePath = path.join(saveDir, filename);
    const writeStream = fs.createWriteStream(savePath);
    req.pipe(writeStream);
    req.on('end', () => res.json({ success: true, path: savePath }));
    req.on('error', (err) => res.status(500).json({ success: false, error: err.message }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] VCP Chat Server running on port ${PORT}`);
});
