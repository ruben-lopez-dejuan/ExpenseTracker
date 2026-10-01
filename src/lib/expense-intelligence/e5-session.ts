import * as ort from 'onnxruntime-react-native';

import {
  getE5ModelPath,
} from './e5-assets';

let sessionPromise:
  Promise<ort.InferenceSession> | null =
    null;

export async function getE5Session() {
  if (sessionPromise) {
    return sessionPromise;
  }

  sessionPromise = (async () => {
    const modelPath =
      await getE5ModelPath();

    const start =
      globalThis.performance?.now?.() ??
      Date.now();

    const session =
      await ort.InferenceSession.create(
        modelPath,
        {
          executionProviders: ['cpu'],
          graphOptimizationLevel: 'all',
        }
      );

    if (__DEV__) {
      const elapsed =
        (globalThis.performance?.now?.() ??
          Date.now()) -
        start;

      console.log(
        `[E5] modelo cargado en ${Math.round(
          elapsed
        )} ms`
      );

      console.log(
        '[E5] inputs:',
        session.inputNames
      );

      console.log(
        '[E5] outputs:',
        session.outputNames
      );
    }

    return session;
  })();

  try {
    return await sessionPromise;
  } catch (error) {
    sessionPromise = null;
    throw error;
  }
}
