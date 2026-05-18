export interface AIProvider {
  generateResponse(prompt: string, systemPrompt: string): Promise<string | null>;
}
