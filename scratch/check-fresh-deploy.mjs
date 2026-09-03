const res = await fetch("https://heat-chat-beta.vercel.app/api/conversations/not-a-uuid/media", {
  headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" }
});
console.log("Status on malformed UUID media endpoint:", res.status);
const text = await res.text();
console.log("Body:", text);
