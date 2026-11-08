# VoxNote — Transcripción local + resumen con IA

Aplicación de escritorio **local** para transcribir videos y audios, buscar en
el texto y generar un resumen en PDF con Gemini. El audio nunca sale del
equipo: solo el texto de la transcripción se envía a la IA, y únicamente
cuando el usuario lo pide.

La especificación completa está en
[`docs/Biblia_Proyecto_Transcriptor_IA.md`](docs/Biblia_Proyecto_Transcriptor_IA.md).

## Estado actual

| Etapa de la biblia | Estado |
|---|---|
| 0. Preparación | ✅ |
| 1. Interfaz y selección de archivos | ✅ (React + pywebview) |
| 2. Extracción de audio | ✅ (PyAV, sin FFmpeg externo) |
| 3. Transcripción local | ✅ (faster-whisper en CPU) |
| 4. API de IA | ✅ (Gemini + PDF local) |
| 5. Exportación | ✅ TXT + SRT + PDF |
| 6. Calidad y empaquetado | ⏳ pendiente (tests ✅) |

La interfaz es un dashboard oscuro con panel de importación, historial local,
transcripción con búsqueda y una vista de resumen que refleja el diseño del
PDF. Corre en una ventana nativa con **pywebview + WebView2** y React + Vite +
Tailwind.

## Requisitos

- Windows 10/11 con WebView2 (instalado de serie en Windows 11)
- Python 3.10+ (probado con 3.14)
- Node.js 20.19+ o 22.12+ (solo para compilar la interfaz)
- ~1 GB de disco para dependencias + ~500 MB para el modelo `small`
- Internet solo la primera vez (modelo) y para el resumen con Gemini

No hace falta instalar FFmpeg: `faster-whisper` decodifica con PyAV, que
incluye FFmpeg embebido.

## Instalación

```powershell
cd python
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt

cd ..\frontend
npm install
npm run build
```

## Abrir la aplicación

```powershell
cd python
.\.venv\Scripts\python.exe -m voxnote.desktop
```

Para desarrollo con recarga en caliente (dos terminales):

```powershell
# Terminal 1
cd frontend
npm run dev

# Terminal 2
cd python
.\.venv\Scripts\python.exe -m voxnote.desktop --dev
```

## Uso por terminal

El backend sigue siendo utilizable sin interfaz:

```powershell
cd python

# Transcripción completa (TXT + SRT)
.\.venv\Scripts\python.exe -m voxnote.cli "C:\ruta\video.mp4"

# Prueba de 2 minutos a partir del minuto 4
.\.venv\Scripts\python.exe -m voxnote.cli "video.mp4" --start-minutes 4 --max-minutes 2 --force

# Resumen de una transcripción existente (Gemini)
.\.venv\Scripts\python.exe -m voxnote.summarize "salida\clase.txt" --out salida --model gemini-3.5-flash

# Eventos JSON por línea (integración)
.\.venv\Scripts\python.exe -m voxnote.cli "video.mp4" --json
```

El resultado se guarda en `python\salida\<nombre>.txt` con una línea por
segmento:

```
[00:04:00] Vamos a comenzar. Hoy vamos a hablar sobre formas normales...
[00:04:14] ¿Qué entendemos por una forma normal?
```

Detalles del backend en [`python/README.md`](python/README.md).

## API key de Gemini

La clave **nunca** se escribe en el repositorio ni en la configuración:

1. En la app: **Ajustes → Resumen con Gemini → API key**. Se guarda en el
   Administrador de credenciales de Windows (`keyring`).
2. O define `GEMINI_API_KEY` (o `GOOGLE_API_KEY`) en el entorno.

El modelo por defecto es `gemini-3.5-flash`, con `gemini-3.1-flash-lite` como
respaldo automático. Gemini devuelve JSON estructurado y VoxNote maqueta el PDF
localmente con ReportLab: títulos en violeta, barra de sección, tabla de
conceptos y numeración de páginas.

## Estructura

```
VoxNote/
├── docs/                    # especificación (biblia, no versionada)
├── python/                  # backend y contenedor de escritorio
│   ├── voxnote/
│   │   ├── desktop.py       # ventana pywebview + API JS
│   │   ├── cli.py           # transcripción por terminal
│   │   ├── summarize.py     # resumen por terminal
│   │   ├── pipeline.py      # orquestación reutilizable
│   │   ├── media.py         # inspección/decodificación con PyAV
│   │   ├── transcribe.py    # wrapper de faster-whisper
│   │   ├── export.py        # TXT y SRT
│   │   ├── credentials.py   # keyring / variables de entorno
│   │   └── ai/              # Gemini, prompts y PDF
│   ├── tests/
│   └── requirements.txt
├── frontend/                # React + Vite + Tailwind v4
│   ├── src/components/      # Sidebar, panel, transcripción, resumen…
│   ├── src/lib/bridge.ts    # puente con pywebview + mock de navegador
│   └── dist/                # build que carga la ventana (ignorado)
├── .gitignore
└── README.md
```

## Privacidad

- El video y el audio nunca salen del equipo; Whisper corre en CPU local.
- No hay base de datos ni servidor propio; el historial vive en el
  almacenamiento del WebView.
- No hay telemetría.
- Solo el texto de la transcripción se envía a Gemini, tras una acción
  explícita del usuario.
- Los modelos se guardan en `%LOCALAPPDATA%\VoxNote\models` y los ajustes en
  `%LOCALAPPDATA%\VoxNote\settings.json`, fuera del repositorio.
- Las transcripciones se escriben solo en la carpeta elegida.

## Próximos pasos

1. Empaquetar Python, el modelo y el build web en un instalador de Windows.
2. Añadir firma de código y actualizaciones.
3. Ampliar pruebas con más formatos, duraciones y equipos sin WebView2.
4. Exportar también a Markdown/Word si hace falta.
