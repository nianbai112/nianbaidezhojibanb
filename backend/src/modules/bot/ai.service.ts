import { Injectable } from '@nestjs/common';
import { AiRuntimeService } from '../ai-runtime/ai-runtime.service';

@Injectable()
export class AiService {
  constructor(private readonly aiRuntime: AiRuntimeService) {}

  async generateContent(prompt: string, type: string = 'text'): Promise<string> {
    try {
      return await this.aiRuntime.generateText(prompt, {
        type,
        systemPrompt: type === 'comment'
          ? '你是校园社区真实用户，请生成自然、短句、不过度营销的评论。'
          : '你是校园本地生活内容运营助手，请生成像真实学生发布的自然内容。',
      });
    } catch (error: any) {
      throw new Error(`AI 生成失败: ${error.message}`);
    }
  }

  async isConfigured(): Promise<boolean> {
    return this.aiRuntime.isConfigured();
  }
}
