import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AiService {
  constructor(private readonly configService: ConfigService) {}

  async generateContent(prompt: string, type: string = 'text'): Promise<string> {
    const apiKey = this.configService.get<string>('AI_API_KEY');
    if (!apiKey) {
      throw new Error('AI_API_KEY 未配置，无法生成内容。请在环境变量中配置 AI_API_KEY。');
    }

    const apiUrl = this.configService.get<string>('AI_API_URL') || 'https://api.openai.com/v1/chat/completions';
    const model = this.configService.get<string>('AI_MODEL') || 'gpt-3.5-turbo';

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI API 请求失败: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } catch (error: any) {
      throw new Error(`AI 生成失败: ${error.message}`);
    }
  }

  isConfigured(): boolean {
    return !!this.configService.get<string>('AI_API_KEY');
  }
}
