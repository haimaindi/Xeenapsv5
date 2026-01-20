import re
import os
import requests
from flask import Flask, request, jsonify
import yt_dlp

app = Flask(__name__)

# List of Invidious instances to use as fallbacks for stream extraction
INVIDIOUS_INSTANCES = [
    "https://inv.vern.cc",
    "https://invidious.snopyta.org",
    "https://yewtu.be",
    "https://vid.puffyan.us",
    "https://invidious.kavin.rocks",
    "https://inv.riverside.rocks"
]

def get_audio_stream_url(url):
    """
    Attempts to get the direct audio stream URL.
    Hierarchy: 1. yt-dlp (Native with Android Spoofing), 2. Invidious Proxy API
    """
    # 1. Try yt-dlp with ANDROID SPOOFING
    ydl_opts = {
        'format': 'bestaudio[ext=m4a]/bestaudio',
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        # Force the extractor to use the Android player client
        'extractor_args': {
            'youtube': {
                'player_client': ['android'],
                'skip': ['webpage']
            }
        },
        'http_headers': {
            'User-Agent': 'com.google.android.youtube/19.29.37 (Linux; U; Android 11; en_US) gzip',
        }
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if info.get('url'):
                return info.get('url')
    except Exception as e:
        print(f"yt-dlp android spoofing failed: {str(e)}")

    # 2. Fallback to Invidious Proxy
    video_id = ""
    if 'youtu.be/' in url:
        video_id = url.split('/')[-1].split('?')[0]
    else:
        match = re.search(r'v=([^&]+)', url)
        video_id = match.group(1) if match else ""

    if video_id:
        for instance in INVIDIOUS_INSTANCES:
            try:
                # Invidious API
                api_url = f"{instance}/api/v1/videos/{video_id}"
                resp = requests.get(api_url, timeout=5)
                if resp.status_code == 200:
                    data = resp.json()
                    # Find the best audio format
                    audio_streams = [f for f in data.get('adaptiveFormats', []) if 'audio' in f.get('type', '').lower()]
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