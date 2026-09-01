import {
  getManagedWechatTemplateContract,
  isWechatTemplateTechnicalConfigManaged,
} from './wechat-template-contracts';

describe('backend-managed WeChat template contracts', () => {
  it('keeps the production official-account accepted-order fields in code', () => {
    expect(getManagedWechatTemplateContract('official', 'errand_accepted')).toEqual(expect.objectContaining({
      fieldMapping: {
        character_string1: 'orderNo',
        character_string2: 'riderName',
        time3: 'estimatedTime',
      },
      requiredTemplateKeys: ['character_string1', 'character_string2', 'time3'],
    }));
  });

  it('keeps the existing official picked and delivered defaults in code', () => {
    expect(getManagedWechatTemplateContract('official', 'errand_picked')?.fieldMapping).toEqual({
      thing1: 'orderNo',
      thing2: 'pickupAddress',
      time3: 'estimatedTime',
    });
    expect(getManagedWechatTemplateContract('official', 'errand_delivered')).toEqual(expect.objectContaining({
      fieldMapping: { thing1: 'orderNo', time2: 'finishedAt', thing3: 'remark' },
      requiredTemplateKeys: ['thing1', 'time2'],
    }));
  });

  it('locks operator-visible technical config without inventing unverified field mappings', () => {
    const pairs = [
      ['miniprogram', 'takeaway_order_status'],
      ['miniprogram', 'takeaway_merchant_order'],
      ['miniprogram', 'takeaway_rider_order'],
      ['miniprogram', 'errand_accepted'],
      ['miniprogram', 'errand_picked'],
      ['miniprogram', 'errand_delivered'],
      ['official', 'errand_abnormal'],
      ['miniprogram', 'post_audit_result'],
      ['miniprogram', 'post_comment'],
      ['miniprogram', 'comment_reply'],
      ['official', 'community_at'],
      ['official', 'community_reply'],
      ['official', 'community_like'],
    ];
    for (const [platform, type] of pairs) {
      expect(isWechatTemplateTechnicalConfigManaged(platform, type)).toBe(true);
      expect(getManagedWechatTemplateContract(platform, type)).toBeNull();
    }
  });

  it('does not lock or invent a contract for developer-defined templates', () => {
    expect(getManagedWechatTemplateContract('official', 'custom_scene')).toBeNull();
    expect(isWechatTemplateTechnicalConfigManaged('official', 'custom_scene')).toBe(false);
  });
});
