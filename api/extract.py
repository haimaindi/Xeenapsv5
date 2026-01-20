import re
import os
import requests
from flask import Flask, request, jsonify
import yt_dlp

app = Flask(__name__)

# Set max content length to 25MB
app.config['MAX_CONTENT_LENGTH'] = 25 * 1024 * 1024

def get_audio_stream_url(url):
    """
    Extracts the direct audio stream URL using yt-dlp.
    Does not download the file, just retrieves the URL for the best m4a/aac stream.
    """
    ydl_opts = {
        'format': 'bestaudio[ext=m4a]/bestaudio',
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return info.get('url')
    except Exception as e:
        print(f"yt-dlp error: {str(e)}")
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
                return jsonify({"status": "error", "message": "Could not extract stream URL."}), 500
        
        return jsonify({"status": "error", "message": "Invalid YouTube URL provided."}), 400
        
    except Exception as e:
        print(f"Extraction error: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000)