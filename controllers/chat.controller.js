import { OpenAI } from "openai";
import Product from "../models/Product.js";

/**
 * AI Chat Controller (ONE FILE)
 * - Fixes user typos first (optional, via LLM)
 * - Retrieves real products from MongoDB (source of truth)
 * - Uses LLM to understand the question (plan) + rerank candidates (smart ranking)
 * - Returns a markdown answer + a `products` array (recommended for rendering cards/images in React)
 *
 * Recommended MongoDB index (once):
 * ProductSchema.index({ title: "text", description: "text", category: "text" })
 */

// ----------------------------- LLM CLIENT (Groq via OpenAI SDK) -----------------------------

// LLM client is optional; when missing we fall back to DB-only matching.
const llm =
  process.env.GROQ_API_KEY ?
    new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    })
  : null;

const LLM_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

// ----------------------------- CONFIG -----------------------------

const FRONTEND_BASE_URL =
  process.env.FRONTEND_BASE_URL || "http://localhost:5173";

// Retrieve this many candidates from DB
const RETRIEVE_LIMIT = Number(process.env.CHAT_RETRIEVE_LIMIT || 120);

// Send only this many candidates to LLM for reranking (token safe)
const RERANK_LIMIT = Number(process.env.CHAT_RERANK_LIMIT || 30);

// Final number of products to show
const DEFAULT_K = Number(process.env.CHAT_K || 3);

// Max bestsellers to fetch for generic recommendations
const BESTSELLER_LIMIT = Number(process.env.CHAT_BESTSELLER_LIMIT || 6);

// Your categories must match your Product schema enum exactly:
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

// ----------------------------- SMALL HELPERS -----------------------------

/**
 * Normalize text to a simple, ASCII-only form for matching.
 * This keeps matching consistent across user input and stored text.
 *
 * @param {string} v
 * @returns {string}
 */
const normalize = (v) =>
  String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Strip URLs from generated text before returning it to the user.
 * This avoids noisy links in short summaries.
 *
 * @param {string} value
 * @returns {string}
 */
const stripUrls = (value) =>
  String(value || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

const MIN_TOKEN_PREFIX = Number(process.env.CHAT_TOKEN_PREFIX || 4);
const HISTORY_LIMIT = Number(process.env.CHAT_HISTORY_LIMIT || 8);

/**
 * Build a small set of search tokens that tolerate plurals and typos.
 * Used for regex fallback when $text search has no hits.
 *
 * @param {string} queryText
 * @returns {string[]}
 */
function buildSearchTokens(queryText) {
  const words = normalize(queryText).split(" ").filter(Boolean);
  const tokens = new Set();

  for (const word of words) {
    tokens.add(word);

    // Basic plural normalization for common English endings.
    if (word.endsWith("ies") && word.length > 3) {
      tokens.add(`${word.slice(0, -3)}y`);
    }
    if (word.endsWith("es") && word.length > 2) {
      tokens.add(word.slice(0, -2));
    }
    if (word.endsWith("s") && word.length > 1) {
      tokens.add(word.slice(0, -1));
    }

    // Prefix token helps match short typos (e.g., "monitos" -> "monit").
    const prefixLen = Math.min(
      word.length,
      Math.max(MIN_TOKEN_PREFIX, word.length - 2)
    );
    if (prefixLen >= MIN_TOKEN_PREFIX) {
      tokens.add(word.slice(0, prefixLen));
    }
  }

  return Array.from(tokens).filter((token) => token.length >= 3);
}

/**
 * Normalize and cap incoming chat history to a safe size.
 * This prevents oversized prompts and keeps only useful content.
 *
 * @param {Array} rawHistory
 * @returns {{role: "user"|"assistant", content: string}[]}
 */
function normalizeHistory(rawHistory) {
  if (!Array.isArray(rawHistory)) return [];
  const cleaned = [];

  for (const item of rawHistory) {
    const rawRole = item?.role || item?.sender;
    const role = rawRole === "user" ? "user" : "assistant";
    const content = String(item?.content ?? item?.text ?? "").trim();

    if (!content) continue;
    cleaned.push({ role, content });
  }

  return cleaned.slice(-HISTORY_LIMIT);
}

/**
 * Convert normalized history into LLM message format.
 *
 * @param {{role: "user"|"assistant", content: string}[]} history
 * @returns {{role: string, content: string}[]}
 */
function toLlmHistory(history) {
  if (!history?.length) return [];
  return history.slice(-HISTORY_LIMIT).map((item) => ({
    role: item.role,
    content: item.content,
  }));
}

// Short cues that usually mean "continue the previous request".
const FOLLOW_UP_HINTS = [
  "cheaper",
  "lower",
  "less",
  "more",
  "another",
  "others",
  "similar",
  "same",
  "next",
  "again",
  "cheapest",
  "budget",
  "billiger",
  "guenstiger",
  "mehr",
  "weniger",
  "andere",
  "nochmal",
  "naechste",
  "aehnlich",
  "it",
  "them",
  "this",
  "that",
  "these",
  "those",
  "one",
  "ones",
];

// Hints that the user is already asking for products.
const PRODUCT_INTENT_HINTS = [
  "recommend",
  "suggest",
  "product",
  "buy",
  "search",
  "find",
  "looking",
  "need",
  "want",
  "price",
  "budget",
  "category",
  "kaufen",
  "suche",
  "suchen",
  "brauche",
  "preis",
  "budget",
  "produkt",
  "empfehl",
];

// Simple small talk intents (kept ASCII-only).
const SMALL_TALK_INTENTS = {
  greeting: [
    "hi",
    "hello",
    "hey",
    "hallo",
    "guten tag",
    "guten morgen",
    "guten abend",
    "moin",
    "servus",
    "yo",
    "hola",
    "bonjour",
    "ciao",
  ],
  thanks: ["thanks", "thank you", "thx", "danke", "merci", "gracias"],
  bye: ["bye", "goodbye", "see you", "tschuss", "tschuess", "ciao", "adios"],
};

const CATEGORY_SUGGESTIONS = [
  "Electronics",
  "Home",
  "Sports",
  "Books",
  "Beauty",
];

/**
 * Detect short follow-ups like "cheaper", "more", "same".
 * These need previous context to make sense.
 *
 * @param {string} message
 * @returns {boolean}
 */
function isFollowUpMessage(message) {
  const t = normalize(message);
  if (!t) return false;

  const shortFollowUps = new Set([
    "more",
    "less",
    "cheaper",
    "another",
    "others",
    "similar",
    "same",
    "next",
    "again",
    "yes",
    "no",
    "ok",
    "okay",
    "sure",
    "mehr",
    "weniger",
    "andere",
    "nochmal",
  ]);

  if (shortFollowUps.has(t)) return true;
  return FOLLOW_UP_HINTS.some((hint) => t.includes(hint));
}

/**
 * Detect small talk intent while avoiding product queries.
 *
 * @param {string} message
 * @returns {"greeting"|"thanks"|"bye"|null}
 */
function detectSmallTalkIntent(message) {
  const t = normalize(message);
  if (!t) return null;

  if (PRODUCT_INTENT_HINTS.some((hint) => t.includes(hint))) return null;

  if (SMALL_TALK_INTENTS.thanks.some((hint) => t.includes(hint))) {
    return "thanks";
  }
  if (SMALL_TALK_INTENTS.bye.some((hint) => t.includes(hint))) {
    return "bye";
  }

  const isGreeting = SMALL_TALK_INTENTS.greeting.some(
    (hint) => t === hint || t.startsWith(`${hint} `)
  );

  return isGreeting ? "greeting" : null;
}

/**
 * Build a friendly small talk response that stays product-focused.
 *
 * @param {"greeting"|"thanks"|"bye"} intent
 * @param {"en"|"de"} language
 * @returns {string}
 */
function buildSmallTalkResponse(intent, language) {
  const suggestions = CATEGORY_SUGGESTIONS.join(", ");

  if (language === "de") {
    if (intent === "thanks") {
      return "Gern! Wenn du weitere Produktempfehlungen moechtest, sag mir Kategorie oder Budget.";
    }
    if (intent === "bye") {
      return "Tschuess! Wenn du spaeter Produkte suchst, frag einfach.";
    }
    return (
      "Hallo! Ich helfe dir beim Finden von Produkten. Nenne mir Kategorie, Budget oder was du brauchst " +
      `(z.B. ${suggestions}).`
    );
  }

  if (intent === "thanks") {
    return "You're welcome! If you want more product recommendations, tell me a category or budget.";
  }
  if (intent === "bye") {
    return "Bye! If you need product recommendations later, just ask.";
  }
  return (
    "Hi! I can help you find products. Tell me a category, budget, or what you need " +
    `(e.g., ${suggestions}).`
  );
}

/**
 * Combine the previous user message with a follow-up.
 * This improves retrieval when the user continues the topic.
 *
 * @param {string} message
 * @param {{role: "user"|"assistant", content: string}[]} history
 * @returns {string}
 */
function buildContextualMessage(message, history) {
  const current = String(message || "").trim();
  if (!current) return current;
  if (!history?.length) return current;
  if (!isFollowUpMessage(current)) return current;

  // Use last user message as the anchor for follow-ups.
  const lastUser = [...history].reverse().find((item) => item.role === "user");
  if (!lastUser?.content) return current;

  return `${lastUser.content}\nFollow-up: ${current}`;
}

/**
 * Detect generic recommendation requests with no constraints.
 * This allows a safe bestseller fallback.
 *
 * @param {string} message
 * @param {object} plan
 * @returns {boolean}
 */
function isGenericRecommendation(message, plan) {
  const t = normalize(message);
  const hints = [
    "recommend",
    "recommendation",
    "suggest",
    "suggestion",
    "bestseller",
    "best seller",
    "top picks",
    "top products",
    "popular",
    "empfehlung",
    "empfehlen",
    "bestseller",
    "beliebt",
  ];
  const hasHint = hints.some((h) => t.includes(h));
  const hasConstraints =
    Boolean(plan?.recipient) ||
    (plan?.preferCategories?.length || 0) > 0 ||
    (plan?.avoidCategories?.length || 0) > 0 ||
    plan?.minPrice != null ||
    plan?.maxPrice != null;
  return hasHint && !hasConstraints;
}

/**
 * Extract the first JSON object from a string safely.
 * LLMs sometimes add extra text around the JSON.
 *
 * @param {string} text
 * @returns {object|null}
 */
function safeJsonParse(text) {
  if (!text) return null;
  const raw = String(text).trim();

  try {
    return JSON.parse(raw);
  } catch {}

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

/**
 * Very simple language detection (EN/DE only).
 * Used to choose response language and prompts.
 *
 * @param {string} message
 * @returns {"en"|"de"}
 */
function detectLanguage(message) {
  const t = normalize(message);
  const deWords = [
    "bitte",
    "danke",
    "kaufen",
    "geschenk",
    "sohn",
    "tochter",
    "preis",
    "versand",
    "rueckgabe",
    "umtausch",
    "warenkorb",
  ];
  let hits = 0;
  for (const w of deWords) if (t.includes(w)) hits++;
  return hits >= 2 ? "de" : "en";
}

/**
 * Build markdown with clickable product image links.
 * The frontend renders this markdown in the chat UI.
 *
 * @param {Array} products
 * @param {"en"|"de"} language
 * @returns {string}
 */
function buildProductMarkdown(products, language) {
  const heading =
    language === "de" ? "### Empfehlungen" : "### Recommendations";
  const lines = [heading, ""];

  for (const p of products) {
    lines.push(`- **${p.title}**`);
    lines.push(`  - Price: €${Number(p.price || 0).toFixed(2)}`);
    lines.push(`  - Category: ${p.category || "Other"}`);

    // Image line (markdown). If your frontend blocks markdown images, render from `products` array instead.
    if (p.image) {
      lines.push(`  - Image: [![${p.title}](${p.image})](${p.url})`);
    }

    lines.push("");
  }

  return lines.join("\n").trim();
}

// ----------------------------- NEW: TYPO / SPELLING CORRECTION -----------------------------

/**
 * Correct user typos without changing meaning.
 * Output is ONLY the corrected text so it can be reused for search.
 *
 * @param {Object} params
 * @param {string} params.message
 * @param {"de"|"en"} params.language
 * @returns {Promise<{ correctedMessage: string, didCorrect: boolean }>}
 */
async function correctUserMessage({ message, language }) {
  const original = String(message || "").trim();
  if (!original) return { correctedMessage: original, didCorrect: false };
  if (!llm) return { correctedMessage: original, didCorrect: false };

  // Cheap heuristic: only correct when message looks "broken" or very short.
  const words = original.split(/\s+/).filter(Boolean);
  const hasWeirdChars = /[^\w\s!?.,'"-]/.test(original);
  const repeatedChars = /(.)\1\1/.test(original); // e.g. "coooool"
  const isVeryShort = words.length <= 3;

  if (!isVeryShort && !hasWeirdChars && !repeatedChars) {
    return { correctedMessage: original, didCorrect: false };
  }

  // Use a strict system prompt to avoid meaning changes.
  const system =
    "You correct spelling and typos in the user's message.\n" +
    "Rules:\n" +
    "- Keep the exact meaning.\n" +
    "- Keep product names/brands as-is.\n" +
    "- Do NOT add new information.\n" +
    "- Output ONLY the corrected text (no quotes, no markdown).\n" +
    `Language: ${language}`;

  try {
    const resp = await llm.chat.completions.create({
      model: LLM_MODEL,
      temperature: 0.0,
      max_tokens: 120,
      messages: [
        { role: "system", content: system },
        { role: "user", content: original },
      ],
    });

    const corrected = resp?.choices?.[0]?.message?.content?.trim();
    if (!corrected) return { correctedMessage: original, didCorrect: false };

    // Safety: ignore if the correction drifts too far.
    const deltaTooBig =
      Math.abs(corrected.length - original.length) >
      Math.max(40, original.length * 0.6);

    if (deltaTooBig) return { correctedMessage: original, didCorrect: false };

    return { correctedMessage: corrected, didCorrect: corrected !== original };
  } catch (e) {
    console.error("correctUserMessage error:", e);
    return { correctedMessage: original, didCorrect: false };
  }
}

// ----------------------------- NEW: TRANSLATE TO ENGLISH (FOR SEARCH) -----------------------------

/**
 * Translate user input to English for better search coverage.
 * If the input is already English, return it unchanged.
 *
 * @param {Object} params
 * @param {string} params.message
 * @returns {Promise<{ translatedMessage: string, didTranslate: boolean }>}
 */
async function translateToEnglish({ message }) {
  const original = String(message || "").trim();
  if (!original) return { translatedMessage: original, didTranslate: false };
  if (!llm) return { translatedMessage: original, didTranslate: false };

  // Strict prompt to avoid extra text or meaning changes.
  const system =
    "You translate user text to English.\n" +
    "Rules:\n" +
    "- If the input is already English, return it exactly unchanged.\n" +
    "- Preserve product names, brands, sizes, and numbers.\n" +
    "- Do NOT add or remove meaning.\n" +
    "- Output ONLY the translated text (no quotes, no markdown).";

  try {
    const resp = await llm.chat.completions.create({
      model: LLM_MODEL,
      temperature: 0.0,
      max_tokens: 200,
      messages: [
        { role: "system", content: system },
        { role: "user", content: original },
      ],
    });

    const translated = resp?.choices?.[0]?.message?.content?.trim();
    if (!translated) {
      return { translatedMessage: original, didTranslate: false };
    }

    const deltaTooBig =
      Math.abs(translated.length - original.length) >
      Math.max(120, original.length * 1.8);

    if (deltaTooBig) {
      return { translatedMessage: original, didTranslate: false };
    }

    return {
      translatedMessage: translated,
      didTranslate: translated !== original,
    };
  } catch (e) {
    console.error("translateToEnglish error:", e);
    return { translatedMessage: original, didTranslate: false };
  }
}

// ----------------------------- SMART "RECIPIENT" HEURISTICS (to avoid wrong gender gifts) -----------------------------

/**
 * Simple fallback extraction (works even if the LLM plan fails).
 * Helps avoid mismatched gift categories.
 *
 * @param {string} message
 * @returns {string|null}
 */
function recipientHeuristic(message) {
  const t = normalize(message);

  // English
  if (/\bson\b|\bboy\b|\bmy son\b/.test(t)) return "son";
  if (/\bdaughter\b|\bgirl\b|\bmy daughter\b/.test(t)) return "daughter";
  if (/\bwife\b|\bgirlfriend\b|\bher\b/.test(t)) return "women";
  if (/\bhusband\b|\bboyfriend\b|\bhim\b/.test(t)) return "men";
  if (/\bkid\b|\bkids\b|\bchild\b|\bchildren\b/.test(t)) return "kids";

  // German (ASCII-only words)
  if (/\bsohn\b|\bjunge\b/.test(t)) return "son";
  if (/\btochter\b|\bmaedchen\b/.test(t)) return "daughter";
  if (/\bfrau\b|\bmeine frau\b|\bfreundin\b/.test(t)) return "women";
  if (/\bmann\b|\bmein mann\b|\bfreund\b/.test(t)) return "men";
  if (/\bkind\b|\bkinder\b/.test(t)) return "kids";

  return null;
}

/**
 * Apply safety rules for recipient preferences and exclusions.
 *
 * @param {object} plan
 * @param {string|null} recipient
 * @returns {object}
 */
function applyRecipientRules(plan, recipient) {
  if (!recipient) return plan;

  const avoid = new Set(plan.avoidCategories || []);
  const prefer = new Set(plan.preferCategories || []);

  // Gift for son / men: avoid women-specific categories
  if (recipient === "son" || recipient === "men") {
    avoid.add("Women's Clothing");
    avoid.add("Beauty");
    avoid.add("Jewelry");
    prefer.add("Men's Clothing");
    prefer.add("Sports");
    prefer.add("Electronics");
    prefer.add("Kids's Clothing"); // son could be a kid
  }

  // Gift for daughter / women: avoid men-specific categories
  if (recipient === "daughter" || recipient === "women") {
    avoid.add("Men's Clothing");
    prefer.add("Women's Clothing");
    prefer.add("Beauty");
    prefer.add("Jewelry");
    prefer.add("Kids's Clothing"); // daughter could be a kid
  }

  // Gift for kids: avoid adult-focused categories a bit
  if (recipient === "kids") {
    prefer.add("Kids's Clothing");
    prefer.add("Sports");
    prefer.add("Books");
    prefer.add("Electronics");
  }

  return {
    ...plan,
    recipient,
    preferCategories: Array.from(prefer).filter((c) =>
      ALLOWED_CATEGORIES.includes(c)
    ),
    avoidCategories: Array.from(avoid).filter((c) =>
      ALLOWED_CATEGORIES.includes(c)
    ),
  };
}

// ----------------------------- STEP 1: BUILD A "PLAN" (LLM extracts intent & constraints) -----------------------------

/**
 * Plan output example:
 * {
 *   "query": "gift for my son sneakers under 50",
 *   "recipient": "son"|"daughter"|"kids"|"men"|"women"|null,
 *   "minPrice": null,
 *   "maxPrice": 50,
 *   "preferCategories": ["Kids's Clothing","Sports"],
 *   "avoidCategories": ["Women's Clothing","Beauty","Jewelry"],
 *   "k": 3
 * }
 */
/**
 * Ask the LLM to build a structured plan from the user message.
 * This extracts query, categories, budget, and k.
 *
 * @param {Object} params
 * @param {string} params.message
 * @param {"en"|"de"} params.language
 * @param {Array} params.history
 * @returns {Promise<object|null>}
 */
async function buildPlanLLM({ message, language, history }) {
  if (!llm) return null;

  const system =
    "Return ONLY valid JSON. No markdown.\n" +
    'Schema: {"query":string,"recipient":"son"|"daughter"|"kids"|"men"|"women"|null,"minPrice":number|null,"maxPrice":number|null,"preferCategories":string[],"avoidCategories":string[],"k":number}\n' +
    "Rules:\n" +
    `- preferCategories/avoidCategories can ONLY use: ${JSON.stringify(ALLOWED_CATEGORIES)}\n` +
    "- If message is a gift request, identify the recipient if possible.\n" +
    "- If recipient is son/men -> avoid Women's Clothing, Beauty, Jewelry.\n" +
    "- If recipient is daughter/women -> avoid Men's Clothing.\n" +
    "- k must be 1..5.\n" +
    "Keep query short but meaningful.\n" +
    `Language: ${language}`;

  try {
    // Include short history to help the LLM interpret follow-ups.
    const historyMessages = toLlmHistory(history);
    const resp = await llm.chat.completions.create({
      model: LLM_MODEL,
      temperature: 0.2,
      max_tokens: 280,
      messages: [
        { role: "system", content: system },
        ...historyMessages,
        { role: "user", content: message },
      ],
    });

    const text = resp?.choices?.[0]?.message?.content?.trim();
    const plan = safeJsonParse(text);
    if (!plan) return null;

    const cleaned = {
      query: String(plan.query || message),
      recipient: plan.recipient || null,
      minPrice: plan.minPrice == null ? null : Number(plan.minPrice),
      maxPrice: plan.maxPrice == null ? null : Number(plan.maxPrice),
      preferCategories:
        Array.isArray(plan.preferCategories) ? plan.preferCategories : [],
      avoidCategories:
        Array.isArray(plan.avoidCategories) ? plan.avoidCategories : [],
      k: Math.min(Math.max(Number(plan.k || DEFAULT_K), 1), 5),
    };

    // Keep categories valid
    cleaned.preferCategories = cleaned.preferCategories.filter((c) =>
      ALLOWED_CATEGORIES.includes(c)
    );
    cleaned.avoidCategories = cleaned.avoidCategories.filter((c) =>
      ALLOWED_CATEGORIES.includes(c)
    );

    return cleaned;
  } catch (e) {
    console.error("buildPlanLLM error:", e);
    return null;
  }
}

// ----------------------------- STEP 2: DB RETRIEVAL (real products only) -----------------------------

/**
 * Build a MongoDB filter from the plan constraints.
 *
 * @param {object} plan
 * @returns {object}
 */
function buildMongoFilter(plan) {
  const filter = {};

  // Price filters
  if (plan?.minPrice != null || plan?.maxPrice != null) {
    filter.price = {};
    if (plan.minPrice != null) filter.price.$gte = plan.minPrice;
    if (plan.maxPrice != null) filter.price.$lte = plan.maxPrice;
  }

  // Hard exclude categories to avoid obvious mismatch
  if (plan?.avoidCategories?.length) {
    filter.category = { $nin: plan.avoidCategories };
  }

  return filter;
}

/**
 * Retrieve candidate products using text search and regex fallback.
 * The fallback handles typos and plural/singular variants.
 *
 * @param {Object} params
 * @param {string} params.message
 * @param {object} params.plan
 * @returns {Promise<Array>}
 */
async function retrieveCandidates({ message, plan }) {
  const filter = buildMongoFilter(plan);
  const queryText = String(plan?.query || message).trim();

  // Attempt MongoDB text search first (best relevance).
  let textItems = [];
  try {
    textItems = await Product.find({
      ...filter,
      $text: { $search: queryText },
    })
      .select("title description price category image averageRating createdAt")
      .select({ score: { $meta: "textScore" } })
      .sort({ score: { $meta: "textScore" }, averageRating: -1, createdAt: -1 })
      .limit(RETRIEVE_LIMIT)
      .lean();
  } catch {
    textItems = [];
  }

  if (textItems.length) {
    return textItems.map((p) => ({
      ...p,
      url: `${FRONTEND_BASE_URL}/product/${p._id}`,
    }));
  }

  // Fallback: regex keyword OR (limited, case-insensitive).
  const tokens = buildSearchTokens(queryText).slice(0, 10);

  if (!tokens.length) {
    const items = await Product.find(filter)
      .select("title description price category image averageRating createdAt")
      .sort({ averageRating: -1, createdAt: -1 })
      .limit(RETRIEVE_LIMIT)
      .lean();

    return items.map((p) => ({
      ...p,
      url: `${FRONTEND_BASE_URL}/product/${p._id}`,
    }));
  }

  const ors = tokens.map((token) => {
    const safe = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${safe}`, "i");
    return { $or: [{ title: re }, { description: re }, { category: re }] };
  });

  const flatOrs = ors.map((x) => x.$or).flat();

  const items = await Product.find({ ...filter, $or: flatOrs })
    .select("title description price category image averageRating createdAt")
    .sort({ averageRating: -1, createdAt: -1 })
    .limit(RETRIEVE_LIMIT)
    .lean();

  return items.map((p) => ({
    ...p,
    url: `${FRONTEND_BASE_URL}/product/${p._id}`,
  }));
}

/**
 * Fetch simple "bestsellers" (highest rating, newest as tie-break).
 *
 * @param {Object} params
 * @param {number} params.limit
 * @returns {Promise<Array>}
 */
async function getBestSellers({ limit = BESTSELLER_LIMIT } = {}) {
  const items = await Product.find({})
    .select("title description price category image averageRating createdAt")
    .sort({ averageRating: -1, createdAt: -1 })
    .limit(limit)
    .lean();

  return items.map((p) => ({
    ...p,
    url: `${FRONTEND_BASE_URL}/product/${p._id}`,
  }));
}

// ----------------------------- STEP 3: LLM RERANK (smart ranking based on question) -----------------------------

/**
 * Rerank candidates with the LLM based on intent and constraints.
 * Returns ordered ids or a clarifying question.
 *
 * @param {Object} params
 * @param {string} params.message
 * @param {"en"|"de"} params.language
 * @param {object} params.plan
 * @param {Array} params.candidates
 * @param {Array} params.history
 * @returns {Promise<{orderedIds: string[], oneQuestion: string|null}|null>}
 */
async function rerankWithLLM({ message, language, plan, candidates, history }) {
  if (!llm) return null;

  const shortlist = candidates.slice(0, RERANK_LIMIT);
  const packed = shortlist.map((p) => ({
    id: String(p._id),
    title: p.title,
    category: p.category,
    price: Number(p.price || 0),
    rating: Number(p.averageRating || 0),
    description: String(p.description || "").slice(0, 180),
  }));

  const system =
    "You are a ranking engine for an ecommerce shop.\n" +
    "Return ONLY valid JSON. No markdown.\n" +
    'Schema: {"orderedIds": string[], "oneQuestion": string|null}\n' +
    "Rules:\n" +
    "- orderedIds MUST contain only ids from the provided products.\n" +
    "- Rank by: recipient fit, intent, constraints (budget), category match, usefulness.\n" +
    "- Strongly avoid categories listed in plan.avoidCategories.\n" +
    "- If user request is too vague, set oneQuestion to ONE short clarifying question.\n" +
    `Language for oneQuestion: ${language}`;

  const user =
    `User message: ${message}\n` +
    `Plan: ${JSON.stringify(plan)}\n` +
    `Products: ${JSON.stringify(packed)}`;

  try {
    // Include short history to keep reranking context-aware.
    const historyMessages = toLlmHistory(history);
    const resp = await llm.chat.completions.create({
      model: LLM_MODEL,
      temperature: 0.35,
      max_tokens: 380,
      messages: [
        { role: "system", content: system },
        ...historyMessages,
        { role: "user", content: user },
      ],
    });

    const text = resp?.choices?.[0]?.message?.content?.trim();
    const data = safeJsonParse(text);
    if (!data || !Array.isArray(data.orderedIds)) return null;

    const allowed = new Set(packed.map((p) => p.id));
    const orderedIds = data.orderedIds
      .map(String)
      .filter((id) => allowed.has(id));

    return {
      orderedIds,
      oneQuestion: data.oneQuestion ? String(data.oneQuestion) : null,
    };
  } catch (e) {
    console.error("rerankWithLLM error:", e);
    return null;
  }
}

// ----------------------------- STEP 4: Generate a short intro text (optional) -----------------------------

/**
 * Generate a short natural language intro for the recommendations.
 * Kept optional so the system works without the LLM.
 *
 * @param {Object} params
 * @param {string} params.message
 * @param {"en"|"de"} params.language
 * @param {object} params.plan
 * @param {Array} params.topProducts
 * @param {Array} params.history
 * @returns {Promise<string|null>}
 */
async function generateIntro({
  message,
  language,
  plan,
  topProducts,
  history,
}) {
  if (!llm) return null;

  const products = topProducts.map((p) => ({
    title: p.title,
    price: Number(p.price || 0),
    category: p.category,
  }));

  const system =
    "Write ONLY 1-3 short sentences.\n" +
    "Do NOT use bullet points.\n" +
    "Do NOT invent details.\n" +
    "If you need more info, ask ONE short question.\n" +
    `Language: ${language}`;

  const user =
    `User message: ${message}\n` +
    `Plan: ${JSON.stringify(plan)}\n` +
    `Top products: ${JSON.stringify(products)}`;

  try {
    // Short history helps the intro stay on-topic.
    const historyMessages = toLlmHistory(history);
    const resp = await llm.chat.completions.create({
      model: LLM_MODEL,
      temperature: 0.7,
      max_tokens: 160,
      messages: [
        { role: "system", content: system },
        ...historyMessages,
        { role: "user", content: user },
      ],
    });

    const text = resp?.choices?.[0]?.message?.content?.trim();
    return text ? stripUrls(text) : null;
  } catch {
    return null;
  }
}

// ----------------------------- CONTROLLER -----------------------------

/**
 * POST /chat/message
 * Body: { message: string, history?: Array }
 * Returns: { botResponse: string, products: any[], correctedMessage?: string }
 *
 * Main controller flow:
 * - normalize input + history
 * - build plan (LLM if available)
 * - retrieve candidates (text search + fallback)
 * - rerank (LLM if available)
 * - return markdown + products
 */
export const createChatMessage = async (req, res) => {
  try {
    const rawMessage = String(req.body?.message || "").trim();
    if (!rawMessage) {
      return res
        .status(400)
        .json({ botResponse: "Please send a message.", products: [] });
    }

    // Lightweight language detection for response language.
    const language = detectLanguage(rawMessage);
    // Normalize client history to avoid prompt bloat.
    const history = normalizeHistory(req.body?.history);

    // ✅ 0) Correct message typos first (important for $text search + rerank quality)
    const { correctedMessage, didCorrect } = await correctUserMessage({
      message: rawMessage,
      language,
    });

    const message = correctedMessage;
    // For short follow-ups, merge the previous user message.
    const contextualMessage = buildContextualMessage(message, history);

    // Handle small talk without polluting product recommendations.
    const smallTalkIntent = detectSmallTalkIntent(message);
    if (smallTalkIntent) {
      return res.status(200).json({
        botResponse: buildSmallTalkResponse(smallTalkIntent, language),
        products: [],
        correctedMessage: didCorrect ? message : undefined,
      });
    }

    // ✅ 1) Build plan (LLM), fallback to simple plan if LLM missing/fails
    const llmPlan = (await buildPlanLLM({ message, language, history })) || {
      query: contextualMessage,
      recipient: null,
      minPrice: null,
      maxPrice: null,
      preferCategories: [],
      avoidCategories: [],
      k: DEFAULT_K,
    };

    // ✅ 1b) Apply heuristic recipient detection (extra safety against wrong gender gifts)
    const guessedRecipient = llmPlan.recipient || recipientHeuristic(message);
    const plan = applyRecipientRules(llmPlan, guessedRecipient);
    const k = Math.min(Math.max(Number(plan.k || DEFAULT_K), 1), 5);

    // If user asks for gift but we still don't know recipient -> ask a quick question
    const giftIntent =
      /\b(gift|present|geschenk|geburtstag|weihnachten)\b/i.test(message);
    if (giftIntent && !plan.recipient) {
      const q =
        language === "de" ?
          "Fuer wen ist das Geschenk (z.B. Sohn/Tochter/Mann/Frau) und welches Budget hast du?"
        : "Who is the gift for (son/daughter/men/women) and what is your budget?";
      return res.status(200).json({
        botResponse: didCorrect ? `I understood: "${message}"\n\n${q}` : q,
        products: [],
        correctedMessage: didCorrect ? message : undefined,
      });
    }

    // Generic "recommend me" with no constraints -> show bestsellers.
    if (isGenericRecommendation(message, plan)) {
      const bestsellers = await getBestSellers({ limit: k });
      if (bestsellers.length) {
        const intro =
          language === "de" ?
            "Hier sind einige unserer Bestseller."
          : "Here are some of our bestsellers.";
        const list = buildProductMarkdown(bestsellers, language);
        const correctionLine =
          didCorrect ? `I understood: "${message}"\n\n` : "";
        const botResponse = `${correctionLine}${intro}\n\n${list}`;

        return res.status(200).json({
          botResponse,
          products: bestsellers,
          correctedMessage: didCorrect ? message : undefined,
        });
      }
    }

    // ✅ 2) Retrieve candidates from DB (real products only)
    const candidates = await retrieveCandidates({
      message: contextualMessage,
      plan,
    });

    if (!candidates.length) {
      const bestsellers = await getBestSellers({ limit: k });
      if (bestsellers.length) {
        const msg =
          language === "de" ?
            "Ich finde aktuell keine passenden Produkte. Hier sind ein paar Bestseller."
          : "I couldn't find a close match. Here are some bestsellers.";
        const list = buildProductMarkdown(bestsellers, language);
        const correctionLine =
          didCorrect ? `I understood: \"${message}\"\n\n` : "";
        const botResponse = `${correctionLine}${msg}\n\n${list}`;

        return res.status(200).json({
          botResponse,
          products: bestsellers,
          correctedMessage: didCorrect ? message : undefined,
        });
      }

      const msg =
        language === "de" ?
          "Ich finde aktuell keine passenden Produkte. Kannst du Kategorie oder Budget nennen?"
        : "I can’t find matching products right now. Can you share a category or budget?";
      return res.status(200).json({
        botResponse: didCorrect ? `I understood: "${message}"\n\n${msg}` : msg,
        products: [],
        correctedMessage: didCorrect ? message : undefined,
      });
    }

    // ✅ 3) Rerank candidates with LLM (smart ranking based on meaning)
    const rerank = await rerankWithLLM({
      message,
      language,
      plan,
      candidates,
      history,
    });

    // If reranker says it's too vague -> ask the one question
    if (rerank?.oneQuestion) {
      return res.status(200).json({
        botResponse:
          didCorrect ?
            `I understood: "${message}"\n\n${rerank.oneQuestion}`
          : rerank.oneQuestion,
        products: [],
        correctedMessage: didCorrect ? message : undefined,
      });
    }

    // Build final ordered list
    let ordered = candidates;

    if (rerank?.orderedIds?.length) {
      const byId = new Map(candidates.map((p) => [String(p._id), p]));
      const first = rerank.orderedIds
        .map((id) => byId.get(String(id)))
        .filter(Boolean);

      // Keep all candidates (after the ranked ones) as fallback
      const used = new Set(first.map((p) => String(p._id)));
      const rest = candidates.filter((p) => !used.has(String(p._id)));

      ordered = [...first, ...rest];
    }

    // Soft category boost (prefer categories get a small priority)
    if (plan.preferCategories?.length) {
      const prefer = new Set(plan.preferCategories);
      ordered = ordered.slice().sort((a, b) => {
        const ap = prefer.has(a.category) ? 1 : 0;
        const bp = prefer.has(b.category) ? 1 : 0;
        if (bp !== ap) return bp - ap;
        // tie-break: rating then newest
        return Number(b.averageRating || 0) - Number(a.averageRating || 0);
      });
    }

    // ✅ 4) Pick top K
    const top = ordered.slice(0, k);

    // ✅ 5) Create a short intro + product markdown list (images included)
    const intro = await generateIntro({
      message,
      language,
      plan,
      topProducts: top,
      history,
    });
    const list = buildProductMarkdown(top, language);

    const correctionLine = didCorrect ? `I understood: "${message}"\n\n` : "";

    const botResponse =
      intro ?
        `${correctionLine}${intro}\n\n${list}`
      : `${correctionLine}${list}`;

    return res.status(200).json({
      botResponse,
      products: top, // Best practice: render images/cards from this array in the frontend
      correctedMessage: didCorrect ? message : undefined,
    });
  } catch (err) {
    console.error("Chat controller error:", err);
    return res.status(500).json({ botResponse: "Server error.", products: [] });
  }
};
