import re
import os
import requests
import random
from flask import Flask, request, jsonify

app = Flask(__name__)

# Daftar instance Piped terverifikasi (Update 2024/2025)
# Kami menggunakan instance yang memiliki reputasi uptime tinggi.
STABLE_INSTANCES = [
    "https://api.piped.privacydev.net",
    "https://pipedapi.rivo.xyz",
    "https://piped-api.lunar.icu",
    "https://pipedapi.kavin.rocks",
    "https://piped-api.us.v9.io",
    "https://pipedapi.leptons.xyz"
]

def extract_video_id(url):
    """Mengekstrak ID video YouTube."""
    patterns = [
        r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})',
        r'youtube\.com\/embed\/([a-zA-Z0-9_-]{11})',
        r'youtube\.com\/v\/([a-zA-Z0-9_-]{11})',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    if len(url) == 11 and re.match(r'^[a-zA-Z0-9_-]+$', url):
        return url
    return None

def get_audio_stream_url(video_id):
    """Mencoba mendapatkan URL stream audio dengan rotasi instance."""
    if not video_id:
        return None

    # Acak daftar instance agar beban terbagi (load balancing)
    instances = list(STABLE_INSTANCES)
    random.shuffle(instances)

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Origin': 'https://piped.video'
    }

    # Coba maksimal 3 instance berbeda untuk efisiensi waktu Vercel
    for i in range(min(3, len(instances))):
        instance = instances[i]
        try:
            print(f"Attempting extraction via: {instance}")
            api_url = f"{instance}/streams/{video_id}"
            
            # Timeout 3 detik cukup untuk instance yang sehat
            resp = requests.get(api_url, headers=headers, timeout=3.0)
            
            if resp.status_code == 200:
                data = resp.json()
                audio_streams = data.get('audioStreams', [])
                if audio_streams:
                    # Ambil bitrate terbaik
                    audio_streams.sort(key=lambda x: x.get('bitrate', 0), reverse=True)
                    print(f"Success! Found stream at {instance}")
                    return audio_streams[0].get('url')
            else:
                print(f"Instance {instance} returned status code: {resp.status_code}")
                
        except requests.exceptions.RequestException as e:
            print(f"Instance {instance} failed: {type(e).__name__}")
            continue

    return None

@app.route('/api/extract', methods=['POST'])
def extract():
    try:
        if not request.is_json:
            return jsonify({"status": "error", "message": "JSON required"}), 400
            
        data = request.get_json()
        url = data.get('url', '')
        
        video_id = extract_video_id(url)
        if not video_id:
            return jsonify({"status": "error", "message": "Invalid YouTube URL"}), 400

        stream_url = get_audio_stream_url(video_id)
        
        if stream_url:
            return jsonify({
                "status": "success",
                "video_id": video_id,
                "stream_url": stream_url
            })
        
        return jsonify({
            "status": "error", 
            "message": "Audio source unreachable. All active Piped nodes are failing or rate-limiting our request."
        }), 503
        
    except Exception as e:
        print(f"CRITICAL ERROR: {str(e)}")
        return jsonify({"status": "error", "message": "Internal server crash"}), 500

if __name__ == '__main__':
    app.run(port=5000)
