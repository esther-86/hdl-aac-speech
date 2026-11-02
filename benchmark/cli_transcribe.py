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
    sanitize_child_safe_text,
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

    # Use vad_filter=False to match training/registration 100% so identical audio always yields identical ASR & acoustic match
    segs, _ = model.transcribe(wav_path, beam_size=5, vad_filter=False)
    raw_asr = " ".join(s.text.strip() for s in segs).strip()
    if not raw_asr and browser_hint:
        raw_asr = browser_hint.strip()

    sig = compute_mfcc_signature(wav_path)
    memory = load_learned_memory()

    best_mem = None
    best_score = 0.0
    for mem in memory:
        t_sim = text_similarity(raw_asr, mem.get("raw_asr", "")) if raw_asr else 0.0
        a_sim = acoustic_similarity(sig, mem.get("acoustic_sig"))

        # 1. Exact or near-exact audio recording match (same audio sent again)
        if a_sim >= 0.94 and (t_sim >= 0.50 or not raw_asr):
            score = a_sim
        elif not raw_asr:
            score = a_sim * 0.90
        else:
            score = t_sim * 0.78 + a_sim * 0.22
            if normalize_text(raw_asr) and normalize_text(raw_asr) == normalize_text(mem.get("raw_asr", "")):
                if len(normalize_text(raw_asr).split()) <= 2:
                    score = t_sim * 0.45 + a_sim * 0.55
                else:
                    score = 0.99

        if score > best_score:
            best_score = score
            best_mem = mem

    if best_mem and best_score >= 0.76:
        primary = best_mem["target"]
        reason = f"Learned speech case (score={best_score:.2f})"
    else:
        primary = apply_phonological_rules(raw_asr, memory)
        reason = "Phonological audio decode"

    return {
        "primary": sanitize_child_safe_text(primary),
        "rawAsr": sanitize_child_safe_text(raw_asr),
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
