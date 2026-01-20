import re
import os
import requests
import random
from flask import Flask, request, jsonify

app = Flask(__name__)

# Engine 1: Cobalt API (Sangat Tangguh)
COBALT_URL = "https://api.cobalt.tools/api/json"

# Engine 2: Piped API Instances (Fallback)
PIPED_INSTANCES = [
    "https://api.piped.privacydev.net",
    "https://piped-api.lunar.icu",
    "https://pipedapi.leptons.xyz",
    "https://piped-api.hostux.net",
    "https://piped-api.at.v9.io"
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
    """Mencoba ekstraksi menggunakan Cobalt API."""
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    }
    payload = {
        "url": url,
        "videoQuality": "720", # Default
        "audioFormat": "m4a",
        "isAudioOnly": True,
        "isNoQuery": True
    }
    try:
        print(f"Attempting Cobalt API for: {url}")
        resp = requests.post(COBALT_URL, json=payload, headers=headers, timeout=5.0)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("status") == "stream" or data.get("status") == "picker":
                # Ambil URL pertama jika ada picker
                url_res = data.get("url") or (data.get("picker", [{}])[0].get("url"))
                if url_res:
                    print("Cobalt Success!")
                    return url_res
        print(f"Cobalt failed with status: {resp.status_code}")
    except Exception as e:
        print(f"Cobalt Error: {type(e).__name__}")
    return None

def try_piped_extraction(video_id):
    """Fallback ke Piped API jika Cobalt gagal."""
    instances = list(PIPED_INSTANCES)
    random.shuffle(instances)
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    }

    # Hanya coba 1 instance terbaik untuk efisiensi waktu setelah Cobalt
    instance = instances[0]
    try:
        print(f"Attempting Fallback Piped: {instance}")
        api_url = f"{instance}/streams/{video_id}"
        resp = requests.get(api_url, headers=headers, timeout=4.0)
        if resp.status_code == 200:
            streams = resp.json().get('audioStreams', [])
            if streams:
                streams.sort(key=lambda x: x.get('bitrate', 0), reverse=True)
                return streams[0].get('url')
    except Exception as e:
        print(f"Piped Fallback Error: {type(e).__name__}")
    return None

@app.route('/api/extract', methods=['POST'])
def extract():
    try:
        data = request.get_json()
        url = data.get('url', '')
        video_id = extract_video_id(url)
        
        if not video_id:
            return jsonify({"status": "error", "message": "Invalid URL"}), 400

        # Strategi 1: Cobalt
        stream_url = try_cobalt_extraction(url)
        
        # Strategi 2: Piped (Fallback)
        if not stream_url:
            stream_url = try_piped_extraction(video_id)

        if stream_url:
            return jsonify({"status": "success", "stream_url": stream_url, "video_id": video_id})

        return jsonify({"status": "error", "message": "Source blocked by YouTube. Please try another link."}), 503
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000)
