import logging

logger = logging.getLogger("NHP_Synth")


def _to_float(value, fallback):
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def poll_synth_states(synths, state_manager):
    """Read back live values from hardware and reconcile state_manager.synths in-place.

    Returns poll health and update counts.
    """
    if not synths or not hasattr(state_manager, "synths"):
        return {"updated_count": 0, "failed_count": 0, "total_count": 0}

    updated_count = 0
    failed_count = 0
    synth_count = min(len(synths), len(state_manager.synths))

    for synth_id in range(synth_count):
        synth = synths[synth_id]
        synth_state = state_manager.synths[synth_id]
        changed = False

        try:
            enabled_a = synth.get_enabled("a")
            enabled_b = synth.get_enabled("b")
            amp_a = synth.get_amplitude("a")
            amp_b = synth.get_amplitude("b")
            freq_a = synth.get_frequency("a")
            freq_b = synth.get_frequency("b")
            phase_a = synth.get_phase("a")
            phase_b = synth.get_phase("b")
        except Exception as exc:
            logger.warning(f"Synth {synth_id} poll failed: {exc}")
            failed_count += 1
            continue

        # If any critical numeric readback is invalid (None), treat this synth as a failed poll cycle.
        # This catches cases where ESP boot logs/noise are read instead of protocol responses.
        if any(v is None for v in [amp_a, amp_b, freq_a, freq_b, phase_a, phase_b]):
            logger.warning(
                f"Synth {synth_id} poll returned invalid numeric readbacks; skipping state update for this cycle"
            )
            failed_count += 1
            continue

        expected_enabled_a = bool(enabled_a)
        expected_enabled_b = bool(enabled_b)
        if synth_state.get("enabled", {}).get("a") != expected_enabled_a:
            synth_state.setdefault("enabled", {})["a"] = expected_enabled_a
            changed = True
        if synth_state.get("enabled", {}).get("b") != expected_enabled_b:
            synth_state.setdefault("enabled", {})["b"] = expected_enabled_b
            changed = True

        new_amp_a = round(_to_float(amp_a, synth_state.get("amplitude_a", 0.0)), 3)
        new_amp_b = round(_to_float(amp_b, synth_state.get("amplitude_b", 0.0)), 3)
        new_freq_a = round(_to_float(freq_a, synth_state.get("frequency_a", 50.0)), 3)
        new_freq_b = round(_to_float(freq_b, synth_state.get("frequency_b", 50.0)), 3)
        new_phase_a = round(_to_float(phase_a, synth_state.get("phase_a", 0.0)), 2)
        new_phase_b = round(_to_float(phase_b, synth_state.get("phase_b", 0.0)), 2)

        if synth_state.get("amplitude_a") != new_amp_a:
            synth_state["amplitude_a"] = new_amp_a
            changed = True
        if synth_state.get("amplitude_b") != new_amp_b:
            synth_state["amplitude_b"] = new_amp_b
            changed = True
        if synth_state.get("frequency_a") != new_freq_a:
            synth_state["frequency_a"] = new_freq_a
            changed = True
        if synth_state.get("frequency_b") != new_freq_b:
            synth_state["frequency_b"] = new_freq_b
            changed = True
        if synth_state.get("phase_a") != new_phase_a:
            synth_state["phase_a"] = new_phase_a
            changed = True
        if synth_state.get("phase_b") != new_phase_b:
            synth_state["phase_b"] = new_phase_b
            changed = True

        if changed:
            updated_count += 1

    return {
        "updated_count": updated_count,
        "failed_count": failed_count,
        "total_count": synth_count,
    }