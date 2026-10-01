import {
  Tokenizer,
} from '@huggingface/tokenizers';

import {
  loadTokenizerFiles,
} from './e5-assets';

type E5Tokenizer = InstanceType<
  typeof Tokenizer
>;

let tokenizerPromise:
  Promise<E5Tokenizer> | null =
    null;

export async function getE5Tokenizer() {
  if (tokenizerPromise) {
    return tokenizerPromise;
  }

  tokenizerPromise =
    (async () => {
      const {
        tokenizerJson,
        tokenizerConfig,
      } =
        await loadTokenizerFiles();

      return new Tokenizer(
        tokenizerJson as any,
        tokenizerConfig as any
      );
    })();

  try {
    return await tokenizerPromise;
  } catch (error) {
    tokenizerPromise = null;
    throw error;
  }
}
