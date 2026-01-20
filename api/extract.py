import re
import os
import requests
import random
from flask import Flask, request, jsonify

app = Flask(__name__)

# Engine 1: Cobalt API (Updated parameters to avoid 400 Bad Request)
COBALT_URL = "https://api.cobalt.tools/api/json"

# Engine 2: Piped API Instances (Sorted by reliability)
PIPED_INSTANCES = [
    "https://api.piped.privacydev.net",
    "https://pipedapi.kavin.rocks",
    "https://piped-api.lunar.icu",
    "https://pipedapi.moomoo.me",
    "https://pipedapi.leptons.xyz",
    "https://piped-api.hostux.net"
]

def extract_video_id(url):
    patterns = [
        r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})',
        r'youtube\.be\/([a-zA-Z0-9_-]{11})',
        r'youtube\.com\/embed\/([a-zA-Z0-9_-]{11})',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match: return match.group(1)
    return url if len(url) == 11 else None

def try_cobalt_extraction(url):
    """Mencoba ekstraksi menggunakan Cobalt API dengan parameter terbaru."""
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Origin": "https://cobalt.tools",
        "Referer": "https://cobalt.tools/"
    }
    
    # Payload terbaru untuk Cobalt v10+
    payload = {
        "url": url,
        "downloadMode": "audio",
        "audioFormat": "mp3",
        "filenameStyle": "pretty",
        "isNoQuery": True
    }
    
    try:
        print(f"Attempting Cobalt API (Audio Mode) for: {url}")
        resp = requests.post(COBALT_URL, json=payload, headers=headers, timeout=6.0)
        
        if resp.status_code == 200:
            data = resp.json()
            # Cobalt mengembalikan URL di field 'url'
            stream_url = data.get("url")
            if stream_url:
                print("Cobalt Success!")
                return stream_url
        print(f"Cobalt failed (Status: {resp.status_code})")
    except Exception as e:
        print(f"Cobalt Error: {type(e).__name__}")
    return None

def try_piped_extraction(video_id):
    """Fallback ke Piped API dengan rotasi instance."""
    instances = list(PIPED_INSTANCES)
    random.shuffle(instances)
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept': 'application/json'
    }

    # Coba maksimal 2 instance Piped berbeda
    for i in range(min(2, len(instances))):
        instance = instances[i]
        try:
            print(f"Attempting Piped Instance [{i+1}/2]: {instance}")
            api_url = f"{instance}/streams/{video_id}"
            resp = requests.get(api_url, headers=headers, timeout=4.0)
            if resp.status_code == 200:
                streams = resp.json().get('audioStreams', [])
                if streams:
                    # Ambil bitrate tertinggi
                    streams.sort(key=lambda x: x.get('bitrate', 0), reverse=True)
                    print(f"Piped Success via {instance}")
                    return streams[0].get('url')
            else:
                print(f"Piped Instance {instance} returned {resp.status_code}")
        except Exception as e:
            print(f"Piped Instance {instance} failed: {type(e).__name__}")
            
    return None

@app.route('/api/extract', methods=['POST'])
def extract():
    try:
        if not request.is_json:
            return jsonify({"status": "error", "message": "JSON body required"}), 400
            
        data = request.get_json()
        url = data.get('url', '')
        video_id = extract_video_id(url)
        
        if not video_id:
            return jsonify({"status": "error", "message": "Invalid YouTube URL"}), 400

        # Step 1: Coba Cobalt
        stream_url = try_cobalt_extraction(url)
        
        # Step 2: Fallback ke Piped jika Cobalt gagal
        if not stream_url:
            stream_url = try_piped_extraction(video_id)

        if stream_url:
            return jsonify({
                "status": "success", 
                "stream_url": stream_url, 
                "video_id": video_id
            })

        # Jika semua gagal
        return jsonify({
            "status": "error", 
            "message": "YouTube access restricted from this region. Please try again later or use a different link."
        }), 503
        
    except Exception as e:
        print(f"Extraction Route Fatal Error: {str(e)}")
        return jsonify({"status": "error", "message": "Server internal error"}), 500

if __name__ == '__main__':
    app.run(port=5000)
