/**
 * XEENAPS PKM - GEMINI AI SERVICE
 */

function callGeminiService(prompt, modelOverride) {
  const keys = getKeysFromSheet('ApiKeys', 1);
  if (!keys || keys.length === 0) return { status: 'error', message: 'No Gemini API keys found in database.' };

  const config = getProviderModel('GEMINI');
  const model = modelOverride || config.model;

  for (let key of keys) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      const payload = { contents: [{ parts: [{ text: prompt }] }] };
      
      const res = UrlFetchApp.fetch(url, { 
        method: "post", 
        contentType: "application/json", 
        payload: JSON.stringify(payload), 
        muteHttpExceptions: true 
      });
      
      const responseData = JSON.parse(res.getContentText());
      if (responseData.candidates && responseData.candidates.length > 0) {
        const responseText = responseData.candidates[0].content.parts[0].text;
        return { status: 'success', data: responseText };
      }
    } catch (err) {
      console.log("Gemini rotation: key failed, trying next...");
    }
  }
  return { status: 'error', message: 'Gemini service is currently unavailable.' };
}