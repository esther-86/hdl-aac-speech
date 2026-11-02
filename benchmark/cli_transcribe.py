import sys
import os
import json
from faster_whisper import WhisperModel
from transcribe_engine import (
    BASE_DIR,
    LEARNED_CASES_PATH,
    compute_mfcc_signature,
    acoustic_similarity,
    normalize_text,
    text_similarity,
    apply_phonological_rules,
)

def load_learned_memory():
    if os.path.exists(LEARNED_CASES_PATH):
        try:
            with open(LEARNED_CASES_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return []

def transcribe_wav_file(wav_path, model=None, browser_hint=""):
    if model is None:
        model = WhisperModel("small.en", device="cpu", compute_type="int8")

    segs, _ = model.transcribe(wav_path, beam_size=5, vad_filter=True)
    raw_asr = " ".join(s.text.strip() for s in segs).strip()
    if browser_hint and (not raw_asr or len(browser_hint.strip()) > len(raw_asr) * 1.3):
        raw_asr = browser_hint.strip()

    sig = compute_mfcc_signature(wav_path)
    memory = load_learned_memory()

    best_mem = None
    best_score = 0.0
    if raw_asr:
        for mem in memory:
            t_sim = text_similarity(raw_asr, mem.get("raw_asr", ""))
            if t_sim < 0.82:
                continue
            a_sim = acoustic_similarity(sig, mem.get("acoustic_sig"))
            score = t_sim * 0.85 + a_sim * 0.15
            if normalize_text(raw_asr) == normalize_text(mem.get("raw_asr", "")):
                score = 0.98
            if score > best_score:
                best_score = score
                best_mem = mem

    if best_mem and best_score >= 0.84:
        primary = best_mem["target"]
        reason = "Learned speech case"
    else:
        primary = apply_phonological_rules(raw_asr, memory)
        reason = "Phonological audio decode"

    return {
        "primary": primary,
        "rawAsr": raw_asr,
        "reason": reason,
        "provider": "local-faster-whisper-small"
    }

def register_new_test_case(wav_path, target_text, browser_hint="", model=None):
    if model is None:
        model = WhisperModel("small.en", device="cpu", compute_type="int8")

    raw_asr = browser_hint.strip()
    if wav_path and os.path.exists(wav_path):
        segs, _ = model.transcribe(wav_path, beam_size=5, vad_filter=False)
        whisper_asr = " ".join(s.text.strip() for s in segs).strip()
        if whisper_asr:
            raw_asr = whisper_asr
        sig = compute_mfcc_signature(wav_path)
    else:
        sig = None

    rel_wav = ""
    if wav_path:
        try:
            rel_wav = os.path.relpath(wav_path, BASE_DIR).replace("\\", "/")
        except Exception:
            rel_wav = os.path.basename(wav_path)

    memory = load_learned_memory()
    # Update existing if same raw_asr and similar acoustic signature, else append
    updated = False
    for mem in memory:
        if normalize_text(mem.get("raw_asr", "")) == normalize_text(raw_asr) and normalize_text(raw_asr):
            if not sig or not mem.get("acoustic_sig") or acoustic_similarity(sig, mem.get("acoustic_sig")) > 0.7:
                mem["target"] = target_text.strip()
                if sig:
                    mem["acoustic_sig"] = sig
                if rel_wav:
                    mem["wav_path"] = rel_wav
                mem["source"] = "live_user_edit"
                updated = True
                break

    if not updated:
        memory.append({
            "id": f"user_case_{len(memory) + 1}",
            "wav_path": rel_wav,
            "raw_asr": raw_asr,
            "target": target_text.strip(),
            "acoustic_sig": sig,
            "source": "live_user_edit"
        })

    with open(LEARNED_CASES_PATH, "w", encoding="utf-8") as f:
        json.dump(memory, f, indent=2)

    return {"saved": True, "rawAsr": raw_asr, "target": target_text.strip(), "totalCases": len(memory)}

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "transcribe"
    if mode == "transcribe":
        wav_file = sys.argv[2]
        hint = sys.argv[3] if len(sys.argv) > 3 else ""
        res = transcribe_wav_file(wav_file, browser_hint=hint)
        print(json.dumps(res))
    elif mode == "learn":
        wav_file = sys.argv[2]
        target = sys.argv[3]
        hint = sys.argv[4] if len(sys.argv) > 4 else ""
        res = register_new_test_case(wav_file, target, browser_hint=hint)
        print(json.dumps(res))
