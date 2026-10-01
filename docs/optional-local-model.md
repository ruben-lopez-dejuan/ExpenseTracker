# Modelo local opcional

La aplicación funciona siempre con sugerencias básicas de categoría. En una APK instalada, el usuario puede descargar desde Ajustes un modelo semántico adicional para mejorar esas sugerencias.

## Comportamiento

- La descarga nunca se inicia automáticamente.
- Los archivos ocupan aproximadamente 135 MB y se guardan en el almacenamiento privado de la aplicación.
- El texto se procesa en el dispositivo y no se envía a un servicio de IA.
- Si el modelo falta, falla o se elimina, la aplicación mantiene las sugerencias básicas.
- Expo Go no puede ejecutar el motor ONNX nativo; hace falta una development build o APK.
- El usuario puede eliminar los archivos descargados desde Ajustes.

## Recursos

Se usa la revisión fija `761b726dd34fb83930e26aab4e9ac3899aa1fa78` de `Xenova/multilingual-e5-small`:

- `tokenizer.json`: 17.082.730 bytes
- `tokenizer_config.json`: 443 bytes
- `onnx/model_int8.onnx`: 118.054.593 bytes

La revisión fija evita que una actualización posterior del repositorio cambie silenciosamente los archivos instalados.
