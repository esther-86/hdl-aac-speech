/**
 * ClearVoice AAC - IndexedDB & Optional WordPress Sync Multi-Profile Data Layer
 * Pre-calibrated with acoustic & phonological patterns from Recording.m4a
 */

const DB_NAME = 'ClearVoiceAAC_DB_v2';
const DB_VERSION = 1;
const CALIBRATION_VERSION_KEY = 'clearvoice_calibration_v2_applied';

let dbPromise = null;

function initDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('profiles')) {
        const profileStore = db.createObjectStore('profiles', { keyPath: 'id' });
        profileStore.createIndex('name', 'name', { unique: false });
      }

      if (!db.objectStoreNames.contains('learned_patterns')) {
        const patternStore = db.createObjectStore('learned_patterns', {
          keyPath: 'id',
          autoIncrement: true
        });
        patternStore.createIndex('profileId', 'profileId', { unique: false });
        patternStore.createIndex('rawInput', 'rawInput', { unique: false });
      }

      if (!db.objectStoreNames.contains('dictionary')) {
        const dictStore = db.createObjectStore('dictionary', {
          keyPath: 'id',
          autoIncrement: true
        });
        dictStore.createIndex('profileId', 'profileId', { unique: false });
        dictStore.createIndex('phrase', 'phrase', { unique: false });
      }

      if (!db.objectStoreNames.contains('history')) {
        const historyStore = db.createObjectStore('history', {
          keyPath: 'id',
          autoIncrement: true
        });
        historyStore.createIndex('profileId', 'profileId', { unique: false });
        historyStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e);
  });

  return dbPromise;
}

// Pre-seeded vocabulary & triggers calibrated from her voice recording (Recording.m4a)
export const DEFAULT_DICTIONARY = [
  {
    phrase: 'I want water please',
    category: 'Needs',
    triggers: ['wa-wa', 'wawa', 'waer', 'watuh', 'i wan watuh pwease', 'water', 'drink']
  },
  {
    phrase: 'I am hungry, can I have a snack?',
    category: 'Needs',
    triggers: [
      'hungy',
      'i hungy',
      'i hungwy',
      'suh-nack',
      'sinack',
      'i hungry can have is enough',
      'have is enough',
      'snack'
    ]
  },
  {
    phrase: 'I want a banana please',
    category: 'Foods',
    triggers: ['ba-na', 'bana', 'nana', 'banana']
  },
  {
    phrase: 'I want ramen please',
    category: 'Foods',
    triggers: ['wah-men', 'wahmen', 'wamen', 'ramen', 'woman', 'noodles']
  },
  {
    phrase: 'I want French fries please',
    category: 'Foods',
    triggers: ['fwen fwy', 'fwen-fwy', 'friend fly', 'frame fly', 'french fly', 'french fries', 'fries']
  },
  {
    phrase: 'I want a hamburger please',
    category: 'Foods',
    triggers: ['ham-buh-guh', 'hambuhguh', 'have a good', 'hamburger', 'burger']
  },
  {
    phrase: 'I want lettuce please',
    category: 'Foods',
    triggers: ['det-tis', 'dettis', 'dattis', 'that is', 'dentist', 'lettuce']
  },
  {
    phrase: 'I want meat please',
    category: 'Foods',
    triggers: ['meet', 'meat']
  },
  {
    phrase: 'I want Goldfish crackers please',
    category: 'Foods',
    triggers: ['no-fis', 'no fish', 'now fish', 'goldfish']
  },
  {
    phrase: 'I want sweet strawberries and cheese',
    category: 'Foods',
    triggers: ['fweet fwawbewwy', 'free strawberry and teeth', 'free strawberry and tea', 'teese', 'strawberries', 'cheese']
  },
  {
    phrase: 'I want to go to the park',
    category: 'Activities',
    triggers: ['go pak', 'pak', 'puck', 'gween pak', 'big green park', 'park']
  },
  {
    phrase: 'Can we ride the fast train and go down the slide?',
    category: 'Activities',
    triggers: ['fat train', 'fat twain', 'go down this fight', 'go down de fwide', 'fwide', 'slide', 'train']
  },
  {
    phrase: 'I need to use the bathroom',
    category: 'Needs',
    triggers: [
      'potty',
      'bafroom',
      'bafwoom',
      'bafoom',
      'doos de bafwoom',
      'i need to eat the bathroom',
      'i need to do the bathroom',
      'pee',
      'toilet'
    ]
  },
  {
    phrase: 'Can you help me please?',
    category: 'Needs',
    triggers: ['hep', 'hewp', 'help', 'can do help me please', 'can doo hep me pwease', 'can they help me']
  },
  {
    phrase: 'I want to play my game on the iPad',
    category: 'Activities',
    triggers: ['game', 'ipad', 'tablet', 'pway my gay on de ipad', 'play my game on the ipad']
  },
  {
    phrase: 'I want to go outside',
    category: 'Activities',
    triggers: ['outsie', 'outside', 'go out', 'i wan to go outside']
  },
  {
    phrase: 'Yes, that is what I want',
    category: 'Responses',
    triggers: ['yeah', 'yea', 'yes', 'des', 'des dat is what i want', 'that that where i want']
  },
  {
    phrase: 'No thank you, I do not want that',
    category: 'Responses',
    triggers: ['no', 'nah', 'nope', 'no dank doo', 'no thank you i did not want that']
  },
  {
    phrase: 'I am tired and I want to rest',
    category: 'Needs',
    triggers: ['tiah', 'sleep', 'bed', 'nap', 'i am tired', 'want to wet', 'i not want to wet', 'want to west']
  },
  {
    phrase: 'It is too loud, I need a break',
    category: 'Feelings',
    triggers: ['too loud', 'it too doud', '82 down i need a break', 'it to down i need a break', 'need a bwake', 'scared', 'overwhelmed']
  },
  {
    phrase: 'Can you say that again?',
    category: 'Responses',
    triggers: ['can they say that again', 'can do say that again', 'can doo say dat again', 'say that again']
  },
  {
    phrase: 'I love you Mom and Dad',
    category: 'Family',
    triggers: ['wuv you', 'love ya', 'i dove doo', 'i dare do mom and dad', 'i dove do mom and dad', 'mom and dad']
  },
  {
    phrase: 'Mom, Dad, and Brother',
    category: 'Family',
    triggers: ['bwuduh', 'bwater', 'mom dad water', 'mom dad brother', 'brother']
  },
  {
    phrase: 'Look at the blue bird flying high in the sky!',
    category: 'Activities',
    triggers: ['dook at de', 'ooh bird', 'fire high in this side', 'blue bird']
  },
  {
    phrase: 'A little brown puppy jumped over a red ball',
    category: 'Activities',
    triggers: ['ditto bwown puppy', 'dental brown puppy', 'dump away red ball', 'puppy']
  },
  {
    phrase: 'They saw five yellow ducks swimming in the water',
    category: 'Activities',
    triggers: ['five dellow duck', 'five narrow duct family', 'fwimming in de watuh', 'yellow ducks']
  }
];

export const DEFAULT_SETTINGS = {
  listenMode: 'push',
  silenceAfterVoiceSec: 6, // 6 seconds after speaking so pauses between words never cut her off
  maxListenDurationSec: 45, // Up to 45 seconds per listening session
  manualStopOnly: false,
  autoClarifyEnabled: true,
  clarifyTriggers: [
    'can you say that again',
    'can they say that again',
    'can do say that again',
    'what did you say',
    'say that again',
    'repeat that',
    'pardon',
    'what was that',
    'come again',
    "i didn't hear you",
    "didn't catch that",
    'what?'
  ],
  speechRate: 0.95,
  speechPitch: 1.05,
  speechVolume: 1.0,
  selectedVoiceURI: '',
  highContrast: true,
  listenerBannerDurationSec: 6,
  childPitchRange: { minHz: 195, maxHz: 340 }, // Calibrated to her 213-291 Hz voice (median 239 Hz)
  partnerPitchRange: { minHz: 75, maxHz: 190 },
  primarySpeakerOverride: 'auto',
  aiTranscriptionEnabled: true,
  aiProvider: 'gemini',
  aiApiKey: '',
  academicSubjectContext:
    'General Classroom, Academic Subjects (Science, Math, Reading, History), & Open Speech'
};

const ACTIVE_PROFILE_KEY = 'clearvoice_active_profile_id';

function mergeAcousticFeatures(prev, next) {
  if (!next) return prev || null;
  if (!prev) return next;

  const mergedBands =
    Array.isArray(prev.spectralBands) && Array.isArray(next.spectralBands)
      ? prev.spectralBands.map((val, idx) =>
          Number((val * 0.65 + (next.spectralBands[idx] || 0) * 0.35).toFixed(4))
        )
      : next.spectralBands || prev.spectralBands;

  return {
    durationMs: Math.round((prev.durationMs || next.durationMs) * 0.65 + next.durationMs * 0.35),
    syllableCount: Math.round(
      (prev.syllableCount || next.syllableCount) * 0.65 + next.syllableCount * 0.35
    ),
    avgPitch: Math.round((prev.avgPitch || next.avgPitch) * 0.65 + next.avgPitch * 0.35),
    spectralBands: mergedBands,
    peakLevel: next.peakLevel || prev.peakLevel,
    acousticCode: next.acousticCode || prev.acousticCode,
    hasVoice: true
  };
}

export const storageService = {
  async syncProfileToServer(profileId) {
    try {
      const wpConfig = typeof window !== 'undefined' ? window.hdlAacSpeechConfig : null;
      if (!wpConfig || !wpConfig.restUrl || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        return false;
      }

      const payloadJson = await this.exportProfileData(profileId);
      if (!payloadJson) return false;

      const headers = { 'Content-Type': 'application/json' };
      if (wpConfig.restNonce) {
        headers['X-WP-Nonce'] = wpConfig.restNonce;
      }

      await fetch(`${wpConfig.restUrl}/profile-sync`, {
        method: 'POST',
        headers,
        body: payloadJson
      });
      return true;
    } catch (e) {
      return false;
    }
  },

  /**
   * Ensure existing profiles receive the new calibrated vocabulary items from Recording.m4a
   */
  async ensureCalibratedVocabulary(profileId) {
    if (!profileId) return;
    const appliedKey = `${CALIBRATION_VERSION_KEY}_${profileId}`;
    if (localStorage.getItem(appliedKey) === '1') return;

    const existingDict = await this.getDictionary(profileId);
    const existingPhrases = new Set(existingDict.map((d) => (d.phrase || '').toLowerCase()));

    const db = await initDB();
    await new Promise((resolve) => {
      const tx = db.transaction('dictionary', 'readwrite');
      const store = tx.objectStore('dictionary');

      DEFAULT_DICTIONARY.forEach((item) => {
        if (!existingPhrases.has(item.phrase.toLowerCase())) {
          store.add({ ...item, profileId, createdAt: Date.now() });
        }
      });

      tx.oncomplete = () => {
        localStorage.setItem(appliedKey, '1');
        resolve(true);
      };
      tx.onerror = () => resolve(false);
    });
  },

  async getProfiles() {
    const db = await initDB();
    return new Promise((resolve) => {
      const tx = db.transaction('profiles', 'readonly');
      const store = tx.objectStore('profiles');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  },

  async getActiveProfileId() {
    return localStorage.getItem(ACTIVE_PROFILE_KEY);
  },

  async setActiveProfileId(profileId) {
    localStorage.setItem(ACTIVE_PROFILE_KEY, profileId);
  },

  async createProfile({ name, voiceType = 'child', baselinePitch = 239, customPhrases = [] }) {
    const db = await initDB();
    const profileId = 'prof_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const newProfile = {
      id: profileId,
      name: (name || '').trim() || 'My Child',
      voiceType,
      baselinePitch: voiceType === 'child' ? 239 : 140,
      createdAt: Date.now(),
      settings: { ...DEFAULT_SETTINGS }
    };

    return new Promise((resolve) => {
      const tx = db.transaction(['profiles', 'dictionary'], 'readwrite');
      const profileStore = tx.objectStore('profiles');
      const dictStore = tx.objectStore('dictionary');

      profileStore.add(newProfile);

      DEFAULT_DICTIONARY.forEach((item) => {
        dictStore.add({ ...item, profileId });
      });

      if (customPhrases && customPhrases.length > 0) {
        customPhrases.forEach((cp) => {
          if (cp.phrase && cp.phrase.trim()) {
            dictStore.add({
              phrase: cp.phrase.trim(),
              category: cp.category || 'Family',
              triggers: cp.triggers || [],
              profileId,
              createdAt: Date.now()
            });
          }
        });
      }

      tx.oncomplete = () => {
        localStorage.setItem(`${CALIBRATION_VERSION_KEY}_${profileId}`, '1');
        this.setActiveProfileId(profileId);
        this.syncProfileToServer(profileId);
        resolve(newProfile);
      };
    });
  },

  async deleteProfile(profileId) {
    const db = await initDB();
    return new Promise((resolve) => {
      const tx = db.transaction(
        ['profiles', 'learned_patterns', 'dictionary', 'history'],
        'readwrite'
      );
      tx.objectStore('profiles').delete(profileId);

      ['learned_patterns', 'dictionary', 'history'].forEach((storeName) => {
        const store = tx.objectStore(storeName);
        const index = store.index('profileId');
        const req = index.openCursor(IDBKeyRange.only(profileId));
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };
      });

      tx.oncomplete = async () => {
        const activeId = await this.getActiveProfileId();
        if (activeId === profileId) {
          const remaining = await this.getProfiles();
          if (remaining.length > 0) {
            await this.setActiveProfileId(remaining[0].id);
          } else {
            localStorage.removeItem(ACTIVE_PROFILE_KEY);
          }
        }
        resolve(true);
      };
    });
  },

  async exportProfileData(profileId) {
    const profiles = await this.getProfiles();
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) return null;

    const patterns = await this.getLearnedPatterns(profileId);
    const dictionary = await this.getDictionary(profileId);

    const exportData = {
      version: 1,
      appName: 'ClearVoice AAC',
      exportedAt: new Date().toISOString(),
      profile,
      learnedPatterns: patterns,
      dictionary
    };

    return JSON.stringify(exportData, null, 2);
  },

  async importProfileData(jsonString) {
    const data = JSON.parse(jsonString);
    if (!data || !data.profile || !data.profile.name) {
      throw new Error('Invalid ClearVoice profile format');
    }

    const db = await initDB();
    const newProfileId = 'prof_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const importedProfile = {
      ...data.profile,
      id: newProfileId,
      importedAt: Date.now()
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(['profiles', 'learned_patterns', 'dictionary'], 'readwrite');
      tx.objectStore('profiles').add(importedProfile);

      const patternStore = tx.objectStore('learned_patterns');
      if (Array.isArray(data.learnedPatterns)) {
        data.learnedPatterns.forEach((p) => {
          const { id, ...rest } = p;
          patternStore.add({ ...rest, profileId: newProfileId });
        });
      }

      const dictStore = tx.objectStore('dictionary');
      if (Array.isArray(data.dictionary)) {
        data.dictionary.forEach((d) => {
          const { id, ...rest } = d;
          dictStore.add({ ...rest, profileId: newProfileId });
        });
      }

      tx.oncomplete = () => {
        this.setActiveProfileId(newProfileId);
        this.syncProfileToServer(newProfileId);
        resolve(importedProfile);
      };
      tx.onerror = (e) => reject(e);
    });
  },

  async getSettings(profileId) {
    const profiles = await this.getProfiles();
    const prof = profiles.find((p) => p.id === profileId);
    if (prof && prof.settings) {
      return {
        ...DEFAULT_SETTINGS,
        ...prof.settings,
        // Ensure upgraded minimum silence wait of at least 6s unless customized higher
        silenceAfterVoiceSec: Math.max(6, prof.settings.silenceAfterVoiceSec || 6)
      };
    }
    return { ...DEFAULT_SETTINGS };
  },

  async saveSettings(profileId, settings) {
    const db = await initDB();
    return new Promise((resolve) => {
      const tx = db.transaction('profiles', 'readwrite');
      const store = tx.objectStore('profiles');
      const req = store.get(profileId);
      req.onsuccess = () => {
        const prof = req.result;
        if (prof) {
          prof.settings = { ...DEFAULT_SETTINGS, ...settings };
          store.put(prof);
        }
        tx.oncomplete = () => {
          this.syncProfileToServer(profileId);
          resolve(true);
        };
      };
      req.onerror = () => resolve(false);
    });
  },

  async getLearnedPatterns(profileId) {
    if (!profileId) return [];
    const db = await initDB();
    return new Promise((resolve) => {
      const tx = db.transaction('learned_patterns', 'readonly');
      const store = tx.objectStore('learned_patterns');
      const index = store.index('profileId');
      const req = index.getAll(IDBKeyRange.only(profileId));
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  },

  async recordLearnedPattern({
    profileId,
    rawInput,
    resolvedText,
    audioFeatures = null,
    context = '',
    wasAutoTriggered = false
  }) {
    if (!profileId || !resolvedText || !resolvedText.trim()) return;
    const db = await initDB();
    const cleanRaw = (rawInput || '').trim().toLowerCase();
    if (!cleanRaw) return;
    const cleanResolved = resolvedText.trim();

    return new Promise((resolve) => {
      const tx = db.transaction('learned_patterns', 'readwrite');
      const store = tx.objectStore('learned_patterns');
      const index = store.index('profileId');
      const req = index.getAll(IDBKeyRange.only(profileId));

      req.onsuccess = () => {
        const patterns = req.result || [];
        const existing = patterns.find(
          (p) =>
            p.rawInput.toLowerCase() === cleanRaw &&
            p.resolvedText.toLowerCase() === cleanResolved.toLowerCase()
        );

        if (existing) {
          existing.useCount = (existing.useCount || 1) + 1;
          existing.lastUsed = Date.now();
          existing.lastContext = context;
          if (audioFeatures) {
            existing.audioFeatures = mergeAcousticFeatures(existing.audioFeatures, audioFeatures);
          }
          store.put(existing);
        } else {
          store.add({
            profileId,
            rawInput: cleanRaw,
            resolvedText: cleanResolved,
            audioFeatures: audioFeatures || null,
            context,
            useCount: 1,
            lastUsed: Date.now(),
            wasAutoTriggered,
            createdAt: Date.now()
          });
        }
        tx.oncomplete = () => {
          this.syncProfileToServer(profileId);
          resolve(true);
        };
      };
      req.onerror = () => resolve(false);
    });
  },

  async deleteLearnedPattern(id) {
    const db = await initDB();
    return new Promise((resolve) => {
      const tx = db.transaction('learned_patterns', 'readwrite');
      tx.objectStore('learned_patterns').delete(id);
      tx.oncomplete = () => resolve(true);
    });
  },

  async getDictionary(profileId) {
    if (!profileId) return DEFAULT_DICTIONARY;
    const db = await initDB();
    return new Promise((resolve) => {
      const tx = db.transaction('dictionary', 'readonly');
      const store = tx.objectStore('dictionary');
      const index = store.index('profileId');
      const req = index.getAll(IDBKeyRange.only(profileId));
      req.onsuccess = () => {
        if (!req.result || req.result.length === 0) {
          resolve(DEFAULT_DICTIONARY);
        } else {
          resolve(req.result);
        }
      };
      req.onerror = () => resolve(DEFAULT_DICTIONARY);
    });
  },

  async addDictionaryItem({ profileId, phrase, category = 'Custom', triggers = [] }) {
    if (!profileId) return;
    const db = await initDB();
    return new Promise((resolve) => {
      const tx = db.transaction('dictionary', 'readwrite');
      const store = tx.objectStore('dictionary');
      store.add({
        profileId,
        phrase: phrase.trim(),
        category,
        triggers: triggers.filter(Boolean),
        createdAt: Date.now()
      });
      tx.oncomplete = () => {
        this.syncProfileToServer(profileId);
        resolve(true);
      };
    });
  },

  async deleteDictionaryItem(id) {
    const db = await initDB();
    return new Promise((resolve) => {
      const tx = db.transaction('dictionary', 'readwrite');
      tx.objectStore('dictionary').delete(id);
      tx.oncomplete = () => resolve(true);
    });
  },

  async logHistory({ profileId, speaker, text, timestamp = Date.now(), isChild = false, raw = '' }) {
    if (!profileId) return;
    const db = await initDB();
    return new Promise((resolve) => {
      const tx = db.transaction('history', 'readwrite');
      tx.objectStore('history').add({
        profileId,
        speaker,
        text,
        timestamp,
        isChild,
        raw
      });
      tx.oncomplete = () => resolve(true);
    });
  },

  async getRecentHistory(profileId, limit = 20) {
    if (!profileId) return [];
    const db = await initDB();
    return new Promise((resolve) => {
      const tx = db.transaction('history', 'readonly');
      const store = tx.objectStore('history');
      const index = store.index('profileId');
      const req = index.getAll(IDBKeyRange.only(profileId));
      req.onsuccess = () => {
        const history = req.result || [];
        resolve(history.slice(-limit));
      };
      req.onerror = () => resolve([]);
    });
  },

  async clearHistory(profileId) {
    if (!profileId) return;
    const db = await initDB();
    return new Promise((resolve) => {
      const tx = db.transaction('history', 'readwrite');
      const store = tx.objectStore('history');
      const index = store.index('profileId');
      const req = index.openCursor(IDBKeyRange.only(profileId));
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve(true);
    });
  }
};
