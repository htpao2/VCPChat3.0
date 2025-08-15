// AudioManager.js
class AudioManager {
    constructor() {
        this.ctx = null;       // 延迟到 unlock 再建
        this.models = new Map();  // 同前
        this.priority = {LanLan1: true, LanLan2: false};         // 同前
    }

    /** 确保 ctx 可用——若还没解锁就抛错，让调用方决定怎么做 */
    ensureCtx() {
        if (!this.ctx || this.ctx.state === 'suspended') {
            throw new Error('AudioContext not unlocked yet');
        }
        return this.ctx;
    }

    /** 在用户交互回调里调用一次即可 */
    unlock() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        // 任何依赖 ctx 的 Graph 也可以在这里补建
        for (const [id, m] of this.models) {
            if (!m.gain) {
                const {gain, analyser} = this._buildNodes();
                Object.assign(m, {gain, analyser});
            }
        }
    }

    /** 提供给外部：注册模型 */
    register(modelId) {
        if (this.models.has(modelId)) return;

        // 先占个坑，真正的节点等 unlock 后再补
        this.models.set(modelId, {
            gain: null,
            analyser: null,
            queue: [],
            nextTime: 0,
            playingSources: new Set(),
            animationFrameId: null,
        });
    }

    /** 内部小工具：生成 Gain + Analyser */
    _buildNodes() {
        const gain = this.ctx.createGain();
        const analyser = this.ctx.createAnalyser();
        gain.connect(analyser);
        analyser.connect(this.ctx.destination);
        analyser.fftSize = 2048;
        return {gain, analyser};
    }

    /** 往某个模型的播放队列塞一段 PCM buffer */
    enqueue(modelId, audioBuffer, seq) {
        const m = this.models.get(modelId);
        m.queue.push({buffer: audioBuffer, seq});
        m.queue.sort((a, b) => a.seq - b.seq);
        if (m.playingSources.size === 0) {
            m.nextTime = this.ctx.currentTime + 0.1;
        }
        if (!m.schedulingLoop) this._scheduleLoop(modelId);
    }

    // ————— 私有 —————
    _scheduleLoop(modelId) {
        const m = this.models.get(modelId);
        m.schedulingLoop = true;
        const lookAhead = 4;               // 4 s 预调度
        const fadeTime = 0.0; // 20ms淡入淡出时间
        const loop = () => {
            const tNow = this.ctx.currentTime;

            while (m.queue.length && m.nextTime < tNow + lookAhead) {
                const {buffer} = m.queue.shift();
                const src = this.ctx.createBufferSource();
                // src.buffer = buffer;
                // src.connect(m.gain);

                // 应用淡入淡出包络
                const fadeGain = this.ctx.createGain();
                src.buffer = buffer;
                src.connect(fadeGain);
                fadeGain.connect(m.gain);
                fadeGain.gain.setValueAtTime(0, m.nextTime);
                fadeGain.gain.linearRampToValueAtTime(1, m.nextTime + fadeTime);
                fadeGain.gain.setValueAtTime(1, m.nextTime + buffer.duration - fadeTime);
                fadeGain.gain.linearRampToValueAtTime(0, m.nextTime + buffer.duration);

                // 口型
                if (window[modelId] && window[modelId].live2dModel) {
                    this.startLipSync(modelId, m.analyser); // 你已有的实现
                }

                src.onended = () => {
                    m.playingSources.delete(src);
                    if (m.playingSources.size === 0) this.stopLipSync(modelId);
                    this._updateDuck();          // 有可能释放优先级
                    this._checkFinished(modelId);
                };

                src.start(m.nextTime);
                m.nextTime += buffer.duration;
                m.playingSources.add(src);
                this._updateDuck();            // 让优先级立即生效
            }
            if (m.queue.length || m.playingSources.size) {
                setTimeout(loop, 25);
            } else {
                m.schedulingLoop = false;      // 暂停 loop，等下一包再启动
            }
        };
        loop();
    }

    /** 根据当前播放状态调节全局 Ducking */
    _updateDuck() {
        // 判断有没有高优先级模型在说话
        let priorityTalking = false;
        for (const [id, m] of this.models) {
            if (this.priority[id] && m.playingSources.size) {
                priorityTalking = true;
                break;
            }
        }
        for (const [id, m] of this.models) {
            const target = (priorityTalking && !this.priority[id]) ? 0.15 : 1;
            // 用小时间常数做平滑，不要瞬间断音
            m.gain.gain.cancelScheduledValues(this.ctx.currentTime);
            m.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
        }
    }

    _checkFinished(modelId) {
        const m = this.models.get(modelId);
        if (m.playingSources.size === 0 && m.queue.length === 0) {
          if (window.coder_socket?.readyState === WebSocket.OPEN) {
            window.coder_socket.send(JSON.stringify({
              action: 'finish_playing',
              input_type: modelId            // ← 或保留 'coder'，看后端协议
            }));
          }
        }
      }

    startLipSync(modelId, analyser) {
        const model = window[modelId].live2dModel;
        const dataArray = new Uint8Array(analyser.fftSize);
        const self = this;

        const animate = () => {
            analyser.getByteTimeDomainData(dataArray);
            // 简单求音量（RMS 或最大振幅）
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                const val = (dataArray[i] - 128) / 128; // 归一化到 -1~1
                sum += val * val;
            }
            const rms = Math.sqrt(sum / dataArray.length);
            // 这里可以调整映射关系
            const mouthOpen = Math.min(1, rms * 8); // 放大到 0~1
            // 设置 Live2D 嘴巴参数
            model.internalModel.coreModel.setParameterValueById("ParamMouthOpenY", Math.max(mouthOpen));
            this.models.get(modelId).animationFrameId = requestAnimationFrame(animate);
        }

        animate();
    }

    stopLipSync(modelId) {
        const model = window[modelId].live2dModel;
        cancelAnimationFrame(this.models.get(modelId).animationFrameId);
        // 关闭嘴巴
        model.internalModel.coreModel.setParameterValueById("ParamMouthOpenY", 0);
    }
}

function unlockAudio() {
    try {
        window.AM.unlock();
        window.removeEventListener('pointerdown', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
        console.log('AudioContext unlocked ✔');
    } catch (e) {
        // ignore
    }
}

function handleAudioBlobFor(id, blob, seq) {
    blob.arrayBuffer().then(pcm => {
        const int16 = new Int16Array(pcm);
        const float32 = Float32Array.from(int16, v => v / 32768);
        const sr = window.AM.ctx.sampleRate;
        const audioBuf = window.AM.ctx.createBuffer(1, float32.length, sr);
        audioBuf.copyToChannel(float32, 0);
        window.AM.enqueue(id, audioBuf, seq);
    });
}

window.AM = new AudioManager();
window.addEventListener('pointerdown', unlockAudio, {passive: true});
window.addEventListener('keydown', unlockAudio, {passive: true});