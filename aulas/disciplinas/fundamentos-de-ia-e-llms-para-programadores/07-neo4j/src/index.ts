import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { type PretrainedOptions } from "@huggingface/transformers";
import { Neo4jVectorStore } from "@langchain/community/vectorstores/neo4j_vector";
import { ChatOpenAI } from "@langchain/openai";
import { mkdir, writeFile } from "node:fs/promises";

import { DocumentProcessor } from "./document-processor.ts";
import { CONFIG } from "./config.ts";
import { AI } from "./ai.ts";

let _neo4jVectorStore = null;

async function clearAll(
  vectorStore: Neo4jVectorStore,
  nodeLabel: string,
): Promise<void> {
  console.log(`[Neo4jVectorStore]: Deleting all nodes with label ${nodeLabel}`);
  await vectorStore.query(`MATCH (n: ${nodeLabel}) DETACH DELETE n`);
  console.log(`[Neo4jVectorStore]: All nodes with label ${nodeLabel} deleted`);
}

try {
  console.log(`Iniciando processo...`);

  const documentProcessor = new DocumentProcessor(
    CONFIG.pdf.path,
    CONFIG.textSplitter,
  );

  const documents = await documentProcessor.loadAndSplit();

  const embeddings = new HuggingFaceTransformersEmbeddings({
    model: CONFIG.embedding.modelName,
    pretrainedOptions: CONFIG.embedding.pretrainedOptions as PretrainedOptions,
  });

  const nlp = new ChatOpenAI({
    temperature: CONFIG.openRouter.temperature,
    maxRetries: CONFIG.openRouter.maxRetries,
    model: CONFIG.openRouter.nlpModel,
    openAIApiKey: CONFIG.openRouter.apiKey,
    configuration: {
      baseURL: CONFIG.openRouter.url,
      defaultHeaders: CONFIG.openRouter.defaultHeaders,
    },
  });

  _neo4jVectorStore = await Neo4jVectorStore.fromExistingGraph(
    embeddings,
    CONFIG.neo4j,
  );
  await clearAll(_neo4jVectorStore, CONFIG.neo4j.nodeLabel);

  for (const [index, document] of documents.entries()) {
    console.log(
      `[DocumentProcessor]: Processing document ${index + 1}/${documents.length}`,
    );
    await _neo4jVectorStore.addDocuments([document]);
  }

  console.log("[Neo4jVectorStore]: All documents processed successfully");

  const questions = [
    "O que significa treinar uma rede reunal?",
    "Como converter objetos JavaScript em tensores?",
    "O que é normalização de dados e por que é necessária?",
    "Como funciona uma rede neural no TensorFlow.js?",
    "O que significa treinar uma rede neural?",
    "o que é hot enconding e quando usar?",
  ];

  const ai = new AI({
    debugLog: console.log,
    vectorStore: _neo4jVectorStore,
    nlpModel: nlp,
    promptConfig: CONFIG.promptConfig,
    templateText: CONFIG.templateText,
    topK: CONFIG.similarity.topK,
  });

  for (const index in questions) {
    const question = questions[index];
    const result = await ai.answerQuestion(question!);

    if (result.error) {
      console.log("[Error]: ", result.error);
      continue;
    }

    console.log(`\n${result.answer}\n`);

    await mkdir(CONFIG.output.answersFolder, { recursive: true });
    const fileName = `${CONFIG.output.answersFolder}/${CONFIG.output.fileName}-${index}-${Date.now()}.md`;
    await writeFile(fileName, result.answer!);
  }
} catch (err) {
  console.log("[Error]: ", err);
} finally {
  _neo4jVectorStore?.close();
}
