import os
import json
from faster_whisper import WhisperModel
from transcribe_engine import (
    BASE_DIR,
    DATASET_PATH,
    LEARNED_CASES_PATH,
    compute_mfcc_signature,
    acoustic_similarity,
    normalize_text,
    text_similarity,
    apply_phonological_rules,
)

def resolve_wav_path(wav_path):
    if not wav_path:
        return ""
    if os.path.isabs(wav_path) and os.path.exists(wav_path):
        return wav_path
    return os.path.join(BASE_DIR, wav_path)


def decode_audio_clip(model, wav_path, train_memory):
    abs_wav = resolve_wav_path(wav_path)
    segs, _ = model.transcribe(abs_wav, beam_size=5, vad_filter=False)
    raw_asr = " ".join(s.text.strip() for s in segs).strip()
    sig = compute_mfcc_signature(abs_wav)

    # 1. Check Training / On-the-Fly Learned Memory (text + acoustic similarity)
    best_mem = None
    best_score = 0.0
    for mem in train_memory:
        t_sim = text_similarity(raw_asr, mem.get("raw_asr", ""))
        a_sim = acoustic_similarity(sig, mem.get("acoustic_sig"))
        if not raw_asr:
            score = a_sim
        else:
            score = t_sim * 0.75 + a_sim * 0.25
        if normalize_text(raw_asr) and normalize_text(raw_asr) == normalize_text(mem.get("raw_asr", "")):
            # If raw_asr is a generic hallucination like "No, please", also require acoustic match
            if len(normalize_text(raw_asr).split()) <= 2:
                score = t_sim * 0.45 + a_sim * 0.55
            else:
                score = 0.98
        if score > best_score:
            best_score = score
            best_mem = mem

    if best_mem and best_score >= 0.76:
        return best_mem["target"], raw_asr, f"Learned training case (score={best_score:.2f})"

    # 2. Otherwise (including ALL Held-Out Test Clips!), apply general phonological rules
    reconstructed = apply_phonological_rules(raw_asr, train_memory)
    return reconstructed, raw_asr, "Open-vocab phonological rule decode"


def word_accuracy(pred, target):
    pw = normalize_text(pred).split()
    tw = normalize_text(target).split()
    if not tw:
        return 1.0
    # Levenshtein distance on words
    dp = [[0] * (len(tw) + 1) for _ in range(len(pw) + 1)]
    for i in range(len(pw) + 1):
        dp[i][0] = i
    for j in range(len(tw) + 1):
        dp[0][j] = j
    for i in range(1, len(pw) + 1):
        for j in range(1, len(tw) + 1):
            cost = 0 if pw[i - 1] == tw[j - 1] else 1
            dp[i][j] = min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    dist = dp[len(pw)][len(tw)]
    return max(0.0, 1.0 - dist / float(len(tw)))


def main():
    with open(DATASET_PATH, "r", encoding="utf-8") as f:
        dataset = json.load(f)

    model = WhisperModel("small.en", device="cpu", compute_type="int8")

    # Step 1: Build training memory ONLY from split == "train"
    train_memory = []
    for item in dataset:
        if item["split"] == "train":
            abs_wav = resolve_wav_path(item["wav_path"])
            segs, _ = model.transcribe(abs_wav, beam_size=5, vad_filter=False)
            raw_asr = " ".join(s.text.strip() for s in segs).strip()
            sig = compute_mfcc_signature(abs_wav)
            train_memory.append({
                "id": item["id"],
                "wav_path": item["wav_path"],
                "raw_asr": raw_asr,
                "target": item["target"],
                "acoustic_sig": sig,
                "source": "train_split"
            })

    # Merge any user-added on-the-fly cases if present
    if os.path.exists(LEARNED_CASES_PATH):
        try:
            with open(LEARNED_CASES_PATH, "r", encoding="utf-8") as lf:
                existing = json.load(lf)
            for ex in existing:
                if ex.get("source") == "live_user_edit":
                    train_memory.append(ex)
        except Exception:
            pass

    with open(LEARNED_CASES_PATH, "w", encoding="utf-8") as lf:
        json.dump(train_memory, lf, indent=2)

    # Step 2: Evaluate on TRAIN (18 clips) and Held-Out TEST (7 clips)
    for split_name in ["train", "test"]:
        items = [d for d in dataset if d["split"] == split_name]
        exact_matches = 0
        word_acc_sum = 0.0
        print(f"\n==================== {split_name.upper()} SET ({len(items)} Real Audio Clips) ====================")
        for item in items:
            pred, raw_asr, method = decode_audio_clip(model, item["wav_path"], train_memory)
            w_acc = word_accuracy(pred, item["target"])
            is_exact = normalize_text(pred) == normalize_text(item["target"])
            if is_exact:
                exact_matches += 1
            word_acc_sum += w_acc
            status = "PASS" if is_exact else f"DIFF ({w_acc*100:.0f}%)"
            print(f"[{status:9s}] {item['id']} | Raw ASR: '{raw_asr}'")
            print(f"            Predicted: '{pred}'")
            print(f"            Target   : '{item['target']}'  ({method})")

        sent_acc = (exact_matches / len(items)) * 100.0
        avg_w_acc = (word_acc_sum / len(items)) * 100.0
        print(f"--> {split_name.upper()} RESULTS: Sentence Accuracy = {exact_matches}/{len(items)} ({sent_acc:.1f}%), Word Accuracy = {avg_w_acc:.1f}%")


if __name__ == "__main__":
    main()
