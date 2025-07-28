import os
import json
import datetime
import copy
import time
import threading

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
        command_dict['timestamp'] = datetime.datetime.utcnow().isoformat()
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

    @app.route('/')
    def home():
        return send_file(os.path.join(os.path.dirname(__file__), 'home.html'))

    # Background task to emit synth state on change
    def emit_synth_state():
        last_state = None
        while True:
            try:
                current_state = copy.deepcopy(getattr(state_manager, 'synths', []))
                selection_mode = getattr(state_manager, 'selection_mode', None)
                emit_payload = {'synths': current_state}
                if selection_mode is not None:
                    emit_payload['selection_mode'] = selection_mode
                if last_state is None or json.dumps(current_state, sort_keys=True) != json.dumps(last_state, sort_keys=True):
                    socketio.emit('synth_state', emit_payload)
                    last_state = current_state
            except Exception:
                pass
            time.sleep(0.1)

    threading.Thread(target=emit_synth_state, daemon=True).start()

    # Handle socket connection to emit initial synth state
    @socketio.on('connect')
    def handle_connect():
        try:
            current_state = copy.deepcopy(getattr(state_manager, 'synths', []))
            selection_mode = getattr(state_manager, 'selection_mode', None)
            emit_payload = {'synths': current_state}
            if selection_mode is not None:
                emit_payload['selection_mode'] = selection_mode
            socketio.emit('synth_state', emit_payload)
        except Exception:
            pass

    return app, socketio
