# 🛍️ Bon Marché — E-Commerce API (Backend)

This is the backend API for the **Bon Marché** E-Commerce platform. It's a robust RESTful API built with Node.js, Express, and MongoDB, providing all the necessary functionality for a modern e-commerce application, including authentication, product management, order processing, and an AI shopping assistant.

![Node.js](https://img.shields.io/badge/Node.js-20+-43853D?logo=node.js)
![Express.js](https://img.shields.io/badge/Express.js-4-000000?logo=express)
![MongoDB](https://img.shields.io/badge/MongoDB-6-47A248?logo=mongodb)
![JWT](https://img.shields.io/badge/JWT-Auth-black?logo=jsonwebtokens)
![Stripe](https://img.shields.io/badge/Stripe-API-635BFF?logo=stripe)
![License](https://img.shields.io/badge/License-MIT-green)

---

### **🌐 Live**

> **Live:** [https://e-commerce-mern-stack-frontend-q5j0.onrender.com/](https://e-commerce-mern-stack-frontend-q5j0.onrender.com)

---

## ✨ Features

- **Secure Authentication**: JWT-based authentication with HttpOnly cookies and password hashing using `bcrypt`.
- **Product Management**: Full CRUD operations for products, including image uploads to Cloudinary.
- **Search & Pagination**: Advanced text search on products with server-side pagination.
- **User Features**: Manage wishlists (favorites) and submit product ratings and reviews.
- **Shopping Cart**: Persistent cart management tied to user accounts.
- **Stripe Integration**: Create checkout sessions for secure payment processing.
- **Order Processing**: Create orders, store transaction details, and generate PDF invoices.
- **AI Shopping Assistant**: Integrates with Groq (LLaMA 3.1) to provide conversational product recommendations.
- **Security**: Includes rate limiting, CORS, and security headers via Helmet.js.
- **Email Notifications**: Sends order confirmations and password reset emails using Nodemailer.

---

## 🛠️ Tech Stack

| Category           | Technology                                            |
| :----------------- | :---------------------------------------------------- |
| **Core**           | Node.js, Express.js, Mongoose                         |
| **Database**       | MongoDB                                               |
| **Authentication** | `jsonwebtoken` (JWT), `bcrypt`                        |
| **Payments**       | `stripe`                                              |
| **File Storage**   | `cloudinary` (for images), `multer` (for uploads)     |
| **AI / LLM**       | `openai` (Groq-compatible SDK)                        |
| **Email**          | `nodemailer`                                          |
| **Security**       | `helmet`, `express-rate-limit`, `cors`                |
| **Utilities**      | `pdfkit` (for invoices), `franc` (language detection) |

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v20 or higher, for `--env-file` support)
- npm or a compatible package manager
- MongoDB (local instance or a cloud service like MongoDB Atlas)
- Accounts for Stripe, Cloudinary, and an email provider (e.g., SendGrid or Gmail).
- Groq API Key for the AI assistant.

### Installation & Setup

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/Arnaudbrice/E-Commerce-MERN-stack-backend.git
    cd Project-Mern-stack-e-commerce/E-Commerce-MERN-stack-backend
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Create an environment file:**
    Create a `.env` file in the `E-Commerce-MERN-stack-backend` root and add the variables from the example below.

4.  **Run the development server:**
    ```bash
    npm run dev
    ```
    The API will be available at `http://localhost:3000`.

---

### **🔑 Environment Variables (`.env`)**

```env
# Server Configuration
PORT=3000
NODE_ENV=development
FRONTEND_BASE_URL=http://localhost:5173

# MongoDB Connection
MONGODB_URI=your_mongodb_connection_string

# JWT Authentication
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRES_IN=3d

# Stripe API Keys
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key

# Cloudinary Credentials
CLOUDINARY_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

# Email (Nodemailer with Gmail)
GMAIL_EMAIL=your_gmail_address@gmail.com
GMAIL_APP_PASSWORD=your_google_app_password

# AI Assistant (Groq)
GROQ_API_KEY=gsk_your_groq_api_key
```

---

## 🤖 AI Shopping Assistant Flow

The chat assistant (`chat.controller.js`) uses a multi-step process to provide intelligent recommendations:

1.  **Language Detection**: Identifies the user's language (EN/DE).
2.  **Intent Classification**: Uses Groq's LLaMA 3.1 to determine if the user is searching for a product, asking a question, or making small talk.
3.  **Entity Extraction**: Extracts key information like categories, price range, and keywords from the user's message.
4.  **Database Search**: Performs a text search in MongoDB to find matching products.
5.  **Reranking & Response Generation**: The LLM reranks the search results for relevance and generates a human-friendly response, including product cards formatted in Markdown.
6.  **Fallback**: If no products are found, it suggests bestsellers or asks clarifying questions.

---

## 📁 API Endpoints

A brief overview of the main API routes. All routes are prefixed with `/`.

| Method       | Endpoint                              | Description                          | Access |
| :----------- | :------------------------------------ | :----------------------------------- | :----- |
| **Auth**     |                                       |                                      |        |
| `POST`       | `/auth/register`                      | Register a new user.                 | Public |
| `POST`       | `/auth/login`                         | Log in a user.                       | Public |
| `POST`       | `/auth/logout`                        | Log out a user.                      | User   |
| `GET`        | `/auth/me`                            | Get the current authenticated user.  | User   |
| **Products** |                                       |                                      |        |
| `GET`        | `/users/products`                     | Get all products with pagination.    | Public |
| `GET`        | `/users/products/:id`                 | Get a single product by ID.          | Public |
| `POST`       | `/admin/products`                     | Create a new product.                | Admin  |
| `PUT`        | `/admin/products/:id`                 | Update an existing product.          | Admin  |
| `DELETE`     | `/admin/products/:id`                 | Delete a product.                    | Admin  |
| `PUT`        | `/users/products/:id/rating`          | Add or update a product rating.      | User   |
| **Cart**     |                                       |                                      |        |
| `GET`        | `/users/cart`                         | Get the user's cart.                 | User   |
| `POST`       | `/users/cart`                         | Add a product to the cart.           | User   |
| `POST`       | `/users/cart/create-checkout-session` | Create a Stripe checkout session.    | User   |
| **Orders**   |                                       |                                      |        |
| `POST`       | `/users/orders`                       | Create a new order from the cart.    | User   |
| `GET`        | `/users/orders`                       | Get all orders for the current user. | User   |
| `GET`        | `/users/orders/:id/invoice`           | Download a PDF invoice for an order. | User   |
| **Chat**     |                                       |                                      |        |
| `POST`       | `/chat/message`                       | Send a message to the AI assistant.  | Public |

---

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
