@echo off
REM Start Python HTTP server on port 8000 in a new window
start cmd /k python -m http.server 8000

REM Wait a moment for server to start
timeout /t 1 /nobreak

REM Open browser
start http://localhost:8000

REM Exit this script
exit
