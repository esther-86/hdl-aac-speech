import os
import json
import numpy as np
from scipy.io import wavfile
from faster_whisper import WhisperModel

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WAV_FULL = os.path.join(BASE_DIR, "full_recording.wav")
CLIPS_DIR = os.path.join(BASE_DIR, "clips")
os.makedirs(CLIPS_DIR, exist_ok=True)

UTTERANCES = [
    {"id": "clip_01", "start": 1.20, "end": 6.20, "target": "Zoey and Leo went to the big green park", "split": "train"},
    {"id": "clip_02", "start": 6.70, "end": 12.80, "target": "They saw five yellow ducks swimming in the water", "split": "test"},
    {"id": "clip_03", "start": 13.50, "end": 18.70, "target": "A little brown puppy jumped over a red ball", "split": "train"},
    {"id": "clip_04", "start": 20.00, "end": 27.30, "target": "Look at the blue bird flying high in the sky!", "split": "train"},
    {"id": "clip_05", "start": 27.90, "end": 33.20, "target": "My brother likes to eat sweet strawberries and cheese", "split": "test"},
    {"id": "clip_06", "start": 34.70, "end": 39.80, "target": "Can we ride the fast train and go down the slide?", "split": "train"},
    {"id": "clip_07", "start": 41.60, "end": 44.60, "target": "I want water please", "split": "train"},
    {"id": "clip_08", "start": 45.80, "end": 49.00, "target": "I am hungry, can I have a snack?", "split": "train"},
    {"id": "clip_09", "start": 51.10, "end": 53.80, "target": "I need to use the bathroom", "split": "train"},
    {"id": "clip_10", "start": 54.90, "end": 58.10, "target": "Can you help me please?", "split": "test"},
    {"id": "clip_11", "start": 59.30, "end": 63.60, "target": "I want to play my game on the iPad", "split": "test"},
    {"id": "clip_12", "start": 64.70, "end": 67.80, "target": "I want to go outside", "split": "train"},
    {"id": "clip_13", "start": 69.40, "end": 72.20, "target": "Yes, that is what I want", "split": "train"},
    {"id": "clip_14", "start": 73.30, "end": 77.10, "target": "No thank you, I do not want that", "split": "test"},
    {"id": "clip_15", "start": 78.10, "end": 82.00, "target": "I am tired and I want to rest", "split": "test"},
    {"id": "clip_16", "start": 83.00, "end": 86.50, "target": "It is too loud, I need a break", "split": "train"},
    {"id": "clip_17", "start": 87.20, "end": 89.80, "target": "Can you say that again?", "split": "test"},
    {"id": "clip_18", "start": 95.30, "end": 98.80, "target": "I love you Mom and Dad", "split": "train"},
    {"id": "clip_19", "start": 116.30, "end": 120.80, "target": "Mom, Dad, and Brother", "split": "train"},
    {"id": "clip_20", "start": 125.60, "end": 127.80, "target": "I want Goldfish crackers please", "split": "train"},
    {"id": "clip_21", "start": 129.50, "end": 131.40, "target": "I want ramen please", "split": "train"},
    {"id": "clip_22", "start": 138.70, "end": 140.40, "target": "I want French fries please", "split": "train"},
    {"id": "clip_23", "start": 140.40, "end": 143.20, "target": "I want a hamburger please", "split": "train"},
    {"id": "clip_24", "start": 152.20, "end": 154.30, "target": "I want lettuce please", "split": "train"},
    {"id": "clip_25", "start": 155.20, "end": 157.00, "target": "I want meat please", "split": "train"},
]

sr, data = wavfile.read(WAV_FULL)
for item in UTTERANCES:
    s_idx = int(item["start"] * sr)
    e_idx = min(len(data), int(item["end"] * sr))
    clip_rel_path = f"clips/{item['id']}.wav"
    clip_path = os.path.join(BASE_DIR, clip_rel_path)
    wavfile.write(clip_path, sr, data[s_idx:e_idx])
    item["wav_path"] = clip_rel_path

with open(os.path.join(BASE_DIR, "dataset.json"), "w", encoding="utf-8") as f:
    json.dump(UTTERANCES, f, indent=2)

model = WhisperModel("base.en", device="cpu", compute_type="int8")
for item in UTTERANCES:
    abs_clip = os.path.join(BASE_DIR, item["wav_path"])
    segs, _ = model.transcribe(abs_clip, beam_size=5, vad_filter=False)
    raw_asr = " ".join(s.text.strip() for s in segs).strip()
    print(f"[{item['split'].upper():5s}] {item['id']}: ASR='{raw_asr}'  |  TARGET='{item['target']}'")
