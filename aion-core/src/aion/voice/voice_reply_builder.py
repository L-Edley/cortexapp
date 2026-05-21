import re

def build_voice_reply(full_response: str) -> str:
    """
    Extrai a versão curta da resposta para fala (máx 2 frases).
    Remove markdown, listas, blocos de código e mantém o essencial.
    """
    # 1. Remove blocos de código markdown (```...```)
    text = re.sub(r"```.*?```", "", full_response, flags=re.DOTALL)
    
    # 2. Remove código inline (`...`)
    text = re.sub(r"`.*?`", "", text)
    
    # 3. Remove cabeçalhos markdown (#, ##, ###) inteiros (não só as hashtags)
    text = re.sub(r"^#+.*$", "", text, flags=re.MULTILINE)
    
    # 4. Remove links markdown [text](url) -> text
    text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)
    
    # 5. Remove itens de lista (-, *, +, 1.)
    text = re.sub(r"^[\-\*\+]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\d+\.\s+", "", text, flags=re.MULTILINE)
    
    # 6. Remove negrito e itálico (*, **)
    text = re.sub(r"\*\*([^\*]+)\*\*", r"\1", text)
    text = re.sub(r"\*([^\*]+)\*", r"\1", text)
    
    # 7. Normaliza espaços e quebras de linha
    text = re.sub(r"\s+", " ", text).strip()
    
    # 8. Extrai as duas primeiras frases válidas
    # Divisão rudimentar por pontuação forte
    sentences = re.split(r"(?<=[.!?])\s+", text)
    
    valid_sentences = [s.strip() for s in sentences if s.strip()]
    short_reply = " ".join(valid_sentences[:2])
    
    return short_reply
