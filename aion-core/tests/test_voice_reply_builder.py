import pytest
from aion.voice.voice_reply_builder import build_voice_reply

def test_build_voice_reply():
    # Caso extremo 1: Markdown carregado
    full = """# Resultado da Análise
Ocorreu um erro no deploy do projeto na Vercel hoje de manhã.
Parece que o **bundle** estourou o limite de memória.

Aqui está o log:
```javascript
Error: bundle size limit exceeded
```

Recomendo corrigir o bundle antes de abrir a nova feature."""
    
    short = build_voice_reply(full)
    assert short == "Ocorreu um erro no deploy do projeto na Vercel hoje de manhã. Parece que o bundle estourou o limite de memória."
    
    # Caso 2: Listas e links
    full2 = """Baseado na sua dúvida:
- Leia a [documentação](https://doc.com).
- Atualize a lib `react`.
Isso deve resolver o problema de carregamento que você comentou."""
    
    short2 = build_voice_reply(full2)
    assert short2 == "Baseado na sua dúvida: Leia a documentação. Atualize a lib ."
    
    # Caso 3: Resposta curta
    full3 = "Feito."
    assert build_voice_reply(full3) == "Feito."
