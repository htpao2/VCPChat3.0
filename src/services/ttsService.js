// src/services/ttsService.js
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// The cache paths will be initialized, not hardcoded.
let MODELS_CACHE_PATH;
let TTS_CACHE_DIR;

function initialize(paths) {
    const APP_DATA_ROOT = paths.APP_DATA_ROOT_IN_PROJECT;
    MODELS_CACHE_PATH = path.join(APP_DATA_ROOT, 'sovits_models.json');
    TTS_CACHE_DIR = path.join(APP_DATA_ROOT, 'tts_cache');
    // Ensure cache directory exists
    fs.mkdir(TTS_CACHE_DIR, { recursive: true }).catch(err => {
        console.error("Failed to create TTS cache directory:", err);
    });
}

/**
 * Fetches the list of available TTS models.
 * @param {boolean} forceRefresh - Whether to bypass the cache.
 * @param {string} ttsServerUrl - The base URL of the SoVITS server.
 * @returns {Promise<Object>} The list of models.
 */
async function getModels(forceRefresh = false, ttsServerUrl) {
    if (!ttsServerUrl) throw new Error("TTS Server URL is not provided.");

    if (!forceRefresh) {
        try {
            const cachedModels = await fs.readFile(MODELS_CACHE_PATH, 'utf-8');
            return JSON.parse(cachedModels);
        } catch (error) {
            // Cache miss, proceed to fetch from API
        }
    }

    try {
        const response = await axios.post(`${ttsServerUrl}/models`, { version: "v2ProPlus" });
        if (response.data && response.data.msg === "获取成功" && response.data.models) {
            await fs.writeFile(MODELS_CACHE_PATH, JSON.stringify(response.data.models, null, 2));
            return response.data.models;
        }
        throw new Error("Failed to fetch models from API.");
    } catch (error) {
        console.error("Error requesting TTS models from API:", error.message);
        // As a fallback, try to read from cache one last time
        try {
            const cachedModels = await fs.readFile(MODELS_CACHE_PATH, 'utf-8');
            return JSON.parse(cachedModels);
        } catch (e) {
            return null; // Return null if both API and cache fail
        }
    }
}

/**
 * Converts text to speech by calling the SoVITS API.
 * @param {object} options - The speech options.
 * @param {string} options.text - The text to synthesize.
 * @param {string} options.voice - The voice model to use.
 * @param {number} options.speed - The speech speed.
 * @param {string} ttsServerUrl - The base URL of the SoVITS server.
 * @returns {Promise<Buffer|null>} A buffer containing the audio data.
 */
async function speak({ text, voice, speed }, ttsServerUrl) {
    if (!ttsServerUrl) throw new Error("TTS Server URL is not provided.");

    const cacheKey = crypto.createHash('md5').update(text + voice + speed).digest('hex');
    const cacheFilePath = path.join(TTS_CACHE_DIR, `${cacheKey}.mp3`);

    // 1. Check cache
    try {
        return await fs.readFile(cacheFilePath);
    } catch (error) {
        // Cache miss, proceed to API
    }

    // 2. Determine language and create payload
    let promptLang = voice.includes('日语') ? "日语" : "中文";
    const payload = {
        model: "tts-v2ProPlus",
        input: text,
        voice: voice,
        response_format: "mp3",
        speed: speed,
        other_params: {
            text_lang: promptLang === "日语" ? "日语" : "中英混合",
            prompt_lang: promptLang,
            emotion: "默认",
            text_split_method: "按标点符号切",
        }
    };

    // 3. Request from API
    try {
        const response = await axios.post(`${ttsServerUrl}/v1/audio/speech`, payload, {
            responseType: 'arraybuffer'
        });

        if (response.headers['content-type'] === 'audio/mpeg') {
            const audioBuffer = Buffer.from(response.data);
            // 4. Save to cache
            await fs.writeFile(cacheFilePath, audioBuffer).catch(cacheError => {
                console.error("Failed to save TTS audio to cache:", cacheError);
            });
            return audioBuffer;
        }
        return null;
    } catch (error) {
        console.error("Error requesting speech synthesis from API:", error.message);
        return null;
    }
}

module.exports = {
    initialize,
    getModels,
    speak,
};
