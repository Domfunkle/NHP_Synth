# NHP_Synth: ESP32 Dual DDS Synthesizer

This project implements a dual-channel Direct Digital Synthesis (DDS) signal generator on the ESP32 platform. It features:

- Two independent sine wave outputs (via DACs on GPIO25 and GPIO26)
- Precise square wave output (GPIO18) synchronized to DDS phase
- UART command interface for real-time control
- Phase, frequency, and amplitude control for each channel
- Odd harmonic mixing with amplitude and phase control per channel
- External sync input (GPIO19, rising edge)
- High-resolution timer for accurate waveform generation

## Features
- **Frequency Range:** 20 Hz to 8 kHz (configurable)
- **Amplitude Ramping:** Smooth amplitude changes to prevent clicks
- **Phase Control:** Set phase offset for each channel
- **Harmonic Mixing:** Add a single odd harmonic (3rd, 5th, 7th, etc) to either channel, with amplitude and phase control
- **UART Commands:**
  - `wfa<freq>`: Set channel A frequency (Hz)
  - `wfb<freq>`: Set channel B frequency (Hz)
  - `wpa<deg>`: Set channel A phase (degrees, -180 to +180)
  - `wpb<deg>`: Set channel B phase (degrees, -180 to +180)
  - `waa<ampl>`: Set channel A amplitude (0-100)
  - `wab<ampl>`: Set channel B amplitude (0-100)
  - `wha<order>,<pct>[,<phase>]`: Mix odd harmonic to channel A (e.g. `wha3,10` for 10% 3rd harmonic, or `wha7,20,-90` for 20% 7th harmonic at -90° phase)
  - `whb<order>,<pct>[,<phase>]`: Mix odd harmonic to channel B (e.g. `whb5,20,45` for 20% 5th harmonic at 45° phase)
  - `buff`: Output buffer content
  - `help`: Show help message

## Hardware Connections
- **DAC Channel A:** GPIO25
- **DAC Channel B:** GPIO26
- **Square Wave Output:** GPIO18
- **Sync Input:** GPIO19 (rising edge, with pulldown)

## Build & Flash
This project uses ESP-IDF. To build and flash:

```bash
idf.py build
idf.py -p /dev/ttyUSB0 flash
```

To flash to multiple devices simultaneously:

```bash
idf.py -p /dev/ttyUSB0 flash && idf.py -p /dev/ttyUSB1 flash
```

## UART Usage
Connect to the ESP32 UART (default 115200 baud) and type commands as described above. Type `help` for a list of commands.

## File Structure
- `main/main.c`: Main application source
- `build/`: Build artifacts (ignored by git)
- `.gitignore`: Excludes build and config files from version control

## License
MIT License (or specify your license here)
