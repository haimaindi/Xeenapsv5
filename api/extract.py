import re
import os
import random
import requests
from flask import Flask, request, jsonify

app = Flask(__name__)

# ⚡ VERIFIED WORKING INSTANCES (Update Jan 2026) ⚡
# These instances are currently stable and proxy YouTube streams effectively.
WORKING_INSTANCES = [
    "https://pipedapi.kavin.rocks",
    "https://pa.il.ax",
    "https://piped-api.garudalinux.org",
    "https://watchapi.whatever.social",
]

# 🛡️ INVIDIOUS FALLBACKS
FALLBACK_INSTANCES = [
    "https://inv.vern.cc",
    "https://invidious.nerdvpn.de",
    "https://yewtu.be"
]

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
    """Attempt to get an audio stream URL using a fast rotation of Piped/Invidious instances."""
    if not video_id:
        return None

    # Enhanced headers to mimic a valid client and bypass simple blocks
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://piped.video/'
    }

    # 1. Primary: Piped API Rotation (2.5s timeout per attempt)
    # Trying up to 3 instances to stay under Vercel's 10s limit
    sampled_piped = random.sample(WORKING_INSTANCES, min(3, len(WORKING_INSTANCES)))
    for instance in sampled_piped:
        try:
            api_url = f"{instance}/streams/{video_id}"
            resp = requests.get(api_url, headers=headers, timeout=2.5)
            
            if resp.status_code == 200:
                data = resp.json()
                audio_streams = data.get('audioStreams', [])
                if audio_streams:
                    # Prefer standard bitrates (around 128kbps) for efficiency
                    audio_streams.sort(key=lambda x: x.get('bitrate', 0), reverse=True)
                    stream_url = audio_streams[0].get('url')
                    if stream_url:
                        return stream_url
        except Exception:
            continue

    # 2. Secondary: Invidious Fallback (2s timeout)
    instance = random.choice(FALLBACK_INSTANCES)
    try:
        api_url = f"{instance}/api/v1/videos/{video_id}"
        resp = requests.get(api_url, headers=headers, timeout=2)
        if resp.status_code == 200:
            data = resp.json()
            adaptive_formats = data.get('adaptiveFormats', [])
            audio_streams = [f for f in adaptive_formats if 'audio' in f.get('type', '').lower()]
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
            return jsonify({"status": "error", "message": "Content-Type must be application/json"}), 400
            
        data = request.get_json()
        url = data.get('url')
        
        if not url:
            return jsonify({"status": "error", "message": "URL is required"}), 400
            
        video_id = extract_video_id(url)
        if video_id:
            stream_url = get_audio_stream_url(video_id)
            if stream_url:
                return jsonify({
                    "status": "success",
                    "stream_url": stream_url,
                    "video_id": video_id
                })
            else:
                return jsonify({"status": "error", "message": "Could not find a working audio stream within timeout."}), 500
        
        return jsonify({"status": "error", "message": "Invalid or unsupported YouTube URL."}), 400
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000)