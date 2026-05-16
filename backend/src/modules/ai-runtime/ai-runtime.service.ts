import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/services/prisma.service';

export type AiDecision = 'approve' | 'reject' | 'manual';

export interface AiRuntimeConfig {
  enabled: boolean;
  provider: string;
  apiKey: string;
  apiBaseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  prompt: string;
  contentSafetyEnabled: boolean;
  reviewBeforePost: boolean;
  source: string;
}

export interface AiModerationResult {
  decision: AiDecision;
  reason: string;
  labels: string[];
  score: number;
  raw?: string;
  skipped?: boolean;
}

@Injectable()
export class AiRuntimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private getProviderBaseUrl(provider: string) {
    const normalized = String(provider || '').toLowerCase();
    if (normalized === 'deepseek') return 'https://api.deepseek.com/v1';
    if (normalized === 'openai') return 'https://api.openai.com/v1';
    return 'https://api.openai.com/v1';
  }

  private normalizeBaseUrl(value: any, provider: string) {
    const raw = String(value || '').trim();
    const base = raw || this.getProviderBaseUrl(provider);
    return base.replace(/\/chat\/completions\/?$/, '').replace(/\/+$/, '');
  }

  private numberValue(value: any, fallback: number) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  private stringValue(...values: any[]) {
    for (const value of values) {
      const raw = String(value ?? '').trim();
      if (raw && raw !== '********' && !raw.includes('***')) return raw;
    }
    return '';
  }

  private boolValue(...values: any[]) {
    for (const value of values) {
      if (value !== undefined && value !== null && value !== '') return Boolean(value);
    }
    return false;
  }

  private async readConfig(key: string) {
    const config = await this.prisma.config.findUnique({ where: { key }, select: { value: true } });
    return (config?.value || {}) as Record<string, any>;
  }

  async getRuntimeConfig(options: { allowDisabled?: boolean } = {}): Promise<AiRuntimeConfig> {
    const [ops, legacyMini, legacySystem] = await Promise.all([
      this.readConfig('ai_ops_config'),
      this.readConfig('ai_config'),
      this.readConfig('ai'),
    ]);

    const provider = this.stringValue(
      ops.provider,
      legacyMini.provider,
      legacySystem.provider,
      this.configService.get<string>('AI_PROVIDER'),
      this.configService.get<string>('OPENAI_PROVIDER'),
      'deepseek',
    );
    const apiKey = this.stringValue(
      ops.apiKey,
      legacyMini.apiKey,
      legacySystem.apiKey,
      this.configService.get<string>('AI_API_KEY'),
      this.configService.get<string>('DEEPSEEK_API_KEY'),
      this.configService.get<string>('OPENAI_API_KEY'),
    );
    const apiBaseUrl = this.normalizeBaseUrl(
      this.stringValue(
        ops.apiBaseUrl,
        ops.baseURL,
        ops.apiEndpoint,
        legacyMini.apiBaseUrl,
        legacyMini.baseURL,
        legacyMini.apiEndpoint,
        legacySystem.apiBaseUrl,
        legacySystem.baseURL,
        legacySystem.apiEndpoint,
        this.configService.get<string>('AI_API_BASE_URL'),
        this.configService.get<string>('AI_API_URL'),
        this.configService.get<string>('OPENAI_BASE_URL'),
        this.configService.get<string>('DEEPSEEK_BASE_URL'),
      ),
      provider,
    );
    const model = this.stringValue(
      ops.model,
      legacyMini.model,
      legacySystem.model,
      this.configService.get<string>('AI_MODEL'),
      provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini',
    );
    const source = ops.apiKey || ops.model
      ? 'ai_ops_config'
      : legacyMini.apiKey || legacyMini.model
        ? 'ai_config'
        : legacySystem.apiKey || legacySystem.model
          ? 'ai'
          : 'env';

    return {
      enabled: options.allowDisabled ? true : this.boolValue(
        ops.enabled,
        legacyMini.enabled,
        legacySystem.enabled,
        apiKey ? true : false,
      ),
      provider,
      apiKey,
      apiBaseUrl,
      model,
      temperature: this.numberValue(ops.temperature ?? legacyMini.temperature ?? legacySystem.temperature, 0.7),
      maxTokens: this.numberValue(ops.maxTokens ?? legacyMini.maxTokens ?? legacySystem.maxTokens, 1000),
      prompt: this.stringValue(
        ops.prompt,
        legacyMini.prompt,
        legacySystem.prompt,
        '你是校园本地生活平台的内容运营助手，输出要自然、真实、克制。',
      ),
      contentSafetyEnabled: this.boolValue(ops.contentSafetyEnabled, true),
      reviewBeforePost: this.boolValue(ops.reviewBeforePost, true),
      source,
    };
  }

  async isConfigured() {
    const config = await this.getRuntimeConfig({ allowDisabled: true });
    return Boolean(config.apiKey && config.model && config.apiBaseUrl);
  }

  async getSafeConfig() {
    const config = await this.getRuntimeConfig({ allowDisabled: true });
    const { apiKey, ...safe } = config;
    return { ...safe, hasApiKey: Boolean(apiKey) };
  }

  async callChat(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options: Partial<Pick<AiRuntimeConfig, 'temperature' | 'maxTokens'>> & { allowDisabled?: boolean } = {},
  ) {
    const config = await this.getRuntimeConfig({ allowDisabled: options.allowDisabled });
    if (!config.enabled) throw new Error('AI运营未启用，请先在 AI运营中心 / AI配置 中开启');
    if (!config.apiKey) throw new Error('AI API Key 未配置，请先在 AI运营中心 / AI配置 中填写密钥');
    if (!config.model) throw new Error('AI 模型未配置，请先填写模型名称');

    const response = await fetch(`${config.apiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: options.temperature ?? config.temperature,
        max_tokens: options.maxTokens ?? config.maxTokens,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`AI API 调用失败 (${response.status}): ${detail.slice(0, 300)}`);
    }

    const result = await response.json();
    return String(result.choices?.[0]?.message?.content || '').trim();
  }

  async generateText(prompt: string, options: { systemPrompt?: string; type?: string; count?: number } = {}) {
    const config = await this.getRuntimeConfig();
    const systemPrompt = options.systemPrompt || config.prompt;
    return this.callChat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      { maxTokens: config.maxTokens, temperature: config.temperature },
    );
  }

  private extractJson(text: string) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }

  async moderateContent(input: {
    type: 'post' | 'comment';
    title?: string | null;
    content: string;
    regionId?: string | null;
    approvalType?: string;
  }): Promise<AiModerationResult> {
    const approvalType = String(input.approvalType || 'manual').toLowerCase();
    if (!['ai', 'llm', 'model'].includes(approvalType)) {
      if (['none', 'auto', 'pass', 'published', 'approved'].includes(approvalType)) {
        return { decision: 'approve', reason: '无需审核', labels: [], score: 0, skipped: true };
      }
      return { decision: 'manual', reason: '当前配置为人工审核', labels: ['manual'], score: 0, skipped: true };
    }

    const config = await this.getRuntimeConfig();
    if (!config.enabled || !config.apiKey) {
      return { decision: 'manual', reason: 'AI未启用或密钥未配置，已转人工审核', labels: ['ai_not_configured'], score: 0, skipped: true };
    }

    const content = String(input.content || '').trim();
    if (!content && !input.title) {
      return { decision: 'reject', reason: '内容为空', labels: ['empty'], score: 1, skipped: true };
    }

    const prompt = [
      '请审核校园本地生活平台用户内容，必须只输出 JSON。',
      'JSON 格式：{"decision":"approve|reject|manual","reason":"一句中文原因","labels":["标签"],"score":0到1}',
      '审核标准：违法违规、色情低俗、暴力仇恨、诈骗引流、联系方式/二维码引流、广告刷屏、攻击辱骂、隐私泄露应拒绝或转人工；普通校园生活、二手、跑腿、外卖、求助、圈子互动可通过。',
      `内容类型：${input.type === 'post' ? '帖子/笔记' : '评论'}`,
      `标题：${input.title || ''}`,
      `正文：${content.slice(0, 2000)}`,
    ].join('\n');

    try {
      const raw = await this.callChat(
        [
          { role: 'system', content: '你是严谨的内容安全审核员，只输出 JSON，不要解释。' },
          { role: 'user', content: prompt },
        ],
        { temperature: 0.1, maxTokens: 500 },
      );
      const parsed = this.extractJson(raw);
      if (!parsed) {
        return { decision: 'manual', reason: 'AI审核结果无法解析，已转人工审核', labels: ['parse_failed'], score: 0.5, raw };
      }
      const decision = ['approve', 'reject', 'manual'].includes(parsed.decision) ? parsed.decision : 'manual';
      return {
        decision,
        reason: String(parsed.reason || (decision === 'approve' ? 'AI审核通过' : 'AI建议人工复核')),
        labels: Array.isArray(parsed.labels) ? parsed.labels.map((item: any) => String(item)) : [],
        score: Math.max(0, Math.min(1, Number(parsed.score) || 0)),
        raw,
      };
    } catch (error: any) {
      return {
        decision: 'manual',
        reason: error?.message ? `AI审核失败，已转人工：${error.message.slice(0, 120)}` : 'AI审核失败，已转人工',
        labels: ['ai_error'],
        score: 0.5,
      };
    }
  }

  async testConnection() {
    const config = await this.getRuntimeConfig();
    const missing = [
      !config.enabled ? 'AI运营未启用' : '',
      !config.apiKey ? '未配置 API Key' : '',
      !config.model ? '未配置模型名称' : '',
      !config.apiBaseUrl ? '未配置接口地址' : '',
    ].filter(Boolean);
    if (missing.length) {
      return { ok: false, missing, provider: config.provider, model: config.model, source: config.source };
    }
    const content = await this.callChat(
      [
        { role: 'system', content: '你是接口连通性检测助手。' },
        { role: 'user', content: '请只回复“AI连接正常”。' },
      ],
      { temperature: 0.1, maxTokens: 20 },
    );
    return { ok: true, missing: [], provider: config.provider, model: config.model, source: config.source, sample: content };
  }
}
