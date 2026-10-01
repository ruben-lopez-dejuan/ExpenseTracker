import fs from 'node:fs';
import path from 'node:path';

const packageDir = path.join(
  process.cwd(),
  'node_modules',
  'onnxruntime-react-native'
);

if (!fs.existsSync(packageDir)) {
  console.log(
    '[fix-onnx-expo] onnxruntime-react-native no instalado.'
  );
  process.exit(0);
}

/*
 * FIX 1
 * Expo puede interpretar unimodule.json como metadata de Expo Modules
 * e impedir el autolinking normal de React Native.
 */
const unimodulePath =
  path.join(
    packageDir,
    'unimodule.json'
  );

if (fs.existsSync(unimodulePath)) {
  fs.rmSync(unimodulePath);

  console.log(
    '[fix-onnx-expo] unimodule.json eliminado.'
  );
} else {
  console.log(
    '[fix-onnx-expo] unimodule.json ya estaba eliminado.'
  );
}

/*
 * FIX 2
 * onnxruntime-react-native 1.24.3 usa VersionNumber.parse(),
 * eliminado en Gradle 9.
 *
 * Ese bloque únicamente añade dependencias para React Native < 0.71.
 * ExpenseTracker usa React Native 0.86+, así que podemos eliminarlo.
 */
const gradlePath =
  path.join(
    packageDir,
    'android',
    'build.gradle'
  );

if (!fs.existsSync(gradlePath)) {
  console.log(
    '[fix-onnx-expo] build.gradle no encontrado.'
  );
  process.exit(0);
}

let gradle =
  fs.readFileSync(
    gradlePath,
    'utf8'
  );

const legacyVersionBlock =
  /if\s*\(\s*VersionNumber\.parse\(REACT_NATIVE_VERSION\)\s*<\s*VersionNumber\.parse\(["']0\.71["']\)\s*\)\s*\{\s*extractLibs\s+["']com\.facebook\.fbjni:fbjni:\+:headers["']\s*extractLibs\s+["']com\.facebook\.fbjni:fbjni:\+["']\s*\}/m;

if (
  legacyVersionBlock.test(
    gradle
  )
) {
  gradle =
    gradle.replace(
      legacyVersionBlock,
      `// Removed by ExpenseTracker postinstall:
    // VersionNumber was removed in Gradle 9.
    // fbjni compatibility block only applied to React Native < 0.71.`
    );

  fs.writeFileSync(
    gradlePath,
    gradle,
    'utf8'
  );

  console.log(
    '[fix-onnx-expo] Gradle VersionNumber workaround aplicado.'
  );
} else if (
  gradle.includes(
    'VersionNumber.parse(REACT_NATIVE_VERSION)'
  )
) {
  console.warn(
    '[fix-onnx-expo] Se encontró VersionNumber pero el patrón esperado ha cambiado.'
  );
} else {
  console.log(
    '[fix-onnx-expo] Gradle VersionNumber ya corregido.'
  );
}
