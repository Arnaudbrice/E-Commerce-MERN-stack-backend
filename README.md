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
JWT_REXPIRES_IN=3
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
