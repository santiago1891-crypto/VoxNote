# Backend local de transcripción (Python)

Módulo responsable de inspeccionar el archivo, decodificar el audio y
transcribirlo localmente con `faster-whisper`. Alimenta la interfaz de
escritorio (pywebview) y la CLI; no abre servidores HTTP ni envía audio a
internet.

## Requisitos

- Windows 10/11
- Python 3.10 o superior (probado con 3.14)
- ~1 GB de disco para dependencias y ~500 MB para el modelo `small`
- Conexión a internet **solo la primera vez**, para descargar el modelo

FFmpeg no es necesario: `faster-whisper` decodifica con PyAV, que trae
FFmpeg embebido.

## Instalación

```powershell
cd python
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

# Solo para desarrollo (tests)
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
```

Los modelos se guardan en `%LOCALAPPDATA%\VoxNote\models`, fuera del
repositorio.

## Interfaz de escritorio

Compila la interfaz y abre la ventana nativa:

```powershell
cd ..\frontend
npm install
npm run build

cd ..\python
.\.venv\Scripts\python.exe -m voxnote.desktop
```

En desarrollo, `npm run dev` en `frontend/` y `python -m voxnote.desktop --dev`
en otra terminal.

La API que consume React incluye `pick_file`, `pick_folder`, `transcribe`,
`cancel`, `export_transcript`, `generate_summary`, `api_status`,
`save_api_key`, `test_api_key`, `get_settings`, `save_settings` y `open_path`.
El progreso llega a la ventana como eventos `window.voxnoteEmit({...})`:
`stage`, `info`, `progress`, `completed`, `summary` y `error`.

La configuración se guarda en `%LOCALAPPDATA%\VoxNote\settings.json` y la API
key en el Administrador de credenciales de Windows (nunca en el repositorio).

## Uso

```powershell
# Transcripción completa (español, modelo small, TXT + SRT)
.\.venv\Scripts\python.exe -m voxnote.cli "C:\ruta\video.mp4"

# Carpeta de salida concreta
.\.venv\Scripts\python.exe -m voxnote.cli "video.mp4" --out "C:\ruta\salida"

# Prueba rápida: 2 minutos a partir del minuto 4
.\.venv\Scripts\python.exe -m voxnote.cli "video.mp4" --start-minutes 4 --max-minutes 2 --force

# Detección automática de idioma
.\.venv\Scripts\python.exe -m voxnote.cli "video.mp4" --lang auto
```

### Opciones

| Opción | Descripción |
|---|---|
| `-m, --model` | `tiny`, `base`, `small` (defecto), `medium`, `large-v3`, `large-v3-turbo` |
| `-l, --lang` | `es` por defecto; `auto` para detectar |
| `-o, --out` | Carpeta de salida (por defecto `.\salida`) |
| `--format` | `txt`, `srt` o `both` (por defecto `both`) |
| `--start-minutes` | Empezar en el minuto indicado |
| `--max-minutes` | Transcribir solo esa cantidad de minutos |
| `--initial-prompt` | Texto de contexto para orientar vocabulario/estilo |
| `--no-vad` | Desactivar el filtro de silencios |
| `--cpu-threads` | Hilos de CPU; `0` = automático |
| `--summary` | Generar también el resumen en PDF con Gemini |
| `--gemini-model` / `--gemini-key` | Modelo y clave de Gemini |
| `--json` | Emitir eventos NDJSON en stdout (integración) |
| `--force` | Sobrescribir archivos de salida existentes |

### Resumen con Gemini

```powershell
# La clave se puede pasar por entorno o guardar desde Ajustes en la app
$env:GEMINI_API_KEY = "tu-clave"
.\.venv\Scripts\python.exe -m voxnote.summarize "salida\clase.txt" --out salida
```

Genera `<nombre>_resumen.json` y `<nombre>_resumen.pdf` junto al TXT. El PDF se
maqueta localmente con ReportLab; Gemini solo devuelve el JSON estructurado.
Solo se envía el texto de la transcripción, nunca el audio.

| Opción | Descripción |
|---|---|
| `-o, --out` | Carpeta de salida (por defecto `.\salida`) |
| `-m, --model` | `gemini-3.5-flash` (defecto) o `gemini-3.1-flash-lite` |
| `--gemini-key` | Clave puntual; mejor usa `GEMINI_API_KEY` o Ajustes |
| `--json` | Eventos NDJSON en stdout |

### Mejorar términos técnicos

`--initial-prompt` acepta un glosario separado por comas. No reentrena el
modelo, solo orienta la decodificación:

```powershell
.\.venv\Scripts\python.exe -m voxnote.cli "clase.mp4" --initial-prompt "lógica proposicional, forma normal conjuntiva, forma normal disyuntiva, literal, átomo, conjunción, disyunción, productoria, bottom"
```

## Salidas

`<carpeta>\<nombre-del-archivo>.txt` (una línea por segmento):

```
[00:04:00] Vamos a comenzar. Hoy vamos a hablar sobre formas normales...
[00:04:14] ¿Qué entendemos por una forma normal?
```

`<carpeta>\<nombre-del-archivo>.srt` (subtítulos):

```
1
00:04:00,000 --> 00:04:14,010
Vamos a comenzar. Hoy vamos a hablar sobre formas normales...
```

Ambos en UTF-8. El archivo original nunca se modifica y no se crean
temporales en disco.

## Protocolo JSON (integración)

Con `--json`, stdout contiene **solo** eventos JSON, uno por línea. Los
mensajes de diagnóstico van a stderr. Ejemplo real:

```json
{"event": "stage", "stage": "prepare", "message": "1/4 Preparando archivo"}
{"event": "stage", "stage": "audio", "message": "2/4 Preparando audio", "file": "C:\\video.mp4", "duration": 3710.912}
{"event": "stage", "stage": "transcription", "message": "3/4 Cargando modelo y transcribiendo"}
{"event": "progress", "stage": "transcription", "current": 61.0, "total": 120.0, "percent": 50.8}
{"event": "stage", "stage": "export", "message": "4/4 Guardando resultado"}
{"event": "completed", "file": "...", "outputs": ["...txt", "...srt"], "segments_count": 13, "words": 173, "language": "es", "language_probability": 1.0, "duration": 120.0, "elapsed": 24.1, "segments": [{"start": 240.0, "end": 254.01, "text": "..."}]}
```

En caso de error:

```json
{"event": "error", "code": "NO_AUDIO_TRACK", "message": "El archivo no tiene pista de audio."}
```

### Códigos de error

| Código | Significado |
|---|---|
| `FILE_NOT_FOUND` | La ruta no existe |
| `INVALID_PATH` | La ruta no es un archivo |
| `UNSUPPORTED_FORMAT` | Extensión no admitida |
| `READ_FAILED` | Contenedor dañado o códec no disponible |
| `NO_AUDIO_TRACK` | El archivo no tiene pista de audio |
| `DECODE_FAILED` / `NO_AUDIO_DATA` | No se pudo extraer audio |
| `MODEL_LOAD_FAILED` | Modelo no descargado, sin red o sin memoria |
| `OUT_OF_MEMORY` | Memoria insuficiente para el modelo |
| `NO_SPEECH` | El VAD no detectó voz |
| `TRANSCRIPTION_FAILED` | Fallo interno del motor |
| `OUTPUT_EXISTS` | El archivo de salida ya existe (usar `--force`) |
| `WRITE_FAILED` | No se pudo guardar el resultado |
| `CANCELLED` | Cancelado por el usuario (Ctrl+C) |

Códigos de salida: `0` éxito, `2` problema con el archivo, `3` salida
existente, `130` cancelado, `1` resto.

## Tests

```powershell
.\.venv\Scripts\python.exe -m pytest
```

Cubren formato TXT/SRT, inspección y decodificación de audio, errores con
código, opciones de la CLI, protocolo JSON, normalización de ajustes y
renderizado del PDF. No descargan modelos ni necesitan red.

## Estructura

```
python/
├── requirements.txt
├── requirements-dev.txt
├── pyproject.toml
├── voxnote/
│   ├── desktop.py      # ventana pywebview y API para React
│   ├── cli.py          # interfaz de terminal
│   ├── summarize.py    # resumen por terminal
│   ├── pipeline.py     # orquestación reutilizable
│   ├── report.py       # reporter de consola y reporter JSON
│   ├── media.py        # validación y decodificación con PyAV
│   ├── transcribe.py   # wrapper de faster-whisper
│   ├── export.py       # TXT y SRT
│   ├── credentials.py  # keyring / variables de entorno
│   ├── ai/
│   │   ├── gemini.py   # cliente REST de Gemini
│   │   ├── prompts.py  # plantillas del resumen
│   │   ├── pdf.py      # maquetación con ReportLab
│   │   └── service.py  # resumen + JSON + PDF
│   └── errors.py       # errores con código estable
└── tests/
```
