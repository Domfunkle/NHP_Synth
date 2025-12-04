#!/bin/bash

# NHP Synth Kiosk Mode Browser Script
# Designed to run at boot via crontab and open browser in kiosk mode

# Configuration
LOG_FILE="$HOME/NHP_Synth/kiosk_autostart.log"
PID_FILE="$HOME/NHP_Synth/kiosk.pid"
KIOSK_URL="http://localhost:5000"

# Readiness check settings
SYNTH_PID_FILE="$HOME/NHP_Synth/synth.pid"
READINESS_TIMEOUT=120 # seconds
READINESS_POLL_INTERVAL=2 # seconds

# Logging function
log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
    trim_log_lines
}

# Log trimming settings (keep latest 1,000 lines)
MAX_LOG_LINES=1000

trim_log_lines() {
    [ -f "$LOG_FILE" ] || : > "$LOG_FILE"
    local line_count
    line_count=$(wc -l < "$LOG_FILE" 2>/dev/null | tr -d ' ')
    if [ -n "$line_count" ] && [ "$line_count" -gt "$MAX_LOG_LINES" ]; then
        local tmpfile
        tmpfile=$(mktemp)
        tail -n "$MAX_LOG_LINES" "$LOG_FILE" > "$tmpfile" && mv "$tmpfile" "$LOG_FILE"
    fi
}

# Cleanup function
cleanup() {
    log_message "Cleaning up kiosk browser..."
    if [ -f "$PID_FILE" ]; then
        BROWSER_PID=$(cat "$PID_FILE")
        if kill -0 "$BROWSER_PID" 2>/dev/null; then
            log_message "Killing browser process $BROWSER_PID"
            kill "$BROWSER_PID" 2>/dev/null
        fi
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
        log_message "Kiosk browser already running with PID $OLD_PID. Exiting."
        exit 1
    else
        log_message "Stale kiosk PID file found. Removing it."
        rm "$PID_FILE"
    fi
fi

log_message "Starting NHP Synth kiosk browser script"

# Wait for system to be ready and X11/Wayland to start



# Set DISPLAY if not set (for X11)
if [ -z "$DISPLAY" ]; then
    export DISPLAY=:0
    log_message "Set DISPLAY to :0"
fi

# Wait until the synth main service is ready
wait_for_synth_ready() {
    local start_ts=$(date +%s)
    log_message "Waiting for synth service readiness..."

    while true; do
        # Check PID file exists and process is alive
        if [ -f "$SYNTH_PID_FILE" ]; then
            local synth_pid
            synth_pid=$(cat "$SYNTH_PID_FILE" 2>/dev/null)
            if [ -n "$synth_pid" ] && kill -0 "$synth_pid" 2>/dev/null; then
                log_message "Synth PID $synth_pid is running. Checking web service..."
                # Check the web server is responding
                if command -v curl >/dev/null 2>&1; then
                    if curl -s -o /dev/null -w "%{http_code}" "$KIOSK_URL" | grep -qE '^(200|302|301)$'; then
                        log_message "Web service responding at $KIOSK_URL"
                        break
                    fi
                else
                    # Fallback: attempt TCP connection via bash builtin
                    exec 3<>/dev/tcp/localhost/5000 2>/dev/null && { exec 3>&-; log_message "TCP port 5000 reachable"; break; }
                fi
            else
                log_message "Synth PID not alive yet."
            fi
        else
            log_message "Synth PID file not found at $SYNTH_PID_FILE."
        fi

        # Timeout handling
        local now_ts=$(date +%s)
        if [ $((now_ts - start_ts)) -ge "$READINESS_TIMEOUT" ]; then
            log_message "Readiness timeout ($READINESS_TIMEOUT s). Proceeding to launch browser anyway."
            break
        fi
        sleep "$READINESS_POLL_INTERVAL"
    done
}

wait_for_synth_ready

# Function to find available browser
find_browser() {
    local browsers=("chromium-browser" "chromium" "google-chrome" "chrome" "firefox")
    
    for browser in "${browsers[@]}"; do
        if command -v "$browser" &> /dev/null; then
            echo "$browser"
            return 0
        fi
    done
    
    return 1
}

# Find available browser
BROWSER=$(find_browser)
if [ -z "$BROWSER" ]; then
    log_message "ERROR: No supported browser found (chromium, chrome, or firefox)"
    exit 1
fi

log_message "Using browser: $BROWSER"

# Launch browser in kiosk mode
case "$BROWSER" in
    "chromium-browser"|"chromium"|"google-chrome"|"chrome")
        log_message "Launching Chromium/Chrome in kiosk mode..."
        "$BROWSER" \
            --kiosk \
            --no-first-run \
            --disable-infobars \
            --disable-session-crashed-bubble \
            --disable-translate \
            --disable-features=TranslateUI \
            --disable-ipc-flooding-protection \
            --disable-background-timer-throttling \
            --disable-backgrounding-occluded-windows \
            --disable-renderer-backgrounding \
            --disable-field-trial-config \
            --disable-back-forward-cache \
            --disable-hang-monitor \
            --disable-prompt-on-repost \
            --no-default-browser-check \
            --no-first-run \
            --disable-default-apps \
            --disable-popup-blocking \
            --disable-extensions \
            --disable-plugins \
            --disable-sync \
            --disable-background-mode \
            --autoplay-policy=no-user-gesture-required \
            "$KIOSK_URL" &
        ;;
    "firefox")
        log_message "Launching Firefox in kiosk mode..."
        "$BROWSER" \
            --kiosk \
            --private-window \
            "$KIOSK_URL" &
        ;;
esac

BROWSER_PID=$!
echo "$BROWSER_PID" > "$PID_FILE"

log_message "Browser launched with PID: $BROWSER_PID"
log_message "Kiosk mode active - URL: $KIOSK_URL"

# Wait for browser process to finish
wait "$BROWSER_PID"
EXIT_CODE=$?

log_message "Browser process exited with code: $EXIT_CODE"
cleanup
