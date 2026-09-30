import { Router, Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { serverDb } from '../db.js';

export function createAiRouter(): Router {
  const router = Router();

  // Foresight AI Assistant endpoint (Server-side Gemini 2.5 Flash)
  router.post('/chat', async (req: Request, res: Response) => {
    try {
      const { prompt, context } = req.body;
      if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

      const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY environment variable is not configured on the server.' });
      }

      const ai = new GoogleGenAI({ apiKey });

      // Build real-time server context snapshot if not supplied
      const products = serverDb.getCollection('products');
      const transactions = serverDb.getCollection('transactions');
      const lowStockCount = products.filter((p: any) => p.stock <= (p.minStock || 0)).length;

      const systemInstruction = `You are AutoMatePH Foresight AI, an expert technical retail & inventory assistant for Philippine retail stores.
Answer questions accurately using current real-time inventory, sales, and supply chain telemetry.
Format your responses cleanly with Markdown, tables, and monetary figures in Philippine Peso (₱).
Real-time System Snapshot:
- Total Products: ${products.length}
- Low Stock Items: ${lowStockCount}
- Total Recorded Transactions: ${transactions.length}
${context ? `Additional Context:\n${context}` : ''}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.2,
        },
      });

      res.json({ reply: response.text });
    } catch (error: any) {
      console.error('AI chat endpoint error:', error);
      res.status(500).json({ error: error.message || 'Failed to generate AI response' });
    }
  });

  // Product description generation endpoint
  router.post('/description', async (req: Request, res: Response) => {
    try {
      const { name, category, imageBase64, mimeType } = req.body;
      if (!name) return res.status(400).json({ error: 'Product name is required' });

      const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
      }

      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Write a short, engaging description (max 2 sentences) for a retail product named "${name}"${category ? ` in the ${category} category` : ''}. Keep it concise, appealing, and professional for a retail POS catalog.`;

      let contents: any = prompt;
      if (imageBase64) {
        contents = {
          parts: [
            { text: prompt + ' Here is an image of the product to help you write the description.' },
            { inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } },
          ],
        };
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
      });

      res.json({ description: response.text ? response.text.trim() : '' });
    } catch (error: any) {
      console.error('AI description error:', error);
      res.status(500).json({ error: error.message || 'Failed to generate product description' });
    }
  });

  // Product image generation endpoint
  router.post('/product-image', async (req: Request, res: Response) => {
    try {
      const { name, category, supplierName } = req.body;
      if (!name) return res.status(400).json({ error: 'Product name is required' });

      const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
      }

      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Photorealistic, accurate studio product photography of the retail store item: ${name} ${category ? `(${category})` : ''} ${supplierName ? `by ${supplierName}` : ''}. Exact authentic packaging, centered, crisp detail, minimalist neutral studio backdrop.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: prompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: '1:1',
          },
        },
      });

      let generatedImageUrl = '';
      if (response.candidates && response.candidates[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData && part.inlineData.mimeType && part.inlineData.data) {
            generatedImageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            break;
          }
        }
      }

      res.json({ imageUrl: generatedImageUrl });
    } catch (error: any) {
      console.error('AI product image error:', error);
      res.status(500).json({ error: error.message || 'Failed to generate product image' });
    }
  });

  return router;
}
