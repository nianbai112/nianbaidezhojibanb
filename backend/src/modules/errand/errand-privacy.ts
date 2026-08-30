const numberValue = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const coarseAddress = (value: unknown) => {
  const text = String(value || '')
    .replace(/1[3-9]\d{9}/g, '')
    .replace(/[0-9０-９]+/g, '*')
    .split(/[，,；;\n]/)[0]
    .trim();
  return text.slice(0, 18);
};

const amountBand = (value: unknown) => {
  const amount = numberValue(value);
  if (amount < 5) return '0-5';
  if (amount < 10) return '5-10';
  if (amount < 20) return '10-20';
  return '20+';
};

export function poolErrandProjection(order: any) {
  const details = Array.isArray(order?.details) ? order.details : [];
  return {
    id: order?.id,
    order_id: order?.order_id || order?.id,
    order_no: order?.order_no,
    type: 'errand',
    service_type: order?.service_type,
    status: order?.status,
    raw_status: order?.raw_status,
    region_id: order?.region_id || order?.regionId,
    pickup_area: coarseAddress(order?.pickup_address),
    delivery_area: coarseAddress(order?.delivery_address || order?.address),
    delivery_time: order?.delivery_time,
    total_amount: order?.total_amount,
    pay_amount: order?.pay_amount,
    delivery_fee: order?.delivery_fee || order?.platform_delivery_fee,
    tip: order?.tip,
    task_count: details.length || Number(order?.task_count || 0),
    task_types: [...new Set(details.map((item: any) => item?.task_type).filter(Boolean))],
    required_evidence: order?.required_evidence || order?.risk_assessment?.required_evidence || [],
    receiver_type: order?.receiver_type,
    fallback_to_rider_enabled: order?.fallback_to_rider_enabled === true,
    fallback_release_at: order?.fallback_release_at || '',
    receiver_settlement_note: order?.receiver_settlement_note || '',
    dispatch_score: order?.dispatch_score,
    dispatch_reason: order?.dispatch_reason,
    created_at: order?.created_at,
  };
}

export function publicErrandProjection(order: any) {
  return {
    service_type: order?.service_type,
    status: order?.raw_status || order?.status || 'completed',
    region_label: order?.region_label || '本校区',
    amount_band: amountBand(order?.total_amount ?? order?.pay_amount ?? order?.amount),
    completed_at: order?.completed_at || order?.updated_at || order?.created_at,
    rider: order?.rider ? { anonymous: true, type: order.rider_type || 'part_time' } : null,
  };
}

export function assignedErrandProjection(order: any) {
  return order;
}
