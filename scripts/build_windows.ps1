# Genera VoxNote.exe (un solo archivo) para Windows.
# Uso, desde la raíz del repositorio:
#   powershell -ExecutionPolicy Bypass -File .\scripts\build_windows.ps1
param(
    [switch]$SkipFrontend
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root "python\.venv\Scripts\python.exe"
$frontend = Join-Path $root "frontend"

if (-not (Test-Path $python)) {
    throw "No se encontró el entorno virtual en python\.venv. Créalo e instala las dependencias primero."
}

Push-Location $root
try {
    if (-not $SkipFrontend) {
        Write-Host "==> Compilando la interfaz React"
        Push-Location $frontend
        try {
            & npm.cmd install
            if ($LASTEXITCODE -ne 0) { throw "npm install falló." }
            & npm.cmd run build
            if ($LASTEXITCODE -ne 0) { throw "npm run build falló." }
        }
        finally {
            Pop-Location
        }
    }

    Write-Host "==> Instalando PyInstaller"
    & $python -m pip install -r (Join-Path $root "python\requirements-build.txt")
    if ($LASTEXITCODE -ne 0) { throw "No se pudo instalar PyInstaller." }

    Write-Host "==> Empaquetando VoxNote.exe"
    & $python -m PyInstaller --clean --noconfirm (Join-Path $root "python\voxnote.spec")
    if ($LASTEXITCODE -ne 0) { throw "PyInstaller falló." }

    $exe = Join-Path $root "dist\VoxNote.exe"
    if (-not (Test-Path $exe)) { throw "No se generó $exe" }

    $size = [math]::Round((Get-Item $exe).Length / 1MB, 1)
    Write-Host ""
    Write-Host "Listo: $exe ($size MB)"
}
finally {
    Pop-Location
}
