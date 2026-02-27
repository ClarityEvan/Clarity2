module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const elevenKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  if (!anthropicKey) { res.status(500).json({ error: 'API key not configured.' }); return; }

  try {
    const { messages, system } = req.body;

    // Check if this looks like a report generation request
    const lastMsg = messages[messages.length - 1];
    const isReportRequest = lastMsg && (
      lastMsg.content.toLowerCase().includes('report') ||
      lastMsg.content.toLowerCase().includes('json')
    );

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: isReportRequest ? 2000 : 1024,
        system,
        messages
      })
    });

    const claudeData = await claudeRes.json();
    if (!claudeRes.ok) {
      res.status(claudeRes.status).json({ error: claudeData.error?.message || 'Claude API error' });
      return;
    }

    const text = claudeData.content?.[0]?.text || '';
    const isReport = text.includes('REPORT:');
    let audioBase64 = null;

    // Only generate voice for conversational responses, not reports
    if (!isReport && elevenKey && voiceId) {
      const speakText = text
        .split('\n')
        .filter(l => l.indexOf('INSIGHT:') !== 0)
        .join('\n')
        .replace(/\*\*/g, '')
        .trim();

      if (speakText.length > 0 && speakText.length < 2000) {
        try {
          const elevenRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'xi-api-key': elevenKey
            },
            body: JSON.stringify({
              text: speakText,
              model_id: 'eleven_turbo_v2',
              voice_settings: { stability: 0.5, similarity_boost: 0.75 }
            })
          });
          if (elevenRes.ok) {
            const buf = await elevenRes.arrayBuffer();
            audioBase64 = Buffer.from(buf).toString('base64');
          }
        } catch (e) {}
      }
    }

    res.status(200).json({ text, audioBase64 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
