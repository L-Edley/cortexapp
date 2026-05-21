@echo off
cd /d "%~dp0aion-core"
call .venv\Scripts\activate.bat
set PYTHONPATH=src
python -m uvicorn aion.main:app --host 127.0.0.1 --port 8000 --reload
pause
