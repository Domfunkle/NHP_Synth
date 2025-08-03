# function to parse the synth serial commands, returning a human-readable string
def parse_synth_command(command):
    """Parse a synth command string into a human-readable format.
    
    This function can handle both commands being sent and responses being received.
    It automatically detects the type based on the content.
    """
    command = command.strip()
    
    # Handle special commands first
    if command == "help":
        return "Show help message"
    
    # Check for harmonic clear commands
    if command.startswith("whcl"):
        if len(command) >= 5:
            channel = command[4]  # 'a' or 'b'
            return f"Clear all harmonics for channel {channel.upper()}"
        return "Clear harmonics (invalid format)"
    
    # Parse standard commands/responses: [r|w][f|p|a|h|en][a|b][<args>]
    if len(command) < 3:
        return "Invalid command format (too short)"
    
    # Extract operation (read/write)
    operation = command[0]
    if operation not in ['r', 'w']:
        return "Invalid command format (must start with 'r' or 'w')"
    
    # Extract parameter type
    if command[1:3] == "en":
        param_type = "en"
        param_start = 3
    elif command[1] in ['f', 'p', 'a', 'h']:
        param_type = command[1]
        param_start = 2
    else:
        return "Invalid command format (unknown parameter type)"
    
    # Extract channel
    if len(command) <= param_start:
        return "Invalid command format (missing channel)"
    
    channel = command[param_start]
    if channel not in ['a', 'b']:
        return "Invalid command format (channel must be 'a' or 'b')"
    
    # Extract value/args (for write operations or response values)
    value_part = command[param_start + 1:] if len(command) > param_start + 1 else ""
    
    # Determine if this is a command or response
    # If it's a read operation with a value, it's likely a response
    # If it's a write operation, it's a command
    is_response = (operation == 'r' and value_part != "")
    is_command = not is_response
    
    # Format the human-readable output
    channel_text = f"channel {channel.upper()}"
    
    if param_type == 'f':
        param_text = "frequency"
        unit = "Hz"
    elif param_type == 'p':
        param_text = "phase"
        unit = "degrees"
    elif param_type == 'a':
        param_text = "amplitude"
        unit = "%"
    elif param_type == 'h':
        param_text = "harmonics"
        unit = ""
    elif param_type == 'en':
        param_text = "enable state"
        unit = ""
    
    if is_response:
        # This is a response to a read command
        if param_type == 'f':
            return f"Read {param_text} from {channel_text}: {value_part} {unit}"
        elif param_type == 'p':
            return f"Read {param_text} from {channel_text}: {value_part} {unit}"
        elif param_type == 'a':
            return f"Read {param_text} from {channel_text}: {value_part} {unit}"
        elif param_type == 'en':
            if value_part == "1":
                state = "enabled"
            elif value_part == "0":
                state = "disabled"
            else:
                state = f"unknown ({value_part})"
            return f"Read {param_text} from {channel_text}: {state}"
        elif param_type == 'h':
            # Parse harmonic response format: rha3,10.0,0.0;5,20.0,-90.0;
            if not value_part:
                return f"Read {param_text} from {channel_text}: no harmonics"
            
            harmonics = []
            # Split by semicolon to get individual harmonics
            harmonic_entries = [h.strip() for h in value_part.split(';') if h.strip()]
            
            for entry in harmonic_entries:
                if ',' in entry:
                    parts = entry.split(',')
                    if len(parts) >= 2:
                        harmonic_num = parts[0]
                        percent = parts[1]
                        phase = parts[2] if len(parts) > 2 else "0.0"
                        harmonics.append(f"{harmonic_num}th harmonic: {percent}% at {phase}°")
                    else:
                        harmonics.append(f"malformed harmonic: {entry}")
                else:
                    harmonics.append(f"malformed harmonic: {entry}")
            
            if harmonics:
                return f"Read {param_text} from {channel_text}: {'; '.join(harmonics)}"
            else:
                return f"Read {param_text} from {channel_text}: no valid harmonics found"
    
    elif is_command:
        # This is a command being sent
        if operation == 'r':
            # Read command (no value expected)
            return f"Read {param_text} from {channel_text}"
        else:
            # Write command
            if param_type == 'h':
                # Handle harmonic format: wh[a|b]<n>,<percent>[,<phase_deg>]
                if ',' in value_part:
                    harmonic_parts = value_part.split(',')
                    harmonic_num = harmonic_parts[0]
                    percent = harmonic_parts[1] if len(harmonic_parts) > 1 else "unknown"
                    phase = harmonic_parts[2] if len(harmonic_parts) > 2 else "0"
                    return f"Write harmonic {harmonic_num} for {channel_text} to {percent}% at {phase}°"
                else:
                    return f"Write {param_text} for {channel_text} to {value_part}"
            elif param_type == 'en':
                enable_text = "enable" if value_part == "1" else "disable" if value_part == "0" else f"set to {value_part}"
                return f"Write {channel_text} ({enable_text})"
            else:
                value_text = f"{value_part} {unit}" if unit else value_part
                return f"Write {param_text} for {channel_text} to {value_text}"
    
    return f"Unknown command/response: {command}"