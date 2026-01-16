
import { GoogleGenAI, Type } from "@google/genai";

/**
 * Generates multiple-choice questions using Gemini 3 Pro.
 * Question generation is considered a complex text task requiring advanced reasoning.
 */
export const generateQuestions = async (topic: string, count: number = 5) => {
  // Use a new instance with the required named parameter for the API key.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Use ai.models.generateContent to query GenAI with both the model name and prompt.
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Generate ${count} multiple-choice questions about ${topic}. Ensure they vary in difficulty.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING, description: "The question text" },
            options: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "Array of exactly 4 options"
            },
            correctAnswer: { 
              type: Type.INTEGER, 
              description: "Index of the correct answer (0-3)" 
            }
          },
          // Fix: Use propertyOrdering instead of required to match provided guidelines example for Type.OBJECT.
          propertyOrdering: ["text", "options", "correctAnswer"]
        }
      }
    }
  });

  // Access the .text property directly (not a method) to extract the generated JSON string.
  const jsonStr = response.text || "[]";
  try {
    return JSON.parse(jsonStr.trim());
  } catch (e) {
    console.error("Failed to parse generated questions:", e);
    return [];
  }
};
