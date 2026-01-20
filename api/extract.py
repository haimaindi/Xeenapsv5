import re
import os
import requests
from flask import Flask, request, jsonify

app = Flask(__name__)

# ⚡ STABLE PIPED INSTANCES (Priority Ordered) ⚡
# pipedapi.kavin.rocks is primary, pa.il.ax is backup.
PIPED_INSTANCES = [
    "https://pipedapi.kavin.rocks",
    "https://pa.il.ax"
]

def extract_video_id(url):
    patterns = [
        r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})',
        r'youtube\.com\/embed\/([a-zA-Z0-9_-]{11})',
        r'youtube\.com\/v\/([a-zA-Z0-9_-]{11})',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return url # Assume it's already an ID if no pattern matches

def get_audio_stream_url(url):
    video_id = extract_video_id(url)
    if not video_id:
        return None

    # Common headers to mimic a browser/InnerTube client
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Origin': 'https://piped.video'
    }

    # Attempt extraction using Piped instances in priority order
    for instance in PIPED_INSTANCES:
        try:
            api_url = f"{instance}/streams/{video_id}"
            # Short timeout (2.5s) per instance to stay within Vercel's 10s limit
            resp = requests.get(api_url, headers=headers, timeout=2.5)
            
            if resp.status_code == 200:
                data = resp.json()
                audio_streams = data.get('audioStreams', [])
                if audio_streams:
                    # Sort by bitrate to get the best available quality
                    audio_streams.sort(key=lambda x: x.get('bitrate', 0), reverse=True)
                    return audio_streams[0].get('url')
        except Exception:
            continue

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
            
        if 'youtube.com' in url or 'youtu.be' in url:
            stream_url = get_audio_stream_url(url)
            if stream_url:
                return jsonify({
                    "status": "success",
                    "stream_url": stream_url
                })
            else:
                return jsonify({"status": "error", "message": "All stream extraction methods timed out or failed."}), 500
        
        return jsonify({"status": "error", "message": "Not a YouTube URL."}), 400
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000)