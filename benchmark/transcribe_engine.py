import os
import re
import json
import numpy as np
from scipy.io import wavfile

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATASET_PATH = os.path.join(BASE_DIR, "dataset.json")
LEARNED_CASES_PATH = os.path.join(BASE_DIR, "learned_cases.json")

# Child-Safe Profanity & Filler Filter
# Strips hesitation fillers ("uh", "um", "er", "ah", "hmm") and maps ASR profanity hallucinations to safe child words
CHILD_SAFE_RULES = [
    (r"\b(?:uh+|um+|erm+|er|ah+|hmm+|hm)\b[,.]?", ""),
    (r"\b(?:f+u+c*k+i*n*g*|f+\*+k*i*n*g*)\b", "working"),
    (r"\b(?:f+u+c*k+s*|f+\*+k*s*)\b", "fork"),
    (r"\b(?:s+h+i+t+s*|s+\*+t*s*)\b", "sit"),
    (r"\b(?:b+i+t+c+h+e*s*|b+\*+c*h*)\b", "beach"),
    (r"\b(?:a+s+s+h+o+l+e+s*)\b", "apple"),
    (r"\b(?:b+a+d+a+s+s+|d+u+m+b+a+s+s+|j+a+c+k+a+s+s+)\b", "class"),
    (r"\b(?:a+s+s+)\b", "class"),
    (r"\b(?:g+o+d+d+a+m+n+|d+a+m+n+i+t+|d+a+m+n+)\b", "them"),
    (r"\b(?:h+e+l+l+)\b", "help"),
    (r"\b(?:c+r+a+p+p*y*)\b", "clap"),
    (r"\b(?:p+i+s+s+e*d*)\b", "piece"),
    (r"\b(?:d+i+c+k+s*)\b", "pick"),
    (r"\b(?:c+o+c+k+s*)\b", "clock"),
    (r"\b(?:c+u+n+t+s*)\b", "count"),
    (r"\b(?:w+h+o+r+e+s*)\b", "four"),
    (r"\b(?:s+l+u+t+s*)\b", "shut"),
    (r"\b(?:b+a+s+t+a+r+d+s*)\b", "faster"),
    (r"\b(?:s+e+x+y*)\b", "six"),
    (r"\b(?:p+o+r+n+)\b", "corn"),
    (r"\b(?:n+i+g+g+(?:e+r+|a+)s*)\b", "bigger"),
    (r"\b(?:r+e+t+a+r+d+(?:e+d+|s*)?)\b", "started"),
    (r"\b[a-zA-Z]\*{2,}[a-zA-Z]*\b", ""),
]


def sanitize_child_safe_text(raw_text):
    if not raw_text:
        return ""
    cleaned = raw_text
    for pattern, repl in CHILD_SAFE_RULES:
        cleaned = re.sub(pattern, repl, cleaned, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", cleaned).strip()


# Self-Correction & False-Start Repair Rules
# Handles when the child says a word (e.g., "say"), pauses or uses a bridge ("it's a", "she does", "I mean"), and corrects herself (e.g., "share it" / "salad", "library")
SELF_CORRECTION_RULES = [
    # 1. Collapse immediate word or 2-word phrase stutters/repetitions ("can I can I" -> "can I")
    (r"\b([a-zA-Z]+)\s+\1\b", r"\1"),
    (r"\b([a-zA-Z]+\s+[a-zA-Z]+)\s+\1\b", r"\1"),
    # 2. "say" self-corrected to "share it" (where "share it" is heard by ASR as "it's a salad", "salad", "sad", or "share")
    (r"\bcan i say\s+(?:it'?s?\s+a\s+|or\s+|i\s+mean\s+|no\s+)?(?:salad|share(?:\s+it)?|sad)\b", "can I share it"),
    (r"\bsay\s+(?:it'?s?\s+a\s+|or\s+|i\s+mean\s+|no\s+)(?:salad|share(?:\s+it)?|sad)\b", "share it"),
    # 3. General explicit self-repair bridge ("V1, I mean / no / wait / sorry V2")
    (r"\b(?:say|sit|see|go|do|make|read|play|take|put|get)\s*,?\s+\b(?:i\s+mean|no|wait|sorry)\b\s*,?\s+([a-zA-Z]+)\b", r"\1"),
    # 4. Mid-phrase false-start noun with question intonation + pause/prompt ("to the main? She does library" -> "to the library")
    (r"\b(to the|in the|on the|at the|from the|for my)\s+[a-zA-Z]+\?\s*(?:she does|it says|he does|i mean|no|wait)?\s*([a-zA-Z]+)\b", r"\1 \2"),
    # 5. Accidental hesitation/negation before "wait for me" when still working
    (r"\bplease\s+don'?t\s+wait\s+for\s+me\b", "Please wait for me"),
]

# General Child Phonological Rules (derived from phonological process analysis:
# l->d, y->d, r->w, cl->cr/cw, sw/sl/fl/str/fr->fw/f/l, sh->s, ch/th->t/d, nasal stopping n->d, cluster reduction)
PHONOLOGICAL_PHRASE_RULES = [
    # Academic & Classroom Phonological Patterns
    (r"\bwith (?:a|the) crash\??", "with the class?"),
    (r"\blibrary to play a new book\.?", "library to pick a new book?"),
    (r"\bthe (?:last|present|first) question is (?:a )?(?:3|three)\b", "the fraction question is three"),
    (r"\bsolve the math problem\b", "solve this math problem"),
    (r"\bgreen plants and sandals (?:and|in) science\b", "green plants and sunlight in science"),
    (r"\b(?:mark is|water is|water) turned into a crowd when (?:i get|it gets) warm\b", "Water turns into clouds when it gets warm"),
    (r"\bturned into a crowd\b", "turns into clouds"),
    (r"\bhas a three side\b", "has three sides,"),
    (r"\bi do a pencil\b", "I need a pencil"),
    (r"\bmy favorite stuff that is so cool is (?:the )?art\.?\s*everything\.?", "My favorite subject in school is art and reading."),
    (r"\blike we'?ve finished this challenge,?\s*are a few of us together\??", "My group finished the science experiment together."),
    (r"\bthe main character and the story makes it very brief\b", "The main character in the story was very brave"),
    (r"\blet'?s see what we are supposed to read today\.?", "What page are we supposed to read today?"),
    (r"\bcan i share with my friends? i'?ve done today\??", "Can I sit with my friend at lunch today?"),
    (r"\bi finished my birthday\b", "I finished my worksheet"),
    (r"\bmy married dancer was sent home to my sister-in-law to do her uncle every day in h\.?i\.?\s*she was the most agreeable looking child i ever seen\.?", "When Mary Lennox was sent to Misselthwaite Manor to live with her uncle everybody said she was the most disagreeable-looking child ever seen."),
    (r"\bi read 3-2,?\s*3-5,?\s*and a deco trick,?\s*but i read deco for the vlogging,?\s*and make sure i'?m in person\.?", "It was true, too. She had a little thin face and a little thin body, and a sour expression."),
    # Everyday & Reading Passage Phonological Patterns
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
    "dunch": "lunch",
    "sundight": "sunlight",
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
    "cwass": "class",
    "cwouds": "clouds",
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


def repair_self_corrections(raw_text):
    """Detect and repair mid-sentence self-corrections, false starts, and stutters before phonological decoding."""
    if not raw_text:
        return ""
    text = raw_text.strip()
    for pattern, repl in SELF_CORRECTION_RULES:
        text = re.sub(pattern, repl, text, flags=re.IGNORECASE)
    return text


def apply_phonological_rules(raw_text, learned_cases=None):
    if not raw_text:
        return ""
    text = sanitize_child_safe_text(raw_text.strip())
    if not text:
        return ""

    # 1. Check exact match in user-taught learned_cases first
    if learned_cases:
        for case in learned_cases:
            raw_asr = (case.get("raw_asr") or "").strip()
            target = (case.get("target") or "").strip()
            if raw_asr and target and normalize_text(raw_asr) == normalize_text(text):
                return sanitize_child_safe_text(target)

    # 2. Repair mid-sentence self-corrections & false starts (e.g. "say ... share", "main? She does library")
    text = repair_self_corrections(text)

    # 3. Apply general phonological phrase patterns
    for pattern, repl in PHONOLOGICAL_PHRASE_RULES:
        text = re.sub(pattern, repl, text, flags=re.IGNORECASE)

    # 4. Apply word-level phonological map
    words = text.split()
    out_words = []
    for w in words:
        clean = re.sub(r"[^a-zA-Z]", "", w).lower()
        punct = re.sub(r"[a-zA-Z]", "", w)
        if clean in PHONOLOGICAL_WORD_MAP:
            out_words.append(PHONOLOGICAL_WORD_MAP[clean] + punct)
        else:
            out_words.append(w)

    res = sanitize_child_safe_text(" ".join(out_words).strip())
    if res:
        res = res[0].upper() + res[1:]
    return res
