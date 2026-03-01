@echo off
:: BSPlus Overlay – lokaler HTTP-Server mit BeatLeader-Proxy (Port 7273)

set PORT=7273
set URL=http://localhost:%PORT%/settings.html

echo BSPlus Overlay – Server startet auf Port %PORT%
echo Druecke Strg+C zum Beenden.
echo.

:: Python 3 (bevorzugt)
python --version >nul 2>&1
if %errorlevel% == 0 (
    start "" "%URL%"
    python server.py
    goto :end
)

:: Python Launcher (py)
py --version >nul 2>&1
if %errorlevel% == 0 (
    start "" "%URL%"
    py server.py
    goto :end
)

echo FEHLER: Python nicht gefunden.
echo Bitte Python von https://www.python.org installieren.
pause

:end
