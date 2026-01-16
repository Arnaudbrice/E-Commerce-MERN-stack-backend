import { OpenAI } from "openai";
import Product from "../models/Product.js";

/**
 * Chat controller for ecommerce assistant responses.
 * Uses deterministic product matching and optional LLM responses.
 * Keeps lightweight, in-memory per-user context (not persisted).
 */
// LLM client (used only when GROQ_API_KEY is set).
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

/**
 * @typedef {Object} CatalogProduct
 * @property {string} _id
 * @property {string} title
 * @property {string} [description]
 * @property {number} [price]
 * @property {string} [category]
 * @property {string} [image]
 * @property {number} [averageRating]
 * @property {string} [url]
 */

/** @type {Map<string, CatalogProduct[]>} */
const recentSelectionsByUser = new Map();
/** @type {Map<string, CatalogProduct[]>} */
const pendingRelatedByUser = new Map();

// Category detection keywords (English + German).
const CATEGORY_MATCHERS = [
  {
    category: "Women's Clothing",
    regex: /\bwomen(?:'s)?\b|\bwomens\b|\bwoman\b|\bladies\b|\bfrauen\b|\bdamen\b/i,
  },
  {
    category: "Men's Clothing",
    regex: /\bmen(?:'s)?\b|\bmens\b|\bman\b|\bherren\b|\bmaenner\b/i,
  },
  {
    category: "Kids's Clothing",
    regex: /\bkids\b|\bkid\b|\bchild\b|\bchildren\b|\bkinder\b|\bkind\b/i,
  },
  {
    category: "Sports",
    regex: /\bsports?\b|\bfitness\b|\bgym\b|\brunning\b|\bathletic\b|\bsport\b/i,
  },
  {
    category: "Beauty",
    regex: /\bbeauty\b|\bmakeup\b|\bcosmetic\b|\bskincare\b|\bkosmetik\b|\bschoenheit\b/i,
  },
  {
    category: "Electronics",
    regex:
      /\belectronic\b|\belectronics\b|\belektronik\b|\blaptop\b|\bmacbook\b|\bnotebook\b|\bcomputer\b|\bpc\b|\bdesktop\b|\bmonitor\b|\bscreen\b|\bdisplay\b|\bphone\b|\bcamera\b|\btv\b|\bheadphone\b|\btablet\b/i,
  },
  {
    category: "Home",
    regex: /\bhome\b|\bkitchen\b|\bdecor\b|\bfurniture\b|\bhaus\b|\bzuhause\b|\bkueche\b/i,
  },
  {
    category: "Books",
    regex: /\bbook\b|\bbooks\b|\bnovel\b|\breading\b|\bbuch\b|\bbuecher\b/i,
  },
  {
    category: "Jewelry",
    regex: /\bjewelry\b|\bjewellery\b|\bnecklace\b|\bring\b|\bbracelet\b|\bschmuck\b/i,
  },
  {
    category: "Other",
    regex: /\bother\b/i,
  },
];

// Common words to ignore when extracting search tokens.
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "be",
  "for",
  "from",
  "have",
  "i",
  "im",
  "in",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "please",
  "show",
  "some",
  "that",
  "the",
  "this",
  "to",
  "want",
  "with",
  "you",
  "your",
]);

// Simple synonym list for common product terms.
const SYNONYMS = {
  macbook: ["laptop", "notebook"],
  monitor: ["screen", "display"],
  screen: ["monitor", "display"],
  display: ["screen", "monitor"],
  tv: ["television"],
  television: ["tv"],
  phone: ["smartphone", "mobile"],
  smartphone: ["phone", "mobile"],
  mobile: ["phone", "smartphone"],
  laptop: ["notebook"],
  notebook: ["laptop"],
  shoes: ["sneakers", "trainers"],
  sneakers: ["shoes", "trainers"],
  trainers: ["shoes", "sneakers"],
  tshirt: ["t-shirt", "tee", "shirt"],
  "t-shirt": ["tshirt", "tee", "shirt"],
  tee: ["tshirt", "t-shirt", "shirt"],
  shirt: ["tee", "tshirt", "t-shirt"],
  jacket: ["coat", "raincoat"],
  coat: ["jacket", "raincoat"],
  raincoat: ["jacket", "coat"],
  necklace: ["jewelry", "jewellery"],
  ring: ["jewelry", "jewellery"],
  bracelet: ["jewelry", "jewellery"],
  earrings: ["jewelry", "jewellery"],
};

// Words that make a message "generic" (not very specific).
const GENERIC_QUERY_WORDS = new Set([
  "about",
  "available",
  "availability",
  "best",
  "better",
  "buy",
  "cost",
  "danke",
  "description",
  "details",
  "do",
  "does",
  "good",
  "hilfe",
  "help",
  "how",
  "info",
  "information",
  "ist",
  "is",
  "kann",
  "kaufen",
  "kosten",
  "moechte",
  "preis",
  "problem",
  "produkt",
  "produkte",
  "sind",
  "need",
  "price",
  "recommend",
  "recommended",
  "recommendation",
  "sell",
  "show",
  "suggest",
  "tell",
  "was",
  "welche",
  "welcher",
  "welches",
  "wie",
  "warum",
  "what",
  "which",
  "why",
]);

// Store-related intent words (buying, shipping, etc.).
const STORE_INTENT_REGEX =
  /\b(buy|price|cost|sell|available|availability|stock|recommend|suggest|show|products?|bestseller|order|shipping|return|refund|checkout|cart|kaufen|preis|kosten|verfuegbar|empfehlen|empfehlung|bestellung|versand|rueckgabe|umtausch|warenkorb)\b/i;

// Quick intent detection keywords.
const GREETING_REGEX =
  /\b(hi|hello|hey|good morning|good afternoon|good evening|hallo|guten tag|guten morgen|guten abend|servus|gruss)\b/i;
const THANKS_REGEX =
  /\b(thanks|thank you|thx|appreciate|cheers|danke|vielen dank)\b/i;
const SUPPORT_REGEX =
  /\b(order|shipping|delivery|return|refund|exchange|tracking|cancel|support|customer service|help desk|complaint|bestellung|versand|lieferung|rueckgabe|umtausch|kundenservice)\b/i;
const FOLLOWUP_CUE_REGEX =
  /\b(why|good|better|worth|details|detail|tell me more|more info|specs|features|material|quality|size|fit|color|durable|comfortable|warum|gut|besser|details|mehr info|merkmale|material|qualitaet|groesse|farbe|bequem)\b/i;

// Short "yes/no" tokens for follow-up prompts.
const AFFIRMATIVE_TOKENS = new Set([
  "yes",
  "yeah",
  "yep",
  "sure",
  "ok",
  "okay",
  "please",
  "show",
  "showme",
  "showthem",
  "go",
  "ahead",
]);

const NEGATIVE_TOKENS = new Set(["no", "nope", "nah", "not"]);

// German language detection helpers.
const GERMAN_STRONG_WORDS = new Set([
  "hallo",
  "danke",
  "bitte",
  "guten",
  "servus",
  "gruss",
  "tschuss",
]);

const GERMAN_KEYWORDS = new Set([
  "kaufen",
  "kauf",
  "preis",
  "produkte",
  "produkt",
  "bestellung",
  "versand",
  "lieferung",
  "rueckgabe",
  "umtausch",
  "hilfe",
  "moechte",
  "suche",
  "suchen",
  "empfehl",
  "warenkorb",
  "zahlung",
  "rechnung",
  "kategorie",
  "groesse",
  "farbe",
  "material",
  "beschreibung",
  "details",
]);

// User-facing copy in English and German (ASCII-only).
const COPY = {
  en: {
    greeting:
      "Hi there! Tell me what you're looking for and I can recommend products.",
    thanks: "You're welcome! Let me know if you want more suggestions.",
    support:
      "I can help with product questions and recommendations. For orders, shipping, or returns, please contact customer service.",
    relatedPrompt: "Would you like me to show related products?",
    relatedIntro: "Here are related products you might like.",
    relatedDecline: "No problem. Let me know if you'd like suggestions later.",
    askWhichProduct: "Which product are you referring to?",
    noTypeFound: (typeToken) =>
      `I couldn't find any ${typeToken} products in our store right now.`,
    noCategoryProducts: (category) =>
      `I don't see any products in ${category} right now.`,
    typeMatchYes: (title) => `Yes, ${title} matches that type.`,
    typeMatchNo: (title, typeToken) =>
      `No, ${title} does not appear to be a ${typeToken}.`,
    introRecommendations: "Here are a few recommendations based on your request.",
    introBrowse: "Here are some popular picks to start with.",
    introAbout: "Here is the product you're referring to.",
    introClosest: "Here is the closest match I found.",
    introDefault: "Here are the products I found.",
    fallback:
      "Tell me what you're shopping for, or pick a category: Women's Clothing, Men's Clothing, Sports, Beauty, Electronics, Home, Books, Jewelry, or Kids's Clothing.",
    headings: {
      bestsellers: "### Bestsellers",
      productMatches: "### Product matches",
      about: "### About that product",
      related: "### Related products",
      recommended: "### Recommended for you",
      category: (category) => `### ${category}`,
      categoryPicks: (category) => `### ${category} picks`,
    },
  },
  de: {
    greeting:
      "Hallo! Sag mir, wonach du suchst, dann empfehle ich dir passende Produkte.",
    thanks: "Gern! Sag Bescheid, wenn du weitere Vorschlaege moechtest.",
    support:
      "Ich helfe gern bei Produkten und Empfehlungen. Fuer Bestellungen, Versand oder Rueckgabe wende dich bitte an den Kundenservice.",
    relatedPrompt: "Soll ich dir passende Produkte zeigen?",
    relatedIntro: "Hier sind passende Produkte, die dir gefallen koennten.",
    relatedDecline:
      "Alles klar. Sag Bescheid, wenn du spaeter Vorschlaege moechtest.",
    askWhichProduct: "Welches Produkt meinst du?",
    noTypeFound: (typeToken) =>
      `Ich konnte aktuell keine ${typeToken}-Produkte in unserem Shop finden.`,
    noCategoryProducts: (category) =>
      `Ich sehe aktuell keine Produkte in der Kategorie ${category}.`,
    typeMatchYes: (title) => `Ja, ${title} passt zu diesem Typ.`,
    typeMatchNo: (title, typeToken) =>
      `Nein, ${title} scheint kein ${typeToken} zu sein.`,
    introRecommendations: "Hier sind ein paar Empfehlungen zu deiner Anfrage.",
    introBrowse: "Hier sind ein paar beliebte Picks zum Starten.",
    introAbout: "Hier ist das Produkt, auf das du dich beziehst.",
    introClosest: "Hier ist der naechste Treffer, den ich gefunden habe.",
    introDefault: "Hier sind die Produkte, die ich gefunden habe.",
    fallback:
      "Sag mir, wonach du suchst, oder waehle eine Kategorie: Women's Clothing, Men's Clothing, Sports, Beauty, Electronics, Home, Books, Jewelry, oder Kids's Clothing.",
    headings: {
      bestsellers: "### Bestseller",
      productMatches: "### Passende Produkte",
      about: "### Zu diesem Produkt",
      related: "### Aehnliche Produkte",
      recommended: "### Empfehlungen fuer dich",
      category: (category) => `### ${category}`,
      categoryPicks: (category) => `### ${category} Empfehlungen`,
    },
  },
};

/**
 * Normalize text for matching (lowercase, alphanumeric, trimmed).
 * @param {string} value
 * @returns {string}
 */
const normalizeText = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Split a message into base tokens after normalization.
 * @param {string} message
 * @returns {string[]}
 */
const getBaseTokens = (message) =>
  normalizeText(message).split(" ").filter(Boolean);

/**
 * Detect language based on keyword heuristics.
 * Defaults to English unless German keywords are present.
 * @param {string} message
 * @returns {"en"|"de"}
 */
const detectLanguage = (message) => {
  const normalized = normalizeText(message);
  if (!normalized) {
    return "en";
  }

  const strongHit = Array.from(GERMAN_STRONG_WORDS).some((word) =>
    normalized.includes(word)
  );
  if (strongHit) {
    return "de";
  }

  let count = 0;
  GERMAN_KEYWORDS.forEach((word) => {
    if (normalized.includes(word)) {
      count += 1;
    }
  });

  return count >= 2 ? "de" : "en";
};

/**
 * Get localized copy for deterministic responses.
 * @param {"en"|"de"} language
 * @returns {typeof COPY.en}
 */
const getCopy = (language) => COPY[language] || COPY.en;

/**
 * Resolve language using optional config override.
 * Set CHAT_LANGUAGE to "en" or "de" to force a language.
 * @param {string} message
 * @returns {"en"|"de"}
 */
const getLanguage = (message) => {
  const configured = String(process.env.CHAT_LANGUAGE || "").toLowerCase();
  if (configured === "en" || configured === "de") {
    return configured;
  }

  return detectLanguage(message);
};

// All searchable "type" tokens for quick detection (e.g., laptop, monitor).
const TYPE_TOKENS = new Set([
  ...Object.keys(SYNONYMS),
  ...Object.values(SYNONYMS).flat(),
]);

/**
 * Find a product type token from the message (e.g., laptop, monitor).
 * @param {string} message
 * @returns {string|null}
 */
const getTypeToken = (message) => {
  const baseTokens = getBaseTokens(message);
  return baseTokens.find((token) => TYPE_TOKENS.has(token)) || null;
};

/**
 * Detect short affirmative replies for follow-up prompts.
 * @param {string} message
 * @returns {boolean}
 */
const isAffirmativeResponse = (message) => {
  const tokens = getBaseTokens(message);
  if (!tokens.length) {
    return false;
  }

  if (tokens.length <= 2 && tokens.every((token) => AFFIRMATIVE_TOKENS.has(token))) {
    return true;
  }

  const normalized = normalizeText(message);
  return (
    normalized === "show me" ||
    normalized === "show them" ||
    normalized === "yes please" ||
    normalized === "go ahead"
  );
};

/**
 * Detect short negative replies for follow-up prompts.
 * @param {string} message
 * @returns {boolean}
 */
const isNegativeResponse = (message) => {
  const tokens = getBaseTokens(message);
  if (!tokens.length) {
    return false;
  }

  return tokens.length <= 2 && tokens.every((token) => NEGATIVE_TOKENS.has(token));
};

/**
 * Lightweight intent checks for greetings, thanks, and support.
 * @param {string} message
 * @returns {boolean}
 */
const isGreetingMessage = (message) => GREETING_REGEX.test(message);
/** @param {string} message @returns {boolean} */
const isThanksMessage = (message) => THANKS_REGEX.test(message);
/** @param {string} message @returns {boolean} */
const isSupportQuestion = (message) => SUPPORT_REGEX.test(message);

/**
 * Remove URLs from a response to avoid raw link output.
 * @param {string} value
 * @returns {string}
 */
const stripUrls = (value) =>
  String(value || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

/**
 * Decide if a question should be handled as general knowledge (not store intent).
 * @param {Object} params
 * @param {boolean} params.isQuestion
 * @param {boolean} params.refersToPrevious
 * @param {boolean} params.wantsRecommendations
 * @param {boolean} params.wantsImages
 * @param {string} params.normalizedMessage
 * @param {string[]} params.baseTokens
 * @returns {boolean}
 */
const isGeneralKnowledgeQuestion = ({
  isQuestion,
  refersToPrevious,
  wantsRecommendations,
  wantsImages,
  normalizedMessage,
  baseTokens,
}) => {
  if (!isQuestion) {
    return false;
  }
  if (refersToPrevious || wantsRecommendations || wantsImages) {
    return false;
  }
  if (STORE_INTENT_REGEX.test(normalizedMessage) || /\bin stock\b/i.test(normalizedMessage)) {
    return false;
  }

  const meaningfulTokens = baseTokens.filter(
    (token) => !GENERIC_QUERY_WORDS.has(token)
  );
  const looksLikeDefinition =
    /\b(what is|what s|what's|define|meaning of)\b/.test(normalizedMessage);
  const looksLikeComparison =
    /\bis\b[^?]*\ba\b/.test(normalizedMessage) ||
    /\bare\b[^?]*\ba\b/.test(normalizedMessage);

  return looksLikeDefinition || looksLikeComparison || meaningfulTokens.length >= 2;
};

/**
 * Expand a token with synonyms and basic stemming.
 * @param {string} token
 * @returns {string[]}
 */
const expandToken = (token) => {
  const variants = new Set([token]);

  if (SYNONYMS[token]) {
    SYNONYMS[token].forEach((synonym) => variants.add(synonym));
  }

  if (token.endsWith("ies") && token.length > 4) {
    variants.add(`${token.slice(0, -3)}y`);
  }

  if (token.endsWith("es") && token.length > 4) {
    variants.add(token.slice(0, -2));
  }

  if (token.endsWith("s") && token.length > 3) {
    variants.add(token.slice(0, -1));
  }

  if (token.endsWith("ing") && token.length > 5) {
    variants.add(token.slice(0, -3));
  }

  if (token.endsWith("ed") && token.length > 4) {
    variants.add(token.slice(0, -2));
  }

  return Array.from(variants);
};

/**
 * Extract searchable tokens from a message (minus stop words).
 * @param {string} message
 * @returns {string[]}
 */
const extractTokens = (message) => {
  const baseTokens = normalizeText(message).split(" ").filter(Boolean);
  const tokens = new Set();

  baseTokens.forEach((token) => {
    if (STOP_WORDS.has(token)) {
      return;
    }
    expandToken(token).forEach((variant) => tokens.add(variant));
  });

  return Array.from(tokens);
};

/**
 * Score a product by matching tokens against title/description/category.
 * @param {CatalogProduct} product
 * @param {string[]} tokens
 * @param {string} fullMessage
 * @returns {number}
 */
const scoreProduct = (product, tokens, fullMessage) => {
  const titleText = normalizeText(product.title);
  const descriptionText = normalizeText(product.description);
  const categoryText = normalizeText(product.category);

  let score = 0;

  if (fullMessage && titleText.includes(fullMessage)) {
    score += 6;
  }
  if (fullMessage && descriptionText.includes(fullMessage)) {
    score += 3;
  }

  tokens.forEach((token) => {
    if (titleText.includes(token)) {
      score += 3;
    }
    if (descriptionText.includes(token)) {
      score += 1;
    }
    if (categoryText.includes(token)) {
      score += 2;
    }
  });

  return score;
};

/**
 * Check if a product matches a type token (e.g., "monitor").
 * @param {CatalogProduct} product
 * @param {string|null} typeToken
 * @returns {boolean}
 */
const doesProductMatchType = (product, typeToken) => {
  if (!typeToken) {
    return false;
  }

  const productText = normalizeText(
    `${product.title || ""} ${product.description || ""} ${product.category || ""}`
  );

  return expandToken(typeToken).some((variant) => productText.includes(variant));
};

/**
 * Sort products by rating (descending).
 * @param {CatalogProduct[]} products
 * @returns {CatalogProduct[]}
 */
const sortByRating = (products) =>
  products
    .slice()
    .sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));

/**
 * Get the top-rated products from a list.
 * @param {CatalogProduct[]} products
 * @param {number} [limit=3]
 * @returns {CatalogProduct[]}
 */
const getTopRatedProducts = (products, limit = 3) =>
  sortByRating(products).slice(0, limit);

/**
 * Build related product candidates from a message context.
 * @param {Object} params
 * @param {CatalogProduct[]} params.catalog
 * @param {string} params.normalizedMessage
 * @param {string[]} params.searchTokens
 * @param {string|null} params.typeToken
 * @returns {CatalogProduct[]}
 */
const getRelatedProducts = ({
  catalog,
  normalizedMessage,
  searchTokens,
  typeToken,
}) => {
  const candidates = typeToken
    ? catalog.filter((product) => doesProductMatchType(product, typeToken))
    : catalog;

  const scored = candidates
    .map((product) => ({
      product,
      score: scoreProduct(product, searchTokens, normalizedMessage),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return (b.product.averageRating || 0) - (a.product.averageRating || 0);
    });

  if (scored.length) {
    return scored.map((entry) => entry.product).slice(0, 3);
  }

  if (typeToken) {
    return getTopRatedProducts(candidates, 3);
  }

  return [];
};

/**
 * Format numeric prices in EUR.
 * @param {number|string} value
 * @returns {string}
 */
const formatPrice = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return String(value);
  }

  return `€${numeric.toFixed(2)}`;
};

/**
 * Truncate long text for brief summaries.
 * @param {string} value
 * @param {number} [maxLength=180]
 * @returns {string}
 */
const truncateText = (value, maxLength = 180) => {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}…`;
};

/**
 * Build markdown cards with a clickable image for each product.
 * @param {CatalogProduct[]} products
 * @param {string} heading
 * @returns {string}
 */
const buildProductMarkdown = (products, heading) => {
  const lines = [heading, ""];

  products.forEach((product) => {
    lines.push(`- **${product.title}**`);
    lines.push(`  - Price: ${formatPrice(product.price)}`);
    lines.push(`  - Category: ${product.category}`);
    if (product.image) {
      lines.push(
        `  - Image: [![${product.title}](${product.image})](${product.url})`
      );
    }
    lines.push("");
  });

  return lines.join("\n").trim();
};

/**
 * Build a text-only summary (no images) for products.
 * @param {CatalogProduct[]} products
 * @param {string} heading
 * @returns {string}
 */
const buildProductSummary = (products, heading) => {
  const lines = [heading, ""];

  products.forEach((product) => {
    lines.push(`- **${product.title}**`);
    lines.push(`  - Price: ${formatPrice(product.price)}`);
    lines.push(`  - Category: ${product.category}`);
    if (product.description) {
      lines.push(`  - Description: ${truncateText(product.description)}`);
    }
    lines.push("");
  });

  return lines.join("\n").trim();
};

/**
 * Ensure a generated response references the product title.
 * @param {string} response
 * @param {CatalogProduct[]} products
 * @returns {boolean}
 */
const hasTitleReference = (response, products) => {
  const normalizedResponse = normalizeText(response);

  return products.some((product) => {
    const normalizedTitle = normalizeText(product.title);
    return normalizedTitle && normalizedResponse.includes(normalizedTitle);
  });
};

/**
 * Ask the LLM to answer a product question using only provided data.
 * @param {string} message
 * @param {CatalogProduct[]} products
 * @returns {Promise<string|null>}
 */
const buildQuestionResponse = async (message, products) => {
  if (!process.env.GROQ_API_KEY) {
    return null;
  }

  const sanitizedProducts = products.map((product) => ({
    title: product.title,
    price: product.price,
    category: product.category,
    description: product.description,
  }));

  try {
    const response = await groq.chat.completions.create({
      model: "allam-2-7b",
      messages: [
        {
          role: "system",
          content:
            "You are a friendly shopping assistant. Use only the provided product data. " +
            "Answer the user's question in the same language, in 2-4 short sentences. " +
            "Do not use lists, do not add images, and do not invent details. " +
            "Always include the product title exactly as provided. " +
            "If the answer is not in the data, say you don't have that information. " +
            "You may mention the product name and price. Do not include any URLs.",
        },
        {
          role: "user",
          content: `User question: ${message}\n\nProduct data: ${JSON.stringify(
            sanitizedProducts
          )}`,
        },
      ],
      temperature: 0.4,
      max_tokens: 220,
      frequency_penalty: 0,
      presence_penalty: 0,
    });

    const content = response?.choices?.[0]?.message?.content?.trim() || null;
    if (!content) {
      return null;
    }

    return stripUrls(content);
  } catch (error) {
    console.error("Chat summary error:", error);
    return null;
  }
};

/**
 * Ask the LLM to answer a general question (no store details).
 * @param {string} message
 * @returns {Promise<string|null>}
 */
const buildGeneralAnswer = async (message) => {
  if (!process.env.GROQ_API_KEY) {
    return null;
  }

  try {
    const response = await groq.chat.completions.create({
      model: "allam-2-7b",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant for general product knowledge. " +
            "Answer the question briefly in the same language, in 2-4 short sentences. " +
            "Do not mention store inventory, prices, or availability. " +
            "Do not include URLs. If unsure, say you don't know.",
        },
        {
          role: "user",
          content: message,
        },
      ],
      temperature: 0.5,
      max_tokens: 220,
      frequency_penalty: 0,
      presence_penalty: 0,
    });

    const content = response?.choices?.[0]?.message?.content?.trim() || null;
    if (!content) {
      return null;
    }

    return stripUrls(content);
  } catch (error) {
    console.error("General chat error:", error);
    return null;
  }
};

/**
 * POST /chat/message
 * Core chat flow: detect intent, match products, optionally answer with LLM,
 * and return markdown that the frontend can render (including image links).
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @returns {Promise<void>}
 */
//********** POST /chat/message **********
export const createChatMessage = async (req, res) => {
  const userID = req.user._id;
  const userKey = String(userID);

  const frontendBaseUrl =
    process.env.FRONTEND_BASE_URL || "http://localhost:5173";

  const { message } = req.body;
  const rawMessage = String(message || "");
  const normalizedMessage = normalizeText(message);
  const language = getLanguage(rawMessage);
  const copy = getCopy(language);
  const baseTokens = getBaseTokens(message);
  const typeToken = getTypeToken(message);
  const searchTokens = extractTokens(message);
  console.log("message", message);

  // Load the full product catalog once per request.
  const catalog = await Product.find()
    .select("title description price category image averageRating")
    .lean();

  // Add frontend URLs so responses can render clickable product images.
  const catalogWithUrl = catalog.map((product) => ({
    ...product,
    url: `${frontendBaseUrl}/product/${product._id}`,
  }));

  const matchedCategory = CATEGORY_MATCHERS.find(({ regex }) =>
    regex.test(normalizedMessage)
  )?.category;

  // Basic intent signals from the text.
  const wantsRecommendations =
    /\b(bestseller|bestsellers|recommend|recommendation|suggest|top|popular|best|empfehlen|empfehlung|beliebt)\b/i.test(
      normalizedMessage
    );
  const wantsImages =
    /\b(image|images|photo|photos|picture|pictures|show|see|look|bild|bilder|foto|fotos|zeige)\b/i.test(
      normalizedMessage
    );
  const isQuestion =
    /\?/.test(rawMessage) ||
    /\b(what|which|how|why|does|do|is|are|can|could|tell|price|cost|available|availability|stock|details|description|was|wie|warum|welche|welcher|welches|kann|koennen)\b/i.test(
      normalizedMessage
    );
  const previousSelections = recentSelectionsByUser.get(userKey) || [];
  const explicitRefersToPrevious =
    /\b(this|that|it|these|those|this product|that product|that one|this one)\b/i.test(
      normalizedMessage
    );
  const followUpIntent =
    previousSelections.length > 0 &&
    isQuestion &&
    FOLLOWUP_CUE_REGEX.test(normalizedMessage) &&
    !typeToken &&
    !wantsRecommendations &&
    !STORE_INTENT_REGEX.test(normalizedMessage);
  const refersToPrevious = explicitRefersToPrevious || followUpIntent;
  const hasSpecificTerms = searchTokens.some(
    (token) => !GENERIC_QUERY_WORDS.has(token)
  );
  // "Browse" means the user wants shopping help but no clear product term.
  const wantsBrowse = !hasSpecificTerms && STORE_INTENT_REGEX.test(normalizedMessage);
  const generalKnowledgeQuestion = isGeneralKnowledgeQuestion({
    isQuestion,
    refersToPrevious,
    wantsRecommendations,
    wantsImages,
    normalizedMessage,
    baseTokens,
  });

  const pendingRelated = pendingRelatedByUser.get(userKey);
  if (pendingRelated?.length) {
    // Follow-up step for "show related products?" prompt.
    if (isAffirmativeResponse(message)) {
      pendingRelatedByUser.delete(userKey);
      const response = `${copy.relatedIntro}\n\n${buildProductMarkdown(
        pendingRelated,
        copy.headings.related
      )}`;
      res.status(200).json({ botResponse: response });
      return;
    }

    if (isNegativeResponse(message)) {
      pendingRelatedByUser.delete(userKey);
      res.status(200).json({
        botResponse: copy.relatedDecline,
      });
      return;
    }

    pendingRelatedByUser.delete(userKey);
  }

  if (isGreetingMessage(rawMessage)) {
    res.status(200).json({
      botResponse: copy.greeting,
    });
    return;
  }

  if (isThanksMessage(rawMessage)) {
    res.status(200).json({
      botResponse: copy.thanks,
    });
    return;
  }

  if (isSupportQuestion(normalizedMessage)) {
    res.status(200).json({ botResponse: copy.support });
    return;
  }

  if (generalKnowledgeQuestion) {
    const generalAnswer = await buildGeneralAnswer(message);
    if (generalAnswer) {
      // Offer related products after a general answer when relevant.
      const relatedProducts = getRelatedProducts({
        catalog: catalogWithUrl,
        normalizedMessage,
        searchTokens,
        typeToken,
      });

      if (relatedProducts.length) {
        pendingRelatedByUser.set(userKey, relatedProducts);
        res.status(200).json({
          botResponse: `${generalAnswer}\n\n${copy.relatedPrompt}`,
        });
        return;
      }

      res.status(200).json({ botResponse: generalAnswer });
      return;
    }
  }

  let selectedProducts = [];
  let headingKey = "bestsellers";
  let heading = copy.headings.bestsellers;

  // If this looks like a follow-up, reuse the last shown products.
  if (refersToPrevious && previousSelections.length) {
    selectedProducts = previousSelections;
    headingKey = "about";
    heading = copy.headings.about;
  }

  const shouldFilterByType = Boolean(typeToken) && !refersToPrevious;
  const matchPool = matchedCategory
    ? catalogWithUrl.filter((product) => product.category === matchedCategory)
    : catalogWithUrl;
  const scoreThreshold = hasSpecificTerms ? 2 : 3;
  // Rank products by token score with optional category/type filtering.
  const scoredMatches = selectedProducts.length
    ? []
    : matchPool
        .map((product) => ({
          product,
          score: scoreProduct(product, searchTokens, normalizedMessage),
        }))
        .filter(
          (entry) =>
            entry.score >= scoreThreshold &&
            (!shouldFilterByType ||
              doesProductMatchType(entry.product, typeToken))
        )
        .sort((a, b) => {
          if (b.score !== a.score) {
            return b.score - a.score;
          }
          return (b.product.averageRating || 0) - (a.product.averageRating || 0);
        });

  if (!selectedProducts.length && scoredMatches.length) {
    selectedProducts = scoredMatches.map((entry) => entry.product);
    headingKey = "productMatches";
    heading = copy.headings.productMatches;
  }

  const hasSpecificTypeRequest = Boolean(typeToken);

  if (!selectedProducts.length && matchedCategory && matchPool.length === 0) {
    res.status(200).json({
      botResponse: copy.noCategoryProducts(matchedCategory),
    });
    return;
  }

  if (
    !selectedProducts.length &&
    matchedCategory &&
    !(hasSpecificTypeRequest && !scoredMatches.length)
  ) {
    selectedProducts = getTopRatedProducts(matchPool, 3);
    headingKey = "category";
    heading = copy.headings.category(matchedCategory);
  }

  // If the user asked for recommendations or just browsing, show top-rated picks.
  if (!selectedProducts.length && (wantsRecommendations || wantsBrowse)) {
    const recommendationPool = matchedCategory ? matchPool : catalogWithUrl;
    selectedProducts = getTopRatedProducts(recommendationPool, 3);
    headingKey = matchedCategory ? "categoryPicks" : "recommended";
    heading = matchedCategory
      ? copy.headings.categoryPicks(matchedCategory)
      : copy.headings.recommended;
  }

  if (!selectedProducts.length && explicitRefersToPrevious && isQuestion) {
    res.status(200).json({
      botResponse: copy.askWhichProduct,
    });
    return;
  }

  if (!selectedProducts.length && hasSpecificTypeRequest && !refersToPrevious) {
    res.status(200).json({
      botResponse: copy.noTypeFound(typeToken),
    });
    return;
  }

  if (selectedProducts.length) {
    // Build a short response plus markdown cards for the frontend renderer.
    const maxResults =
      wantsRecommendations || wantsBrowse ? 3 : isQuestion ? 1 : 3;
    const selection = selectedProducts.slice(0, maxResults);

    recentSelectionsByUser.set(userKey, selection);

    let introText = "";

    // For questions like "is this a laptop?" answer yes/no first.
    if (isQuestion && typeToken) {
      const targetProduct = selection[0];
      const matchesType = doesProductMatchType(targetProduct, typeToken);
      introText = matchesType
        ? copy.typeMatchYes(targetProduct.title)
        : copy.typeMatchNo(targetProduct.title, typeToken);
    }

    if (!introText && isQuestion) {
      // Ask the LLM for a short answer using only the product data.
      const smallTalk = await buildQuestionResponse(message, selection);
      if (smallTalk && hasTitleReference(smallTalk, selection)) {
        introText = smallTalk;
      }
    }

    if (!introText) {
      if (wantsRecommendations) {
        introText = copy.introRecommendations;
      } else if (wantsBrowse) {
        introText = copy.introBrowse;
      } else if (headingKey === "about") {
        introText = copy.introAbout;
      } else if (headingKey === "productMatches") {
        introText = copy.introClosest;
      } else {
        introText = copy.introDefault;
      }
    }

    const response = `${introText}\n\n${buildProductMarkdown(selection, heading)}`;
    res.status(200).json({ botResponse: response });
    return;
  }

  // Final fallback when nothing matches.
  const fallbackResponse =
    copy.fallback;
  res.status(200).json({ botResponse: fallbackResponse });
};
