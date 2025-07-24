#!/bin/bash
# Build firmware and flash to multiple ESP32 devices simultaneously

FIRMWARE_DIR="${HOME}/NHP_Synth/firmware"
DEVICES=("/dev/ttyUSB0" "/dev/ttyUSB1")

echo "Building NHP_Synth firmware..."

cd "$FIRMWARE_DIR" || exit 1

idf.py build || exit 1

echo "Flashing NHP_Synth firmware to multiple devices..."

# Flash each device
for device in "${DEVICES[@]}"; do
    echo "Flashing to $device..."
    idf.py -p "$device" flash &
done

# Wait for all background jobs to complete
wait

echo "All devices flashed successfully!"
