// Turkish notifications to the owner's private Telegram bot. Plain text only (no parse_mode), so
// nothing a visitor types can add formatting or hidden links. The token is never logged.

const MAX = 3800;

export function leadMessage({ source, lead, contact, page, lang, langName, transcript }) {
  const lines = [
    source === "manual" ? "Asistan: ziyaretçi sohbeti ekibe gönderdi" : "Asistan: yeni potansiyel müşteri",
    "",
  ];
  const add = (label, value) => {
    if (value) lines.push(`${label}: ${value}`);
  };
  add("İsim", contact.name || lead.name);
  add("E-posta", contact.email || lead.email);
  add("Telefon", contact.phone || lead.phone);
  add("İhtiyaç", lead.need);
  add("Bütçe", lead.budget);
  add("Zaman planı", lead.timeline);
  add("Sayfa", page);
  add("Dil", `${lang} (${langName})`);
  if (transcript && transcript.length) {
    lines.push("", "Son mesajlar:");
    for (const m of transcript) {
      lines.push(`${m.role === "user" ? "Ziyaretçi" : "Asistan"}: ${m.content.replace(/\s+/g, " ").slice(0, 400)}`);
    }
  }
  lines.push("", "Lütfen 2 iş günü içinde dönüş yapın. Bu mesaj otomatik gönderildi.");
  const text = lines.join("\n");
  return text.length > MAX ? `${text.slice(0, MAX)}\n…(kısaltıldı)` : text;
}

export async function sendTelegram(fetchImpl, env, text) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chat = env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return false;
  try {
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
    });
    if (!response.ok) console.log(`telegram: HTTP ${response.status}`);
    return response.ok;
  } catch {
    console.log("telegram: network error");
    return false;
  }
}
