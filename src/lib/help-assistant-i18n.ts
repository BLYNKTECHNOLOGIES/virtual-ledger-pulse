export type Lang = "en" | "hi" | "hinglish";

const dict: Record<string, Record<Lang, string>> = {
  title: { en: "Help Assistant", hi: "सहायता असिस्टेंट", hinglish: "Help Assistant" },
  subtitle: {
    en: "Ask anything about Blynkex ERP processes, SOPs, or compliance.",
    hi: "Blynkex ERP प्रक्रियाओं, SOP, या अनुपालन के बारे में कुछ भी पूछें।",
    hinglish: "Blynkex ERP processes, SOPs ya compliance ke baare mein kuch bhi pucho.",
  },
  newChat: { en: "New chat", hi: "नई बातचीत", hinglish: "Nayi chat" },
  history: { en: "History", hi: "इतिहास", hinglish: "History" },
  placeholder: {
    en: "Type your question… (you can attach images too)",
    hi: "अपना प्रश्न लिखें… (आप चित्र भी जोड़ सकते हैं)",
    hinglish: "Apna sawaal likho… (image bhi attach kar sakte ho)",
  },
  send: { en: "Send", hi: "भेजें", hinglish: "Send" },
  sources: { en: "Sources", hi: "स्रोत", hinglish: "Sources" },
  helpful: { en: "Was this helpful?", hi: "क्या यह सहायक था?", hinglish: "Helpful tha?" },
  attach: { en: "Attach image", hi: "चित्र संलग्न करें", hinglish: "Image attach karo" },
  thinking: { en: "Thinking…", hi: "सोच रहा हूँ…", hinglish: "Soch raha hoon…" },
  manage: { en: "Manage Knowledge Base", hi: "ज्ञान आधार प्रबंधित करें", hinglish: "Knowledge Base manage karo" },
  language: { en: "Language", hi: "भाषा", hinglish: "Language" },
  emptyTitle: {
    en: "Ask me anything",
    hi: "मुझसे कुछ भी पूछें",
    hinglish: "Mujhse kuch bhi pucho",
  },
  emptyHint: {
    en: "I answer from your company's curated SOPs and FAQs only.",
    hi: "मैं केवल आपकी कंपनी के क्यूरेटेड SOP और FAQ से उत्तर देता हूँ।",
    hinglish: "Sirf company ke approved SOPs aur FAQs se answer dunga.",
  },
  rateLimit: { en: "Hourly limit reached. Try again later.", hi: "घंटे की सीमा पूरी हुई। बाद में पुनः प्रयास करें।", hinglish: "Hourly limit khatam. Thodi der baad try karo." },
  error: { en: "Something went wrong.", hi: "कुछ गलत हो गया।", hinglish: "Kuch gadbad ho gayi." },
};

export function t(key: string, lang: Lang): string {
  return dict[key]?.[lang] ?? dict[key]?.en ?? key;
}

export const LANG_OPTIONS: { value: Lang; label: string }[] = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी" },
  { value: "hinglish", label: "Hinglish" },
];
