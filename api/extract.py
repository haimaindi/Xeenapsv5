import re
import os
import requests
import random
from flask import Flask, request, jsonify

app = Flask(__name__)

# Daftar instance Piped yang saat ini paling kompatibel dengan Vercel/Cloud
# Dipilih yang tidak menggunakan proteksi Cloudflare agresif yang sering 403
STABLE_INSTANCES = [
    "https://api.piped.privacydev.net",
    "https://piped-api.lunar.icu",
    "https://piped-api.hostux.net",
    "https://piped-api.at.v9.io",
    "https://pipedapi.kavin.rocks"
]

def extract_video_id(url):
    """Mengekstrak ID video YouTube."""
    patterns = [
        r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})',
        r'youtube\.be\/([a-zA-Z0-9_-]{11})',
        r'youtube\.com\/embed\/([a-zA-Z0-9_-]{11})',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    if len(url) == 11:
        return url
    return None

def get_audio_stream_url(video_id):
    """Mendapatkan URL stream dengan strategi 'Fast Fail' (Max 2 attempts)."""
    if not video_id:
        return None

    instances = list(STABLE_INSTANCES)
    random.shuffle(instances)

    # Headers yang lebih minimalis terkadang lebih baik menembus bot-detection
    headers = {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
    }

    # Kita hanya mencoba 2 instance. 
    # Vercel limit adalah 10 detik. Jika kita mencoba 3 instance dengan timeout 3s, 
    # total waktu bisa 9s+ (resiko timeout). 
    # Dengan 2 instance x 4.5s = 9s, masih ada 1s untuk overhead.
    max_attempts = 2
    
    for i in range(max_attempts):
        instance = instances[i]
        try:
            print(f"[{i+1}/{max_attempts}] Trying {instance} for ID: {video_id}")
            api_url = f"{instance}/streams/{video_id}"
            
            # Timeout 4.5 detik untuk memberi ruang pada server yang agak lambat
            resp = requests.get(api_url, headers=headers, timeout=4.5)
            
            if resp.status_code == 200:
                data = resp.json()
                audio_streams = data.get('audioStreams', [])
                if audio_streams:
                    # Ambil yang bitrate paling stabil (biasanya m4a/128kbps)
                    audio_streams.sort(key=lambda x: x.get('bitrate', 0), reverse=True)
                    print(f"Found! Stream URL extracted from {instance}")
                    return audio_streams[0].get('url')
            else:
                print(f"Failed: {instance} responded with {resp.status_code}")
                
        except requests.exceptions.Timeout:
            print(f"Timeout: {instance} took too long (> 4.5s)")
        except requests.exceptions.RequestException as e:
            print(f"Error: {instance} unreachable ({type(e).__name__})")
            
    return None

@app.route('/api/extract', methods=['POST'])
def extract():
    try:
        # Pengecekan JSON dasar
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
        
        # 503 jika semua percobaan gagal agar user tahu ini masalah eksternal
        return jsonify({
            "status": "error", 
            "message": "All Piped nodes failed. YouTube is likely blocking extraction from this region."
        }), 503
        
    except Exception as e:
        print(f"FATAL ERROR: {str(e)}")
        return jsonify({"status": "error", "message": "System error during extraction"}), 500

if __name__ == '__main__':
    # Flask lokal (Vercel menggunakan handler otomatis)
    app.run(port=5000)
