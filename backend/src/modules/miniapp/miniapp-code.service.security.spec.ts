import { MiniappCodeService } from './miniapp-code.service';

describe('MiniappCodeService asset name boundary', () => {
  it('normalizes a bounded filename without edge-trimming regex backtracking', () => {
    const service = new MiniappCodeService();
    expect((service as any).safeAssetBase('---校园 地图---')).toBe('校园-地图');
    expect((service as any).safeAssetBase('x'.repeat(200))).toHaveLength(40);
  });
});
