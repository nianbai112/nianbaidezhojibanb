import { ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/services/prisma.service";
import { RedisService } from "../../common/services/redis.service";

type RiderAiConfig = {
  enabled: boolean;
  provider: string;
  apiBaseUrl: string;
  apiKey?: string;
  model: string;
  temperature: number;
  maxTokens: number;
  dailyCallLimit: number;
  dailyCostLimit: number;
  analysisInterval: "manual" | "hourly" | "six_hours" | "daily" | "weekly";
  analysisScope: "all" | "errand" | "takeaway";
  regionScope: string;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  lastStatus?: string;
};

@Injectable()
export class RiderAiAdvisoryService {
  private readonly configKey = "rider_ai_advisory_config_v1";
  private readonly suggestionsKey = "rider_ai_advisory_suggestions_v1";
  private readonly runLogsKey = "rider_ai_advisory_run_logs_v1";

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis?: RedisService,
  ) {}

  private defaultConfig(): RiderAiConfig {
    return {
      enabled: false,
      provider: "deepseek",
      apiBaseUrl: "",
      apiKey: "",
      model: "deepseek-chat",
      temperature: 0.2,
      maxTokens: 1200,
      dailyCallLimit: 20,
      dailyCostLimit: 20,
      analysisInterval: "manual",
      analysisScope: "all",
      regionScope: "all",
      lastRunAt: null,
      nextRunAt: null,
      lastStatus: "not_run",
    };
  }

  private async readConfigRaw(): Promise<RiderAiConfig> {
    const row = await this.prisma.config
      .findUnique({ where: { key: this.configKey } })
      .catch(() => null);
    return { ...this.defaultConfig(), ...((row?.value as any) || {}) };
  }

  maskRiderAiConfig(config: RiderAiConfig) {
    const { apiKey, ...safe } = config;
    return {
      ...safe,
      hasApiKey: !!apiKey,
      apiKeyMasked: apiKey ? "********" : "",
      configured: !!apiKey || !!safe.apiBaseUrl,
    };
  }

  async getConfig() {
    return {
      success: true,
      data: this.maskRiderAiConfig(await this.readConfigRaw()),
    };
  }

  async shouldRunScheduledAnalysis(now = new Date()) {
    const config = await this.readConfigRaw();
    if (!config.enabled || config.analysisInterval === "manual") {
      return {
        due: false,
        reason: "disabled_or_manual",
        config: this.maskRiderAiConfig(config),
      };
    }
    const nextRunAt = config.nextRunAt ? new Date(config.nextRunAt) : null;
    const invalidNextRunAt = !nextRunAt || Number.isNaN(nextRunAt.getTime());
    return {
      due: invalidNextRunAt || nextRunAt.getTime() <= now.getTime(),
      reason: invalidNextRunAt ? "missing_next_run_at" : "scheduled",
      config: this.maskRiderAiConfig(config),
    };
  }

  async saveConfig(data: any = {}) {
    const current = await this.readConfigRaw();
    const incomingKey = String(data.apiKey || "").trim();
    const next: RiderAiConfig = {
      ...current,
      enabled: data.enabled === true,
      provider: String(data.provider || current.provider || "deepseek"),
      apiBaseUrl: String(
        data.apiBaseUrl || data.api_base_url || current.apiBaseUrl || "",
      ),
      apiKey:
        incomingKey && !/^\*+$/.test(incomingKey)
          ? incomingKey
          : current.apiKey,
      model: String(data.model || current.model || "deepseek-chat"),
      temperature: this.clampNumber(
        data.temperature,
        0,
        2,
        current.temperature,
      ),
      maxTokens: this.clampNumber(
        data.maxTokens ?? data.max_tokens,
        100,
        32000,
        current.maxTokens,
      ),
      dailyCallLimit: this.clampNumber(
        data.dailyCallLimit ?? data.daily_call_limit,
        0,
        10000,
        current.dailyCallLimit,
      ),
      dailyCostLimit: this.clampNumber(
        data.dailyCostLimit ?? data.daily_cost_limit,
        0,
        100000,
        current.dailyCostLimit,
      ),
      analysisInterval: this.normalizeInterval(
        data.analysisInterval ||
          data.analysis_interval ||
          current.analysisInterval,
      ),
      analysisScope: this.normalizeScope(
        data.analysisScope || data.analysis_scope || current.analysisScope,
      ),
      regionScope: String(
        data.regionScope || data.region_scope || current.regionScope || "all",
      ),
      lastRunAt: current.lastRunAt || null,
      nextRunAt: this.nextRunAt(
        this.normalizeInterval(
          data.analysisInterval ||
            data.analysis_interval ||
            current.analysisInterval,
        ),
      ),
      lastStatus: current.lastStatus || "not_run",
    };
    await this.prisma.config.upsert({
      where: { key: this.configKey },
      update: { value: next, group: "analytics" },
      create: {
        key: this.configKey,
        value: next,
        group: "analytics",
        desc: "骑手算法 AI 建议配置",
      },
    });
    return { success: true, data: this.maskRiderAiConfig(next) };
  }

  async listSuggestions(query: any = {}) {
    const value = await this.readList(this.suggestionsKey);
    const status = String(query.status || "");
    const target = String(query.target || "");
    const list = value
      .filter((item: any) => !status || item.status === status)
      .filter((item: any) => !target || item.target_algorithm === target)
      .sort((a: any, b: any) =>
        String(b.created_at).localeCompare(String(a.created_at)),
      );
    return { success: true, data: { list, total: list.length } };
  }

  async updateSuggestionStatus(id: string, dto: any = {}) {
    const value = await this.readList(this.suggestionsKey);
    const nextStatus = ["pending", "accepted", "applied", "dismissed"].includes(
      String(dto.status),
    )
      ? String(dto.status)
      : "pending";
    const next = value.map((item: any) =>
      item.id === id
        ? {
            ...item,
            status: nextStatus,
            operator_note:
              dto.operator_note || dto.operatorNote || item.operator_note || "",
            updated_at: new Date().toISOString(),
          }
        : item,
    );
    await this.writeList(this.suggestionsKey, next, "骑手算法 AI 建议");
    return {
      success: true,
      data: next.find((item: any) => item.id === id) || null,
    };
  }

  async listRunLogs(query: any = {}) {
    const limit = this.clampNumber(query.limit, 1, 200, 50);
    const list = (await this.readList(this.runLogsKey)).slice(-limit).reverse();
    return { success: true, data: { list, total: list.length } };
  }

  async runAnalysis(metrics: any = {}, triggerType = "manual") {
    if (!this.redis) return this.runAnalysisUnlocked(metrics, triggerType);
    const result = await this.redis.withRenewingLock(
      "analytics:rider-ai-analysis",
      15 * 60,
      () => this.runAnalysisUnlocked(metrics, triggerType),
    );
    if (!result)
      throw new ConflictException("骑手 AI 分析正在运行，请稍后再试");
    return result;
  }

  private async runAnalysisUnlocked(metrics: any = {}, triggerType = "manual") {
    const config = await this.readConfigRaw();
    const startedAt = new Date();
    const builtInSuggestions = this.createBuiltInSuggestions(metrics, config);
    let suggestions = builtInSuggestions;
    let modelUsage: any = {};
    let modelError = "";
    let status = config.enabled
      ? "completed_builtin_missing_model_config"
      : "completed_builtin_advisory";
    if (this.canCallConfiguredModel(config)) {
      try {
        const modelResult = await this.callConfiguredModel(metrics, config);
        modelUsage = modelResult.usage || {};
        if (modelResult.suggestions.length) {
          suggestions = [
            ...modelResult.suggestions,
            ...builtInSuggestions,
          ].slice(0, 30);
          status = "completed_model_advisory";
        } else {
          status = "completed_model_empty_builtin_fallback";
        }
      } catch (error) {
        modelError = this.errorMessage(error);
        status = "completed_model_failed_builtin_fallback";
      }
    }
    const existing = await this.readList(this.suggestionsKey);
    const merged = [...existing, ...suggestions].slice(-300);
    await this.writeList(this.suggestionsKey, merged, "骑手算法 AI 建议");
    const log = {
      id: `rai_run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      trigger_type: triggerType,
      scope: config.analysisScope,
      provider: config.provider,
      model: config.model,
      input_data_range: metrics?.range || "latest",
      input_tokens: Number(
        modelUsage.prompt_tokens || modelUsage.input_tokens || 0,
      ),
      output_tokens: Number(
        modelUsage.completion_tokens || modelUsage.output_tokens || 0,
      ),
      total_tokens: Number(modelUsage.total_tokens || 0),
      cost_estimate: 0,
      status,
      error_message: modelError,
      generated_suggestion_count: suggestions.length,
      created_at: startedAt.toISOString(),
    };
    await this.writeList(
      this.runLogsKey,
      [...(await this.readList(this.runLogsKey)), log].slice(-200),
      "骑手算法 AI 分析日志",
    );
    await this.prisma.config.upsert({
      where: { key: this.configKey },
      update: {
        value: {
          ...config,
          lastRunAt: startedAt.toISOString(),
          nextRunAt: this.nextRunAt(config.analysisInterval),
          lastStatus: log.status,
        },
        group: "analytics",
      },
      create: {
        key: this.configKey,
        value: {
          ...config,
          lastRunAt: startedAt.toISOString(),
          nextRunAt: this.nextRunAt(config.analysisInterval),
          lastStatus: log.status,
        },
        group: "analytics",
        desc: "骑手算法 AI 建议配置",
      },
    });
    return { success: true, data: { log, suggestions } };
  }

  private canCallConfiguredModel(config: RiderAiConfig) {
    return (
      config.enabled === true &&
      !!String(config.apiKey || "").trim() &&
      !!String(config.apiBaseUrl || "").trim()
    );
  }

  private resolveChatCompletionsUrl(baseUrl = "") {
    const trimmed = String(baseUrl || "")
      .trim()
      .replace(/\/+$/, "");
    if (!trimmed) return "";
    if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
    return `${trimmed}/chat/completions`;
  }

  private async callConfiguredModel(metrics: any, config: RiderAiConfig) {
    const fetchImpl = (globalThis as any).fetch;
    if (typeof fetchImpl !== "function") {
      throw new Error("当前 Node 运行时不支持 fetch，无法调用模型");
    }
    const url = this.resolveChatCompletionsUrl(config.apiBaseUrl);
    const payload = {
      model: config.model,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "你是校园跑腿和外卖骑手调度算法顾问。",
            '请只返回 JSON，格式为 {"suggestions":[...]}。',
            "每条建议必须包含 suggestion_type、target_algorithm、title、suggested_change、current_metric_evidence、expected_impact、risk_warning、confidence。",
            "不要自动决定生效，所有建议都必须提示管理员人工确认。",
          ].join("\n"),
        },
        {
          role: "user",
          content: `根据以下骑手算法数据给出 1-5 条可执行建议：\n${this.safeStringify(metrics).slice(0, 18000)}`,
        },
      ],
    };
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        body?.error?.message ||
          body?.message ||
          `模型请求失败：${response.status}`,
      );
    }
    const content =
      body?.choices?.[0]?.message?.content || body?.choices?.[0]?.text || "";
    const parsed = this.parseModelJson(content);
    return {
      suggestions: this.normalizeModelSuggestions(parsed, config),
      usage: body?.usage || {},
    };
  }

  private safeStringify(value: any) {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return "{}";
    }
  }

  private parseModelJson(content: any) {
    if (typeof content !== "string") return content || {};
    const text = content.trim();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      const objectMatch = text.match(/\{[\s\S]*\}/);
      const arrayMatch = text.match(/\[[\s\S]*\]/);
      const jsonText = objectMatch?.[0] || arrayMatch?.[0] || "";
      if (!jsonText) return {};
      try {
        return JSON.parse(jsonText);
      } catch {
        return {};
      }
    }
  }

  private normalizeModelSuggestions(raw: any, config: RiderAiConfig) {
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.suggestions)
        ? raw.suggestions
        : Array.isArray(raw?.data)
          ? raw.data
          : [];
    const now = new Date().toISOString();
    return list
      .slice(0, 10)
      .map((item: any, index: number) => ({
        id: `rai_model_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`,
        status: "pending",
        suggestion_type: String(
          item?.suggestion_type || item?.type || "algorithm",
        ),
        target_algorithm: ["errand", "takeaway", "all"].includes(
          String(item?.target_algorithm || item?.targetAlgorithm),
        )
          ? String(item?.target_algorithm || item?.targetAlgorithm)
          : config.analysisScope === "takeaway"
            ? "takeaway"
            : "errand",
        title: String(item?.title || "")
          .trim()
          .slice(0, 80),
        suggested_change: String(
          item?.suggested_change || item?.suggestedChange || item?.change || "",
        )
          .trim()
          .slice(0, 500),
        current_metric_evidence: String(
          item?.current_metric_evidence || item?.evidence || "",
        )
          .trim()
          .slice(0, 300),
        expected_impact: String(item?.expected_impact || item?.impact || "")
          .trim()
          .slice(0, 300),
        risk_warning: String(
          item?.risk_warning ||
            item?.warning ||
            "模型建议，不自动生效，需要人工确认",
        )
          .trim()
          .slice(0, 300),
        confidence: ["low", "medium", "high"].includes(String(item?.confidence))
          ? String(item.confidence)
          : "medium",
        region_scope: config.regionScope || "all",
        source: "model",
        provider: config.provider,
        model: config.model,
        operator_note: "",
        created_at: now,
        updated_at: now,
      }))
      .filter((item: any) => item.title && item.suggested_change);
  }

  private errorMessage(error: any) {
    return String(error?.message || error || "模型调用失败").slice(0, 500);
  }

  private createBuiltInSuggestions(metrics: any = {}, config: RiderAiConfig) {
    const summary = metrics.summary || metrics || {};
    const fulfillment =
      metrics.fulfillment_metrics?.overall || summary.fulfillment || {};
    const suggestions: any[] = [];
    const now = new Date().toISOString();
    const push = (item: any) =>
      suggestions.push({
        id: `rai_sug_${Date.now()}_${suggestions.length}_${Math.random().toString(36).slice(2, 6)}`,
        status: "pending",
        confidence: item.confidence || "medium",
        region_scope: config.regionScope || "all",
        current_metric_evidence: item.evidence,
        expected_impact: item.impact,
        risk_warning: item.warning || "AI建议，不自动生效，需要人工确认",
        operator_note: "",
        created_at: now,
        updated_at: now,
        ...item,
      });

    const topTag = summary.top_tags?.[0]?.tag;
    if (topTag === "cake" || summary.high_risk > 0) {
      push({
        suggestion_type: "risk_rule",
        target_algorithm: "errand",
        title: "收紧高风险跑腿任务派单",
        suggested_change:
          "蛋糕、液体、贵重物订单默认禁止叠单，并缩小到同片区或附近片区推送。",
        evidence: `高风险样本 ${summary.high_risk || 0} 条，最高频标签 ${topTag || "暂无"}`,
        impact: "降低损坏投诉和超时风险",
      });
    }
    if ((summary.evidence_required || 0) > 0) {
      push({
        suggestion_type: "evidence",
        target_algorithm: "errand",
        title: "检查高风险订单拍照闭环",
        suggested_change:
          "对需要证据的订单核查取件照和送达照是否完整，缺失时提醒骑手补充。",
        evidence: `需证据样本 ${summary.evidence_required} 条`,
        impact: "提高售后纠纷处理依据",
      });
    }
    const totalOrders = Number(fulfillment.total_orders || 0);
    if (
      totalOrders >= 10 &&
      Number(fulfillment.acceptance_rate || 0) > 0 &&
      Number(fulfillment.acceptance_rate) < 80
    ) {
      push({
        suggestion_type: "dispatch",
        target_algorithm: "errand",
        title: "接单成功率偏低，建议调整推送和价格策略",
        suggested_change:
          "扩大低风险订单的首轮推送范围，检查基础费和认证骑手加价是否导致骑手不愿接单。",
        evidence: `近周期接单成功率 ${fulfillment.acceptance_rate}%，样本 ${totalOrders} 单`,
        impact: "提升待接单转接单效率，减少用户下单后长时间等待",
        confidence:
          Number(fulfillment.acceptance_rate) < 65 ? "high" : "medium",
      });
    }
    if (totalOrders >= 10 && Number(fulfillment.timeout_rate || 0) > 10) {
      push({
        suggestion_type: "eta",
        target_algorithm: "errand",
        title: "超时率偏高，建议校准 ETA 和预约送达规则",
        suggested_change:
          "按任务类型、楼栋区域和高峰时段增加 ETA 缓冲；高风险物品禁止叠单或缩小同片区推送。",
        evidence: `近周期超时率 ${fulfillment.timeout_rate}%，超时 ${fulfillment.timeout_orders || 0} 单`,
        impact: "降低超时投诉，并让用户看到更真实的预计送达时间",
        confidence: Number(fulfillment.timeout_rate) > 20 ? "high" : "medium",
      });
    }
    if (totalOrders >= 10 && Number(fulfillment.cancel_rate || 0) > 10) {
      push({
        suggestion_type: "cancel_control",
        target_algorithm: "errand",
        title: "取消率偏高，建议排查支付后无人接单和任务描述",
        suggested_change:
          "拆分未接单取消、骑手接单后取消、用户主动取消三类原因，并对无人接单订单提前触发兜底推送。",
        evidence: `近周期取消率 ${fulfillment.cancel_rate}%，取消 ${fulfillment.cancelled_orders || 0} 单`,
        impact: "减少用户流失和无效派单，帮助管理员定位取消原因",
        confidence: Number(fulfillment.cancel_rate) > 18 ? "high" : "medium",
      });
    }
    if (totalOrders >= 10 && Number(fulfillment.incident_rate || 0) > 1) {
      push({
        suggestion_type: "risk_rule",
        target_algorithm: "errand",
        title: "风险事故率偏高，建议收紧高风险履约规则",
        suggested_change:
          "蛋糕、贵重、大件、液体类任务要求取件照和送达照；事故高发时段降低骑手叠单上限。",
        evidence: `近周期风险事故率 ${fulfillment.incident_rate}%，事故样本 ${fulfillment.incident_orders || 0} 单`,
        impact: "减少损坏、丢失、撒漏类纠纷，保护平台和骑手",
        confidence: Number(fulfillment.incident_rate) > 3 ? "high" : "medium",
      });
    }
    push({
      suggestion_type: "eta",
      target_algorithm: "takeaway",
      title: "外卖算法先记录商家等待时间",
      suggested_change: "按商家和时段统计取餐等待，午高峰单独增加 ETA 缓冲。",
      evidence: "外卖算法已纳入骑手分析中心，建议先沉淀商家维度数据",
      impact: "为外卖派单和送达时间校准建立基础",
      confidence: "low",
    });
    return suggestions;
  }

  private async readList(key: string) {
    const row = await this.prisma.config
      .findUnique({ where: { key } })
      .catch(() => null);
    const value = row?.value as any;
    return Array.isArray(value?.list) ? value.list : [];
  }

  private async writeList(key: string, list: any[], desc: string) {
    await this.prisma.config.upsert({
      where: { key },
      update: {
        value: { list, updated_at: new Date().toISOString() },
        group: "analytics",
      },
      create: {
        key,
        value: { list, updated_at: new Date().toISOString() },
        group: "analytics",
        desc,
      },
    });
  }

  private clampNumber(value: any, min: number, max: number, fallback: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  }

  private normalizeInterval(value: any): RiderAiConfig["analysisInterval"] {
    return ["manual", "hourly", "six_hours", "daily", "weekly"].includes(
      String(value),
    )
      ? (String(value) as any)
      : "manual";
  }

  private normalizeScope(value: any): RiderAiConfig["analysisScope"] {
    return ["all", "errand", "takeaway"].includes(String(value))
      ? (String(value) as any)
      : "all";
  }

  private nextRunAt(interval: RiderAiConfig["analysisInterval"]) {
    if (interval === "manual") return null;
    const minutes =
      interval === "hourly"
        ? 60
        : interval === "six_hours"
          ? 360
          : interval === "daily"
            ? 1440
            : 10080;
    return new Date(Date.now() + minutes * 60 * 1000).toISOString();
  }
}
