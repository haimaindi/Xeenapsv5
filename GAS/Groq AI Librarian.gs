/**
 * XEENAPS PKM - GROQ AI LIBRARIAN SERVICE
 */

function callGroqLibrarian(prompt, modelOverride) {
  const keys = getKeysFromSheet('Groq', 2);
  if (!keys || keys.length === 0) return { status: 'error', message: 'No Groq keys found in database.' };
  
  const config = getProviderModel('groq');
  const model = modelOverride || config.model;

  for (let key of keys) {
    try {
      const url = "https://api.groq.com/openai/v1/chat/completions";
      const payload = { 
        model: model, 
        messages: [
          { role: "system", content: "You are the Xeenaps AI Librarian. An expert in academic metadata extraction, knowledge organization, and deep conceptual analysis. Always respond in valid JSON format as requested." }, 
          { role: "user", content: prompt }
        ], 
        temperature: 0.1, 
        response_format: { type: "json_object" } 
      };
      
      const res = UrlFetchApp.fetch(url, { 
        method: "post", 
        contentType: "application/json", 
        headers: { "Authorization": "Bearer " + key }, 
        payload: JSON.stringify(payload), 
        muteHttpExceptions: true 
      });
      
      const responseData = JSON.parse(res.getContentText());
      if (responseData.choices && responseData.choices.length > 0) {
        const responseText = responseData.choices[0].message.content;
        return { status: 'success', data: responseText };
      }
    } catch (err) {
      console.log("Groq rotation: key failed, trying next...");
    }
  }
  return { status: 'error', message: 'The Groq AI Librarian service is currently busy. Please try again later.' };
}