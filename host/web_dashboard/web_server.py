import os
import json
import datetime
import copy
import time
import threading
import subprocess

from flask_socketio import SocketIO, emit
from flask import Flask, jsonify, request, send_file, send_from_directory


def create_app(command_queue, state_manager):
    app = Flask(__name__)
    socketio = SocketIO(app, cors_allowed_origins="*")

    @app.route('/api/synths', methods=['GET'])
    def get_synths():
        try:
            # Use the in-memory state_manager for synth state
            return jsonify({'synths': getattr(state_manager, 'synths', [])})
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    def queue_command(command_dict):
        command_dict['timestamp'] = datetime.datetime.now().isoformat()
        command_queue.put(command_dict)
        return {'status': 'queued', 'command': command_dict}

    @app.route('/api/synths/<int:synth_id>/command', methods=['POST'])
    def send_command(synth_id):
        data = request.json
        value = data.get('value')
        try:
            value = float(value)
        except (TypeError, ValueError):
            return jsonify({'error': 'Invalid value'}), 400
        command = {
            'synth_id': synth_id,
            'command': data.get('command'),
            'channel': data.get('channel'),
            'value': value
        }
        return jsonify(queue_command(command))
    
    @app.route('/api/synths/<int:synth_id>/enabled', methods=['POST'])
    def set_enabled(synth_id):
        data = request.json
        enabled = data.get('enabled')
        if not isinstance(enabled, bool):
            return jsonify({'error': 'Invalid enabled value'}), 400
        command = {
            'synth_id': synth_id,
            'command': 'set_enabled',
            'channel': data.get('channel'),
            'value': enabled
        }
        return jsonify(queue_command(command))

    @app.route('/api/synths/<int:synth_id>/amplitude', methods=['POST'])
    def set_amplitude(synth_id):
        data = request.json
        value = data.get('value')
        try:
            value = float(value)
        except (TypeError, ValueError):
            return jsonify({'error': 'Invalid value'}), 400
        command = {
            'synth_id': synth_id,
            'command': 'set_amplitude',
            'channel': data.get('channel'),
            'value': value
        }
        return jsonify(queue_command(command))

    @app.route('/api/synths/<int:synth_id>/frequency', methods=['POST'])
    def set_frequency(synth_id):
        data = request.json
        value = data.get('value')
        try:
            value = float(value)
        except (TypeError, ValueError):
            return jsonify({'error': 'Invalid value'}), 400
        command = {
            'synth_id': synth_id,
            'command': 'set_frequency',
            'channel': data.get('channel'),
            'value': value
        }
        return jsonify(queue_command(command))

    @app.route('/api/synths/<int:synth_id>/phase', methods=['POST'])
    def set_phase(synth_id):
        data = request.json
        value = data.get('value')
        try:
            value = float(value)
        except (TypeError, ValueError):
            return jsonify({'error': 'Invalid value'}), 400
        command = {
            'synth_id': synth_id,
            'command': 'set_phase',
            'channel': data.get('channel'),
            'value': value
        }
        return jsonify(queue_command(command))

    @app.route('/api/synths/<int:synth_id>/harmonics', methods=['POST'])
    def set_harmonics(synth_id):
        data = request.json
        value = data.get('value')
        # Accept comma-separated list or single value
        if isinstance(value, str):
            try:
                value = [float(v.strip()) for v in value.split(',') if v.strip() != '']
            except Exception:
                return jsonify({'error': 'Invalid harmonics value'}), 400
        elif isinstance(value, list):
            try:
                value = [float(v) for v in value]
            except Exception:
                return jsonify({'error': 'Invalid harmonics value'}), 400
        else:
            try:
                value = [float(value)]
            except Exception:
                return jsonify({'error': 'Invalid harmonics value'}), 400
        command = {
            'synth_id': synth_id,
            'command': 'set_harmonics',
            'channel': data.get('channel'),
            'value': value
        }
        return jsonify(queue_command(command))
    
    @app.route('/api/defaults', methods=['GET'])
    def get_defaults():
        try:
            defaults = getattr(state_manager, 'defaults', [])
            return jsonify({'defaults': defaults})
        except Exception as e:
            return jsonify({'error': str(e)}), 500
        
    @app.route('/api/defaults', methods=['POST'])
    def set_defaults():
        data = request.json
        defaults = data.get('defaults', [])
        if not isinstance(defaults, list):
            return jsonify({'error': 'Defaults must be a list'}), 400
        try:
            state_manager.defaults = defaults
            state_manager.save_state()  # Save the new defaults to file
            return jsonify({'status': 'Defaults updated'})
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    # Settings management endpoints
    @app.route('/api/settings', methods=['GET'])
    def get_settings():
        try:
            settings_file = os.path.join(os.path.dirname(__file__), '..', 'config', 'settings.json')
            if os.path.exists(settings_file):
                with open(settings_file, 'r') as f:
                    settings = json.load(f)
                
                # Sync synthAutoOn with current synth state if available
                if hasattr(state_manager, 'synths') and len(state_manager.synths) >= 3:
                    settings['synthAutoOn'] = [
                        synth.get('auto_on', False) for synth in state_manager.synths[:3]
                    ]
            else:
                # Default settings
                settings = {
                    'maxVoltage': 250,
                    'maxCurrent': 10,
                    'chartRefreshRate': 100,
                    'precisionDigits': 2,
                    'autoSaveSettings': True,
                    'debugMode': False,
                    'synthAutoOn': [False, False, False]  # Default auto_on for 3 synths
                }
                # Save default settings
                with open(settings_file, 'w') as f:
                    json.dump(settings, f, indent=2)
            return jsonify(settings)
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    @app.route('/api/settings', methods=['POST'])
    def save_settings():
        try:
            settings = request.json
            settings_file = os.path.join(os.path.dirname(__file__), '..', 'config', 'settings.json')
            
            # Ensure the directory exists
            os.makedirs(os.path.dirname(settings_file), exist_ok=True)
            
            # Validate settings
            if not isinstance(settings.get('maxVoltage'), (int, float)) or settings['maxVoltage'] <= 0:
                return jsonify({'error': 'Invalid maxVoltage'}), 400
            if not isinstance(settings.get('maxCurrent'), (int, float)) or settings['maxCurrent'] <= 0:
                return jsonify({'error': 'Invalid maxCurrent'}), 400
            if settings.get('chartRefreshRate') not in [50, 100, 200, 500]:
                return jsonify({'error': 'Invalid chartRefreshRate'}), 400
            if settings.get('precisionDigits') not in [1, 2, 3, 4]:
                return jsonify({'error': 'Invalid precisionDigits'}), 400
            if not isinstance(settings.get('autoSaveSettings'), bool):
                return jsonify({'error': 'Invalid autoSaveSettings'}), 400
            if not isinstance(settings.get('debugMode'), bool):
                return jsonify({'error': 'Invalid debugMode'}), 400
            if not isinstance(settings.get('synthAutoOn'), list) or len(settings['synthAutoOn']) != 3:
                return jsonify({'error': 'Invalid synthAutoOn'}), 400
            if not all(isinstance(x, bool) for x in settings['synthAutoOn']):
                return jsonify({'error': 'Invalid synthAutoOn values'}), 400
            
            # Add timestamp
            settings['lastSaved'] = datetime.datetime.now().isoformat()
            
            # Save to file
            with open(settings_file, 'w') as f:
                json.dump(settings, f, indent=2)
            
            # Update synth state manager with new auto_on settings
            if hasattr(state_manager, 'synths') and settings.get('synthAutoOn'):
                for i, auto_on in enumerate(settings['synthAutoOn']):
                    if i < len(state_manager.synths):
                        state_manager.synths[i]['auto_on'] = auto_on
                state_manager.save_state()  # Save updated synth state
            
            return jsonify({'status': 'Settings saved', 'settings': settings})
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    @app.route('/api/settings/reset', methods=['POST'])
    def reset_settings():
        try:
            # Default settings
            settings = {
                'maxVoltage': 250,
                'maxCurrent': 10,
                'chartRefreshRate': 100,
                'precisionDigits': 2,
                'autoSaveSettings': True,
                'debugMode': False,
                'synthAutoOn': [False, False, False],
                'lastSaved': datetime.datetime.now().isoformat()
            }
            
            settings_file = os.path.join(os.path.dirname(__file__), '..', 'config', 'settings.json')
            
            # Ensure the directory exists
            os.makedirs(os.path.dirname(settings_file), exist_ok=True)
            
            with open(settings_file, 'w') as f:
                json.dump(settings, f, indent=2)
            
            return jsonify({'status': 'Settings reset', 'settings': settings})
        except Exception as e:
            return jsonify({'error': str(e)}), 500
        
    @app.route('/api/status', methods=['GET'])
    def get_status():
        try:
            pid_file = os.path.expanduser('~/NHP_Synth/synth.pid')
            status = {'running': False, 'pid': None}
            if os.path.exists(pid_file):
                with open(pid_file, 'r') as f:
                    pid_str = f.read().strip()
                if pid_str.isdigit():
                    pid = int(pid_str)
                    status['pid'] = pid
                    try:
                        os.kill(pid, 0)
                        status['running'] = True
                    except OSError:
                        status['running'] = False
            # Emit status over socket for listeners
            try:
                socketio.emit('serviceStatus', status)
            except Exception:
                pass
            return jsonify(status)
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    @app.route('/api/logs', methods=['GET'])
    def get_logs():
        try:
            lines_param = request.args.get('lines', default='200')
            try:
                lines = max(10, min(2000, int(lines_param)))
            except ValueError:
                lines = 200
            log_file = os.path.expanduser('~/NHP_Synth/synth_autostart.log')
            raw_lines = []
            if os.path.exists(log_file):
                with open(log_file, 'rb') as f:
                    f.seek(0, os.SEEK_END)
                    size = f.tell()
                    block = 4096
                    data = b''
                    while size > 0 and data.count(b'\n') <= lines * 3:
                        read_size = min(block, size)
                        size -= read_size
                        f.seek(size)
                        data = f.read(read_size) + data
                    raw_lines = data.decode('utf-8', errors='replace').splitlines()

            # Temporarily show all log lines without filtering HTTP access logs
            content = raw_lines[-lines:]
            return jsonify({'lines': content})
        except Exception as e:
            return jsonify({'error': str(e)}), 500
        
    @app.route('/api/restart', methods=['POST'])
    def restart_service():
        try:
            # Perform restart in a background thread to avoid request timeouts
            def do_restart():
                try:
                    py_pid_file = os.path.expanduser('~/NHP_Synth/synth_python.pid')
                    if os.path.exists(py_pid_file):
                        with open(py_pid_file, 'r') as f:
                            py_pid_str = f.read().strip()
                        if py_pid_str.isdigit():
                            py_pid = int(py_pid_str)
                            try:
                                os.kill(py_pid, 0)
                                os.kill(py_pid, 15)  # SIGTERM python child
                            except OSError:
                                pass
                    # Optionally relaunch supervisor to ensure it is active
                    script_path = os.path.expanduser('~/NHP_Synth/run_main.sh')
                    if os.path.exists(script_path):
                        try:
                            subprocess.Popen(
                                ['nohup', 'bash', script_path],
                                stdout=open(os.path.expanduser('~/NHP_Synth/restart_stdout.log'), 'a'),
                                stderr=open(os.path.expanduser('~/NHP_Synth/restart_stderr.log'), 'a'),
                                preexec_fn=os.setpgrp
                            )
                        except Exception:
                            pass
                except Exception:
                    pass

            threading.Thread(target=do_restart, daemon=True).start()
            return jsonify({'status': 'restarting'}), 202
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    @app.route('/')
    def home():
        return send_file(os.path.join(os.path.dirname(__file__), 'home.html'))

    # Background task to emit synth state on change
    def emit_synth_state():
        last_state = None
        last_selection_mode = None
        while True:
            try:
                current_state = copy.deepcopy(getattr(state_manager, 'synths', []))
                selection_mode = getattr(state_manager, 'selection_mode', None)
                emit_payload = {'synths': current_state}
                if selection_mode is not None:
                    emit_payload['selectionMode'] = selection_mode
                state_changed = last_state is None or json.dumps(current_state, sort_keys=True) != json.dumps(last_state, sort_keys=True)
                selection_mode_changed = last_selection_mode is None or json.dumps(selection_mode, sort_keys=True) != json.dumps(last_selection_mode, sort_keys=True)
                if state_changed or selection_mode_changed:
                    socketio.emit('synthState', emit_payload)
                    last_state = current_state
                    last_selection_mode = copy.deepcopy(selection_mode)
            except Exception:
                pass
            time.sleep(0.1)

    threading.Thread(target=emit_synth_state, daemon=True).start()

    # Background task: emit service status periodically (reduce API polling need)
    def emit_service_status_loop():
        last_status = None
        while True:
            try:
                pid_file = os.path.expanduser('~/NHP_Synth/synth.pid')
                status = {'running': False, 'pid': None}
                if os.path.exists(pid_file):
                    with open(pid_file, 'r') as f:
                        pid_str = f.read().strip()
                    if pid_str.isdigit():
                        pid = int(pid_str)
                        status['pid'] = pid
                        try:
                            os.kill(pid, 0)
                            status['running'] = True
                        except OSError:
                            status['running'] = False
                if status != last_status:
                    socketio.emit('serviceStatus', status)
                    last_status = status
            except Exception:
                pass
            time.sleep(1.0)

    threading.Thread(target=emit_service_status_loop, daemon=True).start()

    # Background task: stream logs to clients (tail synth_autostart.log)
    def stream_logs_loop():
        log_path = os.path.expanduser('~/NHP_Synth/synth_autostart.log')
        pos = 0
        last_inode = None
        while True:
            try:
                if not os.path.exists(log_path):
                    time.sleep(1.0)
                    continue
                # Detect rotation/truncation: inode or size decreased
                st = os.stat(log_path)
                if last_inode is None:
                    last_inode = st.st_ino
                elif st.st_ino != last_inode or st.st_size < pos:
                    # File rotated/recreated or truncated; reset position
                    last_inode = st.st_ino
                    pos = 0

                with open(log_path, 'r', encoding='utf-8', errors='replace') as f:
                    f.seek(pos)
                    new_lines = f.readlines()
                    pos = f.tell()
                # Temporarily emit all new lines (including HTTP access logs)
                if new_lines:
                    socketio.emit('serviceLogs', {'lines': [ln.rstrip('\n') for ln in new_lines]})
            except Exception:
                pass
            time.sleep(0.5)

    threading.Thread(target=stream_logs_loop, daemon=True).start()

    # Handle socket connection to emit initial synth state
    @socketio.on('connect')
    def handle_connect():
        try:
            current_state = copy.deepcopy(getattr(state_manager, 'synths', []))
            selection_mode = getattr(state_manager, 'selection_mode', None)
            emit_payload = {'synths': current_state}
            if selection_mode is not None:
                emit_payload['selectionMode'] = selection_mode
            socketio.emit('synthState', emit_payload)
        except Exception:
            pass

    # WebSocket listener for command messages
    @socketio.on('command')
    def handle_command_ws(data):
        # Expecting data dict with keys: synth_id, command, channel, value
        synth_id = data.get('synth_id')
        command_name = data.get('command')
        channel = data.get('channel')
        value = data.get('value')
        try:
            if isinstance(value, dict) and 'id' in value and 'order' in value and 'amplitude' in value:
                value = {
                    'id': int(value['id']),
                    'order': int(value['order']),
                    'amplitude': float(value['amplitude']),
                    'phase': float(value.get('phase', 0))
                }
            else:
                value = float(value)
        except (TypeError, ValueError):
            emit('command_response', {'error': 'Invalid value'})
            return
        command = {
            'synth_id': synth_id,
            'command': command_name,
            'channel': channel,
            'value': value
        }
        result = queue_command(command)
        emit('command_response', result)

    return app, socketio