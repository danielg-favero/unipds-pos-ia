/** Produto escalar de dois vetores do mesmo comprimento. Com vetores normalizados, equivale à similaridade de cosseno. */
export function dotProduct(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    sum += a[i]! * b[i]!;
  }
  return sum;
}
