/**
 * ClearVoice AAC - Unbroken Start-to-Stop WAV Audio & Speech Listener
 *
 * Key Design for Child Speech with Natural Pauses:
 * 1. NEVER stops automatically on silence or pauses between words.
 *    Recording stays open continuously from Push #1 ("Push to Listen") until Push #2 ("Push When Done").
 * 2. Captures a continuous, unbroken 16kHz mono PCM .wav audio file across the entire utterance
 *    plus a 350ms tail buffer after Push #2 so the final word is never clipped or lost.
 * 3. Accumulates all browser SpeechRecognition segments across any internal browser restarts
 *    so pauses never overwrite or discard earlier parts of a sentence.
 */

function downsampleBuffer(buffer, inputSampleRate, outputSampleRate = 16000) {
  if (outputSampleRate === inputSampleRate) {
    return buffer;
  }
  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

function encodeMonoWavBlob(float32Chunks, inputSampleRate) {
  if (!float32Chunks || float32Chunks.length === 0) return null;
  let totalLen = 0;
  for (let i = 0; i < float32Chunks.length; i++) {
    totalLen += float32Chunks[i].length;
  }
  if (totalLen === 0) return null;

  const merged = new Float32Array(totalLen);
  let offset = 0;
  for (let i = 0; i < float32Chunks.length; i++) {
    merged.set(float32Chunks[i], offset);
    offset += float32Chunks[i].length;
  }

  const targetRate = 16000;
  const samples = downsampleBuffer(merged, inputSampleRate || 48000, targetRate);
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (byteOffset, str) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(byteOffset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format = 1
  view.setUint16(22, 1, true); // Mono = 1 channel
  view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * 2, true); // Byte rate
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // 16-bit samples
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let idx = 44;
  for (let i = 0; i < samples.length; i++, idx += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(idx, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export class SpeechListener {
  constructor(options = {}) {
    this.options = options;
    this.recognition = null;
    this.audioContext = null;
    this.analyser = null;
    this.pcmProcessor = null;
    this.mediaStream = null;
    this.animationFrameId = null;
    this.maxListenTimer = null;
    this.tailStopTimer = null;

    this.isListening = false;
    this.isStoppingTail = false;
    this.shouldListen = false;
    this.singleShotMode = true;
    this.currentSpeaker = 'child';
    this.recentPitchSamples = [];
    this.primaryChildPitch = 239; // Calibrated median pitch (238.8 Hz)

    // Never cut off automatically on pauses; only stop when the user pushes the button again (or after 3 minutes safety cap)
    this.maxListenDurationMs = options.maxListenDurationMs || 180000;
    this.manualStopOnly = true;

    this.resetAcousticCapture();

    this.onInterim = options.onInterim || (() => {});
    this.onFinal = options.onFinal || (() => {});
    this.onAudioRecorded = options.onAudioRecorded || (() => {});
    this.onAudioLevel = options.onAudioLevel || (() => {});
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onSpeakerDetected = options.onSpeakerDetected || (() => {});
  }

  setTimingConfig() {
    // Always preserve manual start/stop so pauses never cut off the child
    this.manualStopOnly = true;
  }

  resetAcousticCapture() {
    this.utteranceStartTime = 0;
    this.lastActiveVoiceTime = 0;
    this.hasActiveVoice = false;
    this.peakLevel = 0;
    this.syllablePeaks = 0;
    this.wasAboveSyllableThreshold = false;
    this.pitchFrames = [];
    this.spectralBandsAccum = [0, 0, 0, 0, 0, 0, 0, 0];
    this.melSequence = [];
    this.lastMelSampleTime = 0;
    this.spectralFrameCount = 0;
    this.accumulatedFinalChunks = [];
    this.alternativeTranscripts = [];
    this.currentInterimChunk = '';
    this.lastInterimTranscript = '';
    this.finalDeliveredForShot = false;
    this.pcmFloatChunks = [];
    this.inputSampleRate = 48000;
  }

  isSupported() {
    return (
      typeof window !== 'undefined' &&
      ('webkitSpeechRecognition' in window ||
        'SpeechRecognition' in window ||
        (navigator.mediaDevices && navigator.mediaDevices.getUserMedia))
    );
  }

  async start({ continuous = false } = {}) {
    if (this.isListening) {
      if (!this.isStoppingTail) {
        this.finishAndTranscribe();
      }
      return;
    }

    this.singleShotMode = !continuous;
    this.shouldListen = true;
    this.isStoppingTail = false;
    this.resetAcousticCapture();
    this.utteranceStartTime = Date.now();

    try {
      await this.initAudioStream();
      this.initRecognition();

      if (this.recognition) {
        try {
          this.recognition.start();
        } catch (recErr) {
          console.warn('SpeechRecognition start note:', recErr);
        }
      }

      this.isListening = true;
      this.onStatusChange(true, null, 'push-to-listen');
      this.armMaxListenTimeout();
    } catch (err) {
      console.warn('Speech listener start error:', err);
      this.isListening = false;
      this.onStatusChange(false, err.message || 'Microphone access denied');
    }
  }

  armMaxListenTimeout() {
    if (this.maxListenTimer) clearTimeout(this.maxListenTimer);
    this.maxListenTimer = setTimeout(() => {
      if (this.isListening) {
        this.finishAndTranscribe();
      }
    }, this.maxListenDurationMs);
  }

  getCombinedTranscript() {
    const finals = this.accumulatedFinalChunks.join(' ').trim();
    const interim = (this.currentInterimChunk || '').trim();
    return [finals, interim].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }

  getNormalizedMelSequence() {
    if (!this.melSequence || this.melSequence.length === 0) return [];
    const maxFrames = 32;
    if (this.melSequence.length <= maxFrames) {
      return this.melSequence;
    }
    const step = this.melSequence.length / maxFrames;
    const resampled = [];
    for (let i = 0; i < maxFrames; i++) {
      resampled.push(
        this.melSequence[Math.min(this.melSequence.length - 1, Math.floor(i * step))]
      );
    }
    return resampled;
  }

  buildAcousticSignature() {
    const durationMs = Math.max(250, Date.now() - this.utteranceStartTime);

    const avgPitch =
      this.pitchFrames.length > 0
        ? Math.round(this.pitchFrames.reduce((a, b) => a + b, 0) / this.pitchFrames.length)
        : this.primaryChildPitch;

    const bandSum = this.spectralBandsAccum.reduce((a, b) => a + b, 0);
    const spectralBands =
      bandSum > 0
        ? this.spectralBandsAccum.map((v) => Number((v / bandSum).toFixed(4)))
        : [0.125, 0.125, 0.125, 0.125, 0.125, 0.125, 0.125, 0.125];

    const syllableCount = Math.max(1, this.syllablePeaks);
    const pitchBucket = Math.round(avgPitch / 25) * 25;
    const acousticCode = `voice-${syllableCount}syl-${pitchBucket}hz`;

    return {
      durationMs,
      syllableCount,
      avgPitch,
      spectralBands,
      melSequence: this.getNormalizedMelSequence(),
      alternatives: this.alternativeTranscripts.slice(0, 10),
      peakLevel: Number(this.peakLevel.toFixed(3)),
      acousticCode,
      hasVoice: this.hasActiveVoice || this.peakLevel > 0.04
    };
  }

  /**
   * Called when user taps the button a second time ("Listening... Push When Done").
   * Waits 250ms for the final syllable, stops SpeechRecognition so it flushes its final onresult,
   * then finalizes the utterance after 200ms.
   */
  finishAndTranscribe(explicitText = '') {
    if (this.isStoppingTail || this.finalDeliveredForShot) return;
    this.isStoppingTail = true;

    if (this.tailStopTimer) clearTimeout(this.tailStopTimer);
    this.tailStopTimer = setTimeout(() => {
      if (this.recognition) {
        try {
          this.recognition.stop();
        } catch (e) {
          // ignore
        }
      }
      setTimeout(() => {
        this.finalizeCurrentUtterance(explicitText);
      }, 200);
    }, 250);
  }

  finalizeCurrentUtterance(explicitText = '') {
    if (this.finalDeliveredForShot) return;
    this.finalDeliveredForShot = true;
    this.isStoppingTail = false;

    if (this.currentInterimChunk && this.currentInterimChunk.trim()) {
      this.accumulatedFinalChunks.push(this.currentInterimChunk.trim());
      this.currentInterimChunk = '';
    }

    const features = this.buildAcousticSignature();
    const combined = this.getCombinedTranscript();
    const textToUse = (explicitText || combined || this.lastInterimTranscript || '').trim();
    const wavBlob = encodeMonoWavBlob(this.pcmFloatChunks, this.inputSampleRate);

    this.stop();

    // 1. ALWAYS deliver the heard transcript immediately to onFinal so "What I Heard You Say" appears right away!
    if (textToUse) {
      this.onFinal(textToUse, 'child', features, wavBlob);
    } else if (features.hasVoice && (!wavBlob || wavBlob.size <= 1000)) {
      this.onFinal(features.acousticCode, 'child', features, wavBlob);
    }

    // 2. ALSO always send the full start-to-stop WAV recording to onAudioRecorded so it recalibrates
    //    into "What I Think You Mean" using the unbroken recording across any "uh" fillers or pauses!
    if (wavBlob && wavBlob.size > 1000 && features.hasVoice) {
      this.onAudioRecorded(wavBlob, textToUse, features);
    }
  }

  stop() {
    this.shouldListen = false;
    this.isListening = false;
    this.isStoppingTail = false;

    if (this.maxListenTimer) {
      clearTimeout(this.maxListenTimer);
      this.maxListenTimer = null;
    }

    if (this.tailStopTimer) {
      clearTimeout(this.tailStopTimer);
      this.tailStopTimer = null;
    }

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        // ignore
      }
    }

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.pcmProcessor) {
      try {
        this.pcmProcessor.disconnect();
      } catch (e) {
        // ignore
      }
      this.pcmProcessor = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch (e) {
        // ignore
      }
      this.audioContext = null;
    }

    this.onAudioLevel(0);
    this.onStatusChange(false, null);
  }

  async initAudioStream() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return;
    }
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();
      this.inputSampleRate = this.audioContext.sampleRate || 48000;

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      source.connect(this.analyser);

      // Capture raw lossless PCM samples continuously across all pauses
      if (this.audioContext.createScriptProcessor) {
        this.pcmProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
        this.pcmProcessor.onaudioprocess = (e) => {
          if (!this.isListening) return;
          const inputData = e.inputBuffer.getChannelData(0);
          this.pcmFloatChunks.push(new Float32Array(inputData));
        };
        source.connect(this.pcmProcessor);
        this.pcmProcessor.connect(this.audioContext.destination);
      }

      this.startPitchAndSpectralLoop();
    } catch (e) {
      console.warn('Microphone stream setup note:', e);
    }
  }

  startPitchAndSpectralLoop() {
    if (!this.analyser) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const timeData = new Float32Array(bufferLength);
    const freqData = new Uint8Array(bufferLength);

    const melBinRanges = [
      [4, 8],
      [8, 13],
      [13, 19],
      [19, 26],
      [26, 35],
      [35, 46],
      [46, 60],
      [60, 78],
      [78, 100],
      [100, 128],
      [128, 160],
      [160, 200]
    ];

    const updateAudio = () => {
      if (!this.isListening) return;

      this.analyser.getFloatTimeDomainData(timeData);
      this.analyser.getByteFrequencyData(freqData);

      let sumSquares = 0;
      for (let i = 0; i < timeData.length; i++) {
        sumSquares += timeData[i] * timeData[i];
      }
      const rms = Math.sqrt(sumSquares / timeData.length);
      const level = Math.min(1, rms * 8);

      this.onAudioLevel(level);

      if (level > this.peakLevel) {
        this.peakLevel = level;
      }

      const now = Date.now();
      if (level > 0.045) {
        if (!this.hasActiveVoice) {
          this.hasActiveVoice = true;
        }
        this.lastActiveVoiceTime = now;

        if (!this.wasAboveSyllableThreshold && level > 0.1) {
          this.syllablePeaks += 1;
          this.wasAboveSyllableThreshold = true;
        }

        const binsPerBand = Math.max(1, Math.floor(Math.min(bufferLength, 256) / 8));
        for (let b = 0; b < 8; b++) {
          let bandEnergy = 0;
          for (let j = 0; j < binsPerBand; j++) {
            bandEnergy += freqData[b * binsPerBand + j] || 0;
          }
          this.spectralBandsAccum[b] += bandEnergy / binsPerBand;
        }
        this.spectralFrameCount += 1;

        if (now - this.lastMelSampleTime >= 60 && this.melSequence.length < 250) {
          this.lastMelSampleTime = now;
          const melFrame = melBinRanges.map(([startBin, endBin]) => {
            let sum = 0;
            for (let k = startBin; k < endBin && k < bufferLength; k++) {
              sum += freqData[k] || 0;
            }
            return sum / Math.max(1, endBin - startBin);
          });
          const frameSum = melFrame.reduce((a, b) => a + b, 0) || 1;
          this.melSequence.push(melFrame.map((v) => Number((v / frameSum).toFixed(3))));
        }

        const pitch = this.detectPitchAutocorrelation(timeData, this.audioContext.sampleRate);
        if (pitch > 65 && pitch < 550) {
          this.pitchFrames.push(pitch);
        }
      } else if (level < 0.035) {
        this.wasAboveSyllableThreshold = false;
      }

      // IMPORTANT: Never auto-stop on silence here! Keep recording until she taps the button again.
      this.animationFrameId = requestAnimationFrame(updateAudio);
    };

    updateAudio();
  }

  detectPitchAutocorrelation(buffer, sampleRate) {
    const SIZE = buffer.length;
    const maxSamples = Math.floor(SIZE / 2);
    let bestOffset = -1;
    let bestCorrelation = 0;
    let rms = 0;

    for (let i = 0; i < SIZE; i++) {
      const val = buffer[i];
      rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.02) return -1;

    let lastCorrelation = 1;
    for (let offset = 0; offset < maxSamples; offset++) {
      let correlation = 0;
      for (let i = 0; i < maxSamples; i++) {
        correlation += Math.abs(buffer[i] - buffer[i + offset]);
      }
      correlation = 1 - correlation / maxSamples;

      if (correlation > 0.9 && correlation > lastCorrelation) {
        if (correlation > bestCorrelation) {
          bestCorrelation = correlation;
          bestOffset = offset;
        }
      }
      lastCorrelation = correlation;
    }

    if (bestCorrelation > 0.1 && bestOffset > 0) {
      return sampleRate / bestOffset;
    }
    return -1;
  }

  initRecognition() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      this.recognition = null;
      return;
    }

    this.recognition = new SpeechRec();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 10;
    this.recognition.lang = 'en-US';

    this.recognition.onresult = (event) => {
      let interim = '';
      this.lastActiveVoiceTime = Date.now();
      this.hasActiveVoice = true;

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const resultItem = event.results[i];
        const transcript = resultItem[0].transcript;

        for (let altIdx = 0; altIdx < resultItem.length; altIdx++) {
          const altText = (resultItem[altIdx].transcript || '').trim();
          if (altText && !this.alternativeTranscripts.includes(altText)) {
            this.alternativeTranscripts.push(altText);
          }
        }

        if (resultItem.isFinal) {
          const cleanChunk = transcript.trim();
          if (cleanChunk) {
            // Append every chunk across pauses so earlier parts of the sentence are NEVER lost!
            this.accumulatedFinalChunks.push(cleanChunk);
            this.currentInterimChunk = '';
          }
        } else {
          interim += transcript;
        }
      }

      this.currentInterimChunk = interim.trim();
      const fullSoFar = this.getCombinedTranscript();
      if (fullSoFar) {
        this.lastInterimTranscript = fullSoFar;
        this.onInterim(fullSoFar, 'child');
      }
    };

    this.recognition.onerror = (event) => {
      if (event.error === 'not-allowed') {
        this.stop();
        this.onStatusChange(false, 'Microphone permission blocked');
      }
    };

    this.recognition.onend = () => {
      // If Chrome closes SpeechRecognition during a pause while she is still in Push-to-Listen mode:
      // 1. Preserve any unfinalized interim text so it is never dropped!
      if (this.currentInterimChunk && this.currentInterimChunk.trim()) {
        this.accumulatedFinalChunks.push(this.currentInterimChunk.trim());
        this.currentInterimChunk = '';
      }
      // 2. Immediately restart a fresh SpeechRecognition instance if she hasn't pushed "Done" yet
      //    (Creating a fresh instance avoids Chrome's bug where .start() on a paused/uh-ended instance silently stalls)
      if (this.isListening && this.shouldListen && !this.finalDeliveredForShot) {
        setTimeout(() => {
          if (this.isListening && this.shouldListen && !this.finalDeliveredForShot) {
            try {
              this.initRecognition();
              if (this.recognition) {
                this.recognition.start();
              }
            } catch (e) {
              // ignore
            }
          }
        }, 40);
      }
    };
  }
}
