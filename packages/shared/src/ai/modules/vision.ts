import { LLMManager } from '../llm/manager.js';
import { AICache } from '../cache/ai-cache.js';
import logger from '../../utils/logger.js';
import { MessageContentPart } from '../llm/interfaces.js';

export class VisionModule {
    private llmManager: LLMManager;
    private cache: AICache;

    constructor(llmManager: LLMManager, cache: AICache) {
        this.llmManager = llmManager;
        this.cache = cache;
    }

    /**
     * Analyze a screenshot to extract structured data or answer questions
     */
    async execute(params: {
        screenshot: string; // Base64 encoded image or URL
        prompt: string;
        format?: 'text' | 'json';
    }): Promise<any> {
        const { screenshot, prompt, format = 'text' } = params;

        logger.info('👁️ Vision Module: Analyzing screenshot...');

        try {
            // Construct multi-modal message content with image and text
            const imageUrl = screenshot.startsWith('http')
                ? screenshot
                : `data:image/jpeg;base64,${screenshot}`;

            const messageContent: MessageContentPart[] = [
                { type: 'image_url', image_url: imageUrl },
                { type: 'text', text: prompt }
            ];

            if (format === 'json') {
                // For JSON format, add instruction to respond in JSON
                messageContent.push({
                    type: 'text',
                    text: '\n\nRespond with valid JSON that can be parsed.'
                });

                const response = await this.llmManager.generate(messageContent, {
                    model: process.env.VISION_MODEL || 'gpt-4o'
                });

                try {
                    // Attempt to extract JSON from markdown code blocks if present
                    const jsonMatch = response.content.match(/```json\n([\s\S]*?)\n```/) ||
                        response.content.match(/\{[\s\S]*\}/);

                    const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : response.content;
                    return JSON.parse(jsonStr);
                } catch (e) {
                    logger.warn({ err: e }, 'Failed to parse JSON from Vision response');
                    return response.content;
                }
            } else {
                const response = await this.llmManager.generate(messageContent, {
                    model: process.env.VISION_MODEL || 'gpt-4o'
                });
                return response.content;
            }


        } catch (error: any) {
            logger.error({ error }, 'Vision analysis failed');
            throw error;
        }
    }
}
