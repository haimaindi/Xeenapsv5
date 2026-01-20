/**
 * XEENAPS PKM - YOUTUBE EXTRACTION MODULE
 */

function handleYoutubeExtraction(url) {
  let videoId = "";
  if (url.includes('youtu.be/')) {
    videoId = url.split('/').pop().split('?')[0];
  } else {
    const match = url.match(/v=([^&]+)/);
    videoId = match ? match[1] : "";
  }

  if (videoId) {
    const ytInfo = getYoutubeVideoInfo(videoId);
    const captions = getYoutubeOfficialCaptions(videoId);
    
    return `YOUTUBE_METADATA:\n` +
           `Title: ${ytInfo.title}\n` +
           `Channel: ${ytInfo.channel}\n` +
           `Date: ${ytInfo.publishedAt}\n` +
           `Description: ${ytInfo.description}\n` +
           `Keywords: ${ytInfo.tags}\n\n` +
           `OFFICIAL_CAPTIONS:\n${captions || "No official captions found. Analyzing via Metadata only."}`;
  }
  throw new Error("Could not extract Video ID from the provided YouTube URL.");
}

function getYoutubeVideoInfo(videoId) {
  try {
    const response = YouTube.Videos.list('snippet', { id: videoId });
    if (response.items && response.items.length > 0) {
      const snip = response.items[0].snippet;
      return {
        title: snip.title,
        channel: snip.channelTitle,
        description: snip.description,
        tags: (snip.tags || []).join(', '),
        publishedAt: snip.publishedAt
      };
    }
  } catch (e) { console.error("YouTube API Error: " + e.toString()); }
  return { title: "Unknown Video", channel: "Unknown", description: "", tags: "", publishedAt: "-" };
}

function getYoutubeOfficialCaptions(videoId) {
  try {
    const response = UrlFetchApp.fetch(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=srv1`, { muteHttpExceptions: true });
    if (response.getResponseCode() === 200 && response.getContentText().length > 100) {
      return response.getContentText().replace(/<[^>]*>/g, ' ');
    }
  } catch (e) {}
  return null;
}