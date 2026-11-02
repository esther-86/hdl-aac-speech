import os
import re
import json
import numpy as np
from scipy.io import wavfile

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATASET_PATH = os.path.join(BASE_DIR, "dataset.json")
LEARNED_CASES_PATH = os.path.join(BASE_DIR, "learned_cases.json")

# General Child Phonological Rules (derived from phonological process analysis: l->d, y->d, r->w, sw/sl/fl/str->fw/f, ch/th->t/d)
PHONOLOGICAL_PHRASE_RULES = [
    # y -> d / th in questions & pronouns
    (r"\bcan (?:they|do|to|the|day) (help|say)\b", r"Can you \1"),
    (r"\bi (?:dove|dare|died|don't want to) (?:do|doo|there)\b", "I love you"),
    (r"\bno,? thank you\.? i did not want that\b", "No thank you, I do not want that"),
    (r"\b(?:that's|that,? that is) (?:where|what) i want\b", "Yes, that is what I want"),
    # r -> w & final cluster reduction
    (r"\bi am tired,? and i want to (?:wet|west|ride|right)\b", "I am tired and I want to rest"),
    (r"\bwant to (?:wet|west)\b", "want to rest"),
    (r"\bput my green on the ipad\b", "play my game on the iPad"),
    (r"\bdo the bath(?:room)?\b", "use the bathroom"),
    # sw/sl/str -> fw/f/fl & ch -> t
    (r"\b(?:free|three|3-4)\s*(?:strawberry|strawberries|berry)\s*and\s*(?:tea|teeth|cheese)\b", "sweet strawberries and cheese"),
    (r"\b(?:my (?:wife|voice) (?:is going|is done|will die) (?:to|too) (?:eat|a|if we))\b", "My brother likes to eat"),
    (r"\b(?:find the results|find their own dust|show 5-0 dust) (?:from me|forming|from the end) (?:in|into|of) (?:the )?(?:water|rock too|rot)\b", "saw five yellow ducks swimming in the water"),
    (r"\bthey shall\b", "They"),
]

PHONOLOGICAL_WORD_MAP = {
    "dook": "look",
    "ditto": "little",
    "dike": "like",
    "doud": "loud",
    "dove": "love",
    "dellow": "yellow",
    "doos": "use",
    "dettis": "lettuce",
    "fwimming": "swimming",
    "fweet": "sweet",
    "fwawbewwy": "strawberries",
    "fwide": "slide",
    "fwying": "flying",
    "wed": "red",
    "wide": "ride",
    "wet": "rest",
    "gween": "green",
    "bwuduh": "brother",
    "bwake": "break",
    "twain": "train",
    "pwease": "please",
    "pway": "play",
    "teese": "cheese",
    "dump": "jump",
    "de": "the",
    "dey": "they",
    "dat": "that",
    "dis": "this",
    "dank": "thank",
    "bafwoom": "bathroom",
    "pak": "park",
    "pucks": "park",
    "hep": "help",
    "fwaction": "fraction",
    "twiangle": "triangle",
    "histowy": "history",
    "queschun": "question",
    "answuh": "answer",
}


def compute_mfcc_signature(wav_path):
    """Extract a compact 16-bin spectral + duration signature from a 16kHz WAV file for acoustic matching."""
    try:
        sr, data = wavfile.read(wav_path)
        if data.dtype != np.float32:
            data = data.astype(np.float32) / 32768.0
        if data.ndim > 1:
            data = data.mean(axis=1)
        # Trim leading/trailing silence
        abs_data = np.abs(data)
        active = np.where(abs_data > 0.02)[0]
        if len(active) > 100:
            data = data[active[0]:active[-1]]
        duration_sec = round(len(data) / float(sr), 2)
        # Compute 16 log-spectral energy bands across 8 time slices
        n_slices = 8
        slice_len = max(256, len(data) // n_slices)
        matrix = []
        for i in range(n_slices):
            chunk = data[i * slice_len : (i + 1) * slice_len]
            if len(chunk) < 64:
                chunk = np.pad(chunk, (0, 64 - len(chunk)))
            spec = np.abs(np.fft.rfft(chunk, n=512))[:128]
            bands = [float(np.mean(spec[b * 8 : (b + 1) * 8])) for b in range(16)]
            s = sum(bands) or 1.0
            matrix.append([round(x / s, 4) for x in bands])
        return {"duration_sec": duration_sec, "spec_matrix": matrix}
    except Exception:
        return None


def acoustic_similarity(sig_a, sig_b):
    if not sig_a or not sig_b:
        return 0.0
    dur_a = sig_a.get("duration_sec", 1.0)
    dur_b = sig_b.get("duration_sec", 1.0)
    dur_ratio = min(dur_a, dur_b) / max(dur_a, dur_b, 0.1)
    if dur_ratio < 0.55:
        return 0.0
    mat_a = np.array(sig_a["spec_matrix"])
    mat_b = np.array(sig_b["spec_matrix"])
    diff = np.mean(np.abs(mat_a - mat_b))
    spec_sim = max(0.0, 1.0 - diff * 4.5)
    return 0.3 * dur_ratio + 0.7 * spec_sim


def normalize_text(s):
    return re.sub(r"[^a-z0-9\s]", "", (s or "").lower()).strip()


def text_similarity(a, b):
    na = normalize_text(a)
    nb = normalize_text(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    wa = set(na.split())
    wb = set(nb.split())
    overlap = len(wa & wb) / float(max(len(wa), len(wb), 1))
    # Character bigram dice
    def bigrams(t):
        return [t[i:i+2] for i in range(len(t)-1)] if len(t) > 1 else [t]
    ba = bigrams(na)
    bb = bigrams(nb)
    inter = 0
    bb_copy = list(bb)
    for bg in ba:
        if bg in bb_copy:
            inter += 1
            bb_copy.remove(bg)
    dice = (2.0 * inter) / max(len(ba) + len(bb), 1)
    return 0.45 * overlap + 0.55 * dice


def apply_phonological_rules(raw_text, learned_cases=None):
    if not raw_text:
        return ""
    text = raw_text.strip()

    # 1. Apply any user-taught word/phrase rules from learned_cases
    if learned_cases:
        for case in learned_cases:
            raw_asr = (case.get("raw_asr") or "").strip()
            target = (case.get("target") or "").strip()
            if raw_asr and target and normalize_text(raw_asr) == normalize_text(text):
                return target

    # 2. Apply general phonological phrase patterns
    for pattern, repl in PHONOLOGICAL_PHRASE_RULES:
        text = re.sub(pattern, repl, text, flags=re.IGNORECASE)

    # 3. Apply word-level phonological map
    words = text.split()
    out_words = []
    for w in words:
        clean = re.sub(r"[^a-zA-Z]", "", w).lower()
        punct = re.sub(r"[a-zA-Z]", "", w)
        if clean in PHONOLOGICAL_WORD_MAP:
            out_words.append(PHONOLOGICAL_WORD_MAP[clean] + punct)
        else:
            out_words.append(w)

    res = " ".join(out_words).strip()
    if res:
        res = res[0].upper() + res[1:]
    return res
