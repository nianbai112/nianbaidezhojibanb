import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../common/services/prisma.service';

export type AiDecision = 'approve' | 'reject' | 'manual';
export type AiMessageContent =
  | string
  | Array<{
      type: string;
      text?: string;
      image_url?: { url: string };
    }>;
export type AiChatMessage = { role: 'system' | 'user' | 'assistant'; content: AiMessageContent };

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
  callLogId?: string;
  fallbackType?: string;
}

interface AiCallContext {
  purpose?: string;
  source?: string;
  taskId?: string;
  botId?: string;
  userId?: string;
  adminId?: string;
  regionId?: string;
  endpoint?: string;
}

interface AiChatOptions extends Partial<Pick<AiRuntimeConfig, 'temperature' | 'maxTokens'>>, AiCallContext {
  allowDisabled?: boolean;
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

  private preview(value: string, max = 600) {
    const raw = String(value || '').replace(/\s+/g, ' ').trim();
    return raw.length > max ? `${raw.slice(0, max)}...` : raw;
  }

  private hash(value: string) {
    return createHash('sha256').update(value || '').digest('hex');
  }

  private messageContentPreview(content: AiMessageContent) {
    if (typeof content === 'string') return content;
    return content
      .map((item) => {
        if (item.type === 'text') return item.text || '';
        if (item.type === 'image_url') return `[image:${item.image_url?.url || ''}]`;
        return `[${item.type}]`;
      })
      .join('\n');
  }

  private dateStart(date = new Date()) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private estimateTokens(text: string) {
    const length = String(text || '').length;
    return Math.max(1, Math.ceil(length / 3));
  }

  private estimateCost(provider: string, model: string, inputTokens: number, outputTokens: number) {
    const p = String(provider || '').toLowerCase();
    const m = String(model || '').toLowerCase();
    if (p === 'deepseek') return (inputTokens / 1_000_000) * 0.27 + (outputTokens / 1_000_000) * 1.1;
    if (p === 'openai' && m.includes('gpt-4o-mini')) return (inputTokens / 1_000_000) * 0.15 + (outputTokens / 1_000_000) * 0.6;
    return 0;
  }

  private classifyError(error: any) {
    if (error?.errorCode) return String(error.errorCode);
    const message = String(error?.message || '');
    if (error?.name === 'AbortError' || message.includes('timeout')) return 'timeout';
    if (error?.status === 401 || error?.status === 403) return 'auth_error';
    if (error?.status === 429) return 'rate_limited';
    if (error?.status >= 500) return 'provider_5xx';
    if (error?.status >= 400) return 'provider_4xx';
    return 'provider_error';
  }

  private async addQuotaUsage(input: {
    provider: string;
    model: string;
    purpose: string;
    regionId?: string | null;
    botId?: string | null;
    status: 'success' | 'failed' | 'timeout' | 'cancelled';
    inputTokens: number;
    outputTokens: number;
    costAmount: number;
  }) {
    const date = this.dateStart();
    const scopeKey = [
      input.regionId ? `region:${input.regionId}` : '',
      input.botId ? `bot:${input.botId}` : '',
    ].filter(Boolean).join('|') || 'global';
    await this.prisma.aiQuotaUsage.upsert({
      where: {
        date_provider_model_purpose_scopeKey: {
          date,
          provider: input.provider,
          model: input.model,
          purpose: input.purpose,
          scopeKey,
        },
      },
      update: {
        callCount: { increment: 1 },
        successCount: input.status === 'success' ? { increment: 1 } : undefined,
        failedCount: input.status === 'success' ? undefined : { increment: 1 },
        inputTokens: { increment: input.inputTokens },
        outputTokens: { increment: input.outputTokens },
        costAmount: { increment: input.costAmount },
        regionId: input.regionId || undefined,
        botId: input.botId || undefined,
      },
      create: {
        date,
        provider: input.provider,
        model: input.model,
        purpose: input.purpose,
        scopeKey,
        regionId: input.regionId || null,
        botId: input.botId || null,
        callCount: 1,
        successCount: input.status === 'success' ? 1 : 0,
        failedCount: input.status === 'success' ? 0 : 1,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        costAmount: input.costAmount,
      },
    }).catch(() => undefined);
  }

  private async enforceQuotaGuard(config: AiRuntimeConfig, context: AiCallContext) {
    const ops = await this.readConfig('ai_ops_config').catch(() => ({} as Record<string, any>));
    const risk = (ops?.riskControl || {}) as Record<string, any>;
    const maxDailyCalls = Number(risk.maxDailyCalls || 0);
    const maxDailyTokens = Number(risk.maxDailyTokens || 0);
    const maxDailyCost = Number(risk.maxDailyCost || 0);
    if (!maxDailyCalls && !maxDailyTokens && !maxDailyCost) return;

    const usage = await this.prisma.aiQuotaUsage.aggregate({
      where: {
        date: this.dateStart(),
        provider: config.provider,
        model: config.model,
      },
      _sum: {
        callCount: true,
        inputTokens: true,
        outputTokens: true,
        costAmount: true,
      },
    }).catch(() => null);
    const callCount = usage?._sum.callCount || 0;
    const tokenCount = (usage?._sum.inputTokens || 0) + (usage?._sum.outputTokens || 0);
    const costAmount = Number(usage?._sum.costAmount || 0);
    const hit =
      maxDailyCalls && callCount >= maxDailyCalls
        ? { type: 'daily_call_limit', message: `AI今日调用次数已达上限(${maxDailyCalls})` }
        : maxDailyTokens && tokenCount >= maxDailyTokens
          ? { type: 'daily_token_limit', message: `AI今日Token已达上限(${maxDailyTokens})` }
          : maxDailyCost && costAmount >= maxDailyCost
            ? { type: 'daily_cost_limit', message: `AI今日成本已达上限(${maxDailyCost})` }
            : null;
    if (!hit) return;
    await this.prisma.aiRiskEvent.create({
      data: {
        eventType: hit.type,
        level: 'critical',
        taskId: context.taskId || null,
        botId: context.botId || null,
        regionId: context.regionId || null,
        detail: { message: hit.message, callCount, tokenCount, costAmount },
      },
    }).catch(() => undefined);
    const error: any = new Error(hit.message);
    error.status = 429;
    error.errorCode = hit.type;
    throw error;
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

  async callChatDetailed(
    messages: AiChatMessage[],
    options: AiChatOptions = {},
  ) {
    const config = await this.getRuntimeConfig({ allowDisabled: options.allowDisabled });
    if (!config.enabled) throw new Error('AI运营未启用，请先在 AI运营中心 / AI配置 中开启');
    if (!config.apiKey) throw new Error('AI API Key 未配置，请先在 AI运营中心 / AI配置 中填写密钥');
    if (!config.model) throw new Error('AI 模型未配置，请先填写模型名称');

    const endpoint = options.endpoint || `${config.apiBaseUrl}/chat/completions`;
    const requestId = randomUUID();
    const startedAt = Date.now();
    const promptText = messages.map((m) => `${m.role}: ${this.messageContentPreview(m.content)}`).join('\n');
    const purpose = options.purpose || 'generation';
    const source = options.source || 'system';
    let callLogId = '';
    const timeoutMs = Math.max(3000, Number(this.configService.get('AI_TIMEOUT_MS') || 30000));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const callLog = await this.prisma.aiCallLog.create({
      data: {
        requestId,
        provider: config.provider,
        model: config.model,
        endpoint,
        purpose,
        source,
        taskId: options.taskId || null,
        botId: options.botId || null,
        userId: options.userId || null,
        adminId: options.adminId || null,
        regionId: options.regionId || null,
        promptHash: this.hash(promptText),
        promptPreview: this.preview(promptText),
        status: 'running',
      },
      select: { id: true },
    }).catch(() => null);
    callLogId = callLog?.id || '';

    try {
      await this.enforceQuotaGuard(config, options);
      const response = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
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
        const error: any = new Error(`AI API 调用失败 (${response.status}): ${detail.slice(0, 300)}`);
        error.status = response.status;
        throw error;
      }

      const result = await response.json();
      const content = String(result.choices?.[0]?.message?.content || '').trim();
      const inputTokens = Number(result.usage?.prompt_tokens) || this.estimateTokens(promptText);
      const outputTokens = Number(result.usage?.completion_tokens) || this.estimateTokens(content);
      const totalTokens = Number(result.usage?.total_tokens) || inputTokens + outputTokens;
      const costAmount = this.estimateCost(config.provider, config.model, inputTokens, outputTokens);
      const latencyMs = Date.now() - startedAt;

      if (callLogId) {
        await this.prisma.aiCallLog.update({
          where: { id: callLogId },
          data: {
            status: 'success',
            responsePreview: this.preview(content),
            latencyMs,
            inputTokens,
            outputTokens,
            totalTokens,
            costAmount,
          },
        }).catch(() => undefined);
      }
      await this.addQuotaUsage({
        provider: config.provider,
        model: config.model,
        purpose,
        regionId: options.regionId,
        botId: options.botId,
        status: 'success',
        inputTokens,
        outputTokens,
        costAmount,
      });

      return { content, callLogId, inputTokens, outputTokens, totalTokens, costAmount, latencyMs, provider: config.provider, model: config.model };
    } catch (error: any) {
      const status = error?.name === 'AbortError' ? 'timeout' : 'failed';
      const errorCode = this.classifyError(error);
      const latencyMs = Date.now() - startedAt;
      if (callLogId) {
        await this.prisma.aiCallLog.update({
          where: { id: callLogId },
          data: {
            status,
            errorCode,
            errorMessage: String(error?.message || 'AI调用失败').slice(0, 1000),
            latencyMs,
          },
        }).catch(() => undefined);
      }
      await this.addQuotaUsage({
        provider: config.provider,
        model: config.model,
        purpose,
        regionId: options.regionId,
        botId: options.botId,
        status,
        inputTokens: 0,
        outputTokens: 0,
        costAmount: 0,
      });
      error.callLogId = callLogId;
      error.errorCode = errorCode;
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async callChat(
    messages: AiChatMessage[],
    options: AiChatOptions = {},
  ) {
    const result = await this.callChatDetailed(messages, options);
    return result.content;
  }

  async generateText(prompt: string, options: { systemPrompt?: string; type?: string; count?: number } & AiCallContext = {}) {
    const config = await this.getRuntimeConfig();
    const systemPrompt = options.systemPrompt || config.prompt;
    return this.callChat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      {
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        purpose: options.type || options.purpose || 'generation',
        source: options.source,
        taskId: options.taskId,
        botId: options.botId,
        userId: options.userId,
        adminId: options.adminId,
        regionId: options.regionId,
      },
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

  // AUD-P1-152: 改为 public — 供所有内容入口（发帖/评论/私信）共享调用
  async detectSensitiveHit(text: string) {
    const content = String(text || '').toLowerCase();
    if (!content) return null;
    const words = await this.prisma.sensitiveWord.findMany({
      where: { status: 1 },
      select: { word: true, level: true, category: true },
      take: 1000,
    }).catch(() => [] as Array<{ word: string; level: string; category: string }>);
    return words.find((item) => {
      const word = String(item.word || '').trim().toLowerCase();
      return Boolean(word && content.includes(word));
    }) || null;
  }

  private shouldRejectWithoutManual(result: AiModerationResult) {
    const labels = (result.labels || []).map((item) => String(item || '').toLowerCase());
    const reason = String(result.reason || '').toLowerCase();
    const riskText = [...labels, reason].join(' ');
    const highRiskKeywords = [
      'sensitive_word',
      'strict',
      'qrcode',
      'payment',
      'contact',
      'fraud',
      'porn',
      'violence',
      'privacy',
      'illegal',
      'spam',
      '敏感词',
      '二维码',
      '收款',
      '联系方式',
      '诈骗',
      '色情',
      '暴力',
      '违法',
      '隐私',
      '广告',
    ];
    return Number(result.score || 0) >= 0.7 || highRiskKeywords.some((keyword) => riskText.includes(keyword));
  }

  private resolveManualFallback(result: AiModerationResult, manualFallback: boolean): AiModerationResult {
    if (manualFallback || result.decision !== 'manual') return result;
    const shouldReject = this.shouldRejectWithoutManual(result);
    const baseReason = String(result.reason || 'AI建议人工复核')
      .replace(/[，,；;]?\s*已?转入?人工(审核|复核)?/g, '')
      .replace(/[，,；;]?\s*等待人工(审核|复核)?/g, '')
      .trim() || 'AI建议人工复核';
    return {
      ...result,
      decision: shouldReject ? 'reject' : 'approve',
      reason: `${baseReason}；已按配置不转人工，${shouldReject ? '自动拒绝' : '自动通过'}`,
      labels: Array.from(new Set([...(result.labels || []), 'no_manual_fallback'])),
      fallbackType: result.fallbackType || 'manual_resolved_by_policy',
    };
  }

  async moderateContent(input: {
    type: 'post' | 'comment';
    title?: string | null;
    content: string;
    regionId?: string | null;
    approvalType?: string;
    manualFallback?: boolean;
  }): Promise<AiModerationResult> {
    const approvalType = String(input.approvalType || 'manual').toLowerCase();
    const manualFallback = input.manualFallback !== false;
    if (!['ai', 'llm', 'model'].includes(approvalType)) {
      if (['none', 'auto', 'pass', 'published', 'approved'].includes(approvalType)) {
        return { decision: 'approve', reason: '无需审核', labels: [], score: 0, skipped: true };
      }
      return { decision: 'manual', reason: '当前配置为人工审核', labels: ['manual'], score: 0, skipped: true };
    }

    const config = await this.getRuntimeConfig();
    if (!config.enabled || !config.apiKey) {
      return this.resolveManualFallback({
        decision: 'manual',
        reason: 'AI未启用或密钥未配置，已转人工审核',
        labels: ['ai_not_configured'],
        score: 0,
        skipped: true,
        fallbackType: 'ai_not_configured',
      }, manualFallback);
    }

    const content = String(input.content || '').trim();
    if (!content && !input.title) {
      return { decision: 'reject', reason: '内容为空', labels: ['empty'], score: 1, skipped: true };
    }
    const sensitiveHit = await this.detectSensitiveHit(`${input.title || ''}\n${content}`);
    if (sensitiveHit) {
      const level = String(sensitiveHit.level || 'audit').toLowerCase();
      const decision: AiDecision = level === 'strict' ? 'reject' : 'manual';
      return this.resolveManualFallback({
        decision,
        reason: `命中敏感词：${sensitiveHit.word}`,
        labels: ['sensitive_word', sensitiveHit.category || 'other', level],
        score: level === 'strict' ? 1 : 0.75,
        skipped: true,
        fallbackType: 'sensitive_word',
      }, manualFallback);
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
      const detail = await this.callChatDetailed(
        [
          { role: 'system', content: '你是严谨的内容安全审核员，只输出 JSON，不要解释。' },
          { role: 'user', content: prompt },
        ],
        { temperature: 0.1, maxTokens: 500, purpose: 'moderation', source: 'content_review', regionId: input.regionId || undefined },
      );
      const raw = detail.content;
      const parsed = this.extractJson(raw);
      if (!parsed) {
        return this.resolveManualFallback({
          decision: 'manual',
          reason: 'AI审核结果无法解析，已转人工审核',
          labels: ['parse_failed'],
          score: 0.5,
          raw,
          callLogId: detail.callLogId,
          fallbackType: 'parse_failed',
        }, manualFallback);
      }
      const decision = ['approve', 'reject', 'manual'].includes(parsed.decision) ? parsed.decision : 'manual';
      return this.resolveManualFallback({
        decision,
        reason: String(parsed.reason || (decision === 'approve' ? 'AI审核通过' : 'AI建议人工复核')),
        labels: Array.isArray(parsed.labels) ? parsed.labels.map((item: any) => String(item)) : [],
        score: Math.max(0, Math.min(1, Number(parsed.score) || 0)),
        raw,
        callLogId: detail.callLogId,
        fallbackType: 'none',
      }, manualFallback);
    } catch (error: any) {
      return this.resolveManualFallback({
        decision: 'manual',
        reason: error?.message ? `AI审核失败，已转人工：${error.message.slice(0, 120)}` : 'AI审核失败，已转人工',
        labels: ['ai_error'],
        score: 0.5,
        callLogId: error?.callLogId,
        fallbackType: error?.errorCode || 'provider_error',
      }, manualFallback);
    }
  }

  async recordModeration(input: {
    targetType: 'post' | 'comment';
    targetId: string;
    userId?: string | null;
    regionId?: string | null;
    approvalType?: string | null;
    result: AiModerationResult;
    finalStatus?: string | null;
  }) {
    return this.prisma.aiModerationRecord.create({
      data: {
        targetType: input.targetType,
        targetId: input.targetId,
        userId: input.userId || null,
        regionId: input.regionId || null,
        approvalType: input.approvalType || null,
        decision: input.result.decision,
        reason: input.result.reason,
        labels: input.result.labels || [],
        score: input.result.score || 0,
        rawResult: input.result.raw ? { text: input.result.raw } : undefined,
        callLogId: input.result.callLogId || null,
        fallbackType: input.result.fallbackType || (input.result.skipped ? 'disabled' : 'none'),
        finalStatus: input.finalStatus || null,
      },
    }).catch(() => undefined);
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
