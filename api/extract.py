import re
import random
import requests
from flask import Flask, request, jsonify

app = Flask(__name__)

# ⚡ HANYA 2 INSTANCE PIPED YANG PALING STABLE ⚡
PIPED_INSTANCES = [
    "https://pipedapi.kavin.rocks",     # Primary - paling stabil
    "https://pa.il.ax",                 # Backup - cepat
]

def extract_video_id(url):
    # ... (sama seperti sebelumnya) ...

def get_audio_stream_url(url):
    video_id = extract_video_id(url)
    if not video_id:
        return None

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Origin': 'https://piped.video'
    }

    # 🎯 HANYA COBA 2 INSTANCE PIPED SAJA
    for instance in PIPED_INSTANCES:
        try:
            api_url = f"{instance}/streams/{video_id}"
            # Timeout: 4 detik per instance (total max 8 detik)
            resp = requests.get(api_url, headers=headers, timeout=4)
            
            if resp.status_code == 200:
                data = resp.json()
                audio_streams = data.get('audioStreams', [])
                
                if audio_streams:
                    # Ambil medium quality (biasanya index 1 atau 2)
                    # Hindari highest quality yang mungkin terlalu besar
                    if len(audio_streams) >= 2:
                        return audio_streams[1].get('url')  # Medium quality
                    return audio_streams[0].get('url')
                    
        except Exception as e:
            print(f"Instance {instance} failed: {str(e)[:50]}")
            continue

    return None

@app.route('/api/extract', methods=['POST'])
def extract():
    try:
        if not request.is_json:
            return jsonify({"status": "error", "message": "JSON required"}), 400
            
        data = request.get_json()
        url = data.get('url')
        
        if not url:
            return jsonify({"status": "error", "message": "URL missing"}), 400
        
        # Validasi YouTube URL sederhana
        if not ('youtube.com' in url or 'youtu.be' in url):
            return jsonify({"status": "error", "message": "Not a YouTube URL"}), 400
            
        stream_url = get_audio_stream_url(url)
        
        if stream_url:
            return jsonify({
                "status": "success",
                "stream_url": stream_url
            })
        else:
            return jsonify({
                "status": "error", 
                "message": "Failed to extract audio. Video mungkin private/regional."
            }), 500
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000)