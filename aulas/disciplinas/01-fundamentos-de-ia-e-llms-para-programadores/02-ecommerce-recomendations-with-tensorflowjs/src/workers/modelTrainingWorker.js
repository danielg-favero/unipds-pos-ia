import "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js";
import { workerEvents } from "../events/constants.js";

console.log("Model training worker initialized");
let _globalCtx = {};
let _model = null;

// Weights for the features in the recommendation
// If the feature is important for the recommendation, it will have more weight
const WEIGHTS = {
  category: 0.4, // Category is the most important feature in the recommendation, so it has more weight
  color: 0.3,
  price: 0.2,
  age: 0.1,
};

// Normalize values between 0 and 1
function normalize(value, min, max) {
  return (value - min) / (max - min || 1);
}

// Create context based on the training data
// Precompute data and create lookup tables for training
function makeContext(products, users) {
  // Age context
  const ages = users.map((u) => u.age);
  const minAge = Math.min(...ages);
  const maxAge = Math.max(...ages);

  // Price context
  const prices = products.map((p) => p.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  // Color context
  const colors = [...new Set(products.map((p) => p.color))];
  const colorIndex = Object.fromEntries(
    colors.map((color, index) => [color, index]),
  ); // Mapping colors to indexes

  // Category context
  const categories = [...new Set(products.map((p) => p.category))];
  const categoriesIndex = Object.fromEntries(
    categories.map((category, index) => [category, index]),
  ); // Mapping categories to indexes

  const midAge = (minAge + maxAge) / 2;
  const ageSums = {};
  const ageCounts = {};

  // Summing ages of users who bought the same product and counting the number of purchases
  users.forEach((user) => {
    user.purchases.forEach((p) => {
      ageSums[p.name] = (ageSums[p.name] || 0) + user.age;
      ageCounts[p.name] = (ageCounts[p.name] || 0) + 1;
    });
  });

  const avgUserAgePerProduct = Object.fromEntries(
    products.map((product) => {
      const avg = ageCounts[product.name]
        ? ageSums[product.name] / ageCounts[product.name]
        : midAge;

      return [product.name, normalize(avg, minAge, maxAge)];
    }),
  );

  return {
    products,
    users,
    colorIndex,
    categoriesIndex,
    minPrice,
    maxPrice,
    minAge,
    maxAge,
    numCategories: categories.length,
    numColors: colors.length,
    dimensions: 2 + categories.length + colors.length,
    avgUserAgePerProduct,
  };
}

function oneHotWeighted(index, length, weight) {
  return tf.oneHot(index, length).cast("float32").mul(weight);
}

// Encode products data to tensors
function encodeProduct(product, context) {
  // Normalizing the price and multiplying the wight on the recommendation
  const price = tf.tensor1d([
    normalize(product.price, context.minPrice, context.maxPrice) *
      WEIGHTS.price,
  ]);

  const age = tf.tensor1d([
    (context.avgUserAgePerProduct[product.name] ?? 0.5) * WEIGHTS.age,
  ]);

  // Categories are strings, not numbers, so we need to get the index of the category, also know this as label encoding. One-hot encoding is a way to represent categorical data as numerical data
  const category = oneHotWeighted(
    context.categoriesIndex[product.category],
    context.numCategories,
    WEIGHTS.category,
  );

  const color = oneHotWeighted(
    context.colorIndex[product.color],
    context.numColors,
    WEIGHTS.color,
  );

  return tf.concat1d([price, age, category, color]);
}

// Encode users data to tensors
function encodeUser(user, context) {
  // If the user already bought some products, we will get the average of the encodings of those products
  if (user.purchases.length) {
    return tf
      .stack(user.purchases.map((product) => encodeProduct(product, context)))
      .mean(0)
      .reshape([1, context.dimensions]);
  }

  // To generate recommendations to users with no purchases
  return tf
    .concat1d([
      tf.zeros([1]),
      tf.tensor1d([
        normalize(user.age, context.minAge, context.maxAge) * WEIGHTS.age,
      ]),
      tf.zeros([context.numCategories]),
      tf.zeros([context.numColors]),
    ])
    .reshape([1, context.dimensions]);
}

// Create training data based on the context
function createTrainingData(context) {
  const inputs = [];
  const labels = [];

  context.users
    .filter((user) => user.purchases.length)
    .forEach((user) => {
      const userVector = encodeUser(user, context).dataSync();
      context.products.forEach((product) => {
        const productVector = encodeProduct(product, context).dataSync();
        const label = user.purchases.some((purchase) =>
          purchase.name === product.name ? 1 : 0,
        );

        inputs.push([...userVector, ...productVector]);
        labels.push(label);
      });
    });

  return {
    inputs: tf.tensor2d(inputs),
    labels: tf.tensor2d(labels, [labels.length, 1]),
    inputDimensions: context.dimensions * 2,
  };
}

// Create the network and train the model
async function configNetAndTrain(trainData) {
  const model = tf.sequential();

  model.add(
    tf.layers.dense({
      inputShape: [trainData.inputDimensions],
      units: 128,
      activation: "relu",
    }),
  );

  model.add(
    tf.layers.dense({
      units: 64,
      activation: "relu",
    }),
  );

  model.add(
    tf.layers.dense({
      units: 32,
      activation: "relu",
    }),
  );

  model.add(
    tf.layers.dense({
      units: 1,
      activation: "sigmoid",
    }),
  );

  model.compile({
    optimizer: tf.train.adam(0.01),
    loss: "binaryCrossentropy",
    metrics: ["accuracy"],
  });

  await model.fit(trainData.inputs, trainData.labels, {
    epochs: 100,
    batchSize: 32,
    shuffle: true,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        postMessage({
          type: workerEvents.trainingLog,
          epoch,
          loss: logs.loss,
          accuracy: logs.acc,
        });
      },
    },
  });

  return model;
}

async function trainModel({ users }) {
  console.log("Training model with users:", users);

  postMessage({
    type: workerEvents.progressUpdate,
    progress: { progress: 50 },
  });
  const products = await (await fetch("/data/products.json")).json();

  const context = makeContext(products, users);
  context.productVectors = products.map((product) => ({
    name: product.name,
    meta: { ...product },
    vector: encodeProduct(product, context).dataSync(),
  }));

  _globalCtx = context;

  const trainData = createTrainingData(context);

  _model = await configNetAndTrain(trainData);

  postMessage({
    type: workerEvents.progressUpdate,
    progress: { progress: 100 },
  });
  postMessage({ type: workerEvents.trainingComplete });
}

// Make a recommendation to a user
function recommend(user) {
  if (_model === null) return;
  const context = _globalCtx;

  const userVector = encodeUser(user, context).dataSync();
  const input = context.productVectors.map(({ vector }) => {
    return [...userVector, ...vector];
  });

  const inputs = tf.tensor2d(input);
  const predictions = _model.predict(inputs);

  const scores = predictions.dataSync();

  const recommendations = context.productVectors.map((product, index) => ({
    ...product.meta,
    name: product.name,
    score: scores[index],
  }));

  const sortedItems = recommendations.sort((a, b) => b.score - a.score);

  postMessage({
    type: workerEvents.recommend,
    user,
    recommendations: sortedItems,
  });
}

const handlers = {
  [workerEvents.trainModel]: trainModel,
  [workerEvents.recommend]: (d) => recommend(d.user, _globalCtx),
};

self.onmessage = (e) => {
  const { action, ...data } = e.data;
  if (handlers[action]) handlers[action](data);
};
