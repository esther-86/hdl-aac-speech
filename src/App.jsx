import React, { useState, useEffect, useRef } from 'react';
import Navbar from './components/Navbar';
import PushToListenHero from './components/PushToListenHero';
import EditModal from './components/EditModal';
import LearningManagerModal from './components/LearningManagerModal';
import OnboardingModal from './components/OnboardingModal';

import { SpeechListener } from './services/speechListener';
import { speechService } from './services/speechSynthesis';
import { contextEngine } from './services/contextEngine';
import { audioTranscriber } from './services/audioTranscriber';
import { storageService, DEFAULT_SETTINGS } from './services/storage';

export default function App() {
  // Profile State
  const [profiles, setProfiles] = useState([]);
  const [activeProfile, setActiveProfile] = useState(null);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);

  // Listening & Speech State
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [listenMode, setListenMode] = useState('push');
  const [interimText, setInterimText] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [currentSpeaker, setCurrentSpeaker] = useState('child');
  const [spokenText, setSpokenText] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Suggestions & Input
  const [rawHeard, setRawHeard] = useState('');
  const [lastAudioFeatures, setLastAudioFeatures] = useState(null);
  const [lastAudioBlob, setLastAudioBlob] = useState(null);
  const [lastWavPath, setLastWavPath] = useState('');
  const [options, setOptions] = useState([
    { phrase: 'I want water please', score: 0.95, reason: 'Ready to speak' },
    { phrase: 'I am hungry, can I have a snack?', score: 0.85, reason: 'Common phrase' },
    { phrase: 'Can you help me please?', score: 0.75, reason: 'Common phrase' }
  ]);

  // Learning & Dictionary
  const [learnedPatterns, setLearnedPatterns] = useState([]);
  const [dictionary, setDictionary] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [availableVoices, setAvailableVoices] = useState([]);

  // Modals
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isLearningHubOpen, setIsLearningHubOpen] = useState(false);

  const listenerRef = useRef(null);
  const transcriptionSeqRef = useRef(0);
  const latestStateRef = useRef({
    activeProfile,
    options,
    rawHeard,
    lastAudioFeatures,
    learnedPatterns,
    dictionary,
    settings,
    listenMode
  });

  useEffect(() => {
    latestStateRef.current = {
      activeProfile,
      options,
      rawHeard,
      lastAudioFeatures,
      learnedPatterns,
      dictionary,
      settings,
      listenMode
    };
  }, [
    activeProfile,
    options,
    rawHeard,
    lastAudioFeatures,
    learnedPatterns,
    dictionary,
    settings,
    listenMode
  ]);

  // Initial Load of Individual Profile & Offline Data
  useEffect(() => {
    async function initProfiles() {
      let allProfiles = await storageService.getProfiles();

      const urlParams = new URLSearchParams(window.location.search);
      const requestedUser = (urlParams.get('user') || urlParams.get('profile') || '').trim();
      const wpUserName =
        typeof window !== 'undefined' &&
        window.hdlAacSpeechConfig &&
        window.hdlAacSpeechConfig.currentUser &&
        window.hdlAacSpeechConfig.currentUser.name
          ? window.hdlAacSpeechConfig.currentUser.name
          : '';

      if (allProfiles.length === 0) {
        const defaultName = requestedUser || wpUserName || 'My Child';
        const created = await storageService.createProfile({
          name: defaultName,
          voiceType: 'child'
        });
        allProfiles = await storageService.getProfiles();
        setProfiles(allProfiles);
        setActiveProfile(created);
        await loadProfileData(created.id);
        return;
      }

      if (requestedUser) {
        let match = allProfiles.find(
          (p) => p.name.toLowerCase() === requestedUser.toLowerCase()
        );
        if (!match) {
          match = await storageService.createProfile({
            name: requestedUser,
            voiceType: 'child'
          });
          allProfiles = await storageService.getProfiles();
        }
        setProfiles(allProfiles);
        setActiveProfile(match);
        await storageService.setActiveProfileId(match.id);
        await loadProfileData(match.id);
        return;
      }

      setProfiles(allProfiles);
      const savedActiveId = await storageService.getActiveProfileId();
      const active = allProfiles.find((p) => p.id === savedActiveId) || allProfiles[0];
      setActiveProfile(active);
      await loadProfileData(active.id);
    }

    initProfiles();
  }, []);

  const loadProfileData = async (profileId) => {
    if (!profileId) return;
    await storageService.ensureCalibratedVocabulary(profileId);
    const savedSettings = await storageService.getSettings(profileId);
    setSettings(savedSettings);
    if (savedSettings.listenMode) {
      setListenMode(savedSettings.listenMode);
    }
    if (listenerRef.current) {
      listenerRef.current.setTimingConfig(savedSettings);
    }
    speechService.setSettings(savedSettings);

    const patterns = await storageService.getLearnedPatterns(profileId);
    setLearnedPatterns(patterns);

    const dict = await storageService.getDictionary(profileId);
    setDictionary(dict);

    setRawHeard('');
    setLastAudioFeatures(null);
    if (patterns.length > 0) {
      const topSorted = [...patterns]
        .sort((a, b) => (b.useCount || 1) - (a.useCount || 1))
        .slice(0, 3)
        .map((p) => ({
          phrase: p.resolvedText,
          score: 0.98,
          reason: `Learned pattern (used ${p.useCount || 1}x)`,
          isLearned: true
        }));
      while (topSorted.length < 3 && dict.length > topSorted.length) {
        const fallback = dict[topSorted.length];
        if (!topSorted.some((o) => o.phrase === fallback.phrase)) {
          topSorted.push({
            phrase: fallback.phrase,
            score: 0.8,
            reason: 'Personal vocabulary'
          });
        } else {
          break;
        }
      }
      setOptions(topSorted);
    } else {
      setOptions(
        dict.slice(0, 3).map((d) => ({
          phrase: d.phrase,
          score: 0.9,
          reason: 'Common phrase'
        }))
      );
    }
  };

  useEffect(() => {
    const unsubscribeVoices = speechService.onVoicesChanged((voicesList) => {
      setAvailableVoices([...voicesList]);
    });

    listenerRef.current = new SpeechListener({
      onAudioLevel: (lvl) => setAudioLevel(lvl),
      onSpeakerDetected: (speaker) => setCurrentSpeaker(speaker),
      onInterim: (interim) => {
        const { learnedPatterns: curPats, dictionary: curDict } = latestStateRef.current;
        const safeInterim = contextEngine.sanitizeChildSafeText(interim);
        const liveRecon = contextEngine.reconstructChildUtterance(safeInterim, curPats, curDict);
        setInterimText(liveRecon || safeInterim);
      },
      onStatusChange: (listening, err) => {
        setIsListening(listening);
        if (!listening) {
          setInterimText('');
        }
        if (err) console.warn('Listener status:', err);
      },
      onFinal: (text, speaker, audioFeatures, wavBlob) => {
        setInterimText('');
        handleIncomingSpeech(text, speaker, audioFeatures, wavBlob);
      },
      onAudioRecorded: (audioBlob, initialTranscript, audioFeatures) => {
        handleRecordedAudio(audioBlob, initialTranscript, audioFeatures);
      }
    });

    return () => {
      unsubscribeVoices();
      if (listenerRef.current) {
        listenerRef.current.stop();
      }
    };
  }, []);

  const handleIncomingSpeech = (text, speaker = 'child', audioFeatures = null, wavBlob = null) => {
    const {
      activeProfile: curProf,
      learnedPatterns: currentPatterns,
      dictionary: currentDict
    } = latestStateRef.current;

    if (!curProf) return;
    const cleanText = contextEngine.sanitizeChildSafeText((text || '').trim());
    if (!cleanText) return;

    setRawHeard(cleanText);
    setLastAudioFeatures(audioFeatures);
    if (wavBlob) {
      setLastAudioBlob(wavBlob);
    }

    // Evaluate both the primary transcript and any N-best alternatives captured by SpeechRecognition
    const resolved = contextEngine.resolveUtterance({
      rawInput: cleanText,
      audioFeatures,
      partnerContext: '',
      learnedPatterns: currentPatterns,
      dictionary: currentDict
    });

    setOptions(resolved);
  };

  const handleRecordedAudio = async (audioBlob, initialTranscript, audioFeatures) => {
    const {
      activeProfile: curProf,
      learnedPatterns: currentPatterns,
      dictionary: currentDict,
      settings: currentSettings
    } = latestStateRef.current;

    if (!curProf) return;
    if (!initialTranscript && (!audioFeatures || !audioFeatures.hasVoice)) {
      return;
    }

    const reqSeq = ++transcriptionSeqRef.current;
    setLastAudioBlob(audioBlob);
    setLastAudioFeatures(audioFeatures);
    if (initialTranscript) {
      setRawHeard(initialTranscript);
    }

    // First compute instant offline phonological fallback in case offline
    const fallbackResolved = initialTranscript
      ? contextEngine.resolveUtterance({
          rawInput: initialTranscript,
          audioFeatures,
          partnerContext: '',
          learnedPatterns: currentPatterns,
          dictionary: currentDict
        })
      : null;

    if (!audioTranscriber.isEnabled(currentSettings)) {
      if (fallbackResolved && reqSeq === transcriptionSeqRef.current) {
        setOptions(fallbackResolved);
      }
      return;
    }

    setIsTranscribing(true);
    try {
      const aiResult = await audioTranscriber.transcribeAudio({
        audioBlob,
        browserTranscript: initialTranscript,
        audioFeatures,
        settings: currentSettings,
        learnedPatterns: currentPatterns,
        dictionary: currentDict
      });

      if (reqSeq !== transcriptionSeqRef.current) {
        return;
      }

      if (aiResult && aiResult.primary) {
        const safePrimary = contextEngine.sanitizeChildSafeText(aiResult.primary);
        if (aiResult.rawAsr) {
          setRawHeard(contextEngine.sanitizeChildSafeText(aiResult.rawAsr));
        }
        if (aiResult.wavPath) {
          setLastWavPath(aiResult.wavPath);
        }
        const resolvedFromAi = contextEngine.resolveUtterance({
          rawInput: safePrimary,
          audioFeatures,
          partnerContext: '',
          learnedPatterns: currentPatterns,
          dictionary: currentDict
        });
        setOptions(resolvedFromAi);
      } else if (fallbackResolved) {
        setOptions(fallbackResolved);
      }
    } finally {
      if (reqSeq === transcriptionSeqRef.current) {
        setIsTranscribing(false);
      }
    }
  };

  const speakPhrase = (phrase) => {
    if (!phrase) return;
    setSpokenText(phrase);
    speechService.speak(
      phrase,
      () => setIsSpeaking(true),
      () => setIsSpeaking(false)
    );
  };

  // When she pushes "2. Push to Say It Out"
  const handleSelectOption = async (option) => {
    if (!activeProfile || !option || !option.phrase) return;
    speakPhrase(option.phrase);

    const patternRawKey = rawHeard || option.phrase.toLowerCase();
    await storageService.recordLearnedPattern({
      profileId: activeProfile.id,
      rawInput: patternRawKey,
      resolvedText: option.phrase,
      audioFeatures: lastAudioFeatures,
      context: ''
    });

    const updatedPatterns = await storageService.getLearnedPatterns(activeProfile.id);
    setLearnedPatterns(updatedPatterns);

    const matchedPattern = updatedPatterns.find(
      (p) =>
        p.rawInput.toLowerCase() === patternRawKey.toLowerCase() &&
        p.resolvedText.toLowerCase() === option.phrase.toLowerCase()
    );
    const updatedTop = {
      phrase: option.phrase,
      score: 1.0,
      reason: `Learned from your speech pattern (used ${matchedPattern ? matchedPattern.useCount : 1}x)`,
      isLearned: true
    };
    const otherOpts = options.filter(
      (o) => o.phrase.toLowerCase() !== option.phrase.toLowerCase()
    );
    setOptions([updatedTop, ...otherOpts].slice(0, 3));
  };

  // When she taps one of the runner-up pills on the right, promote it to #1 so she can see it and push Say It Out
  const handlePromoteAlternative = (altOption) => {
    if (!altOption) return;
    const others = options.filter(
      (o) => o.phrase.toLowerCase() !== altOption.phrase.toLowerCase()
    );
    setOptions([altOption, ...others].slice(0, 3));
  };

  const handleSaveAndSpeakEdit = async (editedPhrase) => {
    if (!activeProfile || !editedPhrase) return;
    transcriptionSeqRef.current += 1;
    setIsTranscribing(false);

    // Do NOT speak out loud here—only save & teach the pattern and update the main screen so she can push "2. Push to Say It Out" when ready!
    const otherOpts = options.filter(
      (o) => o.phrase.toLowerCase() !== editedPhrase.toLowerCase()
    );
    setOptions([
      {
        phrase: editedPhrase,
        score: 1.0,
        reason: 'Learned from your speech pattern (used 1x)',
        isLearned: true
      },
      ...otherOpts.slice(0, 2)
    ]);

    const patternRawKey = rawHeard || editedPhrase.toLowerCase();
    await storageService.recordLearnedPattern({
      profileId: activeProfile.id,
      rawInput: patternRawKey,
      resolvedText: editedPhrase,
      audioFeatures: lastAudioFeatures,
      context: ''
    });

    const updatedPatterns = await storageService.getLearnedPatterns(activeProfile.id);
    setLearnedPatterns(updatedPatterns);

    // Save the actual recorded WAV audio + raw ASR + edited sentence as a live test/training case on the fly!
    audioTranscriber.saveEditedTestCase({
      audioBlob: lastAudioBlob,
      wavPath: lastWavPath,
      rawTranscript: patternRawKey,
      target: editedPhrase
    });
  };

  const handleCreateProfile = async (profileData) => {
    const newProf = await storageService.createProfile(profileData);
    const updatedProfiles = await storageService.getProfiles();
    setProfiles(updatedProfiles);
    setActiveProfile(newProf);
    setIsOnboardingOpen(false);
    await loadProfileData(newProf.id);
  };

  const handleSelectProfile = async (profileId) => {
    const prof = profiles.find((p) => p.id === profileId);
    if (prof) {
      setActiveProfile(prof);
      await storageService.setActiveProfileId(prof.id);
      await loadProfileData(prof.id);
    }
  };

  const handleDeleteProfile = async (profileId) => {
    await storageService.deleteProfile(profileId);
    const remaining = await storageService.getProfiles();
    setProfiles(remaining);
    if (remaining.length > 0) {
      setActiveProfile(remaining[0]);
      await loadProfileData(remaining[0].id);
    } else {
      const created = await storageService.createProfile({
        name: 'My Child',
        voiceType: 'child'
      });
      const all = await storageService.getProfiles();
      setProfiles(all);
      setActiveProfile(created);
      await loadProfileData(created.id);
    }
  };

  const handleExportProfile = async (profileId) => {
    const jsonString = await storageService.exportProfileData(profileId);
    if (!jsonString) return;

    const prof = profiles.find((p) => p.id === profileId);
    const filename = `ClearVoice_${(prof ? prof.name : 'Profile').replace(/\s+/g, '_')}_backup.json`;
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportProfile = async (jsonString) => {
    try {
      const imported = await storageService.importProfileData(jsonString);
      const updated = await storageService.getProfiles();
      setProfiles(updated);
      setActiveProfile(imported);
      await loadProfileData(imported.id);
      setIsOnboardingOpen(false);
    } catch (e) {
      alert('Failed to import profile: ' + e.message);
    }
  };

  const handlePushToListen = () => {
    if (!listenerRef.current) return;
    if (isListening) {
      listenerRef.current.finishAndTranscribe();
    } else {
      setInterimText('');
      listenerRef.current.start({ continuous: false });
    }
  };

  const handleChangeVoice = async (newVoiceURI) => {
    if (!newVoiceURI) return;
    speechService.setVoice(newVoiceURI);
    const updatedSettings = { ...settings, selectedVoiceURI: newVoiceURI };
    setSettings(updatedSettings);
    if (activeProfile) {
      await storageService.saveSettings(activeProfile.id, updatedSettings);
    }
  };

  const handleDeletePattern = async (id) => {
    if (!activeProfile) return;
    await storageService.deleteLearnedPattern(id);
    const updated = await storageService.getLearnedPatterns(activeProfile.id);
    setLearnedPatterns(updated);
  };

  const handleAddWord = async (item) => {
    if (!activeProfile) return;
    await storageService.addDictionaryItem({ ...item, profileId: activeProfile.id });
    const dict = await storageService.getDictionary(activeProfile.id);
    setDictionary(dict);
  };

  const handleDeleteWord = async (id) => {
    if (!activeProfile) return;
    await storageService.deleteDictionaryItem(id);
    const dict = await storageService.getDictionary(activeProfile.id);
    setDictionary(dict);
  };

  const handleSaveSettings = async (newSettings) => {
    if (!activeProfile) return;
    setSettings(newSettings);
    speechService.setSettings(newSettings);
    if (listenerRef.current) {
      listenerRef.current.setTimingConfig(newSettings);
    }
    await storageService.saveSettings(activeProfile.id, newSettings);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Minimal Top Bar */}
      <Navbar
        isListening={isListening}
        onToggleListening={handlePushToListen}
        audioLevel={audioLevel}
        currentSpeaker={currentSpeaker}
        layoutMode="standard"
        onChangeLayout={() => {}}
        onOpenLearningHub={() => setIsLearningHubOpen(true)}
        learnedCount={learnedPatterns.length}
        profiles={profiles}
        activeProfile={activeProfile}
        onSelectProfile={handleSelectProfile}
        onOpenNewProfile={() => setIsOnboardingOpen(true)}
        onExportProfile={handleExportProfile}
        onImportProfile={handleImportProfile}
        onDeleteProfile={handleDeleteProfile}
      />

      {/* Minimal Two-Panel Main Area: Left = Push to Listen, Right = What It Heard + Push to Say It Out */}
      <main className="flex-1 w-full max-w-5xl mx-auto p-4 sm:p-6 flex items-center justify-center">
        <PushToListenHero
          isListening={isListening}
          isTranscribing={isTranscribing}
          interimText={interimText}
          onPushToListen={handlePushToListen}
          topOption={options[0] || null}
          onSayItOut={handleSelectOption}
          onOpenEdit={() => setIsEditOpen(true)}
          isSpeaking={isSpeaking}
          audioLevel={audioLevel}
          voices={availableVoices}
          selectedVoiceURI={settings.selectedVoiceURI || speechService.getSelectedVoiceURI()}
          onChangeVoice={handleChangeVoice}
        />
      </main>

      {/* Edit / Type Correction Modal */}
      <EditModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        rawHeard={rawHeard}
        initialText={options[0] ? options[0].phrase : ''}
        onSaveAndSpeak={handleSaveAndSpeakEdit}
      />

      {/* Learning & Vocabulary Hub Modal */}
      <LearningManagerModal
        isOpen={isLearningHubOpen}
        onClose={() => setIsLearningHubOpen(false)}
        activeProfileName={activeProfile ? activeProfile.name : 'My Child'}
        learnedPatterns={learnedPatterns}
        dictionary={dictionary}
        settings={settings}
        onDeletePattern={handleDeletePattern}
        onAddWord={handleAddWord}
        onDeleteWord={handleDeleteWord}
        onSaveSettings={handleSaveSettings}
      />

      {/* Add New Individual Profile Modal */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        canClose={profiles.length > 0}
        onClose={() => setIsOnboardingOpen(false)}
        onComplete={handleCreateProfile}
        onImport={handleImportProfile}
      />
    </div>
  );
}
