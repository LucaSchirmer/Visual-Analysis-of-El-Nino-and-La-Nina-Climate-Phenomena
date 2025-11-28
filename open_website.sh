#!/bin/bash

# Start Python HTTP server on port 8000 in background
python3 -m http.server 8000 >/dev/null 2>&1 &
SERVER_PID=$!

# Wait a moment for server to start
sleep 1

# Open browser - WSL specific
if grep -qi microsoft /proc/version; then
    # WSL detected - use powershell to open browser
    powershell.exe -Command "Start-Process 'http://localhost:8000'" 2>/dev/null
elif command -v xdg-open &> /dev/null; then
    # Linux
    xdg-open http://localhost:8000
elif command -v open &> /dev/null; then
    # macOS
    open http://localhost:8000
else
    echo "Server started at http://localhost:8000"
    echo "Press Ctrl+C to stop"
fi

# Keep script running
wait $SERVER_PID