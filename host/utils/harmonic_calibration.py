import json
import os
import time


_SETTINGS_FILE = os.path.join(os.path.dirname(__file__), "..", "config", "settings.json")
_CACHE = {
    "loaded_at": 0.0,
    "mtime": None,
    "cfg": {
        "enabled": False,
        "mode": "linear",
        "linearA": 0.0,
        "perHarmonic": {},
    },
}


def _phase_wrap(value):
    # Keep phase in synth-supported range [-360, 360].
    wrapped = ((float(value) + 360.0) % 720.0) - 360.0
    return round(wrapped, 2)


def _normalize_cfg(raw_cfg):
    cfg = {
        "enabled": False,
        "mode": "linear",
        "linearA": 0.0,
        "perHarmonic": {},
    }
    if not isinstance(raw_cfg, dict):
        return cfg

    cfg["enabled"] = bool(raw_cfg.get("enabled", False))
    mode = str(raw_cfg.get("mode", "linear"))
    cfg["mode"] = mode if mode in ["linear", "per_harmonic"] else "linear"
    try:
        cfg["linearA"] = float(raw_cfg.get("linearA", 0.0))
    except (TypeError, ValueError):
        cfg["linearA"] = 0.0

    per_harmonic = raw_cfg.get("perHarmonic", {})
    if isinstance(per_harmonic, dict):
        normalized = {}
        for key, value in per_harmonic.items():
            try:
                normalized[str(int(key))] = float(value)
            except (TypeError, ValueError):
                continue
        cfg["perHarmonic"] = normalized

    return cfg


def get_harmonic_calibration_config(force_reload=False):
    now = time.time()
    if not force_reload and (now - _CACHE["loaded_at"]) < 1.0:
        return _CACHE["cfg"]

    try:
        mtime = os.path.getmtime(_SETTINGS_FILE)
    except OSError:
        _CACHE["loaded_at"] = now
        return _CACHE["cfg"]

    if not force_reload and _CACHE["mtime"] == mtime:
        _CACHE["loaded_at"] = now
        return _CACHE["cfg"]

    try:
        with open(_SETTINGS_FILE, "r") as f:
            settings = json.load(f)
        cfg = _normalize_cfg(settings.get("harmonicCalibration", {}))
        _CACHE["cfg"] = cfg
        _CACHE["mtime"] = mtime
        _CACHE["loaded_at"] = now
    except Exception:
        _CACHE["loaded_at"] = now

    return _CACHE["cfg"]


def phase_correction_for_order(order, cfg=None):
    if cfg is None:
        cfg = get_harmonic_calibration_config()

    if not cfg.get("enabled", False):
        return 0.0

    try:
        harmonic_order = int(order)
    except (TypeError, ValueError):
        return 0.0

    mode = cfg.get("mode", "linear")
    if mode == "per_harmonic":
        try:
            return float(cfg.get("perHarmonic", {}).get(str(harmonic_order), 0.0))
        except (TypeError, ValueError):
            return 0.0

    try:
        a = float(cfg.get("linearA", 0.0))
    except (TypeError, ValueError):
        a = 0.0
    return a * (1.0 - harmonic_order)


def apply_command_phase_correction(order, desired_phase, cfg=None):
    correction = phase_correction_for_order(order, cfg)
    return _phase_wrap(float(desired_phase) + correction)


def apply_readback_phase_correction(order, measured_phase, cfg=None):
    correction = phase_correction_for_order(order, cfg)
    return _phase_wrap(float(measured_phase) - correction)
