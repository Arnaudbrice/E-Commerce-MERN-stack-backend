import { OpenAI } from "openai";
import Product from "../models/Product.js";

//********** CONFIG **********

const llm =
  process.env.GROQ_API_KEY ?
    new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    })
  : null;

const LLM_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const FRONTEND_BASE_URL =
  process.env.FRONTEND_BASE_URL || "http://localhost:5173";
const DEFAULT_K = Number(process.env.CHAT_K || 3);
const RETRIEVE_LIMIT = Number(process.env.CHAT_RETRIEVE_LIMIT || 60);
const HISTORY_LIMIT = Number(process.env.CHAT_HISTORY_LIMIT || 8);

const ALLOWED_CATEGORIES = [
  "Electronics",
  "Jewelry",
  "Men's Clothing",
  "Women's Clothing",
  "Kids's Clothing",
  "Books",
  "Home",
  "Beauty",
  "Sports",
  "Other",
];

//********** SMALL TALK / FALLBACKS **********

const SMALL_TALK = {
  greeting: {
    en: "Hi! I can help you find products. Tell me what you're looking for — a category, budget, or who it's for.",
    de: "Hallo! Ich helfe dir beim Finden von Produkten. Sag mir, was du suchst — Kategorie, Budget oder für wen.",
    fr: "Salut ! Je peux t'aider à trouver des produits. Dis-moi ce que tu cherches — catégorie, budget ou pour qui.",
    es: "¡Hola! Puedo ayudarte a encontrar productos. Dime qué buscas — categoría, presupuesto o para quién.",
    it: "Ciao! Posso aiutarti a trovare prodotti. Dimmi cosa cerchi — categoria, budget o per chi.",
  },
  thanks: {
    en: "You're welcome! Let me know if you need more product recommendations.",
    de: "Gern geschehen! Sag Bescheid, wenn du weitere Empfehlungen brauchst.",
    fr: "Avec plaisir ! Dis-moi si tu veux d'autres recommandations.",
    es: "¡Con gusto! Avísame si quieres más recomendaciones.",
    it: "Prego! Dimmi se vuoi altri consigli.",
  },
  bye: {
    en: "Goodbye! Come back anytime for product recommendations.",
    de: "Tschüss! Komm jederzeit wieder für Produktempfehlungen.",
    fr: "À bientôt ! Reviens quand tu veux pour des recommandations.",
    es: "¡Hasta pronto! Vuelve cuando quieras para más recomendaciones.",
    it: "A presto! Torna quando vuoi per altri consigli.",
  },
};

const FALLBACK_TEXT = {
  giftQuestion: {
    en: "Who is the gift for (e.g., son, daughter, husband, wife) and what's your budget?",
    de: "Für wen ist das Geschenk (z.B. Sohn, Tochter, Mann, Frau) und welches Budget hast du?",
    fr: "Pour qui est le cadeau (ex : fils, fille, mari, femme) et quel est votre budget ?",
    es: "¿Para quién es el regalo (ej.: hijo, hija, esposo, esposa) y cuál es tu presupuesto?",
    it: "Per chi è il regalo (es.: figlio, figlia, marito, moglie) e qual è il tuo budget?",
  },
  noResults: {
    en: "I couldn't find matching products. Try a different category or budget.",
    de: "Ich konnte keine passenden Produkte finden. Versuche eine andere Kategorie oder ein anderes Budget.",
    fr: "Je n'ai pas trouvé de produits correspondants. Essayez une autre catégorie ou budget.",
    es: "No encontré productos que coincidan. Prueba con otra categoría o presupuesto.",
    it: "Non ho trovato prodotti corrispondenti. Prova un'altra categoria o budget.",
  },
  introFallback: {
    en: "Here are my recommendations:",
    de: "Hier sind meine Empfehlungen:",
    fr: "Voici mes recommandations :",
    es: "Aquí están mis recomendaciones:",
    it: "Ecco i miei suggerimenti:",
  },
};

function tr(dict, lang) {
  return dict?.[lang] || dict?.en || "";
}

/****************************************
 *   AI UNDERSTANDING (single LLM call)
 ****************************************/

/**
 * Use the LLM to understand the user message in one call:
 * - Detect language
 * - Classify intent
 * - Extract entities (categories, price range, recipient, search keywords)
 *
 * Returns structured JSON. Falls back to basic defaults if LLM is unavailable.
 * for example, "I'm looking for a cheap gift for my son" ->
 * {
 *   language: "en",
 *   intent: "product_search",
 *   categories: ["gift"],
 *   minPrice: 0,
 *   maxPrice: null,
 *   recipient: "son",
 *   keywords: ["cheap", "gift", "son"],
 *   isGiftWithoutRecipient: false,
 * }
 */
async function understandMessage(message, history = []) {
  // Fallback if no LLM configured
  if (!llm) {
    return {
      language: "en",
      intent: "product_search",
      categories: [],
      minPrice: null,
      maxPrice: null,
      recipient: null,
      keywords: message
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2),
      isGiftWithoutRecipient: false,
    };
  }

  const historyMessages = history.slice(-HISTORY_LIMIT).map((h) => ({
    role: h.role === "user" ? "user" : "assistant",
    content: String(h.content || "").slice(0, 300),
  }));

  const system = `You are a message analyzer for an e-commerce store called "Bon Marché".
Your job is to analyze the user's message and return structured JSON. Nothing else.

Analyze the LATEST user message. Use conversation history for context only.

Return EXACTLY this JSON structure (no markdown, no explanation, just valid JSON):
{
  "language": "<ISO 639-1 code of the language the user is writing in, e.g. en, de, fr, es, it, pt, nl, ar, ru>",
  "intent": "<one of: greeting, thanks, bye, product_search, followup, gift_without_recipient>",
  "categories": [<array of matching store categories from this list ONLY: ${ALLOWED_CATEGORIES.map((c) => `"${c}"`).join(", ")}>],
  "minPrice": <number or null>,
  "maxPrice": <number or null>,
  "recipient": <one of: "son", "daughter", "men", "women", "kids", or null>,
  "keywords": [<array of English search keywords to find relevant products in our database. Translate non-English product terms to English. Keep brand names as-is. Max 5 keywords.>]
}

Rules:
- "intent" is "greeting" for hi/hello/hey in any language.
- "intent" is "thanks" for thank you/merci/danke in any language.
- "intent" is "bye" for goodbye/au revoir/tschüss in any language.
- "intent" is "gift_without_recipient" when user mentions a gift/present/cadeau/geschenk but does NOT specify for whom.
- "intent" is "followup" when user says things like "cheaper", "more", "similar", "yes", "ok" referencing previous results.
- "intent" is "product_search" for any product-related query.
- "keywords" should be in ENGLISH even if the user writes in another language. E.g. "bagues" → ["ring", "rings"]. "chaussures" → ["shoes"]. "Schuhe" → ["shoes"].
- "categories" must only contain values from the allowed list above. Map user intent to the closest category.
- For price, extract any mentioned budget/price range. "under 50€" → maxPrice: 50. "between 20 and 50" → minPrice: 20, maxPrice: 50.
- Always detect the language from the LATEST user message. If it's too short (e.g. "ok"), use the previous user message's language.`;

  try {
    const resp = await llm.chat.completions.create({
      model: LLM_MODEL,
      temperature: 0,
      max_tokens: 300,
      messages: [
        { role: "system", content: system },
        ...historyMessages,
        { role: "user", content: message },
      ],
    });

    const raw = resp?.choices?.[0]?.message?.content?.trim() || "";

    // Remove markdown code block markers if present in the model's output
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "");

    const parsed = JSON.parse(cleaned);

    return {
      language: parsed.language || "en",
      intent: parsed.intent || "product_search",
      categories:
        Array.isArray(parsed.categories) ?
          parsed.categories.filter((c) => ALLOWED_CATEGORIES.includes(c))
        : [],
      minPrice: typeof parsed.minPrice === "number" ? parsed.minPrice : null,
      maxPrice: typeof parsed.maxPrice === "number" ? parsed.maxPrice : null,
      recipient: parsed.recipient || null,
      keywords:
        Array.isArray(parsed.keywords) ?
          parsed.keywords.map((k) => String(k).toLowerCase()).slice(0, 8)
        : [],
      isGiftWithoutRecipient: parsed.intent === "gift_without_recipient",
    };
  } catch (e) {
    console.error("understandMessage error:", e);
    // Graceful fallback — handle like a product search in English
    return {
      language: "en",
      intent: "product_search",
      categories: [],
      minPrice: null,
      maxPrice: null,
      recipient: null,
      keywords: message
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2),
      isGiftWithoutRecipient: false,
    };
  }
}

//********** RECIPIENT RULES **********

function applyRecipientRules(recipient, preferCategories = []) {
  const prefer = new Set(preferCategories);
  const avoid = new Set();

  const rules = {
    son: {
      prefer: ["Men's Clothing", "Sports", "Electronics", "Kids's Clothing"],
      avoid: ["Women's Clothing", "Beauty", "Jewelry"],
    },
    men: {
      prefer: ["Men's Clothing", "Sports", "Electronics"],
      avoid: ["Women's Clothing", "Beauty", "Jewelry"],
    },
    daughter: {
      prefer: ["Women's Clothing", "Beauty", "Jewelry", "Kids's Clothing"],
      avoid: ["Men's Clothing"],
    },
    women: {
      prefer: ["Women's Clothing", "Beauty", "Jewelry"],
      avoid: ["Men's Clothing"],
    },
    kids: {
      prefer: ["Kids's Clothing", "Sports", "Books", "Electronics"],
      avoid: [],
    },
  };

  const r = rules[recipient];
  if (r) {
    r.prefer.forEach((c) => prefer.add(c));
    r.avoid.forEach((c) => avoid.add(c));
  }

  return {
    prefer: Array.from(prefer).filter((c) => ALLOWED_CATEGORIES.includes(c)),
    avoid: Array.from(avoid).filter((c) => ALLOWED_CATEGORIES.includes(c)),
  };
}

//********** RETRIEVAL + SCORING **********

async function retrieveProducts({
  keywords,
  preferCategories = [],
  avoidCategories = [],
  minPrice = null,
  maxPrice = null,
  limit = RETRIEVE_LIMIT,
}) {
  const filter = {};

  if (minPrice != null || maxPrice != null) {
    filter.price = {};
    if (minPrice != null) filter.price.$gte = minPrice;
    if (maxPrice != null) filter.price.$lte = maxPrice;
  }

  if (avoidCategories.length) {
    filter.category = { $nin: avoidCategories };
  }

  const searchQuery = keywords.join(" ");
  let products = [];

  // 1) Text index search
  if (searchQuery) {
    try {
      products = await Product.find({
        ...filter,
        $text: { $search: searchQuery }, // Use MongoDB text index for efficient word (exact word match) search (faster) rather than $regex (partial word match) . Make sure to create a text index on title, description, and category fields in the Product collection.
      })
        .select(
          "title description price category image averageRating createdAt",
        )
        .select({ score: { $meta: "textScore" } })
        .sort({ score: { $meta: "textScore" } })
        .limit(limit)
        .lean();
    } catch {
      products = [];
    }
  }

  // 2) Regex fallback
  if (!products.length && keywords.length) {
    const regexConditions = keywords.slice(0, 8).flatMap((kw) => {
      const safe = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(safe, "i");
      return [{ title: re }, { description: re }, { category: re }];
    });

    products = await Product.find({ ...filter, $or: regexConditions })
      .select("title description price category image averageRating createdAt")
      .sort({ averageRating: -1, createdAt: -1 })
      .limit(limit)
      .lean();
  }

  // 3) Category fallback
  if (!products.length && preferCategories.length) {
    products = await Product.find({
      ...filter,
      category: { $in: preferCategories },
    })
      .select("title description price category image averageRating createdAt")
      .sort({ averageRating: -1, createdAt: -1 })
      .limit(limit)
      .lean();
  }

  // 4) Global fallback
  if (!products.length) {
    products = await Product.find(filter)
      .select("title description price category image averageRating createdAt")
      .sort({ averageRating: -1, createdAt: -1 })
      .limit(limit)
      .lean();
  }

  // Score and rank
  const preferSet = new Set(preferCategories);

  const scored = products.map((p) => {
    let score = 0;

    if (preferSet.has(p.category)) score += 10;
    score += Number(p.averageRating || 0);

    const titleLower = (p.title || "").toLowerCase();
    const descLower = (p.description || "").toLowerCase();
    for (const kw of keywords) {
      if (titleLower.includes(kw)) score += 5;
      else if (descLower.includes(kw)) score += 2;
    }

    return {
      ...p,
      _score: score,
      url: `${FRONTEND_BASE_URL.replace(/\/+$/, "")}/product/${p._id}`,
    };
  });

  scored.sort((a, b) => {
    if (b._score !== a._score) return b._score - a._score;
    const ratingDiff = (b.averageRating || 0) - (a.averageRating || 0);
    if (ratingDiff !== 0) return ratingDiff;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  return scored;
}

/****************************************
 *   RESPONSE GENERATION (second LLM call)
 ****************************************/

async function generateResponse({ message, language, products, history }) {
  if (!llm) {
    if (!products.length) return tr(FALLBACK_TEXT.noResults, language);
    return tr(FALLBACK_TEXT.introFallback, language);
  }

  const productContext = products
    .map(
      (p, i) =>
        `${i + 1}. "${p.title}" — €${Number(p.price).toFixed(2)} (${p.category})`,
    )
    .join("\n");

  const langNameMap = {
    en: "English",
    de: "German",
    fr: "French",
    es: "Spanish",
    it: "Italian",
    pt: "Portuguese",
    nl: "Dutch",
    ar: "Arabic",
    ru: "Russian",
  };
  const languageName = langNameMap[language] || "English";

  const system =
    `You are a friendly shopping assistant for Bon Marché (e-commerce store).\n` +
    `Respond strictly in ${languageName}. Do not switch language.\n\n` +
    `Rules:\n` +
    `- Write 2-4 short sentences about WHY these products match the user's request.\n` +
    `- Reference specific products by name.\n` +
    `- Do NOT invent products. ONLY mention the products listed below.\n` +
    `- Do NOT include URLs, links, prices, or markdown formatting.\n` +
    `- Do NOT use bullet points or numbered lists.\n` +
    `- If no products are provided, suggest the user try a different search.\n` +
    `- Keep it concise and helpful.\n\n` +
    `Available products:\n${productContext || "None found."}`;

  const historyMessages =
    Array.isArray(history) ?
      history.slice(-HISTORY_LIMIT).map((h) => ({
        role: h.role === "user" ? "user" : "assistant",
        content: String(h.content || "").slice(0, 300),
      }))
    : [];

  try {
    const resp = await llm.chat.completions.create({
      model: LLM_MODEL,
      temperature: 0.6,
      max_tokens: 200,
      messages: [
        { role: "system", content: system },
        ...historyMessages,
        { role: "user", content: message },
      ],
    });

    return resp?.choices?.[0]?.message?.content?.trim() || "";
  } catch (e) {
    console.error("generateResponse error:", e);
    return tr(FALLBACK_TEXT.introFallback, language);
  }
}

//********** PRODUCT MARKDOWN BUILDER **********

function buildProductMarkdown(products, language) {
  if (!products.length) return "";

  const labels = {
    en: {
      heading: "### Recommendations",
      price: "Price",
      category: "Category",
      image: "Image",
    },
    de: {
      heading: "### Empfehlungen",
      price: "Preis",
      category: "Kategorie",
      image: "Bild",
    },
    fr: {
      heading: "### Recommandations",
      price: "Prix",
      category: "Catégorie",
      image: "Image",
    },
    es: {
      heading: "### Recomendaciones",
      price: "Precio",
      category: "Categoría",
      image: "Imagen",
    },
    it: {
      heading: "### Consigli",
      price: "Prezzo",
      category: "Categoria",
      image: "Immagine",
    },
  };

  const label = labels[language] || labels.en;

  const lines = [label.heading, ""];
  for (const p of products) {
    lines.push(`- **${p.title}**`);
    lines.push(`  - ${label.price}: €${Number(p.price || 0).toFixed(2)}`);
    lines.push(`  - ${label.category}: ${p.category || "Other"}`);
    if (p.image) {
      lines.push(`  - ${label.image}: [![${p.title}](${p.image})](${p.url})`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

//********** HISTORY HELPERS **********

function normalizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item?.content || item?.text)
    .map((item) => ({
      role: (item.role || item.sender) === "user" ? "user" : "assistant",
      content: String(item.content ?? item.text ?? "").trim(),
    }))
    .slice(-HISTORY_LIMIT);
}

//********** MAIN CONTROLLER **********

/**
 * POST /chat/message
 */
export const createChatMessage = async (req, res) => {
  try {
    const rawMessage = String(req.body?.message || "").trim();
    if (!rawMessage) {
      return res
        .status(400)
        .json({ botResponse: "Please send a message.", products: [] });
    }

    const history = normalizeHistory(req.body?.history);

    // ── Single AI call: language + intent + entities ──
    const understanding = await understandMessage(rawMessage, history);
    const {
      language,
      intent,
      categories,
      minPrice,
      maxPrice,
      recipient,
      keywords,
      isGiftWithoutRecipient,
    } = understanding;

    // ── Small talk ──
    if (intent === "greeting" || intent === "thanks" || intent === "bye") {
      return res.status(200).json({
        botResponse: tr(SMALL_TALK[intent], language),
        products: [],
      });
    }

    // ── Gift without recipient ──
    if (isGiftWithoutRecipient) {
      return res.status(200).json({
        botResponse: tr(FALLBACK_TEXT.giftQuestion, language),
        products: [],
      });
    }

    // ── Recipient rules ──
    const { prefer, avoid } = applyRecipientRules(recipient, categories);

    // ── Retrieve products ──
    const allProducts = await retrieveProducts({
      keywords,
      preferCategories: prefer,
      avoidCategories: avoid,
      minPrice,
      maxPrice,
    });

    const topProducts = allProducts.slice(0, DEFAULT_K);

    if (!topProducts.length) {
      return res.status(200).json({
        botResponse: tr(FALLBACK_TEXT.noResults, language),
        products: [],
      });
    }

    // ── Generate natural intro (second LLM call) ──
    const intro = await generateResponse({
      message: rawMessage,
      language,
      products: topProducts,
      history,
    });

    const markdown = buildProductMarkdown(topProducts, language);
    const botResponse = intro ? `${intro}\n\n${markdown}` : markdown;

    return res.status(200).json({
      botResponse,
      products: topProducts,
    });
  } catch (err) {
    console.error("Chat controller error:", err);
    return res.status(500).json({ botResponse: "Server error.", products: [] });
  }
};
