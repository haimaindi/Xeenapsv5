import re
import os
import requests
import random
from flask import Flask, request, jsonify

app = Flask(__name__)

# Daftar instance Cobalt publik yang populer
COBALT_INSTANCES = [
    "https://api.cobalt.tools/api/json",
    "https://cobalt.sh/api/json",
    "https://api.wuk.sh/api/json"
]

# Daftar instance Invidious (Sangat bagus untuk fallback link mentah)
INVIDIOUS_INSTANCES = [
    "https://invidious.snopyta.org",
    "https://yewtu.be",
    "https://invidious.kavin.rocks",
    "https://inv.riverside.rocks",
    "https://invidious.sethforprivacy.com"
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
    """Rotasi beberapa instance Cobalt."""
    instances = list(COBALT_INSTANCES)
    random.shuffle(instances)
    
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Origin": "https://cobalt.tools",
        "Referer": "https://cobalt.tools/"
    }
    
    payload = {
        "url": url,
        "downloadMode": "audio",
        "audioFormat": "mp3",
        "isNoQuery": True
    }

    for instance in instances:
        try:
            print(f"Trying Cobalt Instance: {instance}")
            resp = requests.post(instance, json=payload, headers=headers, timeout=5.0)
            if resp.status_code == 200:
                data = resp.json()
                url_res = data.get("url") or (data.get("picker", [{}])[0].get("url"))
                if url_res:
                    return url_res
            print(f"Cobalt {instance} returned {resp.status_code}")
        except:
            continue
    return None

def try_invidious_extraction(video_id):
    """Mendapatkan link stream via Invidious API."""
    instances = list(INVIDIOUS_INSTANCES)
    random.shuffle(instances)
    
    for instance in instances:
        try:
            print(f"Trying Invidious: {instance}")
            api_url = f"{instance}/api/v1/videos/{video_id}"
            resp = requests.get(api_url, timeout=4.0)
            if resp.status_code == 200:
                data = resp.json()
                # Cari format audio m4a atau webm
                formats = data.get('adaptiveFormats', [])
                audio_streams = [f for f in formats if 'audio' in f.get('type', '').lower()]
                if audio_streams:
                    # Ambil yang kualitasnya lumayan
                    return audio_streams[0].get('url')
        except:
            continue
    return None

@app.route('/api/extract', methods=['POST'])
def extract():
    try:
        data = request.get_json()
        url = data.get('url', '')
        video_id = extract_video_id(url)
        
        if not video_id:
            return jsonify({"status": "error", "message": "Invalid URL"}), 400

        # Strategi 1: Cobalt (Tercepat)
        stream_url = try_cobalt_extraction(url)
        
        # Strategi 2: Invidious (Paling tahan banting)
        if not stream_url:
            stream_url = try_invidious_extraction(video_id)

        if stream_url:
            return jsonify({
                "status": "success", 
                "stream_url": stream_url, 
                "video_id": video_id
            })

        return jsonify({
            "status": "error", 
            "message": "All extraction engines are currently blocked by YouTube for this video."
        }), 503
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000)
