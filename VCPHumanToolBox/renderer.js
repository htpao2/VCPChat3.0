// VCPHumanToolBox/renderer.js
import { tools as localTools } from './renderer_modules/config.js'; // Rename import
import * as canvasHandler from './renderer_modules/ui/canvas-handler.js';
import * as dynamicImageHandler from './renderer_modules/ui/dynamic-image-handler.js';

let tools = { ...localTools }; // Copy local tools to a mutable object

document.addEventListener('DOMContentLoaded', async () => {
    // --- 元素获取 ---
    const toolGrid = document.getElementById('tool-grid');
    const toolDetailView = document.getElementById('tool-detail-view');
    const backToGridBtn = document.getElementById('back-to-grid-btn');
    const toolTitle = document.getElementById('tool-title');
    const toolDescription = document.getElementById('tool-description');
    const toolForm = document.getElementById('tool-form');
    const resultContainer = document.getElementById('result-container');
    const settingsBtn = document.getElementById('settings-btn'); // Settings Button
    const settingsModal = document.getElementById('settings-modal'); // Settings Modal
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const saveSettingsBtn = document.getElementById('save-settings-btn');

    // --- 全局变量 ---
    let VCP_SERVER_URL = '';
    let VCP_API_KEY = '';
    let USER_NAME = 'Human';
    let ADMIN_USERNAME = '';
    let ADMIN_PASSWORD = '';
    let settings = {};
    let MAX_FILENAME_LENGTH = 400;

    // --- Wallpaper Function (Moved inside scope) ---
    async function loadAndProcessWallpaper() {
        const bodyStyles = getComputedStyle(document.body);
        let wallpaperUrl = bodyStyles.backgroundImage;

        if (wallpaperUrl && wallpaperUrl !== 'none') {
            const match = wallpaperUrl.match(/url\("(.+)"\)/);
            if (match && match[1]) {
                let imagePath = match[1];
                if (imagePath.startsWith('file:///')) {
                    imagePath = decodeURI(imagePath.substring(8));
                }

                try {
                    const processedImageBase64 = await window.electronAPI.invoke('vcp-ht-process-wallpaper', imagePath);
                    if (processedImageBase64) {
                        document.body.style.backgroundImage = `url('${processedImageBase64}')`;
                    }
                } catch (error) {
                    console.error('Wallpaper processing failed:', error);
                }
            }
        }
    }

    // --- 设置加载与保存 ---
    async function loadSettings() {
        try {
            settings = await window.electronAPI.invoke('vcp-ht-get-settings');
        } catch (error) {
            console.error('Failed to load settings:', error);
            settings = {};
        }
    }

    async function saveSettings() {
        try {
            const result = await window.electronAPI.invoke('vcp-ht-save-settings', settings);
            if (!result.success) {
                throw new Error(result.error);
            }
            console.log('[VCPHumanToolBox] Settings saved successfully');
        } catch (error) {
            console.error('[VCPHumanToolBox] Failed to save settings:', error);
            throw error;
        }
    }

    // --- 初始化应用程序 ---
    async function initializeApp() {
        await loadSettings();

        // Load config from settings
        if (settings.vcpServerUrl) {
            try {
                const url = new URL(settings.vcpServerUrl);
                // Keep the base URL, don't append /v1/human/tool yet, do that when needed
                VCP_SERVER_URL = url.toString().replace(/\/$/, ''); // Remove trailing slash
            } catch (e) {
                console.error("Invalid vcpServerUrl in settings:", settings.vcpServerUrl);
            }
        }
        VCP_API_KEY = settings.vcpApiKey || '';
        USER_NAME = settings.userName || 'Human';
        ADMIN_USERNAME = settings.adminUsername || '';
        ADMIN_PASSWORD = settings.adminPassword || '';
        MAX_FILENAME_LENGTH = settings.maxFilenameLength || 400;

        // 动态加载模块并传递配置
        canvasHandler.setMaxFilenameLength(MAX_FILENAME_LENGTH);

        if (!VCP_SERVER_URL || !VCP_API_KEY) {
             // Show empty state or error, but let user open settings
             toolGrid.innerHTML = `<div class="error" style="text-align: center; padding: 20px;">
                <p>未配置 VCP 服务器信息。</p>
                <p>请点击右上角的 "设置" 按钮进行配置。</p>
             </div>`;
        } else {
            // Attempt to fetch remote tools if configured
            if (ADMIN_USERNAME && ADMIN_PASSWORD) {
                await fetchRemoteTools();
            } else {
                console.log('Admin credentials not set, skipping remote tool fetch.');
            }
        }

        initializeUI();
    }

    // --- Fetch Remote Tools ---
    async function fetchRemoteTools() {
        try {
            const fetchUrl = `${VCP_SERVER_URL}/admin_api/tool-list-editor/tools`;
            const authHeader = 'Basic ' + btoa(ADMIN_USERNAME + ':' + ADMIN_PASSWORD);

            const response = await fetch(fetchUrl, {
                method: 'GET',
                headers: {
                    'Authorization': authHeader
                }
            });

            if (!response.ok) {
                if (response.status === 401) throw new Error('Unauthorized: Invalid Admin credentials');
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            if (data && data.tools && Array.isArray(data.tools)) {
                console.log(`Fetched ${data.tools.length} remote tools.`);
                processRemoteTools(data.tools);
                renderToolGrid(); // Re-render grid with new tools

                 // Show success toast
                 const toast = document.createElement('div');
                 toast.className = 'success-notification';
                 toast.style.cssText = `
                    position: fixed;
                    bottom: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: var(--success-color);
                    color: white;
                    padding: 10px 20px;
                    border-radius: 6px;
                    z-index: 3000;
                 `;
                 toast.textContent = `成功从服务器加载了 ${data.tools.length} 个工具`;
                 document.body.appendChild(toast);
                 setTimeout(() => toast.remove(), 3000);

            }

        } catch (error) {
            console.error('Failed to fetch remote tools:', error);
            const toast = document.createElement('div');
            toast.className = 'error';
            toast.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: var(--danger-color);
                color: white;
                padding: 10px 20px;
                border-radius: 6px;
                z-index: 3000;
            `;
            toast.textContent = `获取远程工具失败: ${error.message}`;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 5000);
        }
    }

    function processRemoteTools(remoteToolsList) {
        // Create a new tools object merging local and remote
        const newTools = { ...localTools };

        remoteToolsList.forEach(remoteTool => {
            const toolName = remoteTool.name;
            // If tool exists in local config, skip (use local definition)
            if (newTools[toolName]) return;

            // Otherwise, parse description to build params
            const params = parseToolParamsFromDescription(remoteTool.description);

            newTools[toolName] = {
                displayName: remoteTool.displayName || toolName,
                description: remoteTool.description || '',
                params: params,
                isRemote: true
            };
        });

        tools = newTools; // Update global tools object
    }

    function parseToolParamsFromDescription(description) {
        const params = [];
        if (!description) return [{ name: 'arg', type: 'textarea', description: 'Arguments' }];

        const lines = description.split('\n');
        let inParamSection = false;

        for (const line of lines) {
            const trimmed = line.trim();
            // Heuristic to detect start of params (often "参数:" or "Params:")
            if (/(参数|Params)[:：]/.test(trimmed)) {
                inParamSection = true;
                continue;
            }

            // If we find a list item that looks like a param
            // Regex: - name (type info): desc
            const paramMatch = trimmed.match(/^-\s*([a-zA-Z0-9_]+)\s*\(([^)]+)\)[:：]\s*(.*)$/);

            if (paramMatch) {
                const name = paramMatch[1];
                const typeInfo = paramMatch[2].toLowerCase();
                const desc = paramMatch[3];

                let type = 'text';
                let required = false;

                // Parse type info
                if (typeInfo.includes('必需') || typeInfo.includes('required') || typeInfo.includes('must')) {
                    required = true;
                }

                if (typeInfo.includes('textarea') || desc.includes('长文本') || desc.includes('提示词')) {
                    type = 'textarea';
                } else if (typeInfo.includes('number') || typeInfo.includes('数字') || typeInfo.includes('int')) {
                    type = 'number';
                } else if (typeInfo.includes('boolean') || typeInfo.includes('布尔') || typeInfo.includes('bool')) {
                    type = 'checkbox';
                } else if (typeInfo.includes('select')) {
                    // Complex to parse options from text, default to text
                    type = 'text';
                }

                // Heuristic for image inputs
                if (name.toLowerCase().includes('image') || desc.includes('图片')) {
                    type = 'dragdrop_image'; // Assume dragdrop for better UX
                }

                params.push({
                    name: name,
                    type: type,
                    required: required,
                    description: desc
                });
            }
        }

        // If no params found via regex, check if it's a simple command without explicit params
        if (params.length === 0) {
            // Check if it's a "single argument" tool implied by context?
            // If description mentions "command" or "prompt", add one generic param
            params.push({
                name: 'args',
                type: 'textarea',
                required: true,
                description: 'JSON Arguments or Command String'
            });
        }

        return params;
    }


    // --- UI Logic ---

    // Settings Modal
    settingsBtn.addEventListener('click', () => {
        // Populate fields
        document.getElementById('setting-server-url').value = settings.vcpServerUrl || '';
        document.getElementById('setting-api-key').value = settings.vcpApiKey || '';
        document.getElementById('setting-admin-user').value = settings.adminUsername || '';
        document.getElementById('setting-admin-pass').value = settings.adminPassword || '';

        settingsModal.style.display = 'flex';
    });

    closeSettingsBtn.addEventListener('click', () => {
        settingsModal.style.display = 'none';
    });

    saveSettingsBtn.addEventListener('click', async () => {
        // Save
        settings.vcpServerUrl = document.getElementById('setting-server-url').value.trim();
        settings.vcpApiKey = document.getElementById('setting-api-key').value.trim();
        settings.adminUsername = document.getElementById('setting-admin-user').value.trim();
        settings.adminPassword = document.getElementById('setting-admin-pass').value.trim();

        try {
            await saveSettings();
            settingsModal.style.display = 'none';
            // Reload app
            await initializeApp();

            const toast = document.createElement('div');
             toast.className = 'success-notification';
             toast.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: var(--success-color);
                color: white;
                padding: 10px 20px;
                border-radius: 6px;
                z-index: 3000;
             `;
             toast.textContent = '设置已保存并刷新';
             document.body.appendChild(toast);
             setTimeout(() => toast.remove(), 2000);

        } catch (e) {
            alert('保存设置失败: ' + e.message);
        }
    });


    function renderToolGrid() {
        toolGrid.innerHTML = '';
        const sortedToolNames = Object.keys(tools).sort(); // Alphabetical sort

        for (const toolName of sortedToolNames) {
            const tool = tools[toolName];
            const card = document.createElement('div');
            card.className = 'tool-card';
            if (tool.isRemote) {
                card.classList.add('remote-tool'); // Can style this later
                card.style.borderColor = 'var(--primary-color)';
            }
            card.dataset.toolName = toolName;

            const badge = tool.isRemote ? '<span style="background:var(--primary-color); color:white; padding:2px 6px; border-radius:4px; font-size:10px; vertical-align:middle; margin-left:6px;">REMOTE</span>' : '';

            card.innerHTML = `
                <h3>${tool.displayName} ${badge}</h3>
                <p>${tool.description}</p>
            `;
            card.addEventListener('click', () => showToolDetail(toolName));
            toolGrid.appendChild(card);
        }
    }

    function showToolDetail(toolName) {
        const tool = tools[toolName];
        toolTitle.textContent = tool.displayName;
        toolDescription.textContent = tool.description;

        buildToolForm(toolName);

        toolGrid.style.display = 'none';
        toolDetailView.style.display = 'block';
        resultContainer.innerHTML = '';
    }

    function buildToolForm(toolName) {
        const tool = tools[toolName];
        toolForm.innerHTML = '';
        const paramsContainer = document.createElement('div');
        paramsContainer.id = 'params-container';

        if (tool.commands) {
            const commandSelectGroup = document.createElement('div');
            commandSelectGroup.className = 'form-group';
            commandSelectGroup.innerHTML = `<label for="command-select">选择操作 (Command):</label>`;
            const commandSelect = document.createElement('select');
            commandSelect.id = 'command-select';
            commandSelect.name = 'command';

            for (const commandName in tool.commands) {
                const option = document.createElement('option');
                option.value = commandName;
                option.textContent = `${commandName} - ${tool.commands[commandName].description}`;
                commandSelect.appendChild(option);
            }
            commandSelectGroup.appendChild(commandSelect);
            toolForm.appendChild(commandSelectGroup);

            toolForm.appendChild(paramsContainer);

            commandSelect.addEventListener('change', (e) => {
                renderFormParams(tool.commands[e.target.value].params, paramsContainer, toolName, e.target.value);
            });
            renderFormParams(tool.commands[commandSelect.value].params, paramsContainer, toolName, commandSelect.value);

        } else {
            toolForm.appendChild(paramsContainer);
            renderFormParams(tool.params, paramsContainer, toolName);
        }

        // 添加按钮容器
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display: flex; gap: 10px; margin-top: 15px; flex-wrap: wrap;';

        const submitButton = document.createElement('button');
        submitButton.type = 'submit';
        submitButton.textContent = '执行';
        submitButton.style.cssText = `
            background-color: var(--success-color);
            color: var(--text-on-accent);
            border: none;
            padding: 12px 25px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
            transition: background-color 0.2s;
        `;
        buttonContainer.appendChild(submitButton);

        // 添加全部清空按钮
        const clearAllButton = document.createElement('button');
        clearAllButton.type = 'button';
        clearAllButton.innerHTML = '🗑️ 全部清空';
        clearAllButton.style.cssText = `
            background-color: var(--warning-color, #f59e0b);
            color: white;
            border: none;
            padding: 12px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
        `;

        clearAllButton.addEventListener('click', () => {
            clearAllFormData(toolName);
        });

        buttonContainer.appendChild(clearAllButton);

        // 为 ComfyUI 工具添加设置按钮
        if (toolName === 'ComfyUIGen') {
            const settingsButton = document.createElement('button');
            settingsButton.type = 'button';
            settingsButton.textContent = '⚙️ 设置';
            settingsButton.className = 'back-btn';
            settingsButton.style.cssText = 'margin-left: auto;';
            settingsButton.addEventListener('click', () => openComfyUISettings());
            buttonContainer.appendChild(settingsButton);
        }

        // 为 NanoBananaGen 工具添加文件名设置按钮
        if (toolName === 'NanoBananaGen') {
            const filenameSettingsButton = document.createElement('button');
            filenameSettingsButton.type = 'button';
            filenameSettingsButton.innerHTML = '⚙️ 设置';
            filenameSettingsButton.style.cssText = `
                background-color: var(--secondary-color, #6b7280);
                color: white;
                border: none;
                padding: 12px 20px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 14px;
                transition: all 0.2s;
            `;

            filenameSettingsButton.addEventListener('click', () => {
                showFilenameSettings();
            });

            buttonContainer.appendChild(filenameSettingsButton);
        }

        toolForm.appendChild(buttonContainer);

        toolForm.onsubmit = (e) => {
            e.preventDefault();
            executeTool(toolName);
        };
    }

    function renderFormParams(params, container, toolName = '', commandName = '') {
        container.innerHTML = '';
        const dependencyListeners = [];

        if (!params || params.length === 0) {
            container.innerHTML = '<p style="color:var(--secondary-text); font-style:italic;">无参数或参数无法自动解析。</p>';
            return;
        }

        // 检查是否为 NanoBananaGen 的 compose 命令
        const isNanoBananaCompose = toolName === 'NanoBananaGen' && commandName === 'compose';
        let imageUrlCounter = 1; // 用于动态图片输入框的计数器

        params.forEach(param => {
            const paramGroup = document.createElement('div');
            paramGroup.className = 'form-group';

            let labelText = param.description || param.name;
            const label = document.createElement('label');
            label.textContent = `${labelText}${param.required ? ' *' : ''}`;

            let input;
            if (param.type === 'textarea') {
                input = document.createElement('textarea');
            } else if (param.type === 'select') {
                input = document.createElement('select');
                if (param.options) {
                    param.options.forEach(opt => {
                        const option = document.createElement('option');
                        option.value = opt;
                        option.textContent = opt || `(${param.name})`;
                        input.appendChild(option);
                    });
                }
            } else if (param.type === 'radio') {
                input = document.createElement('div');
                input.className = 'radio-group';
                if (param.options) {
                    param.options.forEach(opt => {
                        const radioLabel = document.createElement('label');
                        const radioInput = document.createElement('input');
                        radioInput.type = 'radio';
                        radioInput.name = param.name;
                        radioInput.value = opt;
                        if (opt === param.default) radioInput.checked = true;

                        radioLabel.appendChild(radioInput);
                        radioLabel.append(` ${opt}`);
                        input.appendChild(radioLabel);

                        // Add listener for dependency changes
                        radioInput.addEventListener('change', () => {
                            dependencyListeners.forEach(listener => listener());
                        });
                    });
                }
            } else if (param.type === 'dragdrop_image') {
                // 创建拖拽上传图片输入框
                input = canvasHandler.createDragDropImageInput(param);

            } else if (param.type === 'checkbox') {
                input = document.createElement('div');
                input.className = 'checkbox-group';

                const checkboxLabel = document.createElement('label');
                checkboxLabel.className = 'checkbox-label';
                checkboxLabel.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    margin-top: 5px;
                `;

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.name = param.name;
                checkbox.checked = param.default || false;

                const checkboxText = document.createElement('span');
                checkboxText.textContent = param.description || param.name;

                checkboxLabel.appendChild(checkbox);
                checkboxLabel.appendChild(checkboxText);
                input.appendChild(checkboxLabel);

                // 添加翻译相关的UI元素
                if (param.name === 'enable_translation') {
                    const translationContainer = createTranslationContainer(param.name);
                    input.appendChild(translationContainer);

                    // 监听 checkbox 状态变化
                    checkbox.addEventListener('change', (e) => {
                        const container = input.querySelector('.translation-container');
                        if (container) {
                            container.style.display = e.target.checked ? 'block' : 'none';
                        }
                    });
                }
            } else {
                input = document.createElement('input');
                input.type = param.type || 'text';
            }

            if (input.tagName !== 'DIV' || param.type === 'dragdrop_image') {
                input.name = param.name;
                if (param.type !== 'dragdrop_image') {
                    input.placeholder = param.placeholder || '';
                    if (param.default) input.value = param.default;
                }
                if (param.required) input.required = true;
            } else {
                // For radio group, we need a hidden input to carry the name for FormData
                const hiddenInput = document.createElement('input');
                hiddenInput.type = 'hidden';
                hiddenInput.name = param.name;
                paramGroup.appendChild(hiddenInput);
            }

            paramGroup.appendChild(label);
            paramGroup.appendChild(input);
            container.appendChild(paramGroup);

            // Handle conditional visibility
            if (param.dependsOn) {
                const dependencyCheck = () => {
                    const dependencyField = toolForm.querySelector(`[name="${param.dependsOn.field}"]:checked`) || toolForm.querySelector(`[name="${param.dependsOn.field}"]`);
                    if (dependencyField && dependencyField.value === param.dependsOn.value) {
                        paramGroup.style.display = '';
                    } else {
                        paramGroup.style.display = 'none';
                    }
                };
                dependencyListeners.push(dependencyCheck);
            }
        });

        // 如果是 NanoBanana compose 模式，添加动态图片管理区域
        if (isNanoBananaCompose) {
            dynamicImageHandler.createDynamicImageContainer(container);
        }

        dependencyListeners.forEach(listener => listener());
    }

    // ... [Rest of the file remains same, except executeTool uses the updated vars]

    async function executeTool(toolName) {
        const formData = new FormData(toolForm);
        const args = {};
        let finalToolName = toolName;

        const tool = tools[toolName];
        // The finalToolName is always the toolName. The 'command' is an argument.

        for (let [key, value] of formData.entries()) {
            // Handle checkbox
            const inputElement = toolForm.querySelector(`[name="${key}"]`);
            if (inputElement && inputElement.type === 'checkbox') {
                args[key] = inputElement.checked;
            } else if (value) {
                args[key] = value;
            }
        }

        // Handle explicit file/image inputs that might have been skipped by standard FormData iteration if they are custom DIVs
        // (Though canvas-handler uses hidden inputs which should be caught)

        resultContainer.innerHTML = '<div class="loader"></div>';

        try {
            // NOTE: The proxy execution via main process uses VCP_SERVER_URL/v1/human/tool
            // which requires the VCP_API_KEY (Bearer). This is separate from the Admin Auth used for listing.
            const result = await window.electronAPI.invoke('vcp-ht-execute-tool-proxy', {
                url: `${VCP_SERVER_URL}/v1/human/tool`,
                apiKey: VCP_API_KEY,
                toolName: finalToolName,
                userName: USER_NAME,
                args: args
            });

            if (result.success) {
                renderResult(result.data, toolName);
            } else {
                renderResult({ status: 'error', error: result.error }, toolName);
            }
        } catch (error) {
            renderResult({ status: 'error', error: error.message }, toolName);
        }
    }

    // ... [Rest of helper functions like renderResult, setupImageViewer, etc. remain unchanged] ...

    function renderResult(data, toolName) {
        resultContainer.innerHTML = '';

        // 1. Handle errors first
        if (data.status === 'error' || data.error) {
            const errorMessage = data.error || data.message || '未知错误';
            const pre = document.createElement('pre');
            pre.className = 'error';
            pre.textContent = typeof errorMessage === 'object' ? JSON.stringify(errorMessage, null, 2) : errorMessage;
            resultContainer.appendChild(pre);
            return; // Exit on error, no images to process
        }

        // 2. Extract the core content, handling nested JSON from certain tools
        let content = data.result || data.message || data;
        if (content && typeof content.content === 'string') {
            try {
                const parsedContent = JSON.parse(content.content);
                // Prioritize 'original_plugin_output' as it often contains the final, formatted result.
                content = parsedContent.original_plugin_output || parsedContent;
            } catch (e) {
                // If it's not a valid JSON string, just use the string from 'content' property.
                content = content.content;
            }
        }

        // 3. Render content based on its type
        if (content == null) {
            const p = document.createElement('p');
            p.textContent = '插件执行完毕，但没有返回明确内容。';
            resultContainer.appendChild(p);
        } else if (content && Array.isArray(content.content)) { // Multi-modal content (e.g., from GPT-4V)
            content.content.forEach(item => {
                if (item.type === 'text') {
                    const pre = document.createElement('pre');
                    pre.textContent = item.text;
                    resultContainer.appendChild(pre);
                } else if (item.type === 'image_url' && item.image_url && item.image_url.url) {
                    const imgElement = document.createElement('img');
                    imgElement.src = item.image_url.url;
                    resultContainer.appendChild(imgElement);
                }
            });
        } else if (typeof content === 'string' && (content.startsWith('data:image') || /\.(jpg|jpeg|png|gif|webp)$/i.test(content))) { // Direct image URL string
            const imgElement = document.createElement('img');
            imgElement.src = content;
            resultContainer.appendChild(imgElement);
        } else if (typeof content === 'string') { // Markdown/HTML string
            const div = document.createElement('div');
            // Use marked to render markdown, which will also render raw HTML like <img> tags
            if (window.marked && typeof window.marked.parse === 'function') {
                div.innerHTML = window.marked.parse(content);
            } else {
                console.error("'marked' library not loaded. Displaying content as plain text.");
                div.textContent = content;
            }
            resultContainer.appendChild(div);
        } else if (toolName === 'TavilySearch' && content && (content.results || content.images)) {
            const searchResultsWrapper = document.createElement('div');
            searchResultsWrapper.className = 'tavily-search-results';

            // Render images
            if (content.images && content.images.length > 0) {
                const imagesContainer = document.createElement('div');
                imagesContainer.className = 'tavily-images-container';
                content.images.forEach(image => {
                    const imageWrapper = document.createElement('figure');
                    imageWrapper.className = 'tavily-image-wrapper';
                    const img = document.createElement('img');
                    img.src = image.url;
                    const figcaption = document.createElement('figcaption');
                    figcaption.textContent = image.description;
                    imageWrapper.appendChild(img);
                    imageWrapper.appendChild(figcaption);
                    imagesContainer.appendChild(imageWrapper);
                });
                searchResultsWrapper.appendChild(imagesContainer);
            }

            // Render search results
            if (content.results && content.results.length > 0) {
                const resultsContainer = document.createElement('div');
                resultsContainer.className = 'tavily-results-container';
                content.results.forEach(result => {
                    const resultItem = document.createElement('div');
                    resultItem.className = 'tavily-result-item';

                    const title = document.createElement('h4');
                    const link = document.createElement('a');
                    link.href = result.url;
                    link.textContent = result.title;
                    link.target = '_blank'; // Open in new tab
                    title.appendChild(link);

                    const url = document.createElement('p');
                    url.className = 'tavily-result-url';
                    url.textContent = result.url;

                    const snippet = document.createElement('div');
                    snippet.className = 'tavily-result-snippet';
                    if (window.marked && typeof window.marked.parse === 'function') {
                        snippet.innerHTML = window.marked.parse(result.content);
                    } else {
                        console.error("'marked' library not loaded. Displaying content as plain text.");
                        snippet.textContent = result.content;
                    }

                    resultItem.appendChild(title);
                    resultItem.appendChild(url);
                    resultItem.appendChild(snippet);
                    resultsContainer.appendChild(resultItem);
                });
                searchResultsWrapper.appendChild(resultsContainer);
            }

            resultContainer.appendChild(searchResultsWrapper);
        } else if (typeof content === 'object') { // Generic object
            // Check for common image/text properties within the object
            const imageUrl = content.image_url || content.url || content.image;
            const textResult = content.result || content.message || content.original_plugin_output || content.content;

            if (typeof imageUrl === 'string') {
                const imgElement = document.createElement('img');
                imgElement.src = imageUrl;
                resultContainer.appendChild(imgElement);
            } else if (typeof textResult === 'string') {
                if (window.marked && typeof window.marked.parse === 'function') {
                    resultContainer.innerHTML = window.marked.parse(textResult);
                } else {
                    console.error("'marked' library not loaded. Displaying content as plain text.");
                    resultContainer.textContent = textResult;
                }
            } else {
                // Fallback for other objects: pretty-print the JSON
                const pre = document.createElement('pre');
                pre.textContent = JSON.stringify(content, null, 2);
                resultContainer.appendChild(pre);
            }
        } else { // Fallback for any other data type
            const pre = document.createElement('pre');
            pre.textContent = `插件返回了未知类型的数据: ${String(content)}`;
            resultContainer.appendChild(pre);
        }

        // 4. Finally, ensure all rendered images (newly created or from HTML) have the context menu
        // attachEventListenersToImages(resultContainer);
    }

    // --- Image Viewer Modal ---
    function setupImageViewer() {
        if (document.getElementById('image-viewer-modal')) return;

        const viewer = document.createElement('div');
        viewer.id = 'image-viewer-modal';
        viewer.style.cssText = `
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            overflow: auto;
            background-color: rgba(0,0,0,0.85);
            justify-content: center;
            align-items: center;
        `;
        viewer.innerHTML = `
            <span style="position: absolute; top: 15px; right: 35px; color: #f1f1f1; font-size: 40px; font-weight: bold; cursor: pointer;">&times;</span>
            <img style="margin: auto; display: block; max-width: 90%; max-height: 90%;">
        `;
        document.body.appendChild(viewer);

        const modalImg = viewer.querySelector('img');
        const closeBtn = viewer.querySelector('span');

        function openModal(src) {
            viewer.style.display = 'flex';
            modalImg.src = src;
            document.addEventListener('keydown', handleEscKeyModal);
        }

        function closeModal() {
            viewer.style.display = 'none';
            modalImg.src = '';
            document.removeEventListener('keydown', handleEscKeyModal);
        }

        function handleEscKeyModal(e) {
            if (e.key === 'Escape') {
                closeModal();
            }
        }

        closeBtn.onclick = closeModal;
        viewer.onclick = function(e) {
            if (e.target === viewer) {
                closeModal();
            }
        };

        resultContainer.addEventListener('click', (e) => {
            let target = e.target;
            // Handle case where user clicks an IMG inside an A tag
            if (target.tagName === 'IMG' && target.parentElement.tagName === 'A') {
                target = target.parentElement;
            }

            if (target.tagName === 'A' && target.href && (target.href.match(/\.(jpeg|jpg|gif|png|webp)$/i) || target.href.startsWith('data:image'))) {
                e.preventDefault();
                openModal(target.href);
            }
        });
    }

    // --- Initialize UI ---
    function initializeUI() {
        // Window controls
        document.getElementById('minimize-btn').addEventListener('click', () => {
            window.electronAPI.send('window-control', 'minimize');
        });
        document.getElementById('maximize-btn').addEventListener('click', () => {
            window.electronAPI.send('window-control', 'maximize');
        });
        document.getElementById('close-btn').addEventListener('click', () => {
            window.electronAPI.send('window-control', 'close');
        });

        // Theme toggle
        const themeToggleBtn = document.getElementById('theme-toggle-btn');

        function applyTheme(theme) {
            if (theme === 'light') {
                document.body.classList.add('light-theme');
                themeToggleBtn.textContent = '☀️';
            } else {
                document.body.classList.remove('light-theme');
                themeToggleBtn.textContent = '🌙';
            }
        }

        // Apply initial theme from settings
        applyTheme(settings.vcpht_theme);

        themeToggleBtn.addEventListener('click', async () => {
            const isLight = document.body.classList.toggle('light-theme');
            const newTheme = isLight ? 'light' : 'dark';
            applyTheme(newTheme);
            settings.vcpht_theme = newTheme;

            try {
                await saveSettings();
            } catch (saveError) {
                console.error('[VCPHumanToolBox] Failed to save theme setting:', saveError);
            }
        });

        // App controls
        backToGridBtn.addEventListener('click', () => {
            toolDetailView.style.display = 'none';
            toolGrid.style.display = 'grid';
        });

        // 工作流编排按钮
        const workflowBtn = document.getElementById('workflow-btn');
        if (workflowBtn) {
            workflowBtn.addEventListener('click', openWorkflowEditor);
        }

        renderToolGrid();
        loadAndProcessWallpaper(); // Safe to call now
        setupImageViewer();
    }

    // --- ComfyUI Integration (unchanged) ---
    // ... [Keep existing ComfyUI integration code] ...
    let comfyUIDrawer = null;
    let comfyUILoaded = false;

    function createComfyUIDrawer() {
        const overlay = document.createElement('div');
        overlay.className = 'drawer-overlay hidden';
        overlay.addEventListener('click', closeComfyUISettings);

        const drawer = document.createElement('div');
        drawer.className = 'drawer-panel';
        drawer.innerHTML = `
            <div class="drawer-content" id="comfyui-drawer-content">
                <div style="text-align: center; padding: 50px; color: var(--secondary-text);">
                    正在加载 ComfyUI 配置...
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(drawer);

        return { overlay, drawer };
    }

    async function openComfyUISettings() {
        if (!comfyUIDrawer) {
            comfyUIDrawer = createComfyUIDrawer();
        }

        comfyUIDrawer.overlay.classList.remove('hidden');
        comfyUIDrawer.drawer.classList.add('open');
        document.body.classList.add('drawer-open');

        if (!comfyUILoaded) {
            try {
                await loadComfyUIModules();

                if (window.ComfyUILoader) {
                    await window.ComfyUILoader.load();

                    const drawerContent = document.getElementById('comfyui-drawer-content');
                    if (window.comfyUI && drawerContent) {
                        window.comfyUI.createUI(drawerContent, {
                            defaultTab: 'connection',
                            onClose: closeComfyUISettings
                        });
                    }

                    comfyUILoaded = true;
                } else {
                    throw new Error('ComfyUILoader 未能正确加载');
                }
            } catch (error) {
                console.error('加载 ComfyUI 模块失败:', error);
                const drawerContent = document.getElementById('comfyui-drawer-content');
                if (drawerContent) {
                    drawerContent.innerHTML = `
                        <div style="text-align: center; padding: 50px; color: var(--danger-color);">
                            加载 ComfyUI 配置失败: ${error.message}
                        </div>
                    `;
                }
            }
        }

        document.addEventListener('keydown', handleEscKey);
    }

    function closeComfyUISettings() {
        if (comfyUIDrawer) {
            comfyUIDrawer.overlay.classList.add('hidden');
            comfyUIDrawer.drawer.classList.remove('open');
            document.body.classList.remove('drawer-open');
        }
        document.removeEventListener('keydown', handleEscKey);
    }

    function handleEscKey(e) {
        if (e.key === 'Escape') {
            closeComfyUISettings();
        }
    }

    async function loadComfyUIModules() {
        const loaderScript = document.createElement('script');
        loaderScript.src = 'ComfyUImodules/ComfyUILoader.js';

        return new Promise((resolve, reject) => {
            loaderScript.onload = resolve;
            loaderScript.onerror = () => reject(new Error('无法加载 ComfyUILoader.js'));
            document.head.appendChild(loaderScript);
        });
    }

    // --- 工作流编排集成功能 (unchanged) ---
    let workflowEditorLoaded = false;

    async function openWorkflowEditor() {
        try {
            if (!workflowEditorLoaded) {
                await loadWorkflowEditorModules();
                workflowEditorLoaded = true;
            }

            if (window.workflowEditor) {
                window.workflowEditor.show();
            } else {
                throw new Error('工作流编排器未能正确初始化');
            }
        } catch (error) {
            console.error('打开工作流编排器失败:', error);
            alert(`打开工作流编排器失败: ${error.message}`);
        }
    }

    async function loadWorkflowEditorModules() {
        const loaderScript = document.createElement('script');
        loaderScript.src = 'WorkflowEditormodules/WorkflowEditorLoader_Simplified.js';

        await new Promise((resolve, reject) => {
            loaderScript.onload = resolve;
            loaderScript.onerror = () => reject(new Error('无法加载 WorkflowEditorLoader_Simplified.js'));
            document.head.appendChild(loaderScript);
        });

        if (window.WorkflowEditorLoader) {
            await window.WorkflowEditorLoader.load();

            if (window.workflowEditor) {
                await window.workflowEditor.init();
                console.log('工作流编排器初始化成功');
            } else {
                throw new Error('WorkflowEditor 配置模块未能正确加载');
            }
        } else {
            throw new Error('WorkflowEditorLoader 未能正确加载');
        }
    }

    // 将函数暴露到全局作用域，以便按钮点击时调用
    window.openComfyUISettings = openComfyUISettings;
    window.closeComfyUISettings = closeComfyUISettings;
    window.openWorkflowEditor = openWorkflowEditor;
});
