import re
import os
import requests
from flask import Flask, request, jsonify

app = Flask(__name__)

# Daftar instance Piped yang lebih stabil (diurutkan berdasarkan reliabilitas terbaru)
PIPED_INSTANCES = [
    "https://pipedapi.kavin.rocks",
    "https://piped-api.garudalinux.org",
    "https://api.piped.victr.me",
    "https://pipedapi.leptons.xyz",
    "https://pa.il.ax"
]

def extract_video_id(url):
    """Mengekstrak ID video dari berbagai format URL YouTube."""
    patterns = [
        r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})',
        r'youtube\.com\/embed\/([a-zA-Z0-9_-]{11})',
        r'youtube\.com\/v\/([a-zA-Z0-9_-]{11})',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    # Jika tidak ada pola yang cocok, cek apakah input adalah 11 karakter ID langsung
    if len(url) == 11 and re.match(r'^[a-zA-Z0-9_-]+$', url):
        return url
    return None

def get_audio_stream_url(video_id):
    """Mencoba mendapatkan URL stream audio dari daftar instance Piped."""
    if not video_id:
        return None

    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Origin': 'https://piped.video'
    }

    # Coba maksimal 3 instance untuk menjaga total waktu di bawah limit Vercel (10s)
    # Gunakan timeout sedikit lebih longgar (3s) per percobaan
    attempted = 0
    for instance in PIPED_INSTANCES:
        if attempted >= 3:
            break
        try:
            api_url = f"{instance}/streams/{video_id}"
            resp = requests.get(api_url, headers=headers, timeout=3.0)
            
            if resp.status_code == 200:
                data = resp.json()
                audio_streams = data.get('audioStreams', [])
                if audio_streams:
                    # Ambil bitrate tertinggi (biasanya elemen pertama)
                    audio_streams.sort(key=lambda x: x.get('bitrate', 0), reverse=True)
                    return audio_streams[0].get('url')
            attempted += 1
        except Exception as e:
            print(f"Error on {instance}: {str(e)}")
            attempted += 1
            continue

    return None

@app.route('/api/extract', methods=['POST'])
def extract():
    try:
        if not request.is_json:
            return jsonify({"status": "error", "message": "JSON body is required"}), 400
            
        data = request.get_json()
        url = data.get('url')
        
        if not url:
            return jsonify({"status": "error", "message": "Missing 'url' parameter"}), 400
            
        video_id = extract_video_id(url)
        if not video_id:
            return jsonify({"status": "error", "message": "Invalid YouTube URL format"}), 400

        stream_url = get_audio_stream_url(video_id)
        
        if stream_url:
            return jsonify({
                "status": "success",
                "video_id": video_id,
                "stream_url": stream_url
            })
        else:
            # Menggunakan 503 Service Unavailable karena kegagalan pihak ketiga (Piped)
            return jsonify({
                "status": "error", 
                "message": "YouTube audio extraction temporarily unavailable. All Piped instances failed or timed out."
            }), 503
        
    except Exception as e:
        # Menghindari crash aplikasi, kembalikan 500 dengan detail error
        return jsonify({"status": "error", "message": f"Server crash: {str(e)}"}), 500

if __name__ == '__main__':
    # Mode lokal (tidak digunakan di Vercel)
    app.run(port=5000)
