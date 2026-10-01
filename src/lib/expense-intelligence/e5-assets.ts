import * as FileSystem from 'expo-file-system/legacy';

const MODEL_REVISION = '761b726dd34fb83930e26aab4e9ac3899aa1fa78';
const MODEL_BASE_URL = `https://huggingface.co/Xenova/multilingual-e5-small/resolve/${MODEL_REVISION}`;
const MODEL_URL = `${MODEL_BASE_URL}/onnx/model_int8.onnx?download=true`;
const TOKENIZER_URL = `${MODEL_BASE_URL}/tokenizer.json?download=true`;
const TOKENIZER_CONFIG_URL = `${MODEL_BASE_URL}/tokenizer_config.json?download=true`;

const MIN_MODEL_SIZE = 100_000_000;
const MIN_TOKENIZER_SIZE = 10_000_000;
const MIN_TOKENIZER_CONFIG_SIZE = 100;
const ESTIMATED_TOTAL_SIZE = 136_000_000;

export type E5AssetState = {
  phase: 'idle' | 'checking' | 'not-installed' | 'downloading' | 'downloaded' | 'error';
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  message?: string;
};

let assetState: E5AssetState = {
  phase: 'idle', progress: 0, downloadedBytes: 0, totalBytes: ESTIMATED_TOTAL_SIZE,
};
const listeners = new Set<(state: E5AssetState) => void>();

function emit(next: E5AssetState) {
  assetState = next;
  listeners.forEach((listener) => listener(next));
}

export function subscribeE5AssetState(listener: (state: E5AssetState) => void) {
  listeners.add(listener);
  listener(assetState);
  return () => {
    listeners.delete(listener);
  };
}

function paths() {
  if (!FileSystem.documentDirectory) throw new Error('No existe almacenamiento local disponible.');
  const directory = `${FileSystem.documentDirectory}optional-models/e5-small/`;
  return {
    directory,
    model: `${directory}model_int8.onnx`,
    tokenizer: `${directory}tokenizer.json`,
    tokenizerConfig: `${directory}tokenizer_config.json`,
  };
}

async function validFile(path: string, minimumSize: number) {
  const info = await FileSystem.getInfoAsync(path);
  return info.exists && 'size' in info && typeof info.size === 'number' && info.size >= minimumSize;
}

export async function isE5Installed() {
  emit({ phase: 'checking', progress: 0, downloadedBytes: 0, totalBytes: ESTIMATED_TOTAL_SIZE });
  const files = paths();
  const installed = (await Promise.all([
    validFile(files.model, MIN_MODEL_SIZE),
    validFile(files.tokenizer, MIN_TOKENIZER_SIZE),
    validFile(files.tokenizerConfig, MIN_TOKENIZER_CONFIG_SIZE),
  ])).every(Boolean);
  emit({
    phase: installed ? 'downloaded' : 'not-installed',
    progress: installed ? 1 : 0,
    downloadedBytes: installed ? ESTIMATED_TOTAL_SIZE : 0,
    totalBytes: ESTIMATED_TOTAL_SIZE,
  });
  return installed;
}

async function downloadFile(
  url: string,
  destination: string,
  minimumSize: number,
  completedBytes: number
) {
  const temporary = `${destination}.download`;
  await FileSystem.deleteAsync(temporary, { idempotent: true });
  const download = FileSystem.createDownloadResumable(url, temporary, {}, ({ totalBytesWritten }) => {
    const downloadedBytes = completedBytes + totalBytesWritten;
    emit({
      phase: 'downloading',
      progress: Math.min(downloadedBytes / ESTIMATED_TOTAL_SIZE, 0.99),
      downloadedBytes,
      totalBytes: ESTIMATED_TOTAL_SIZE,
    });
  });
  const result = await download.downloadAsync();
  if (!result?.uri || !(await validFile(result.uri, minimumSize))) {
    await FileSystem.deleteAsync(temporary, { idempotent: true });
    throw new Error('Uno de los archivos descargados está incompleto.');
  }
  const info = await FileSystem.getInfoAsync(result.uri);
  const size = info.exists && 'size' in info && typeof info.size === 'number' ? info.size : 0;
  await FileSystem.deleteAsync(destination, { idempotent: true });
  await FileSystem.moveAsync({ from: result.uri, to: destination });
  return size;
}

let installationPromise: Promise<string> | null = null;

export async function installE5Assets() {
  if (installationPromise) return installationPromise;
  installationPromise = (async () => {
    const files = paths();
    await FileSystem.makeDirectoryAsync(files.directory, { intermediates: true });
    if (await isE5Installed()) return files.model;

    await deleteE5Assets(false);
    await FileSystem.makeDirectoryAsync(files.directory, { intermediates: true });
    emit({ phase: 'downloading', progress: 0, downloadedBytes: 0, totalBytes: ESTIMATED_TOTAL_SIZE });

    let completed = 0;
    completed += await downloadFile(TOKENIZER_URL, files.tokenizer, MIN_TOKENIZER_SIZE, completed);
    completed += await downloadFile(TOKENIZER_CONFIG_URL, files.tokenizerConfig, MIN_TOKENIZER_CONFIG_SIZE, completed);
    completed += await downloadFile(MODEL_URL, files.model, MIN_MODEL_SIZE, completed);
    emit({ phase: 'downloaded', progress: 1, downloadedBytes: completed, totalBytes: completed });
    return files.model;
  })();
  try {
    return await installationPromise;
  } catch (error) {
    emit({
      phase: 'error', progress: 0, downloadedBytes: 0, totalBytes: ESTIMATED_TOTAL_SIZE,
      message: error instanceof Error ? error.message : 'No se pudo descargar el modelo.',
    });
    throw error;
  } finally {
    installationPromise = null;
  }
}

export async function getE5ModelPath() {
  const files = paths();
  if (!(await validFile(files.model, MIN_MODEL_SIZE))) throw new Error('El modelo opcional no está instalado.');
  return files.model;
}

export async function loadTokenizerFiles() {
  const files = paths();
  if (!(await validFile(files.tokenizer, MIN_TOKENIZER_SIZE)) ||
      !(await validFile(files.tokenizerConfig, MIN_TOKENIZER_CONFIG_SIZE))) {
    throw new Error('Los recursos del modelo opcional no están instalados.');
  }
  const [tokenizer, config] = await Promise.all([
    FileSystem.readAsStringAsync(files.tokenizer),
    FileSystem.readAsStringAsync(files.tokenizerConfig),
  ]);
  return { tokenizerJson: JSON.parse(tokenizer), tokenizerConfig: JSON.parse(config) };
}

export async function deleteE5Assets(updateState = true) {
  const { directory } = paths();
  await FileSystem.deleteAsync(directory, { idempotent: true });
  if (updateState) {
    emit({ phase: 'not-installed', progress: 0, downloadedBytes: 0, totalBytes: ESTIMATED_TOTAL_SIZE });
  }
}
