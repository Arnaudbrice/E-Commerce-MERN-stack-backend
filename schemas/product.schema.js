import { z } from "zod/v4";

export const productSchema = z.object({
  title: z.string().min(1, "Title Should Be At Least 1 Character"),
  price: z
    .string()
    .regex(
      /^\d+(\.\d{1,34})?$/,
      "Price must be a valid number with up to 34 decimal places"
    ),

  description: z
    .string()
    .min(20, "Description Should Be At Least 20 Characters"),
  category: z.enum([
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
  ]),
  image: z.string().optional(), // Optional because I am handling file uploads (cloudinary and multer will handle validation and storage)
  stock: z.coerce.number().min(0, "Stock Should Be At Least 0"), //formData sent client side turns number to string automatically, so we need to coerce it to number
});
