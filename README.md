# E-Commerce MERN Backend

Node/Express API for the MERN e-commerce app. It handles authentication, products, cart, orders, and payments.

## Features

- JWT auth stored in httpOnly cookies
- Products CRUD, search, pagination, favorites, ratings
- Cart management and Stripe checkout session
- Orders with PDF invoice download
- Image uploads to Cloudinary

## Tech stack

- Node.js, Express.js
- MongoDB (Mongoose)
- JWT + bcrypt
- Stripe, Cloudinary, Nodemailer

## Requirements

- Node.js 20+ (uses `node --watch --env-file`)
- A MongoDB database
- Stripe keys
- Cloudinary credentials (for image uploads)
- Email provider credentials (Gmail or SendGrid)

## Getting started

1. Install dependencies:
   ```
   npm install
   ```
2. Create a `.env` file (see below).
3. Run the server:
   ```
   npm run dev
   ```

By default the API runs on `http://localhost:3000`.

## Scripts

- `npm run dev` - start with file watching and `.env` loading
- `npm start` - start without watch mode

## Environment variables

Create a `.env` file at the project root:

```
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=3
NODE_ENV=development

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

SENDGRID_API_KEY=your_sendgrid_api_key
GMAIL_EMAIL=your_gmail_address
GMAIL_APP_PASSWORD=your_gmail_app_password

FRONTEND_BASE_URL=http://localhost:5173

STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
STRIPE_SECRET_KEY=your_stripe_secret_key

GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.1-8b-instant

CHAT_RETRIEVE_LIMIT=120
CHAT_RERANK_LIMIT=30
CHAT_K=3
CHAT_BESTSELLER_LIMIT=6
CHAT_TOKEN_PREFIX=4

PORT=3000
```

Notes:

- Cookies are used for auth. Your frontend should send `credentials: "include"`.
- If you see CORS errors, update the `allowOrigins` list in `index.js`.

## API overview

Base paths:

- `/auth` for authentication
- `/users` for products, cart, orders

Health check:

- `GET /health`

Auth:

- `POST /auth/register`
- `POST /auth/login`
- `DELETE /auth/logout`
- `GET /auth/me`
- `POST /auth/mail-reset-password`
- `GET /auth/reset-password/:token`
- `POST /auth/reset-password/:token`

Products:

- `GET /users/products` (supports `?search=&page=`)
- `GET /users/products/categories`
- `GET /users/products/favorite` (auth)
- `GET /users/products/:id` (auth)
- `POST /users/products` (auth, multipart with `image`)
- `PUT /users/products/:id` (auth, multipart with `image`)
- `DELETE /users/products/:id` (auth)
- `PUT /users/products/:id/favorite` (auth)
- `PUT /users/products/:id/rating` (auth)
- `PUT /users/products/:id/reduce-stock` (auth)

Cart:

- `GET /users/cart` (auth)
- `POST /users/cart` (auth)
- `GET /users/cart/products/:id` (auth)
- `DELETE /users/cart/products/:id` (auth)
- `DELETE /users/cart/clear` (auth)
- `POST /users/cart/create-checkout-session` (auth)

Orders:

- `GET /users/orders` (auth, supports `?page=`)
- `POST /users/orders` (auth)
- `GET /users/orders/:id/invoice` (auth, returns PDF)

## Chat assistant flow (chat.controller.js)

Endpoint:

- `POST /chat/message`

How it works (high level):

- Detects language with a simple EN/DE heuristic.
- Optionally fixes typos with the LLM (if `GROQ_API_KEY` is set).
- Builds a plan with the LLM (query, price range, categories, k); falls back to a simple plan if LLM is not available.
- Applies recipient heuristics for gift queries (son/daughter/men/women/kids).
- If the user asks for a gift but no recipient is clear, returns one short follow-up question.
- For generic "recommend me" messages, returns bestsellers (sorted by rating then newest).
- Retrieves candidates from MongoDB using `$text` search (requires a text index); if no hits, falls back to a regex search on title/description/category with plural/prefix tokens.
- If no matches, falls back to bestsellers, otherwise asks for category/budget.
- If LLM is available, reranks candidates and can ask one clarifying question.
- Returns `botResponse` as markdown and a `products` array for the UI.

Notes:

- Set `FRONTEND_BASE_URL` so product links point to the right UI.
- Recommended text index:
  `ProductSchema.index({ title: "text", description: "text", category: "text" })`
- Bestsellers are defined as highest `averageRating` then newest `createdAt`.

Example request/response:

```http
POST /chat/message
Content-Type: application/json
Cookie: token=...

{ "message": "Is a laptop an SSD?" }
```

```json
{
  "botResponse": "Here are a few good matches.\n\n### Recommendations\n\n- **Example Product**\n  - Price: €49.99\n  - Category: Electronics\n  - Image: [![Example Product](https://.../image.png)](http://localhost:5173/product/123)\n",
  "products": [
    {
      "_id": "123",
      "title": "Example Product",
      "price": 49.99,
      "category": "Electronics",
      "image": "https://.../image.png"
    }
  ]
}
```

Frontend rendering notes:

- The frontend renders `botResponse` as markdown.
- The image line is link-wrapped, so clicking the image opens the product page.

## Project structure

```
controllers/
db/
middlewares/
models/
routers/
schemas/
services/
utils/
index.js
```
