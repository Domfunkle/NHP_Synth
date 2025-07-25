# NHP_Synth Physical Test Checklist

Use this checklist to verify hardware/software integration after any code changes:

## 1. Encoder Detection Test
- Power on and verify all rotary encoders are detected and initialized correctly.

## 2. Button Press Test
- Short press each encoder button and confirm mode switching (individual/all synths, channel cycling).
- Long press each encoder button and confirm reset to default values for amplitude, frequency, phase, and harmonics.

## 3. Encoder Rotation Test
- Rotate each encoder and verify amplitude, frequency, phase, and harmonics values change as expected.
- Check for correct value limits (e.g., amplitude 0–100%, frequency 20–70Hz, phase -360° to +360°).

## 4. LED Feedback Test
- Confirm LEDs respond to button presses and resets (e.g., flash white on reset, show correct color for each function).

## 5. Synth Output Test
- Measure output signals from each synth channel to verify amplitude, frequency, phase, and harmonics changes are reflected in the hardware.

## 6. State Persistence Test
- Power cycle the system and confirm synth state is saved and restored correctly.

## 7. Error Handling Test
- Disconnect one or more encoders and verify the system handles missing devices gracefully (no crash, correct status messages).

## 8. Multi-Synth Coordination Test
- Test “all synths” mode to ensure simultaneous updates across all devices.

## 9. Timeout Reversion Test
- Leave the system in “individual” mode and confirm it reverts to “all” mode after the timeout period.

## 10. Shutdown Test
- Trigger a clean shutdown and verify all synth outputs are set to zero.

---
Perform these tests after any code changes to ensure full functionality and hardware safety.
