import { type Neo4jVectorStore } from "@langchain/community/vectorstores/neo4j_vector";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";

type DebugLog = (...args: unknown[]) => void;

type Params = {
  debugLog: DebugLog;
  vectorStore: Neo4jVectorStore;
  nlpModel: ChatOpenAI;
  promptConfig: any;
  templateText: string;
  topK: number;
};

interface ChainState {
  question: string;
  context?: string;
  topScore?: number;
  error?: string;
  answer?: string;
}

export class AI {
  private params: Params;

  constructor(params: Params) {
    this.params = params;
  }

  // Traz o dados do vetorStore baseados na pergunta do usuário
  async retrieveVectorSearchResults(input: ChainState): Promise<ChainState> {
    this.params.debugLog("[AI]: Retrieving vector search results");
    const vectorResults =
      await this.params.vectorStore.similaritySearchWithScore(
        input.question,
        this.params.topK,
      );

    if (!vectorResults.length) {
      this.params.debugLog("[AI]: No similar documents found");
      return {
        ...input,
        error: "Desculpe, não consegui encontrar a resposta para sua pergunta.",
      };
    }

    this.params.debugLog(
      `[AI]: Found ${vectorResults.length} similar documents`,
    );

    const topScore = vectorResults[0]![1];

    this.params.debugLog(`[AI]: Top score: ${(topScore * 100).toFixed(2)}%`);

    const context = vectorResults
      .filter(([, score]) => score > 0.5)
      .map(([document]) => document.pageContent)
      .join("\n---\n");

    this.params.debugLog(`[AI]: Found ${context.length} contexts`);

    return {
      ...input,
      topScore,
      context,
    };
  }

  // Traz a resposta do nlpModel baseado na pergunta do usuário e nos dados do vetorStore
  async generateNLPREsponse(input: ChainState): Promise<ChainState> {
    if (input.error) return input;

    this.params.debugLog("[AI]: Generating NLP response");

    // Load the response prompt template
    const responsePrompt = ChatPromptTemplate.fromTemplate(
      this.params.templateText,
    );

    const responseChain = responsePrompt
      .pipe(this.params.nlpModel) // Envia o prompt para o modelo de linguagem
      .pipe(new StringOutputParser()); // Traz a resposta do modelo de linguagem em formato de texto

    const rawResponse = await responseChain.invoke({
      role: this.params.promptConfig.role,
      task: this.params.promptConfig.task,
      tone: this.params.promptConfig.constraints.tone,
      language: this.params.promptConfig.constraints.language,
      format: this.params.promptConfig.constraints.format,
      instructions: this.params.promptConfig.instructions
        .map((instruction: string, idx: number) => `${idx + 1}. ${instruction}`)
        .join("\n"),
      question: input.question,
      context: input.context,
    });

    return {
      ...input,
      answer: rawResponse,
    };
  }

  async answerQuestion(question: string) {
    // O retorno de um método é a entrada do próximo método, funciona como uma cadeia de execução
    const chain = RunnableSequence.from([
      this.retrieveVectorSearchResults.bind(this),
      this.generateNLPREsponse.bind(this),
    ]);

    // A question é passada como argumento de retrieveVectorSearchResults e logo em seguida é passada para generateNLPREsponse
    const result = await chain.invoke({ question });

    return result;
  }
}
