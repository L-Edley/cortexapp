import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { SYSTEM_PROMPT } from '@/lib/prompt';
import type { OutputFormat } from '@/lib/types';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { input } = await req.json();

    if (!input || typeof input !== 'string') {
      return NextResponse.json(
        { error: 'Input is required and must be a string' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY is missing securely on the server.' },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: input,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: 'application/json',
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error('Empty response from model');
    }

    let parsed: OutputFormat;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      const cleaned = text.replace(/^```json/m, '').replace(/```$/m, '').trim();
      parsed = JSON.parse(cleaned);
    }

    // Save to Supabase (ignore error if no table created yet to not break frontend initially)
    try {
      await supabase.from('cortex_entries').insert([{
        tipo_registro: parsed.tipo_registro,
        raw_input: input,
        parsed_output: parsed,
      }]);
    } catch (dbError) {
      console.error('Supabase save error:', dbError);
    }

    return NextResponse.json(parsed);

  } catch (error) {
    console.error('Gemini error:', error);
    return NextResponse.json(
      {
        tipo_registro: 'error',
        error: error instanceof Error ? error.message : 'Unknown error processing input',
      },
      { status: 500 }
    );
  }
}
