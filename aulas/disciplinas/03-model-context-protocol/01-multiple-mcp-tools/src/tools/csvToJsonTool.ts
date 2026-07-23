import { tool } from "langchain";

import csvtojson from "csvtojson";
import { z } from "zod/v3";

// Tool personalizada para a LLM conseguir converter arquivos CSV para JSON
export function getCSVTOJSONTool() {
  return tool(
    async ({ csvText }) => {
      const result = await csvtojson().fromString(csvText);
      console.log(
        "[getCSVToJSONTool] conversion result finished",
        result.length,
        "records",
      );

      return JSON.stringify(result);
    },
    {
      name: "csv_to_json",
      description: "Convert CSV to JSON format",
      schema: z.object({
        csvText: z.string().describe("CSV Data to be converted to JSON format"),
      }),
    },
  );
}
