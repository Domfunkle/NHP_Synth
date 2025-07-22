# NHP_Synth: ESP32 Dual DDS Synthesizer

This project implements a dual-channel Direct Digital Synthesis (DDS) signal generator on the ESP32 platform. It features:

- Two independent sine wave outputs (via DACs on GPIO25 and GPIO26)
- Precise square wave output (GPIO18) synchronized to DDS phase
- UART command interface for real-time control
- Phase, frequency, and amplitude control for each channel
- Odd harmonic mixing with amplitude and phase control per channel (total 8 simultaneous harmonics across both channels)
- External sync input (GPIO19, rising edge)
- High-resolution timer for accurate waveform generation

## Features
- **Frequency Range:** 20 Hz to 8 kHz (configurable)
- **Amplitude Ramping:** Smooth amplitude changes to prevent clicks
- **Phase Control:** Set phase offset for each channel
- **Harmonic Mixing:** Add odd harmonics (3rd, 5th, 7th, etc) to either channel, with amplitude and phase control. Up to a total of 8 harmonics can be active across both channels at once.
- **UART Commands:**
  - `wf[a|b]<freq>`: Set channel A or B frequency (Hz)
  - `wp[a|b]<deg>`: Set channel A or B phase (degrees, -180 to +180)
  - `wa[a|b]<ampl>`: Set channel A or B amplitude (0-100)
  - `wh[a|b]<order>,<pct>[,<phase>]`: Mix odd harmonic to channel A or B (e.g. `wha3,10` for 10% 3rd harmonic, or `wha7,20,-90` for 20% 7th harmonic at -90° phase)
  - `whcl[a|b]`: Clear all harmonics for channel A or B
  - `help`: Show help message

## Hardware Connections
- **DAC Channel A:** GPIO25
- **DAC Channel B:** GPIO26
- **Square Wave Output:** GPIO18
- **Sync Input:** GPIO19 (rising edge, with pulldown)

## Project Structure

```
NHP_Synth/
├── firmware/           # ESP32 firmware (ESP-IDF project)
│   ├── main/          # Main application source
│   ├── .devcontainer/ # ESP-IDF development container
│   └── .vscode/       # ESP32-specific VS Code settings
├── host/              # Python host control interface
│   ├── synth_control/ # Python control library
│   ├── examples/      # Usage examples
│   ├── .devcontainer/ # Python development container
│   └── .vscode/       # Python-specific VS Code settings
├── tools/             # Shared utilities and scripts
└── .vscode/           # Root workspace configuration
```

## Build & Flash

### Firmware (ESP32)
Navigate to the firmware directory and use ESP-IDF:

```bash
cd firmware
idf.py build
idf.py -p /dev/ttyUSB0 flash
```

Or use the convenient script for multiple devices:

```bash
./tools/flash_multiple.sh
```

## Host Control (Python)

A Python interface is provided for programmatic control:

```bash
cd host
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Run examples
python examples/basic_control.py
python examples/harmonic_sweep.py
```

## UART Usage
Connect to the ESP32 UART (default 115200 baud) and type commands as described above. Type `help` for a list of commands.

## Linux commands to test UART
```bash
# Generate a square wave on Channel A at 50Hz
printf "wha3,33\r" > /dev/ttyUSB1
printf "wha5,20\r" > /dev/ttyUSB1
printf "wha7,14\r" > /dev/ttyUSB1
printf "wha9,11\r" > /dev/ttyUSB1
printf "wha11,9\r" > /dev/ttyUSB1
printf "wha13,8\r" > /dev/ttyUSB1
printf "wha15,7\r" > /dev/ttyUSB1
printf "wha17,6\r" > /dev/ttyUSB1
```

```bash
# Clear all harmonics for Channel A and B
printf "whcla\r" > /dev/ttyUSB1
printf "whclb\r" > /dev/ttyUSB1
```

```bash
# Rolling harmonic phase for Channel A and B
ph=-180
while true; do
    printf "wha5,20,%d\n" "$ph" > /dev/ttyUSB1
    invph=$((ph * -1))
    printf "whb3,10,%d\n" "$invph" > /dev/ttyUSB1
    sleep 0.03
    ph=$((ph + 1))
    if [ "$ph" -gt 180 ]; then
        ph=-180
    fi
done
```

## Development

### VS Code Workspace
Open the multi-root workspace for unified development:
```bash
code .vscode/NHP_Synth.code-workspace
```

### DevContainers
Each component has its own development container:
- **Firmware**: ESP-IDF container with all tools
- **Host**: Python container with analysis libraries

### Tools
- `tools/flash_multiple.sh` - Flash firmware to multiple devices
- `tools/uart_test.py` - Test UART communication

## File Structure
- `firmware/main/main.c`: Main ESP32 application source
- `firmware/build/`: Build artifacts (ignored by git)
- `host/synth_control/`: Python control library
- `host/examples/`: Python usage examples
- `tools/`: Shared utilities and scripts
- `.gitignore`: Excludes build and config files from version control

## License
MIT License (or specify your license here)
