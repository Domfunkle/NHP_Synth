# NHP_Synth Host Control

Python interface for controlling the ESP32 NHP_Synth dual-channel DDS synthesizer.

## Installation

1. Create and activate a virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Install the package in development mode:
```bash
pip install -e .
```

## Usage

### Basic Control

```python
from synth_control import SynthInterface

with SynthInterface('/dev/ttyUSB0') as synth:
    # Set frequency and amplitude
    synth.set_frequency('a', 440)  # Channel A to 440Hz
    synth.set_amplitude('a', 80)   # 80% amplitude
    
    # Add harmonics
    synth.add_harmonic('a', 3, 20)  # 3rd harmonic at 20%
    synth.add_harmonic('a', 5, 10)  # 5th harmonic at 10%
```

### Waveform Generation

```python
from synth_control import SynthInterface, WaveformGenerator

with SynthInterface('/dev/ttyUSB0') as synth:
    waveform_gen = WaveformGenerator(synth)
    
    # Generate square wave approximation
    waveform_gen.apply_waveform('a', 'square', 200, 70)
    
    # Frequency sweep
    waveform_gen.sweep_frequency('a', 100, 1000, 5)
```

## Examples

Run the example scripts:

```bash
# Basic control demo
python examples/basic_control.py

# Harmonic and waveform demonstrations
python examples/harmonic_sweep.py
```

## API Reference

### SynthInterface

- `set_frequency(channel, frequency)` - Set channel frequency (20-8000 Hz)
- `set_amplitude(channel, amplitude)` - Set channel amplitude (0-100%)
- `set_phase(channel, phase)` - Set channel phase (-180 to +180 degrees)
- `add_harmonic(channel, order, percent, phase=0)` - Add harmonic to channel
- `clear_harmonics(channel)` - Clear all harmonics from channel

### WaveformGenerator

- `apply_waveform(channel, type, frequency, amplitude)` - Apply predefined waveform
- `sweep_frequency(channel, start, end, duration)` - Perform frequency sweep
- `phase_sweep(channel, harmonic_order, duration)` - Sweep harmonic phase
