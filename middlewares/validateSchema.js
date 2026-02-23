import { z } from "zod/v4";
// high order function to validate any Schema passed as argument
const validateSchema = (schema) => async (req, res, next) => {
  const { success, data, error } = await schema.safeParse(req.body);
  if (!success) {
    const message = z.prettifyError(error);
    console.log("message", message);
    throw new Error(message, {
      cause: 400,
    });
  }
  req.body = data;
  next();
};

export default validateSchema;
