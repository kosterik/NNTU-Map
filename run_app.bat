@echo off
cd /d "%~dp0"
if exist "NNTU_Map.exe" (
    start "" "%~dp0NNTU_Map.exe"
) else (
    start "" pythonw "%~dp0desktop\app_desktop.py"
)
exit
