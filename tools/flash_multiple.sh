#!/bin/bash
# Flash firmware to multiple ESP32 devices simultaneously

FIRMWARE_DIR="../firmware"
DEVICES=("/dev/ttyUSB0" "/dev/ttyUSB1")

echo "Flashing NHP_Synth firmware to multiple devices..."

cd "$FIRMWARE_DIR" || exit 1

# Flash each device
for device in "${DEVICES[@]}"; do
    echo "Flashing to $device..."
    idf.py -p "$device" flash &
done

# Wait for all background jobs to complete
wait

echo "All devices flashed successfully!"
