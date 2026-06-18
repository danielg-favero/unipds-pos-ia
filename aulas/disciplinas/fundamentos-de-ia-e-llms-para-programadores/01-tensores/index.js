import tf from "@tensorflow/tfjs-node";

async function trainModel(inputXs, outputYs) {
  const model = tf.sequential();

  // 1. Camada de entrada
  model.add(
    tf.layers.dense({
      inputShape: [7],
      units: 80, // 80 Neurônios na rede
      activation: "relu", // Função de ativação
    }),
  );

  // 2. Camada de saída
  model.add(
    tf.layers.dense({
      units: 3,
      activation: "softmax",
    }),
  );

  // 3. Compilar o modelo
  model.compile({
    optimizer: "adam",
    loss: "categoricalCrossentropy",
    metrics: ["accuracy"],
  });

  // 4. Treinar o modelo
  await model.fit(inputXs, outputYs, {
    epochs: 100,
    verbose: 0,
    shuffle: true,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        console.log(`Epoch ${epoch + 1}: loss = ${logs.loss.toFixed(4)}`);
      },
    },
  });

  return model;
}

async function predict(model, pessoa) {
  // 1. Transformar o array em tensor
  const tfInput = tf.tensor2d(pessoa);

  // 2. Fazer predição
  const previsao = model.predict(tfInput);
  const previsaoArray = await previsao.array();

  return previsaoArray[0].map((probabilidade, indice) => {
    return {
      label: labelsNomes[indice],
      probabilidade,
    };
  });
}

// Exemplo de pessoas para treino (cada pessoa com idade, cor e localização)
// const pessoas = [
//     { nome: "Erick", idade: 30, cor: "azul", localizacao: "São Paulo" },
//     { nome: "Ana", idade: 25, cor: "vermelho", localizacao: "Rio" },
//     { nome: "Carlos", idade: 40, cor: "verde", localizacao: "Curitiba" }
// ];

// Vetores de entrada com valores já normalizados e one-hot encoded
// Ordem: [idade_normalizada, azul, vermelho, verde, São Paulo, Rio, Curitiba]
// const tensorPessoas = [
//     [0.33, 1, 0, 0, 1, 0, 0], // Erick
//     [0, 0, 1, 0, 0, 1, 0],    // Ana
//     [1, 0, 0, 1, 0, 0, 1]     // Carlos
// ]

// Usamos apenas os dados numéricos, como a rede neural só entende números.
// tensorPessoasNormalizado corresponde ao dataset de entrada do modelo.
const tensorPessoasNormalizado = [
  [0.33, 1, 0, 0, 1, 0, 0], // Erick
  [0, 0, 1, 0, 0, 1, 0], // Ana
  [1, 0, 0, 1, 0, 0, 1], // Carlos
];

// Labels das categorias a serem previstas (one-hot encoded)
// [premium, medium, basic]
const labelsNomes = ["premium", "medium", "basic"]; // Ordem dos labels
const tensorLabels = [
  [1, 0, 0], // premium - Erick
  [0, 1, 0], // medium - Ana
  [0, 0, 1], // basic - Carlos
];

// Criamos tensores de entrada (xs) e saída (ys) para treinar o modelo
const inputXs = tf.tensor2d(tensorPessoasNormalizado);
const outputYs = tf.tensor2d(tensorLabels);

inputXs.print();
outputYs.print();

const model = await trainModel(inputXs, outputYs);

const novaPessoa = {
  nome: "Daniel",
  idade: 28,
  cor: "verde",
  localizacao: "Curitiba",
};

// Normalização dos dados
const pessoaTensorNormalizada = [[0.2, 0, 0, 1, 0, 0, 1]];

// Predizer os dados
const previsao = await predict(model, pessoaTensorNormalizada);
console.log(previsao);
