#!/bin/bash
# Build firmware and flash to multiple ESP32 devices simultaneously

FIRMWARE_DIR="${HOME}/NHP_Synth/firmware"
# Find all serial devices by path
DEVICES=(/dev/serial/by-path/*)

echo "Building NHP_Synth firmware..."

cd "$FIRMWARE_DIR" || exit 1

# Source ESP-IDF export script to set up environment
source "${IDF_PATH}/export.sh" || exit 1

idf.py build || exit 1

echo "Flashing NHP_Synth firmware to multiple devices..."

# Flash each device
for device in "${DEVICES[@]}"; do
    # Resolve symlink to actual device file
    real_device=$(readlink -f "$device")
    echo "Flashing to $real_device..."
    idf.py -p "$real_device" flash &
done

# Wait for all background jobs to complete
wait

echo "All devices flashed successfully!"
