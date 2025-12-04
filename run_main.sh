#!/bin/bash

# NHP Synth Auto-Restart Script
# Designed to run at boot via crontab and automatically restart on crashes

# Configuration
MAX_RESTARTS=10
RESTART_DELAY=5
LOG_FILE="$HOME/NHP_Synth/synth_autostart.log"
PID_FILE="$HOME/NHP_Synth/synth.pid"
PY_PID_FILE="$HOME/NHP_Synth/synth_python.pid"

# Log trimming settings (keep latest 10,000 lines, drop oldest)
MAX_LOG_LINES=1000

trim_log_lines() {
    # Ensure log file exists
    [ -f "$LOG_FILE" ] || : > "$LOG_FILE"
    local line_count
    line_count=$(wc -l < "$LOG_FILE" 2>/dev/null | tr -d ' ')
    if [ -n "$line_count" ] && [ "$line_count" -gt "$MAX_LOG_LINES" ]; then
        # Keep only the last MAX_LOG_LINES lines
        local tmpfile
        tmpfile=$(mktemp)
        tail -n "$MAX_LOG_LINES" "$LOG_FILE" > "$tmpfile" && mv "$tmpfile" "$LOG_FILE"
    fi
}

# Logging function
log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
    trim_log_lines
}

# Cleanup function
cleanup() {
    log_message "Cleaning up..."
    if [ -f "$PID_FILE" ]; then
        rm "$PID_FILE"
    fi
    if [ -f "$PY_PID_FILE" ]; then
        rm "$PY_PID_FILE"
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
    
    # Activate virtual environment
    source "$VENV_PATH"

    # Create FIFO for logging
    PIPE_FILE=$(mktemp -u "$HOME/NHP_Synth/.autostart_pipe.XXXX")
    mkfifo "$PIPE_FILE"

    # Start Python in background, redirect output to FIFO, capture PID
    stdbuf -oL -eL python3 "$SCRIPT_PATH" > "$PIPE_FILE" 2>&1 &
    PY_PID=$!
    echo "$PY_PID" > "$PY_PID_FILE"
    log_message "Launched Python main (PID: $PY_PID)"

    # Reader: timestamp and append lines from FIFO to log
    while IFS= read -r line; do
        log_message "PYTHON: $line"
    done < "$PIPE_FILE" &
    READER_PID=$!

    # Wait for Python to exit
    wait "$PY_PID"
    EXIT_CODE=$?

    # Cleanup FIFO reader and pipe
    if kill -0 "$READER_PID" 2>/dev/null; then
        kill "$READER_PID" 2>/dev/null || true
    fi
    rm -f "$PIPE_FILE"
    
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

