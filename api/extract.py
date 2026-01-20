import re
import requests
from flask import Flask, request, jsonify

app = Flask(__name__)

# ⚡ SPECIFIC PIPED INSTANCES (As requested) ⚡
# Piped 1 (Primary) and Piped 2 (Backup)
PIPED_1 = "https://pipedapi.kavin.rocks"
PIPED_2 = "https://pa.il.ax"

def extract_video_id(url):
    """Extract video ID from various YouTube URL formats."""
    patterns = [
        r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})',
        r'youtube\.com\/embed\/([a-zA-Z0-9_-]{11})',
        r'youtube\.com\/v\/([a-zA-Z0-9_-]{11})',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return url if len(url) == 11 else None

def get_audio_stream_url(video_id):
    """Attempt to get an audio stream URL using only Piped 1 and Piped 2."""
    if not video_id:
        return None

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
    }

    # 1. TRY PIPED 1 (4.0s timeout)
    try:
        resp = requests.get(f"{PIPED_1}/streams/{video_id}", headers=headers, timeout=4.0)
        if resp.status_code == 200:
            data = resp.json()
            audio_streams = data.get('audioStreams', [])
            if audio_streams:
                audio_streams.sort(key=lambda x: x.get('bitrate', 0), reverse=True)
                return audio_streams[0].get('url')
    except Exception:
        pass

    # 2. TRY PIPED 2 (4.0s timeout)
    try:
        resp = requests.get(f"{PIPED_2}/streams/{video_id}", headers=headers, timeout=4.0)
        if resp.status_code == 200:
            data = resp.json()
            audio_streams = data.get('audioStreams', [])
            if audio_streams:
                audio_streams.sort(key=lambda x: x.get('bitrate', 0), reverse=True)
                return audio_streams[0].get('url')
    except Exception:
        pass

    return None

@app.route('/api/extract', methods=['POST'])
def extract():
    try:
        if not request.is_json:
            return jsonify({"status": "error", "message": "JSON required"}), 400
            
        data = request.get_json()
        url = data.get('url')
        
        if not url:
            return jsonify({"status": "error", "message": "URL missing"}), 400
            
        video_id = extract_video_id(url)
        if video_id:
            stream_url = get_audio_stream_url(video_id)
            if stream_url:
                return jsonify({
                    "status": "success",
                    "stream_url": stream_url
                })
            else:
                return jsonify({"status": "error", "message": "Audio stream not found on Piped 1 or 2."}), 404
        
        return jsonify({"status": "error", "message": "Invalid YouTube URL."}), 400
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000)