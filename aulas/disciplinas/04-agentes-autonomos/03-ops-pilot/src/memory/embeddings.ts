import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

let pipelinePromise: Promise<FeatureExtractionPipeline> | undefined;

function loadPipeline(): Promise<FeatureExtractionPipeline> {
  pipelinePromise ??= pipeline("feature-extraction", MODEL_ID);
  return pipelinePromise;
}

/** Embedding local (384 dimensões, normalizado) de `text`, via singleton lazy do pipeline. */
export async function embed(text: string): Promise<Float32Array> {
  const extractor = await loadPipeline();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return new Float32Array(output.data as Float32Array);
}
