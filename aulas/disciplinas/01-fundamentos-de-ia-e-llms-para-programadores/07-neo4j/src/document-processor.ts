import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

import { type TextSplitterConfig } from "./config.ts";

export class DocumentProcessor {
  private pdfPdf: string;
  private textSplitterConfig: TextSplitterConfig;

  constructor(pdfPath: string, textSplitterConfig: TextSplitterConfig) {
    this.pdfPdf = pdfPath;
    this.textSplitterConfig = textSplitterConfig;
  }

  async loadAndSplit() {
    const loader = new PDFLoader(this.pdfPdf);
    const rawDocuments = await loader.load();
    console.log(`[DocumentProcessor]: Loaded ${rawDocuments.length} documents`);

    const splitter = new RecursiveCharacterTextSplitter(
      this.textSplitterConfig,
    );
    const documents = await splitter.splitDocuments(rawDocuments);
    console.log(`[DocumentProcessor]: Split into ${documents.length} chunks`);

    return documents.map((doc) => ({
      ...doc,
      metadata: {
        source: doc.metadata.source,
      },
    }));
  }
}
