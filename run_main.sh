#!/bin/bash

# enter the venv 
VENV_PATH="$HOME/NHP_Synth/host/.venv/bin/activate"
if [ ! -f "$VENV_PATH" ]; then
    echo "Error: Python virtual environment not found at $VENV_PATH"
    exit 1
fi
source "$VENV_PATH"

# check for -test flag
if [[ "$1" == "-test" ]]; then
    SCRIPT_PATH="$HOME/NHP_Synth/host/test.py"
else
    SCRIPT_PATH="$HOME/NHP_Synth/host/main.py"
fi

if [ ! -f "$SCRIPT_PATH" ]; then
    echo "Error: Script not found: $SCRIPT_PATH"
    exit 1
fi

python3 "$SCRIPT_PATH"
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
    echo "Error: Python script exited with code $EXIT_CODE"
    exit $EXIT_CODE
fi

