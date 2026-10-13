import { BadRequestException } from '@nestjs/common';

export function errandStatusFilter(group?: string) {
  const groups: Record<string, string[]> = {
    pending_pay: ['pending_pay'], pending_accept: ['pending_accept'],
    processing: ['accepted', 'in_progress', 'arrived'],
    completed: ['completed'], cancelled: ['cancelled'],
  };
  if (!group || group === 'all') return undefined;
  if (!groups[group]) throw new BadRequestException('订单状态筛选无效');
  return { in: groups[group] };
}
