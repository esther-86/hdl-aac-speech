/**
 * ClearVoice AAC - Unbroken WAV Audio Transcriber & Live Test-Case Learner
 *
 * 1. Sends the unbroken 16kHz mono .wav recording (from Push-to-Start to Push-When-Done)
 *    to the WordPress endpoint (/wp-json/hdl-aac-speech/v1/transcribe), which runs local
 *    Faster-Whisper (small.en) + the child's phonological rules + learned acoustic/text cases
 *    (or Gemini/OpenAI if configured).
 * 2. Whenever an output is edited via "Edit / Teach", sends the recorded .wav audio +
 *    raw transcript + corrected target sentence to /wp-json/hdl-aac-speech/v1/save-sample
 *    so every edit immediately becomes a permanent audio+text test case on the fly!
 */

import { reconstructChildUtterance } from './contextEngine';

export const CHILD_PHONOLOGICAL_SYSTEM_PROMPT = `You are a pediatric Speech-Language Pathologist (SLP) and high-accuracy open-vocabulary speech decoder for a child whose voice has been acoustically calibrated (median pitch 239 Hz).
Your job is to listen to her audio recording and output ONLY the exact intended English sentence she is saying, whether it is an academic/school sentence (science, math, reading, history, classroom Q&A) or everyday communication.

CRITICAL PHONOLOGICAL PROCESSES IN HER SPEECH:
1. Liquid Stopping (/l/ -> /d/): "dook" = "look", "ditto" = "little", "dike" = "like/likes", "doud" = "loud", "dove" = "love", "dettis" = "lettuce", "deaf" = "leaf", "dearn" = "learn", "dight" = "light".
2. Palatal Glide Stopping (/j/ "y" -> /d/): "doo" = "you", "des" = "yes", "dellow" = "yellow", "doos" = "use", "dour" = "your".
3. Cluster Labialization (sw-, sl-, fl-, str-, fr- -> fw- or f-): "fwimming" = "swimming", "fweet" = "sweet", "fwawbewwy" = "strawberries", "fwide" = "slide", "fwying" = "flying", "fwen fwy" = "French fries", "fwaction" = "fraction".
4. Liquid Gliding (/r/ -> /w/ and clusters br/gr/tr/dr/pr/pl -> bw/gw/tw/dw/pw): "wed" = "red", "wide" = "ride", "wet" = "rest", "wead" = "read", "wite" = "write", "gween" = "green", "bwuduh" = "brother", "bwake" = "break", "twain" = "train", "twiangle" = "triangle", "pwease" = "please", "pway" = "play", "pwant" = "plant".
5. Affricate & Fricative Stopping (ch -> t, j -> d, th -> d/f): "teese" = "cheese", "teatuh" = "teacher", "dump" = "jump", "de/dey/dat/dis" = "the/they/that/this", "dank doo" = "thank you", "bafwoom" = "bathroom".
6. Epenthesis & Final Cluster Reduction: "suh-nack" = "snack", "fat" = "fast", "pak" = "park", "hep" = "help".

Return strict JSON: {"primary": "Exact intended sentence", "alternatives": ["Runner-up 1", "Runner-up 2"]}`;

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result || '';
      const commaIdx = String(dataUrl).indexOf(',');
      resolve(commaIdx >= 0 ? String(dataUrl).slice(commaIdx + 1) : String(dataUrl));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export const audioTranscriber = {
  isEnabled(settings = {}) {
    if (settings && settings.aiTranscriptionEnabled === false) {
      return false;
    }
    const wpConfig = typeof window !== 'undefined' ? window.hdlAacSpeechConfig : null;
    if (wpConfig && wpConfig.restUrl) {
      return true;
    }
    const hasLocalKey = Boolean(
      settings && settings.aiApiKey && settings.aiApiKey.trim().length > 10
    );
    return hasLocalKey;
  },

  /**
   * Transcribe the unbroken WAV audio recording.
   */
  async transcribeAudio({
    audioBlob,
    browserTranscript = '',
    audioFeatures = null,
    settings = {},
    learnedPatterns = [],
    dictionary = []
  }) {
    if (!audioBlob || audioBlob.size < 500) {
      return null;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return null;
    }

    try {
      const base64Audio = await blobToBase64(audioBlob);
      const mimeType = (audioBlob.type || 'audio/wav').split(';')[0];

      const learnedHints = (learnedPatterns || [])
        .slice(0, 25)
        .map((p) => `"${p.rawInput}" => "${p.resolvedText}"`)
        .join('; ');

      const customVocab = (dictionary || [])
        .slice(0, 35)
        .map((d) =>
          d.triggers && d.triggers.length > 0
            ? `"${d.phrase}" (sounds like: ${d.triggers.slice(0, 3).join(', ')})`
            : `"${d.phrase}"`
        )
        .join('; ');

      const academicContext =
        (settings && settings.academicSubjectContext) ||
        'General Classroom, Academic Subjects (Science, Math, Reading, History), & Daily Communication';

      const wpConfig = typeof window !== 'undefined' ? window.hdlAacSpeechConfig : null;

      if (wpConfig && wpConfig.restUrl) {
        const headers = { 'Content-Type': 'application/json' };
        if (wpConfig.restNonce) {
          headers['X-WP-Nonce'] = wpConfig.restNonce;
        }

        const resp = await fetch(`${wpConfig.restUrl}/transcribe`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            audioBase64: base64Audio,
            mimeType,
            browserTranscript,
            alternatives: (audioFeatures && audioFeatures.alternatives) || [],
            academicContext,
            learnedHints,
            customVocab,
            provider: (settings && settings.aiProvider) || 'local',
            apiKey: (settings && settings.aiApiKey) || ''
          })
        });

        if (resp.ok) {
          const data = await resp.json();
          if (data && data.primary) {
            return {
              primary: reconstructChildUtterance(data.primary, learnedPatterns, dictionary),
              rawAsr: data.rawAsr || browserTranscript,
              wavPath: data.wavPath || '',
              audioBase64: base64Audio,
              provider: data.provider || 'local-faster-whisper'
            };
          }
        }
      }
    } catch (err) {
      console.warn('Audio transcription note:', err);
    }

    return null;
  },

  /**
   * Save any edited sentence + its recorded WAV audio as a permanent test/training case on the fly.
   */
  async saveEditedTestCase({
    audioBlob = null,
    wavPath = '',
    rawTranscript = '',
    target = ''
  }) {
    if (!target || !target.trim()) return false;
    const wpConfig = typeof window !== 'undefined' ? window.hdlAacSpeechConfig : null;
    if (!wpConfig || !wpConfig.restUrl || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      return false;
    }

    try {
      let base64Audio = '';
      if (!wavPath && audioBlob && audioBlob.size > 500) {
        base64Audio = await blobToBase64(audioBlob);
      }

      const headers = { 'Content-Type': 'application/json' };
      if (wpConfig.restNonce) {
        headers['X-WP-Nonce'] = wpConfig.restNonce;
      }

      const resp = await fetch(`${wpConfig.restUrl}/save-sample`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          wavPath,
          audioBase64: base64Audio,
          rawTranscript,
          target: target.trim()
        })
      });

      return resp.ok;
    } catch (err) {
      console.warn('Save test case note:', err);
      return false;
    }
  }
};
