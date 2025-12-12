// web-polyfill.js
// This script is loaded when running in a browser environment to polyfill Electron APIs.

console.log("[WebPolyfill] Initializing...");

// Ensure we have a socket connection to the main server
// window.io is loaded from /socket.io/socket.io.js
const mainSocket = io();

// --- Audio Player Logic (Client Side) ---
class WebAudioPlayer {
    constructor() {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.audioEl = new Audio();
        this.audioEl.crossOrigin = "anonymous"; // Important for visualizer
        this.sourceNode = this.audioCtx.createMediaElementSource(this.audioEl);
        this.gainNode = this.audioCtx.createGain();
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.8;

        // EQ Nodes (10 bands matching the Python engine)
        this.eqBands = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
        this.eqFilters = this.eqBands.map(freq => {
            const filter = this.audioCtx.createBiquadFilter();
            filter.type = 'peaking';
            filter.frequency.value = freq;
            filter.Q.value = 1.41;
            filter.gain.value = 0;
            return filter;
        });

        // Connect chain: Source -> EQ[0] -> ... -> EQ[9] -> Analyser -> Gain -> Destination
        let currentNode = this.sourceNode;
        this.eqFilters.forEach(filter => {
            currentNode.connect(filter);
            currentNode = filter;
        });
        currentNode.connect(this.analyser);
        this.analyser.connect(this.gainNode);
        this.gainNode.connect(this.audioCtx.destination);

        this.currentTrack = null;
        this.isPlaying = false;
        this.volume = 1.0;

        // Setup Events
        this.audioEl.addEventListener('play', () => this.updateState());
        this.audioEl.addEventListener('pause', () => this.updateState());
        this.audioEl.addEventListener('ended', () => {
            this.isPlaying = false;
            this.updateState();
        });
        this.audioEl.addEventListener('timeupdate', () => {
            // Optional: frequent updates?
        });

        // Start Analysis Loop
        this.startAnalysisLoop();
    }

    async load(track) {
        if (!track || !track.path) throw new Error("Invalid track");

        // Convert file path to server stream URL
        // Server path: /path/to/file.mp3
        // Stream URL: /stream?path=/path/to/file.mp3
        const streamUrl = `/stream?path=${encodeURIComponent(track.path)}`;

        this.audioEl.src = streamUrl;
        this.currentTrack = track;
        try {
            await this.audioEl.load();
            this.updateState();
            return { status: 'success', state: this.getState() };
        } catch (e) {
            console.error("Load failed:", e);
            return { status: 'error', message: e.message };
        }
    }

    async play() {
        if (this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
        }
        try {
            await this.audioEl.play();
            this.isPlaying = true;
            this.updateState();
            return { status: 'success' };
        } catch (e) {
            return { status: 'error', message: e.message };
        }
    }

    pause() {
        this.audioEl.pause();
        this.isPlaying = false;
        this.updateState();
        return { status: 'success' };
    }

    seek(time) {
        if (Number.isFinite(time)) {
            this.audioEl.currentTime = time;
            this.updateState();
        }
        return { status: 'success', state: this.getState() };
    }

    setVolume(vol) {
        this.volume = vol;
        this.gainNode.gain.value = vol;
        this.updateState();
        return { status: 'success' };
    }

    setEq(bands, enabled) {
        if (!enabled) {
            this.eqFilters.forEach(f => f.gain.value = 0);
        } else {
            this.eqBands.forEach((freq, index) => {
                // Determine band key (e.g., '31', '1k')
                let key = freq.toString();
                if (freq >= 1000) key = (freq / 1000) + 'k';

                if (bands[key] !== undefined) {
                    this.eqFilters[index].gain.value = bands[key];
                }
            });
        }
        this.updateState();
        return { status: 'success' };
    }

    getState() {
        return {
            is_playing: !this.audioEl.paused && !this.audioEl.ended,
            is_paused: this.audioEl.paused,
            duration: this.audioEl.duration || 0,
            current_time: this.audioEl.currentTime || 0,
            volume: this.volume,
            file_path: this.currentTrack ? this.currentTrack.path : null,
            device_id: 'web-audio',
            exclusive_mode: false
        };
    }

    updateState() {
        if (mockPythonSocket) {
            mockPythonSocket.emit('playback_state', this.getState());
        }
    }

    startAnalysisLoop() {
        const update = () => {
            if (mockPythonSocket && !this.audioEl.paused) {
                const bufferLength = this.analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                this.analyser.getByteFrequencyData(dataArray);

                // Convert to normalized float 0-1 for compatibility with music.js expectations
                const normalizedData = Array.from(dataArray).map(v => v / 255);

                // We need to send 'spectrum_data'
                mockPythonSocket.emit('spectrum_data', { data: normalizedData });
            }
            requestAnimationFrame(update);
        };
        update();
    }
}

const player = new WebAudioPlayer();

// --- Mock Socket for Python Engine ---
// music.js connects to "http://127.0.0.1:5555"
// We need to intercept this `io` call.

const originalIo = window.io;
let mockPythonSocket = null;

// Mock Socket Emitter
class MockSocket {
    constructor() {
        this.listeners = {};
        this.connected = true;
        setTimeout(() => this.trigger('connect'), 100);
    }
    on(event, cb) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(cb);
    }
    emit(event, data) {
        // This simulates receiving data from server
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }
    trigger(event, data) {
        // Helper to trigger listener
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }
}

window.io = (url, opts) => {
    // If URL matches audio engine, return mock
    if (url && (url.includes('5555') || url.includes('127.0.0.1'))) {
        console.log("[WebPolyfill] Intercepting Python Engine Socket connection");
        if (!mockPythonSocket) mockPythonSocket = new MockSocket();
        return mockPythonSocket;
    }
    return originalIo(url, opts);
};


// --- Electron API Shim ---

const electronShim = {
    ipcRenderer: {
        invoke: async (channel, ...args) => {
            // --- Intercept Audio Commands ---
            if (channel === 'music-load') return player.load(args[0]);
            if (channel === 'music-play') return player.play();
            if (channel === 'music-pause') return player.pause();
            if (channel === 'music-seek') return player.seek(args[0]);
            if (channel === 'music-set-volume') return player.setVolume(args[0]);
            if (channel === 'music-get-state') return { status: 'success', state: player.getState() };
            if (channel === 'music-set-eq') return player.setEq(args[0].bands, args[0].enabled);

            // --- Default: Send to Server ---
            return new Promise((resolve, reject) => {
                mainSocket.emit(channel, ...args, (response) => {
                    if (response && response.success) {
                        resolve(response.result);
                    } else {
                        console.error(`[WebPolyfill] Error invoking ${channel}:`, response ? response.error : 'No response');
                        // Resolve with error status if possible to avoid crashes
                        if (response && response.error) {
                             // Some handlers expect a result object with status: error
                             resolve({ status: 'error', message: response.error });
                        } else {
                             reject(new Error(response ? response.error : 'Unknown error'));
                        }
                    }
                });
            });
        },
        send: (channel, ...args) => {
            // For music window ready signal, we can ignore or log
            if (channel === 'music-renderer-ready') {
                console.log("[WebPolyfill] Music renderer ready (client side)");
                return;
            }
            mainSocket.emit(channel, ...args);
        },
        on: (channel, listener) => {
            // Map standard IPC channels to socket events
            mainSocket.on(channel, (data) => {
                const event = { sender: null };
                listener(event, data);
            });
        },
        removeListener: (channel, listener) => {
            mainSocket.off(channel, listener);
        }
    }
};

// --- Expose API ---

window.electron = {
    send: (channel, data) => electronShim.ipcRenderer.send(channel, data),
    invoke: (channel, data) => electronShim.ipcRenderer.invoke(channel, data),
    on: (channel, func) => electronShim.ipcRenderer.on(channel, func)
};

window.electronPath = {
    dirname: (p) => {
        if (!p) return '';
        const idx = p.lastIndexOf('/');
        return idx === -1 ? '' : p.substring(0, idx);
    },
    extname: (p) => {
        if (!p) return '';
        const idx = p.lastIndexOf('.');
        return idx === -1 ? '' : p.substring(idx);
    },
    basename: (p) => {
        if (!p) return '';
        const idx = p.lastIndexOf('/');
        return idx === -1 ? p : p.substring(idx + 1);
    }
};

// --- Proxy for electronAPI ---
// We define specific overrides, then proxy the rest
const apiOverrides = {
    openMusicWindow: () => {
        // Open music.html in a new tab/window
        window.open('Musicmodules/music.html', '_blank', 'width=1000,height=700');
    },
    // Add other overrides if needed

    // Polyfill for startSpeechRecognition (Using Web Speech API)
    startSpeechRecognition: () => {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            alert("Your browser does not support Speech Recognition.");
            return;
        }
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = 'zh-CN';
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onresult = (event) => {
            const text = event.results[0][0].transcript;
            console.log("[WebPolyfill] Speech Result:", text);
            // Simulate receiving the result from the main process
            // The renderer expects: window.electronAPI.onSpeechRecognitionResult(callback)
            // But how do we trigger that callback?
            // We need to emit an event on the *mainSocket*?
            // No, the renderer listens to `ipcRenderer.on('speech-recognition-result', ...)`
            // We can manually trigger the listener if we tracked it?
            // Or simpler: Dispatch a custom event or use the `mainSocket` as a local event bus if possible.

            // Hack: trigger socket event locally? No, socket is for server.
            // We need a local event bus for client-side features.

            // Actually, we can just invoke a server method that echoes it back?
            // Or better: `mainSocket` handles server events.
            // We can emit a synthetic event on `mainSocket` client-side object?
            // socket.io client usually doesn't support emit-to-self.

            // Let's use the `window.electron.on` mechanism.
            // The user code calls `electronAPI.onSpeechRecognitionResult(cb)`.
            // In preload, this does `ipcRenderer.on(...)`.
            // In our polyfill, `ipcRenderer.on` registers a listener on `mainSocket`.

            // So if we want to trigger it, we need to pretend `mainSocket` received an event.
            // `mainSocket.onevent({ type: 2, data: ['speech-recognition-result', text] })`? (Internal API)
            // Or just:
            if (window.electronAPI._speechListeners) {
                window.electronAPI._speechListeners.forEach(cb => cb(text));
            }
        };
        recognition.start();
    },

    onSpeechRecognitionResult: (callback) => {
        if (!window.electronAPI._speechListeners) window.electronAPI._speechListeners = [];
        window.electronAPI._speechListeners.push(callback);
    },

    // File Selection Polyfill (Use hidden input)
    selectFilesToSend: (agentId, topicId) => {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.multiple = true;
            input.style.display = 'none';
            document.body.appendChild(input);

            input.onchange = async () => {
                const files = Array.from(input.files);
                if (files.length === 0) {
                    resolve({ canceled: true });
                    return;
                }

                // Upload files to server
                // We need to implement the upload logic.
                // Assuming /upload endpoint on server.

                for (const file of files) {
                    // Send to server
                    // Simple fetch upload
                    try {
                        const response = await fetch(`/upload?filename=${encodeURIComponent(file.name)}`, {
                            method: 'POST',
                            body: file
                        });
                        const result = await response.json();
                        if (result.success) {
                            // Notify main process to handle the file
                            // Existing IPC: handleFilePaste(agentId, topicId, fileData) or similar.
                            // But `handle-file-drop` takes file paths.
                            // We can send the *server path* back.

                            // `handle-file-drop` expects { path, name, type }
                            // `result.path` is the server path.

                            const fileDataForServer = {
                                path: result.path,
                                name: file.name,
                                type: file.type
                            };

                            // Call the existing handler on server
                            await electronShim.ipcRenderer.invoke('handle-file-drop', agentId, topicId, [fileDataForServer]);
                        }
                    } catch (e) {
                        console.error("Upload failed:", e);
                    }
                }
                document.body.removeChild(input);
                resolve({ canceled: false, count: files.length });
            };
            input.click();
        });
    }
};

const apiProxyHandler = {
    get: (target, prop) => {
        if (prop in apiOverrides) return apiOverrides[prop];
        if (prop in target) return target[prop];

        return (...args) => {
            const channel = prop.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
            return electronShim.ipcRenderer.invoke(channel, ...args);
        };
    }
};

// Initialize electronAPI object
window.electronAPI = new Proxy({
    // Explicitly map some listeners that don't fit the pattern or are common
    onModelsUpdated: (cb) => electronShim.ipcRenderer.on('models-updated', (event, data) => cb(data)),
    onVCPStreamChunk: (cb) => electronShim.ipcRenderer.on('vcp-stream-chunk', (event, data) => cb(data)),
    onVCPStreamEvent: (cb) => electronShim.ipcRenderer.on('vcp-stream-event', (event, data) => cb(data)),
    onThemeUpdated: (cb) => electronShim.ipcRenderer.on('theme-updated', (event, data) => cb(data)),
    // Add these for music.js
    onScanStarted: (cb) => electronShim.ipcRenderer.on('scan-started', (event, data) => cb(data)),
    onScanProgress: (cb) => electronShim.ipcRenderer.on('scan-progress', (event, data) => cb(data)),
    onScanFinished: (cb) => electronShim.ipcRenderer.on('scan-finished', (event, data) => cb(data)),
    onAudioEngineError: (cb) => electronShim.ipcRenderer.on('audio-engine-error', (event, data) => cb(data)),
    onMusicSetTrack: (cb) => electronShim.ipcRenderer.on('music-set-track', (event, data) => cb(data)),

    // Core Listeners
    onHistoryFileUpdated: (cb) => electronShim.ipcRenderer.on('history-file-updated', (event, data) => cb(data)),
    onAddFileToInput: (cb) => electronShim.ipcRenderer.on('add-file-to-input', (event, data) => cb(data)),
    onVCPLogMessage: (cb) => electronShim.ipcRenderer.on('vcp-log-message', (event, data) => cb(data)),
    onVCPLogStatus: (cb) => electronShim.ipcRenderer.on('vcp-log-status', (event, data) => cb(data)),

    // UI State Listeners
    onDoToggleNotificationsSidebar: (cb) => electronShim.ipcRenderer.on('do-toggle-notifications-sidebar', (event) => cb()),
    onWindowMaximized: (cb) => electronShim.ipcRenderer.on('window-maximized', (event) => cb()),
    onWindowUnmaximized: (cb) => electronShim.ipcRenderer.on('window-unmaximized', (event) => cb()),
}, apiProxyHandler);

console.log("[WebPolyfill] API exposed.");
