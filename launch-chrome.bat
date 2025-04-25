
@echo off
taskkill /f /im chrome.exe
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir=%TEMP%\chrome-profile --no-first-run --no-default-browser-check
exit
    