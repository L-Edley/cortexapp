import os
import io
import time
import logging
from typing import List, Optional
from pydantic import BaseModel, Field

logger = logging.getLogger("aion.voice.tts")

class TTSResult(BaseModel):
    audio_bytes: Optional[bytes]
    provider_used: str
    duration_seconds: float
    text_spoken: str
    available: bool

def get_available_providers() -> List[str]:
    """Retorna a lista de provedores de TTS configurados, ordenados por prioridade."""
    providers = []
    
    # 1. ElevenLabs
    if os.environ.get("ELEVENLABS_API_KEY") and os.environ.get("ELEVENLABS_VOICE_ID"):
        providers.append("elevenlabs")
        
    # 2. OpenAI
    if os.environ.get("OPENAI_API_KEY"):
        providers.append("openai")
        
    # 3. gTTS (sempre disponível se a biblioteca estiver instalada)
    providers.append("gtts")
    
    return providers

async def synthesize(text: str, provider: str = "auto") -> TTSResult:
    """
    Converte texto em áudio usando o melhor provedor disponível (ou o especificado).
    Prioridade: ElevenLabs > OpenAI > gTTS > None
    """
    if not text.strip():
        return TTSResult(
            audio_bytes=None, 
            provider_used="none", 
            duration_seconds=0.0, 
            text_spoken="", 
            available=False
        )

    available_providers = get_available_providers()
    if not available_providers:
        return TTSResult(
            audio_bytes=None, 
            provider_used="none", 
            duration_seconds=0.0, 
            text_spoken=text, 
            available=False
        )

    target_provider = available_providers[0] if provider == "auto" else provider
    
    if target_provider not in available_providers and target_provider != "none":
        logger.warning(f"Provider {target_provider} solicitado, mas não configurado. Usando {available_providers[0]}")
        target_provider = available_providers[0]

    if target_provider == "none":
        return TTSResult(
            audio_bytes=None, 
            provider_used="none", 
            duration_seconds=0.0, 
            text_spoken=text, 
            available=False
        )
        
    start_time = time.time()
    audio_bytes = None
    
    try:
        if target_provider == "elevenlabs":
            audio_bytes = await _synthesize_elevenlabs(text)
        elif target_provider == "openai":
            audio_bytes = await _synthesize_openai(text)
        elif target_provider == "gtts":
            audio_bytes = await _synthesize_gtts(text)
    except Exception as e:
        logger.error(f"Erro no provedor {target_provider}: {e}")
        # Tenta fallback para gtts se falhar os premium
        if target_provider in ["elevenlabs", "openai"]:
            logger.info("Tentando fallback para gtts...")
            try:
                audio_bytes = await _synthesize_gtts(text)
                target_provider = "gtts"
            except Exception as e2:
                logger.error(f"Erro no fallback gtts: {e2}")

    if not audio_bytes:
        return TTSResult(
            audio_bytes=None, 
            provider_used="none", 
            duration_seconds=0.0, 
            text_spoken=text, 
            available=False
        )

    # Duração simulada: assumimos aprox 150 palavras por minuto (2.5 palavras por seg)
    words = len(text.split())
    estimated_duration = max(0.5, words / 2.5)
    
    return TTSResult(
        audio_bytes=audio_bytes,
        provider_used=target_provider,
        duration_seconds=estimated_duration,
        text_spoken=text,
        available=True
    )

async def _synthesize_elevenlabs(text: str) -> bytes:
    # Como não temos httpx injetado ou garantido, usaríamos aiohttp/httpx
    # Isso é um mock realista que chamaria a API REST
    import httpx
    api_key = os.environ.get("ELEVENLABS_API_KEY")
    voice_id = os.environ.get("ELEVENLABS_VOICE_ID")
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {
        "xi-api-key": api_key,
        "Content-Type": "application/json"
    }
    payload = {
        "text": text,
        "model_id": "eleven_turbo_v2"
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, headers=headers)
        response.raise_for_status()
        return response.content

async def _synthesize_openai(text: str) -> bytes:
    import httpx
    api_key = os.environ.get("OPENAI_API_KEY")
    url = "https://api.openai.com/v1/audio/speech"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "tts-1",
        "input": text,
        "voice": "onyx"
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, headers=headers)
        response.raise_for_status()
        return response.content

async def _synthesize_gtts(text: str) -> bytes:
    import asyncio
    from gtts import gTTS
    
    def _run_gtts():
        tts = gTTS(text=text, lang="pt", tld="com.br")
        fp = io.BytesIO()
        tts.write_to_fp(fp)
        return fp.getvalue()
        
    return await asyncio.to_thread(_run_gtts)
