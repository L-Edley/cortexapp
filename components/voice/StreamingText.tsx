import React, { useEffect, useState, useRef } from "react";

export interface StreamingTextProps {
  text: string;
  speedMs?: number;
  isActive?: boolean;
  onComplete?: () => void;
  onWord?: (word: string) => void;
  highlightNumbers?: boolean;
}

// Tokenize text into words/whitespace blocks, merging "R$" with space and number
function tokenize(input: string): string[] {
  if (!input) return [];
  const rawTokens = input.split(/(\s+)/).filter(Boolean);
  const result: string[] = [];
  for (let i = 0; i < rawTokens.length; i++) {
    const token = rawTokens[i];
    if (
      token === "R$" &&
      i + 2 < rawTokens.length &&
      /^\s+$/.test(rawTokens[i + 1]) &&
      /^\d+/.test(rawTokens[i + 2])
    ) {
      result.push(token + rawTokens[i + 1] + rawTokens[i + 2]);
      i += 2;
    } else {
      result.push(token);
    }
  }
  return result;
}

export default function StreamingText({
  text,
  speedMs = 40,
  isActive = true,
  onComplete,
  onWord,
  highlightNumbers = true,
}: StreamingTextProps) {
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Clear any active timer on changes
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (!text) {
      setDisplayedText("");
      setIsTyping(false);
      if (onComplete) onComplete();
      return;
    }

    if (!isActive) {
      setDisplayedText(text);
      setIsTyping(false);
      if (onComplete) onComplete();
      return;
    }

    const words = tokenize(text);
    if (words.length === 0) {
      setDisplayedText("");
      setIsTyping(false);
      if (onComplete) onComplete();
      return;
    }

    setIsTyping(true);
    setDisplayedText("");

    let tokenIndex = 0;
    let accumulated = "";

    timerRef.current = setInterval(() => {
      if (tokenIndex < words.length) {
        const token = words[tokenIndex];
        accumulated += token;
        setDisplayedText(accumulated);

        // Trigger onWord hook for word tokens (ignoring whitespace tokens)
        if (onWord && token.trim().length > 0) {
          onWord(token.trim());
        }

        tokenIndex++;
      } else {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setIsTyping(false);
        if (onComplete) {
          onComplete();
        }
      }
    }, speedMs);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [text, speedMs, isActive]);

  // Helper to color/format special patterns
  const renderTokens = (textString: string) => {
    if (!textString) return null;
    if (!highlightNumbers) return textString;

    const tokens = tokenize(textString);

    return tokens.map((token, index) => {
      // Matches currencies (e.g., R$ 150,00, R$150)
      const isCurrency = /R\$\s*\d+([\.,]\d+)?/i.test(token);
      // Matches dates (e.g., YYYY-MM-DD or DD/MM/YYYY)
      const isDate = /\b\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}\b/.test(token);
      // Matches general numbers, streaks, percent (e.g., 150%, 7+, 2h, 24h, 150)
      const isNumber = /\b\d+(h|%|\+)?\b/.test(token);

      if (isCurrency) {
        return (
          <span key={index} className="text-emerald-400 font-semibold">
            {token}
          </span>
        );
      }
      if (isDate) {
        return (
          <span key={index} className="text-cyan-400 font-semibold">
            {token}
          </span>
        );
      }
      if (isNumber) {
        return (
          <span key={index} className="text-blue-400 font-semibold">
            {token}
          </span>
        );
      }

      return token;
    });
  };

  return (
    <div className="font-mono text-slate-100 leading-relaxed text-sm md:text-base break-words">
      <style>{`
        @keyframes streaming-blink {
          50% { opacity: 0; }
        }
        .streaming-cursor {
          animation: streaming-blink 0.8s step-start infinite;
        }
      `}</style>
      <span>{renderTokens(displayedText)}</span>
      {isTyping && (
        <span className="inline-block w-1.5 h-4 ml-1 bg-cyan-400 streaming-cursor align-middle" />
      )}
    </div>
  );
}
