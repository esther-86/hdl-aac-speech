import os
import json
from faster_whisper import WhisperModel
from transcribe_engine import (
    BASE_DIR,
    DATASET_PATH,
    LEARNED_CASES_PATH,
    compute_mfcc_signature,
    normalize_text,
    extract_aligned_subrules,
)
from cli_transcribe import transcribe_wav_file


def resolve_wav(wav_path):
    if not wav_path:
        return ""
    if os.path.isabs(wav_path) and os.path.exists(wav_path):
        return wav_path
    candidate = os.path.join(BASE_DIR, wav_path)
    if os.path.exists(candidate):
        return candidate
    for subdir in ["user_clips", "clips"]:
        sub_cand = os.path.join(BASE_DIR, subdir, os.path.basename(wav_path))
        if os.path.exists(sub_cand):
            return sub_cand
    return ""


def main():
    print("1. Loading Whisper small.en model...")
    model = WhisperModel("small.en", device="cpu", compute_type="int8")

    # Collect all labeled items from dataset.json + learned_cases.json
    dataset = []
    if os.path.exists(DATASET_PATH):
        with open(DATASET_PATH, "r", encoding="utf-8") as f:
            dataset = json.load(f)

    existing_learned = []
    if os.path.exists(LEARNED_CASES_PATH):
        try:
            with open(LEARNED_CASES_PATH, "r", encoding="utf-8") as f:
                existing_learned = json.load(f)
        except Exception:
            pass

    by_wav_basename = {}
    for item in dataset:
        bname = os.path.basename(item.get("wav_path", ""))
        if bname:
            by_wav_basename[bname] = {
                "id": item.get("id", bname),
                "wav_path": item.get("wav_path", ""),
                "target": item.get("target", ""),
                "source": item.get("split", "dataset"),
            }

    for ex in existing_learned:
        bname = os.path.basename(ex.get("wav_path", ""))
        if bname and bname not in by_wav_basename:
            rel_dir = "user_clips" if bname.startswith("utt_") else "clips"
            by_wav_basename[bname] = {
                "id": ex.get("id", bname),
                "wav_path": f"{rel_dir}/{bname}",
                "raw_asr": ex.get("raw_asr", ""),
                "target": ex.get("target", ""),
                "acoustic_sig": ex.get("acoustic_sig"),
                "source": ex.get("source", "live_user_edit"),
            }

    print(f"2. Training acoustic + ASR memory on {len(by_wav_basename)} audio recordings...")
    trained_memory = []
    for idx, (bname, rec) in enumerate(by_wav_basename.items(), start=1):
        abs_wav = resolve_wav(rec["wav_path"])
        if not abs_wav:
            continue
        rel_dir = "user_clips" if bname.startswith("utt_") else "clips"
        rel_path = f"{rel_dir}/{bname}"

        segs, _ = model.transcribe(abs_wav, beam_size=5, vad_filter=False)
        raw_asr = " ".join(s.text.strip() for s in segs).strip()
        sig = compute_mfcc_signature(abs_wav)

        trained_memory.append({
            "id": rec.get("id", f"case_{idx}"),
            "wav_path": rel_path,
            "raw_asr": raw_asr,
            "target": rec["target"],
            "acoustic_sig": sig,
            "source": rec.get("source", "trained"),
        })

    with open(LEARNED_CASES_PATH, "w", encoding="utf-8") as f:
        json.dump(trained_memory, f, indent=2)

    subrules = extract_aligned_subrules(trained_memory)
    print(f"   Saved {len(trained_memory)} trained audio cases and {len(subrules)} auto-aligned phrase rules to {LEARNED_CASES_PATH}.")

    print("\n3. Verifying live transcription on all trained audio files...")
    passed = 0
    total = len(trained_memory)
    for item in trained_memory:
        abs_wav = resolve_wav(item["wav_path"])
        res = transcribe_wav_file(abs_wav, model=model)
        pred = res["primary"]
        is_exact = normalize_text(pred) == normalize_text(item["target"])
        if is_exact:
            passed += 1
        status = "PASS" if is_exact else "DIFF"
        if not is_exact:
            print(f"[{status}] {item['id']} ({item['wav_path']})")
            print(f"       Predicted: {pred}")
            print(f"       Target   : {item['target']}")

    print(f"\n==> TRAINING & VERIFICATION COMPLETE: {passed}/{total} ({passed/max(total,1)*100:.1f}%) exact match when sending the same audio!")


if __name__ == "__main__":
    main()
