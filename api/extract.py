import re
import requests
from flask import Flask, request, jsonify
from youtube_transcript_api import YouTubeTranscriptApi

app = Flask(__name__)

# Set max content length to 25MB
app.config['MAX_CONTENT_LENGTH'] = 25 * 1024 * 1024

def extract_youtube_data(url):
    video_id = None
    if 'youtu.be/' in url:
        video_id = url.split('/')[-1].split('?')[0]
    elif 'youtube.com/watch' in url:
        match = re.search(r'v=([^&]+)', url)
        if match:
            video_id = match.group(1)
    
    if not video_id:
        return "Error: Could not extract Video ID from YouTube URL."

    metadata_text = ""
    metadata_found = False
    try:
        # Use oEmbed for basic metadata (Title, Author/Channel)
        oembed_url = f"https://www.youtube.com/oembed?url={url}&format=json"
        resp = requests.get(oembed_url, timeout=10).json()
        metadata_text = f"YOUTUBE_METADATA:\nTitle: {resp.get('title')}\nChannel: {resp.get('author_name')}\n"
        metadata_found = True
    except Exception as e:
        metadata_text = "YOUTUBE_METADATA: (Metadata retrieval failed)\n"

    transcript_text = ""
    try:
        # Try fetching transcript (Indonesian priority, then English)
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id, languages=['id', 'en'])
        transcript_text = " ".join([t['text'] for t in transcript_list])
    except Exception as e:
        transcript_text = f"(No transcript available for this video. Reason: {str(e)})"

    return f"{metadata_text}\nTRANSCRIPT CONTENT:\n{transcript_text}"

@app.route('/api/extract', methods=['POST'])
def extract():
    try:
        if request.is_json:
            data = request.get_json()
            url = data.get('url')
            if url and ('youtube.com' in url or 'youtu.be' in url):
                result_text = extract_youtube_data(url)
                # Success as long as we have some text to show (metadata or transcript)
                if "YOUTUBE_METADATA" in result_text:
                    return jsonify({"status": "success", "data": result_text})
        
        return jsonify({"status": "error", "message": "Invalid request. Provide a YouTube URL via JSON."}), 400
        
    except Exception as e:
        print(f"Extraction error: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000)