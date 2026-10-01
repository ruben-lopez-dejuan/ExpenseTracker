import * as ort from 'onnxruntime-react-native';

import {
  getE5Session,
} from './e5-session';

import {
  getE5Tokenizer,
} from './e5-tokenizer';

const MAX_SEQUENCE_LENGTH = 128;

let initializationPromise:
  Promise<void> | null = null;

export async function initializeE5() {
  if (!initializationPromise) {
    initializationPromise =
      Promise.all([
        getE5Tokenizer(),
        getE5Session(),
      ]).then(() => undefined);
  }

  try {
    await initializationPromise;
  } catch (error) {
    initializationPromise = null;
    throw error;
  }
}

type EncodedText = {
  ids: number[];
  attention_mask?: number[];
  attentionMask?: number[];
};

function toInt64Tensor(
  values: number[]
) {
  return new ort.Tensor(
    'int64',
    values,
    [1, values.length]
  );
}

function normalizeVector(
  vector: number[]
): number[] {
  let sumSquares = 0;

  for (const value of vector) {
    sumSquares += value * value;
  }

  const norm =
    Math.sqrt(sumSquares);

  if (!norm) {
    return vector;
  }

  return vector.map(
    (value) => value / norm
  );
}

function meanPool(
  data: readonly number[],
  dimensions: readonly number[],
  attentionMask: number[]
): number[] {
  if (dimensions.length === 2) {
    return normalizeVector(
      Array.from(data)
    );
  }

  if (dimensions.length !== 3) {
    throw new Error(
      `Salida E5 inesperada: ${dimensions.join(
        'x'
      )}`
    );
  }

  const sequenceLength =
    dimensions[1];

  const hiddenSize =
    dimensions[2];

  const result =
    new Array<number>(
      hiddenSize
    ).fill(0);

  let tokenCount = 0;

  for (
    let token = 0;
    token < sequenceLength;
    token++
  ) {
    if (!attentionMask[token]) {
      continue;
    }

    tokenCount++;

    const offset =
      token * hiddenSize;

    for (
      let hidden = 0;
      hidden < hiddenSize;
      hidden++
    ) {
      result[hidden] +=
        data[offset + hidden];
    }
  }

  if (!tokenCount) {
    throw new Error(
      'E5 no produjo tokens utilizables.'
    );
  }

  for (
    let hidden = 0;
    hidden < hiddenSize;
    hidden++
  ) {
    result[hidden] /=
      tokenCount;
  }

  return normalizeVector(result);
}

export function cosineSimilarity(
  a: number[],
  b: number[]
) {
  if (a.length !== b.length) {
    throw new Error(
      'Embeddings con dimensiones diferentes.'
    );
  }

  let result = 0;

  for (
    let index = 0;
    index < a.length;
    index++
  ) {
    result +=
      a[index] *
      b[index];
  }

  return result;
}

export async function createE5Embedding(
  text: string
): Promise<number[]> {
  const [
    tokenizer,
    session,
  ] = await Promise.all([
    getE5Tokenizer(),
    getE5Session(),
  ]);

  const encoded =
    tokenizer.encode(
      text
    ) as EncodedText;

  let ids =
    Array.from(encoded.ids);

  let attentionMask =
    Array.from(
      encoded.attention_mask ??
      encoded.attentionMask ??
      ids.map(() => 1)
    );

  if (
    ids.length >
    MAX_SEQUENCE_LENGTH
  ) {
    ids =
      ids.slice(
        0,
        MAX_SEQUENCE_LENGTH
      );

    attentionMask =
      attentionMask.slice(
        0,
        MAX_SEQUENCE_LENGTH
      );
  }

  if (!ids.length) {
    throw new Error(
      'El tokenizer E5 no generó tokens.'
    );
  }

  const feeds:
    Record<string, ort.Tensor> = {};

  if (
    session.inputNames.includes(
      'input_ids'
    )
  ) {
    feeds.input_ids =
      toInt64Tensor(ids);
  }

  if (
    session.inputNames.includes(
      'attention_mask'
    )
  ) {
    feeds.attention_mask =
      toInt64Tensor(
        attentionMask
      );
  }

  if (
    session.inputNames.includes(
      'token_type_ids'
    )
  ) {
    feeds.token_type_ids =
      toInt64Tensor(
        ids.map(() => 0)
      );
  }

  const started =
    globalThis.performance?.now?.() ??
    Date.now();

  const output =
    await session.run(feeds);

  const outputName =
    session.outputNames[0];

  const tensor =
    output[outputName];

  if (!tensor) {
    throw new Error(
      'E5 no devolvió el tensor esperado.'
    );
  }

  if (__DEV__) {
    const elapsed =
      (globalThis.performance?.now?.() ??
        Date.now()) -
      started;

    console.log(
      `[E5] inferencia ${Math.round(
        elapsed
      )} ms`
    );
  }

  const values =
    Array.from(
      tensor.data as Float32Array
    );

  return meanPool(
    values,
    tensor.dims,
    attentionMask
  );
}
