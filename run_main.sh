#!/bin/bash

# NHP Synth Auto-Restart Script
# Designed to run at boot via crontab and automatically restart on crashes

# Configuration
MAX_RESTARTS=10
RESTART_DELAY=5
LOG_FILE="$HOME/NHP_Synth/synth_autostart.log"
PID_FILE="$HOME/NHP_Synth/synth.pid"

# Logging function
log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Cleanup function
cleanup() {
    log_message "Cleaning up..."
    if [ -f "$PID_FILE" ]; then
        rm "$PID_FILE"
    fi
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT

# Check if already running
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
        log_message "Script already running with PID $OLD_PID. Exiting."
        exit 1
    else
        log_message "Stale PID file found. Removing it."
        rm "$PID_FILE"
    fi
fi

# Store our PID
echo $$ > "$PID_FILE"

log_message "Starting NHP Synth auto-restart script (PID: $$)"

# Wait for system to be ready (important for boot startup)
sleep 10

# Set up paths
VENV_PATH="$HOME/NHP_Synth/host/.venv/bin/activate"

# Check for -test flag
if [[ "$1" == "-test" ]]; then
    SCRIPT_PATH="$HOME/NHP_Synth/host/test.py"
    log_message "Running in test mode"
else
    SCRIPT_PATH="$HOME/NHP_Synth/host/main.py"
    log_message "Running in normal mode"
fi

# Validate paths
if [ ! -f "$VENV_PATH" ]; then
    log_message "ERROR: Python virtual environment not found at $VENV_PATH"
    cleanup
fi

if [ ! -f "$SCRIPT_PATH" ]; then
    log_message "ERROR: Script not found: $SCRIPT_PATH"
    cleanup
fi

# Main restart loop
restart_count=0
while [ $restart_count -lt $MAX_RESTARTS ]; do
    log_message "Starting attempt #$((restart_count + 1))"
    
    # Activate virtual environment and run script
    source "$VENV_PATH"
    
    # Run the Python script
    python3 "$SCRIPT_PATH" 2>&1 | while IFS= read -r line; do
        log_message "PYTHON: $line"
    done
    
    EXIT_CODE=${PIPESTATUS[0]}
    
    if [ $EXIT_CODE -eq 0 ]; then
        log_message "Script exited normally (code 0). Stopping auto-restart."
        break
    else
        restart_count=$((restart_count + 1))
        log_message "Script crashed with exit code $EXIT_CODE. Restart count: $restart_count/$MAX_RESTARTS"
        
        if [ $restart_count -lt $MAX_RESTARTS ]; then
            log_message "Waiting $RESTART_DELAY seconds before restart..."
            sleep $RESTART_DELAY
        else
            log_message "Maximum restart attempts reached. Giving up."
        fi
    fi
done

cleanup

