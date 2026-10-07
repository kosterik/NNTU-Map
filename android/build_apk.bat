@echo off
title Build NNTU Map APK
echo ========================================================
echo   Сборка Android APK для NNTU Map & Schedule
echo   Создатель: kosterik
echo ========================================================
set JAVA_HOME=C:\Program Files\Android\openjdk\jdk-21.0.8
set PATH=%JAVA_HOME%\bin;%PATH%

pushd "%~dp0\.."
python build_apk.py
popd
pause
