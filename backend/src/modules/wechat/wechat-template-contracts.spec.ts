import {
  getManagedWechatTemplateContract,
  isWechatTemplateTechnicalConfigManaged,
} from './wechat-template-contracts';

describe('backend-managed WeChat template contracts', () => {
  it('keeps the production official-account accepted-order fields in code', () => {
    expect(getManagedWechatTemplateContract('official', 'errand_accepted')).toEqual(expect.objectContaining({
      fieldMapping: {
        character_string1: 'orderNo',
        thing4: 'riderName',
        time6: 'estimatedTime',
      },
      requiredTemplateKeys: ['character_string1', 'thing4', 'time6'],
    }));
  });

  it('keeps the verified official picked and delivered fields in code', () => {
    expect(getManagedWechatTemplateContract('official', 'errand_picked')?.fieldMapping).toEqual({
      character_string1: 'orderNo',
      thing4: 'riderName',
      time3: 'pickedAt',
    });
    expect(getManagedWechatTemplateContract('official', 'errand_delivered')).toEqual(expect.objectContaining({
      fieldMapping: { character_string13: 'orderNo', time5: 'finishedAt', thing7: 'deliveryAddress' },
      requiredTemplateKeys: ['character_string13', 'time5', 'thing7'],
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
