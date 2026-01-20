import re
import os
import random
import requests
from flask import Flask, request, jsonify

app = Flask(__name__)

# Recommended Piped Instances (API focus)
PIPED_INSTANCES = [
    "https://pipedapi.kavin.rocks",
    "https://piped-api.lunar.icu",
    "https://api.piped.projectsegfau.lt",
    "https://pipedapi.us.projectsegfau.lt",
    "https://piped-api.garudalinux.org"
]

# Recommended Invidious Instances (Fallback focus)
INVIDIOUS_INSTANCES = [
    "https://inv.vern.cc",
    "https://invidious.snopyta.org",
    "https://yewtu.be",
    "https://vid.puffyan.us"
]

def get_videoId(url):
    if 'youtu.be/' in url:
        return url.split('/')[-1].split('?')[0]
    match = re.search(r'v=([^&]+)', url)
    return match.group(1) if match else ""

def get_audio_stream_url(url):
    """
    Priority Hierarchy:
    1. Piped API (Rotating Instances - Proxy support)
    2. Invidious API
    """
    video_id = get_videoId(url)
    if not video_id:
        return None

    # LAYER 1: PIPED API (Fastest & Proxy enabled)
    # We pick 3 random instances and try them with short timeouts
    sampled_piped = random.sample(PIPED_INSTANCES, min(3, len(PIPED_INSTANCES)))
    for instance in sampled_piped:
        try:
            api_url = f"{instance}/streams/{video_id}"
            resp = requests.get(api_url, timeout=2.5) # Fast timeout for 10s constraint
            if resp.status_code == 200:
                data = resp.json()
                audio_streams = data.get('audioStreams', [])
                if audio_streams:
                    # Prefer high quality audio
                    audio_streams.sort(key=lambda x: x.get('bitrate', 0), reverse=True)
                    # Use proxy=true if available to hide Vercel IP
                    stream_url = audio_streams[0].get('url')
                    return stream_url
        except Exception as e:
            print(f"Piped instance {instance} failed: {str(e)}")
            continue

    # LAYER 2: INVIDIOUS API (Fallback)
    sampled_invidious = random.sample(INVIDIOUS_INSTANCES, min(2, len(INVIDIOUS_INSTANCES)))
    for instance in sampled_invidious:
        try:
            api_url = f"{instance}/api/v1/videos/{video_id}"
            resp = requests.get(api_url, timeout=3)
            if resp.status_code == 200:
                data = resp.json()
                adaptive_formats = data.get('adaptiveFormats', [])
                audio_streams = [f for f in adaptive_formats if 'audio' in f.get('type', '').lower()]
                if audio_streams:
                    audio_streams.sort(key=lambda x: x.get('bitrate', 0), reverse=True)
                    return audio_streams[0].get('url')
        except Exception as e:
            print(f"Invidious instance {instance} failed: {str(e)}")
            continue

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
            
        if 'youtube.com' in url or 'youtu.be' in url:
            stream_url = get_audio_stream_url(url)
            if stream_url:
                return jsonify({
                    "status": "success",
                    "stream_url": stream_url
                })
            else:
                return jsonify({"status": "error", "message": "Could not extract stream URL via any method."}), 500
        
        return jsonify({"status": "error", "message": "Invalid YouTube URL."}), 400
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000)