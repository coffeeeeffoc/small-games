"""Generate the checked-in Mandarin clips locally; no hosted inference or voice cloning.

Requires Python 3.10+, numpy, sherpa-onnx==1.13.8, and the official model.
See ../assets/audio/SOURCES.md for download, license and verification instructions.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path
import wave

import numpy as np
import sherpa_onnx


MODEL_SHA256 = "5511d651b7840c0a93a6bbfd4afd070a2c7f39ca1ec3ff2ecd73191519bbb852"
MODEL_URL = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-icefall-zh-aishell3.tar.bz2"
PHRASES = [
    ("p0", "你今天吃早饭了吗？"),
    ("p1", "请把门口的灯打开。"),
    ("p2", "我们明天还在这里见。"),
    ("p3", "那把蓝色的雨伞是我的。"),
]
VOICES = [("v0", 10), ("v1", 33), ("v2", 99)]


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def prepare_samples(samples: np.ndarray, rate: int) -> np.ndarray:
    samples = np.asarray(samples, dtype=np.float64)
    if not samples.size or not np.isfinite(samples).all():
        raise ValueError("Synthesis returned empty or non-finite samples")
    samples -= np.mean(samples)
    # Preserve phonemes and breaths, but give every clip consistent short margins.
    active = np.flatnonzero(np.abs(samples) > 0.003)
    if not active.size:
        raise ValueError("Synthesis returned silence")
    margin = round(rate * 0.06)
    samples = samples[max(0, active[0] - margin) : active[-1] + margin + 1]
    # Equal RMS, with an independent peak cap. Never normalize to full scale.
    rms = np.sqrt(np.mean(samples * samples))
    scale = min(0.13 / rms, 0.68 / np.max(np.abs(samples)))
    samples *= scale
    ramp = min(round(rate * 0.008), samples.size // 2)
    samples[:ramp] *= np.linspace(0, 1, ramp)
    samples[-ramp:] *= np.linspace(1, 0, ramp)
    return np.pad(samples, (round(rate * 0.10), round(rate * 0.16)))


def encode_wav(samples: np.ndarray, rate: int) -> bytes:
    pcm = np.rint(samples * 32767).astype("<i2")
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(rate)
        output.writeframes(pcm.tobytes())
    return buffer.getvalue()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", required=True, type=Path)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "assets" / "audio",
    )
    args = parser.parse_args()
    model = args.model_dir.resolve()
    if digest((model / "model.onnx").read_bytes()) != MODEL_SHA256:
        raise ValueError("Model hash differs from the reviewed Apache-2.0 model")
    config = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            vits=sherpa_onnx.OfflineTtsVitsModelConfig(
                model=str(model / "model.onnx"),
                lexicon=str(model / "lexicon.txt"),
                tokens=str(model / "tokens.txt"),
                noise_scale=0,
                noise_scale_w=0,
                length_scale=1,
            ),
            num_threads=1,
            provider="cpu",
        ),
    )
    if not config.validate():
        raise ValueError("Invalid TTS configuration")
    tts = sherpa_onnx.OfflineTts(config)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "schemaVersion": 1,
        "language": "zh-CN",
        "generator": {
            "engine": "sherpa-onnx",
            "version": sherpa_onnx.__version__,
            "model": "vits-icefall-zh-aishell3",
            "modelSha256": MODEL_SHA256,
            "modelDownload": MODEL_URL,
            "noiseScale": 0,
            "noiseScaleW": 0,
            "speed": 1,
            "postprocess": "DC removal, edge trim, RMS 0.13 / peak 0.68 caps, 8ms fades, 100/160ms silence",
        },
        "voices": [
            {"id": voice_id, "sourceSpeakerId": sid, "fictionalAdultRole": True}
            for voice_id, sid in VOICES
        ],
        "phrases": [],
    }
    for phrase_id, text in PHRASES:
        phrase = {"id": phrase_id, "text": text, "clips": []}
        for voice_id, speaker_id in VOICES:
            generated = tts.generate(text, sid=speaker_id, speed=1)
            rate = generated.sample_rate
            samples = prepare_samples(generated.samples, rate)
            data = encode_wav(samples, rate)
            sha = digest(data)
            filename = f"{sha[:16]}.wav"
            (args.output_dir / filename).write_bytes(data)
            # Report the exact quantized samples used in the WAV, not pre-encode data.
            with wave.open(io.BytesIO(data), "rb") as audio:
                pcm = np.frombuffer(audio.readframes(audio.getnframes()), dtype="<i2")
            decoded = pcm.astype(np.float64) / 32768
            clip = {
                "voiceId": voice_id,
                "url": f"./assets/audio/{filename}",
                "duration": round(len(decoded) / rate, 6),
                "sampleRate": rate,
                "channels": 1,
                "rms": round(float(np.sqrt(np.mean(decoded * decoded))), 8),
                "peak": round(float(np.max(np.abs(decoded))), 8),
                "sha256": sha,
            }
            assert 0.5 < clip["duration"] < 10
            assert 0.03 < clip["rms"] < 0.16
            assert 0.2 < clip["peak"] <= 0.681
            phrase["clips"].append(clip)
            print(f"{phrase_id}/{voice_id}: {clip['duration']:.3f}s RMS={clip['rms']:.4f} peak={clip['peak']:.4f}", flush=True)
        manifest["phrases"].append(phrase)
    (args.output_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("Wrote 12 WAV files and manifest.json", flush=True)


if __name__ == "__main__":
    main()
