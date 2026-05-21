@echo off
where cloudflared >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] cloudflared nao encontrado.
    echo.
    echo Instale o cloudflared primeiro:
    echo   1. Acesse https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
    echo   2. Baixe o Windows 64-bit (.exe)
    echo   3. Coloque o cloudflared.exe em C:\Windows\System32\ ou adicione ao PATH
    echo.
    pause
    exit /b 1
)
echo [INFO] Iniciando tunnel cloudflared para http://127.0.0.1:8000
echo [INFO] Aguarde a URL do tipo https://xxxx.trycloudflare.com
echo.
cloudflared tunnel --url http://127.0.0.1:8000
pause
