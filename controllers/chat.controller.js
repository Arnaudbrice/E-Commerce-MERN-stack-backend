import { OpenAI } from "openai";
import Product from "../models/Product.js";

//create a new instance of the OpenAI class with our groq API key and base URL
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1"
});

//********** POST /chat/message **********
export const createChatMessage = async (req, res) => {
  const userID = req.user._id;

  const { message, products } = req.body;
  console.log("message", message);

  // 3 best rated products from the database
  const bestsellers = await Product.find().sort({ averageRating: -1 }).limit(3);

  console.log("bestsellers", bestsellers);
  //! note:By passing the data as JSON to the system prompt (RAG principle), we prevent hallucinations.

  //create a new chat message
  const chatMessage = await groq.chat.completions.create({
    model: "allam-2-7b", //model from groq with 500k tokens per day (free) and 30 requests per minute (free)
    messages: [
      {
        role: "user",
        content: message,
      },
      {
        role: "system",
        content: `As the official purchasing consultant for Bon Marché, your role is to provide friendly advice to customers and recommend our products.

RULES:
1. If the user asks for recommendations, mention the bestsellers. Here are the current top products from our database:
${JSON.stringify(bestsellers)}

2. If the user has questions about a specific product, use the provided product details from the product found in the following list of products:${JSON.stringify(products)}

3. Don't fabricate facts. If you don't know something, offer to contact customer service.

You will respond briefly, politely, and in a sales-oriented manner.`,
      },
    ],
    temperature: 0.5,
    max_tokens: 1000,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
  });

  res.status(201).json({ botResponse: chatMessage.choices[0].message.content });
};
