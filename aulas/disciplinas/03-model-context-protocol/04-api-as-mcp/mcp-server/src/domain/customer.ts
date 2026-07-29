import { z } from "zod/v3";

export const CustomerSchema = z.object({
  _id: z.string().optional(),
  name: z.string(),
  phone: z.string(),
});

export const CustomerUpdateSchema = CustomerSchema.extend({
  _id: z.string().describe("MongoDB ObjectID of the customer"),
});

export const CustomerSearchSchema = z.object({
  _id: z.string().optional().describe("MongoDB ObjectID of the customer"),
  phone: z.string().optional().describe("Phone number of the customer"),
  name: z.string().optional().describe("Full name of the customer"),
});

export const CustomerMutationSchema = z.object({
  message: z.string().describe("Confirmation message"),
  id: z.string().optional().describe("MongoDB ObjectID of the customer"),
  isError: z.boolean().optional().describe("Indicates if an error ocurred"),
});

export type Customer = z.infer<typeof CustomerSchema>;
export type CustomerSearch = z.infer<typeof CustomerSearchSchema>;
export type CustomerUpdate = z.infer<typeof CustomerUpdateSchema>;
export type CustomerMutation = z.infer<typeof CustomerMutationSchema>;
