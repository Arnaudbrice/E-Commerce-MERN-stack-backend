import { z } from "zod/v4";

const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!.@#$%^&*])/;
export const registerSchema = z.object({
  email: z.string().trim().email("Email Should Be A Valid Email"),
  password: z
    .string()
    .min(8, "Password Should Be At Least 8 Characters")
    .max(100, "Password Should Be At Most 100 Characters")
    .regex(regex, {
      error:
        "Password Should Contain At Least One Uppercase Letter, One Lowercase Letter, One Number, And One Special Character",
    }),
  passwordConfirmation: z
    .string()
    .min(8, "Confirm Password Should Be At Least 8 Characters")
    .max(100, "Confirm Password Should Be At Most 100 Characters")
    .regex(regex, {
      error:
        "Confirm Password Should Contain At Least One Uppercase Letter, One Lowercase Letter, One Number, And One Special Character",
    }),
});
export const loginSchema = z.object({
  email: z.string().trim().email("Email Should Be A Valid Email"),
  password: z
    .string()
    .min(8, "Password Should Be At Least 8 Characters")
    .max(100, "Password Should Be At Most 100 Characters")
    .regex(regex, {
      error:
        "Password Should Contain At Least One Uppercase Letter, One Lowercase Letter, One Number, And One Special Character",
    }),
});
