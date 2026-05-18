import { useState, useEffect, useRef } from 'react';

export const useVoice = (onTranscript: (text: string) => void) => {
  const [state, setState] = useState<'idle'|'listening'|'processing'|'speaking'>('idle');
  const recognition = useRef<SpeechRecognition | null>(null);
  
  // INICIALIZAÇÃO
  useEffect(() => {
    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    recognition.current = new SpeechRecognition();
    recognition.current.lang = 'pt-BR';
    recognition.current.continuous = false;
    recognition.current.interimResults = true;

    recognition.current.onstart  = () => setState('listening');
    recognition.current.onend    = () => setState('processing');
    recognition.current.onerror  = () => setState('idle');

    recognition.current.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((r: any) => r[0].transcript)
        .join('');
      if (event.results[0].isFinal) {
        onTranscript(transcript);
      }
    };
  }, [onTranscript]);

  // INPUT — começar a escutar
  const startListening = () => {
    if (state === 'listening') {
        recognition.current?.stop();
    } else {
        recognition.current?.start();
    }
  };

  // OUTPUT — Cortex fala
  const speak = async (text: string) => {
    setState('speaking');

    // Tenta ElevenLabs primeiro (qualidade natural)
    if (process.env.NEXT_PUBLIC_ELEVENLABS_KEY && process.env.NEXT_PUBLIC_VOICE_ID) {
      try {
        const res = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${process.env.NEXT_PUBLIC_VOICE_ID}`,
          {
            method: 'POST',
            headers: {
              'xi-api-key': process.env.NEXT_PUBLIC_ELEVENLABS_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text,
              model_id: 'eleven_multilingual_v2',
              voice_settings: { stability: 0.5, similarity_boost: 0.8 }
            }),
          }
        );
        const blob = await res.blob();
        const audio = new Audio(URL.createObjectURL(blob));
        audio.onended = () => setState('idle');
        audio.play();
        return;
      } catch (e) {
        // fallback para Web Speech
      }
    }

    // Fallback — Web Speech Synthesis
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    const voices = synth.getVoices();
    const ptVoice = voices.find(v => v.lang.startsWith('pt'));
    if (ptVoice) utterance.voice = ptVoice;
    utterance.onend = () => setState('idle');
    synth.speak(utterance);
  };

  return { state, setState, startListening, speak };
};
