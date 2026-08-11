import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

export type RiderLearningSnapshot = {
  id?: string;
  event_type: string;
  algorithm?: 'errand' | 'takeaway';
  region_id?: string | null;
  risk?: any;
  outcome_label?: string | null;
  created_at?: string;
};

@Injectable()
export class RiderLearningStore {
  private readonly key = 'rider_learning_snapshots_v1';
  private readonly maxSnapshots = 1000;

  constructor(private readonly prisma: PrismaService) {}

  private async readValue() {
    const row = await this.prisma.config.findUnique({ where: { key: this.key } }).catch(() => null);
    const value = row?.value as any;
    return {
      list: Array.isArray(value?.list) ? value.list : [],
      updated_at: value?.updated_at || null,
    };
  }

  async listSnapshots(limit = 500) {
    const value = await this.readValue();
    return value.list.slice(-Math.max(1, Math.min(1000, Number(limit) || 500)));
  }

  async appendSnapshot(snapshot: RiderLearningSnapshot) {
    const value = await this.readValue();
    const item = {
      id: snapshot.id || `rls_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      event_type: snapshot.event_type,
      algorithm: snapshot.algorithm || 'errand',
      region_id: snapshot.region_id || null,
      risk: snapshot.risk || {},
      outcome_label: snapshot.outcome_label || null,
      created_at: snapshot.created_at || new Date().toISOString(),
    };
    const list = [...value.list, item].slice(-this.maxSnapshots);
    await this.prisma.config.upsert({
      where: { key: this.key },
      update: { value: { list, updated_at: new Date().toISOString() }, group: 'analytics' },
      create: { key: this.key, value: { list, updated_at: new Date().toISOString() }, group: 'analytics', desc: '骑手算法学习快照' },
    });
    return item;
  }

  summarizeSnapshots(snapshots: any[] = []) {
    const byLevel: Record<string, number> = {};
    const byAlgorithm: Record<string, number> = {};
    const byOutcome: Record<string, number> = {};
    const tagCounts: Record<string, number> = {};
    let evidenceRequired = 0;
    let blocked = 0;
    let highRisk = 0;

    snapshots.forEach((snapshot) => {
      const algorithm = snapshot.algorithm || 'errand';
      byAlgorithm[algorithm] = (byAlgorithm[algorithm] || 0) + 1;
      const outcome = snapshot.outcome_label || snapshot.outcomeLabel || snapshot.event_type || 'unknown';
      byOutcome[outcome] = (byOutcome[outcome] || 0) + 1;
      const level = snapshot.risk?.risk_level || snapshot.risk?.level || 'unknown';
      byLevel[level] = (byLevel[level] || 0) + 1;
      if (level === 'blocked') blocked += 1;
      if (['high', 'restricted'].includes(level)) highRisk += 1;
      const tags = snapshot.risk?.risk_tags || snapshot.risk?.tags || [];
      if (Array.isArray(tags)) {
        tags.forEach((tag) => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
      const evidence = snapshot.risk?.required_evidence || snapshot.risk?.evidence || [];
      if (Array.isArray(evidence) && evidence.length) evidenceRequired += 1;
    });

    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    return {
      total_snapshots: snapshots.length,
      by_level: byLevel,
      by_algorithm: byAlgorithm,
      by_outcome: byOutcome,
      outcome_rates: this.buildOutcomeRates(byOutcome),
      top_tags: topTags,
      evidence_required: evidenceRequired,
      blocked,
      high_risk: highRisk,
      attention_items: this.buildAttentionItems({ blocked, highRisk, topTags, total: snapshots.length }),
    };
  }

  private buildOutcomeRates(byOutcome: Record<string, number>) {
    const created = byOutcome.created || byOutcome.order_created || 0;
    const denominator = Math.max(1, created);
    const percent = (value: number) => Math.min(100, Math.round((value / denominator) * 10000) / 100);
    return {
      acceptance_rate: percent((byOutcome.accepted || 0) + (byOutcome.completed || 0) + (byOutcome.timeout || 0)),
      completion_rate: percent((byOutcome.completed || 0) + (byOutcome.timeout || 0)),
      cancel_rate: percent(byOutcome.cancelled || 0),
      timeout_rate: percent(byOutcome.timeout || 0),
      incident_rate: percent(byOutcome.incident || 0),
    };
  }

  private buildAttentionItems(summary: any) {
    const items: string[] = [];
    if (summary.blocked > 0) items.push('存在 blocked 风险任务，请检查禁运/超价值规则是否需要提示前置');
    if (summary.highRisk > 0) items.push('存在高风险任务，建议核查拍照证据和叠单限制执行情况');
    const top = summary.topTags?.[0];
    if (top) items.push(`近期最高频风险标签为 ${top.tag}，出现 ${top.count} 次`);
    if (!items.length) items.push('当前样本风险平稳，继续积累履约结果用于后续校准');
    return items;
  }
}
