async function check() {
  const loginRes = await fetch("https://heat-chat-beta.vercel.app/login");
  const loginText = await loginRes.text();
  const buildIdMatch = loginText.match(/<!--([a-zA-Z0-9_-]+)-->/);
  console.log("Live Build ID:", buildIdMatch ? buildIdMatch[1] : "unknown");

  const chatRes = await fetch("https://heat-chat-beta.vercel.app/chat");
  const chatText = await chatRes.text();

  const scriptMatches = [...chatText.matchAll(/src="(\/_next\/static\/chunks\/[^"]+)"/g)].map(m => m[1]);
  console.log("Discovered chunks on /chat:", scriptMatches.length);

  let hasVoicePlayer = false;
  let hasCollisionMenu = false;

  for (const s of scriptMatches) {
    const js = await fetch("https://heat-chat-beta.vercel.app" + s).then(r => r.text());
    if (js.includes("Voice message") || js.includes("voice-message-player")) {
      hasVoicePlayer = true;
      console.log("✓ Found VoiceMessagePlayer in", s);
    }
    if (js.includes("max(8") || js.includes("idealLeft") || js.includes("maxWidth:calc(100vw - 16px)")) {
      hasCollisionMenu = true;
      console.log("✓ Found collision-aware context menu in", s);
    }
  }

  console.log("Summary:", { hasVoicePlayer, hasCollisionMenu });
}

check().catch(console.error);
