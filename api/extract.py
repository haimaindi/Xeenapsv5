import re
import os
import requests
import random
from flask import Flask, request, jsonify

app = Flask(__name__)

# Daftar instance Cobalt (Dirotasi)
COBALT_INSTANCES = [
    "https://api.cobalt.tools/api/json",
    "https://cobalt.sh/api/json",
    "https://api.wuk.sh/api/json",
    "https://co.wuk.sh/api/json",
    "https://cobalt2.mrcy.xyz/api/json"
]

# Daftar instance Invidious (Fallback paling stabil)
INVIDIOUS_INSTANCES = [
    "https://invidious.snopyta.org",
    "https://yewtu.be",
    "https://invidious.kavin.rocks",
    "https://inv.riverside.rocks",
    "https://invidious.sethforprivacy.com",
    "https://invidious.tiekoetter.com",
    "https://inv.vern.cc",
    "https://invidious.nerdvpn.de"
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
    """Mencoba ekstraksi audio via Cobalt API."""
    instances = list(COBALT_INSTANCES)
    random.shuffle(instances)
    
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
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
            print(f"Checking Cobalt Instance: {instance}")
            resp = requests.post(instance, json=payload, headers=headers, timeout=6.0)
            if resp.status_code == 200:
                data = resp.json()
                # Kadang ada di data['url'], kadang di picker
                url_res = data.get("url") or (data.get("picker", [{}])[0].get("url") if data.get("picker") else None)
                if url_res:
                    print(f"Success Cobalt: {instance}")
                    return url_res
            print(f"Cobalt {instance} failed with {resp.status_code}")
        except Exception as e:
            print(f"Error {instance}: {str(e)}")
            continue
    return None

def try_invidious_extraction(video_id):
    """Fallback ke Invidious untuk mendapatkan direct stream link."""
    instances = list(INVIDIOUS_INSTANCES)
    random.shuffle(instances)
    
    for instance in instances:
        try:
            print(f"Checking Invidious: {instance}")
            api_url = f"{instance}/api/v1/videos/{video_id}"
            resp = requests.get(api_url, timeout=5.0)
            if resp.status_code == 200:
                data = resp.json()
                formats = data.get('adaptiveFormats', [])
                # Cari format audio saja
                audio_streams = [f for f in formats if 'audio' in f.get('type', '').lower()]
                if audio_streams:
                    # Sort by quality (bitrate)
                    audio_streams.sort(key=lambda x: int(x.get('bitrate', 0)), reverse=True)
                    print(f"Success Invidious: {instance}")
                    return audio_streams[0].get('url')
        except:
            continue
    return None

@app.route('/api/extract', methods=['POST'])
def extract():
    print("Vercel Extract API Called")
    try:
        if not request.is_json:
            return jsonify({"status": "error", "message": "JSON Body required"}), 400
            
        data = request.get_json()
        url = data.get('url', '')
        video_id = extract_video_id(url)
        
        if not video_id:
            return jsonify({"status": "error", "message": "Invalid YouTube URL"}), 400

        print(f"Processing Video ID: {video_id}")

        # 1. Coba Cobalt (Audio-first)
        stream_url = try_cobalt_extraction(url)
        
        # 2. Fallback ke Invidious
        if not stream_url:
            print("Cobalt failed, trying Invidious...")
            stream_url = try_invidious_extraction(video_id)

        if stream_url:
            return jsonify({
                "status": "success", 
                "stream_url": stream_url, 
                "video_id": video_id
            })

        print("All engines failed for this video.")
        return jsonify({
            "status": "error", 
            "message": "YouTube stream currently unavailable from this server region."
        }), 503
        
    except Exception as e:
        print(f"Fatal Python Error: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000)
