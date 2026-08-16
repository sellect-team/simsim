"""로컬 음성인식(faster-whisper)으로 노래에서 가사와 시간을 뽑아낸다.
한국어·영어 자동 감지. 외부 서버·API 불필요."""
import os
import threading

MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "whisper")
_lock = threading.Lock()
_model = None
_model_name = None


def available():
    try:
        import faster_whisper  # noqa: F401
        return True
    except Exception:
        return False


def _load(size="small"):
    """모델을 한 번만 올려두고 재사용 (small = 한국어 정확도와 속도의 균형)"""
    global _model, _model_name
    if _model is not None and _model_name == size:
        return _model
    from faster_whisper import WhisperModel
    os.makedirs(MODEL_DIR, exist_ok=True)
    # ctranslate2가 요구하는 cuBLAS 12가 이 환경에 없어(torch는 13) CPU로 고정한다.
    # small 모델 기준 3~4분 곡이 CPU에서 1~2분이면 충분히 실용적이다.
    _model = WhisperModel(size, device="cpu", compute_type="int8",
                          cpu_threads=max(2, (os.cpu_count() or 4) - 2),
                          download_root=MODEL_DIR)
    _model_name = size
    return _model


def transcribe(path, size="small", language=None, on_progress=None):
    """오디오 → [{start, end, text}] + 감지된 언어.
    on_progress(done_sec, total_sec, n_lines) 로 진행 상황을 실시간 보고한다."""
    with _lock:
        model = _load(size)
        segments, info = model.transcribe(
            path,
            language=language,             # None이면 자동 감지 (한국어/영어)
            task="transcribe",
            beam_size=5,
            vad_filter=True,               # 무음 구간 제거 → 간주에 헛인식 방지
            vad_parameters={"min_silence_duration_ms": 700},
            condition_on_previous_text=False,
        )
        total = float(getattr(info, "duration", 0) or 0)
        if on_progress:
            on_progress(0.0, total, 0)
        out = []
        # 제너레이터를 하나씩 소비하며 진행률을 알린다
        for s in segments:
            txt = (s.text or "").strip()
            if txt:
                out.append({"start": round(s.start, 2),
                            "end": round(s.end, 2), "text": txt})
            if on_progress:
                on_progress(float(s.end or 0), total, len(out))
        if on_progress:
            on_progress(total, total, len(out))
    return {"segments": out,
            "language": getattr(info, "language", None),
            "duration": round(total, 2)}


if __name__ == "__main__":
    import json
    import sys
    print(json.dumps(transcribe(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "small"),
                     ensure_ascii=False, indent=1))
