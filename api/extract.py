
import re
import requests
import random
from flask import Flask, request, jsonify

app = Flask(__name__)

# Provider 1: Public Converter APIs (Paling Stabil untuk Audio)
# Menggunakan struktur API yang mirip dengan yang Anda sarankan
CONVERTER_APIS = [
    "https://api.vevioz.com/api/button/mp3/",
    "https://api8.mp3youtube.download/api/widget/v1/get?url=",
    "https://api.loader.to/api/get?format=mp3&url="
]

# Provider 2: Cobalt Instances (Fallback)
COBALT_INSTANCES = [
    "https://api.cobalt.tools/api/json",
    "https://cobalt.sh/api/json",
    "https://co.wuk.sh/api/json"
]

def extract_video_id(url):
    patterns = [
        r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})',
        r'youtu\.be\/([a-zA-Z0-9_-]{11})'
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match: return match.group(1)
    return None

def try_fast_converter(url):
    """Mencoba mendapatkan link MP3 dari converter pihak ketiga."""
    # Kita coba loader.to atau vevioz yang seringkali memberikan direct link via API
    video_id = extract_video_id(url)
    try:
        # Contoh menggunakan loader.to API (sangat cepat)
        api_url = f"https://api.loader.to/api/get?format=mp3&url={url}"
        resp = requests.get(api_url, timeout=5.0)
        if resp.status_code == 200:
            data = resp.json()
            if data.get('success') and data.get('url'):
                print("Success via Loader.to")
                return data.get('url')
    except:
        pass
    return None

def try_cobalt_extraction(url):
    """Fallback ke Cobalt."""
    instances = list(COBALT_INSTANCES)
    random.shuffle(instances)
    payload = {"url": url, "downloadMode": "audio", "audioFormat": "mp3"}
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    
    for instance in instances:
        try:
            resp = requests.post(instance, json=payload, headers=headers, timeout=6.0)
            if resp.status_code == 200:
                data = resp.json()
                res_url = data.get("url") or (data.get("picker", [{}])[0].get("url") if data.get("picker") else None)
                if res_url: return res_url
        except: continue
    return None

@app.route('/api/extract', methods=['POST'])
def extract():
    try:
        data = request.get_json()
        url = data.get('url', '')
        video_id = extract_video_id(url)
        
        if not video_id:
            return jsonify({"status": "error", "message": "Invalid URL"}), 400

        # Strategi 1: Fast Converter (MP3 Pihak Ketiga)
        stream_url = try_fast_converter(url)
        
        # Strategi 2: Cobalt
        if not stream_url:
            stream_url = try_cobalt_extraction(url)

        if stream_url:
            return jsonify({
                "status": "success", 
                "stream_url": stream_url,
                "provider": "external_converter" if "loader.to" in stream_url else "cobalt"
            })

        return jsonify({"status": "error", "message": "No stream found"}), 503
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
