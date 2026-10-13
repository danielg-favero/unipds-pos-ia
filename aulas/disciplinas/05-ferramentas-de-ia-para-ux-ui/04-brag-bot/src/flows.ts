import { genkit, z } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { fallback, retry } from '@genkit-ai/middleware';
import { v4 as uuidv4 } from 'uuid';

export const ai = genkit({
  plugins: [googleAI()],
  model: googleAI.model('gemini-flash-latest', { temperature: 0.8 }),
});

export const BragInputSchema = z.object({
  definition: z
    .string()
    .describe('Informal draft written by the user describing a work accomplishment.'),
});

export const BragSchema = z.object({
  title: z.string().describe('Short title combining the main action and the high-level result.'),
  context: z
    .string()
    .describe('Original situation or problem: what was broken, slow, risky or missing.'),
  actionTaken: z
    .string()
    .describe('Step-by-step technical or strategic actions taken to solve the problem.'),
  businessImpact: z
    .string()
    .describe('Business impact achieved, such as time saved, fewer failures or cost reduction.'),
  metrics: z
    .array(z.string())
    .describe('Strictly quantifiable data points only, e.g. "50% reduction in build time".'),
  technologiesUsed: z
    .array(z.string())
    .describe('Tools, languages and platforms mentioned or reasonably inferred from the draft.'),
});

export type BragInput = z.infer<typeof BragInputSchema>;
export type Brag = z.infer<typeof BragSchema>;

export const bragGeneratorFlow = ai.defineFlow(
  {
    name: 'bragGeneratorFlow',
    inputSchema: BragInputSchema,
    outputSchema: BragSchema,
  },
  async (input) => {
    const prompt = `You are a Senior Career Consultant specialized in Individual Development Plans (IDP) for Software Engineers.

Your goal is to transform the user's informal draft below into an executive "Brag Document" entry.

Rules:
1. Use a professional, objective and impact-focused tone. Do not use emotional adjectives.
2. If no exact metrics are provided, infer the nature of the metric based on the action taken (e.g. "Reduction in deployment time" instead of inventing numbers).
3. Follow EXACTLY the JSON schema format provided (BragSchema).
4. The output MUST be written in the same language as the original input (if the draft is in Portuguese, answer in Portuguese).

User draft:
${input.definition}`;

    const { output } = await ai.generate({
      prompt,
      output: { schema: BragSchema },
      use: [
        retry({ maxRetries: 3, initialDelayMs: 1000, backoffFactor: 2 }),
        fallback({ models: [googleAI.model('gemini-flash-lite-latest')] }),
      ],
    });

    if (!output) {
      throw new Error('Failed to generate a valid Brag Document from the provided draft.');
    }

    return {
      ...output,
      id: uuidv4(),
    };
  },
);
