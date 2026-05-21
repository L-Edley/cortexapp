import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))
import uvicorn
uvicorn.run("aion.main:app", host="127.0.0.1", port=8000)
