import { BadRequestException } from '@nestjs/common'
import { assertErrandRiderGender } from './errand-delivery-requirements'
import { errandRiskDescription } from './errand-risk-presentation'

export type ErrandAssignmentRisk = {
  allowed: boolean
  blocked: boolean
  eventType?: string
  eventLevel?: 'warning' | 'error' | 'critical'
  reasonCode?: string
  message?: string
  signals: string[]
  hasMarketingBenefit: boolean
}

type IdentityProfile = {
  phone?: string | null
  unionid?: string | null
  lastLoginIp?: string | null
  lastLoginDevice?: string | null
  withdraws?: Array<{ account?: string | null; channel?: string | null }> | null
  studentVerify?: {
    status?: string | null
    idCard?: string | null
    studentId?: string | null
    schoolId?: string | null
    schoolName?: string | null
  } | null
  rider?: {
    phone?: string | null
    idCard?: string | null
    alipayAccount?: string | null
  } | null
}

const normalizedDigits = (value: unknown) => {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.length > 11 ? digits.slice(-11) : digits
}

const normalizedIdentity = (value: unknown) =>
  String(value || '').replace(/[\s-]/g, '').toUpperCase()

const normalizedText = (value: unknown) => String(value || '').trim().toLowerCase()

const unavailableRisk = (hasMarketingBenefit: boolean): ErrandAssignmentRisk => ({
  allowed: false,
  blocked: true,
  eventType: 'assignment_risk_check_unavailable',
  eventLevel: 'critical',
  reasonCode: 'assignment_risk_check_unavailable',
  message: '接单风控校验暂不可用，请稍后重试',
  signals: ['risk_check_unavailable'],
  hasMarketingBenefit,
})

const approvedStudent = (profile?: IdentityProfile | null) => {
  const verification = profile?.studentVerify
  return verification && normalizedText(verification.status) === 'approved' ? verification : null
}

const sharedValue = (left: string[], right: string[], minLength = 1) => {
  const rightSet = new Set(right.filter(value => value.length >= minLength))
  return left.some(value => value.length >= minLength && rightSet.has(value))
}

const profilePhones = (profile?: IdentityProfile | null) =>
  [profile?.phone, profile?.rider?.phone]
    .map(normalizedDigits)
    .filter(Boolean)

const profileIdCards = (profile?: IdentityProfile | null) => {
  const student = approvedStudent(profile)
  return [student?.idCard, profile?.rider?.idCard]
    .map(normalizedIdentity)
    .filter(Boolean)
}

const studentIdentityKeys = (profile?: IdentityProfile | null) => {
  const student = approvedStudent(profile)
  if (!student) return []
  const studentId = normalizedIdentity(student.studentId)
  if (!studentId) return []
  return [student.schoolId, student.schoolName]
    .map(normalizedText)
    .filter(Boolean)
    .map(school => `${school}:${studentId}`)
}

const payoutAccountKey = (value: unknown, channel: string | null = 'ALI_PAY') => {
  const raw = String(value || '').trim()
  const provider = normalizedText(channel) || 'ali_pay'
  // WeChat identifiers are case sensitive; different payment providers do not share account identity.
  if (provider === 'wx_pay') return /^[A-Za-z0-9_-]{6,}$/.test(raw) ? `wx_pay:account:${raw}` : ''
  const text = normalizedText(raw)
  // Match the complete email first. Its digits must never be treated as a phone number.
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text)) return `${provider}:email:${text}`
  const phone = text.replace(/[\s-]/g, '')
  const phoneMatch = phone.match(/^(?:\+?86)?(1[3-9]\d{9})$/)
  if (phoneMatch) return `${provider}:phone:${phoneMatch[1]}`
  // Preserve the entire identifier: matching the last 11 digits causes unrelated accounts to collide.
  if (/^[a-z0-9._-]{6,}$/.test(text)) return `${provider}:account:${text}`
  return ''
}

const payoutAccountKeys = (profile?: IdentityProfile | null) =>
  [
    payoutAccountKey(profile?.rider?.alipayAccount, 'ALI_PAY'),
    ...(Array.isArray(profile?.withdraws) ? profile!.withdraws!.map(item => payoutAccountKey(item?.account, item?.channel)) : []),
  ].filter(Boolean)

export function assessErrandAssignmentRisk(input: {
  ownerUserId?: string | null
  assigneeUserId?: string | null
  hasMarketingBenefit?: boolean
  owner?: IdentityProfile | null
  assignee?: IdentityProfile | null
}): ErrandAssignmentRisk {
  const ownerUserId = String(input.ownerUserId || '').trim()
  const assigneeUserId = String(input.assigneeUserId || '').trim()
  const hasMarketingBenefit = !!input.hasMarketingBenefit

  if (ownerUserId && assigneeUserId && ownerUserId === assigneeUserId) {
    return {
      allowed: false,
      blocked: true,
      eventType: 'self_assignment_attempt',
      eventLevel: 'critical',
      reasonCode: 'self_assignment',
      message: '不能接自己发布的跑腿订单',
      signals: ['same_user_id'],
      hasMarketingBenefit,
    }
  }

  if (!hasMarketingBenefit) {
    return { allowed: true, blocked: false, signals: [], hasMarketingBenefit: false }
  }

  const strongSignals: string[] = []
  if (sharedValue(profilePhones(input.owner), profilePhones(input.assignee), 7)) {
    strongSignals.push('same_phone')
  }

  if (sharedValue(profileIdCards(input.owner), profileIdCards(input.assignee), 8)) {
    strongSignals.push('same_id_card')
  }

  if (sharedValue(studentIdentityKeys(input.owner), studentIdentityKeys(input.assignee))) {
    strongSignals.push('same_student_identity')
  }

  const ownerUnionid = normalizedIdentity(input.owner?.unionid)
  const assigneeUnionid = normalizedIdentity(input.assignee?.unionid)
  if (ownerUnionid && ownerUnionid === assigneeUnionid) strongSignals.push('same_unionid')

  if (sharedValue(payoutAccountKeys(input.owner), payoutAccountKeys(input.assignee))) {
    strongSignals.push('same_payout_account')
  }

  if (strongSignals.length) {
    return {
      allowed: false,
      blocked: true,
      eventType: 'marketing_related_account_assignment_attempt',
      eventLevel: 'critical',
      reasonCode: 'marketing_related_account',
      message: '该订单使用了营销优惠，发布人与接单人存在强关联，已停止接单',
      signals: strongSignals,
      hasMarketingBenefit: true,
    }
  }

  const weakSignals: string[] = []
  const ownerDevice = normalizedText(input.owner?.lastLoginDevice)
  const assigneeDevice = normalizedText(input.assignee?.lastLoginDevice)
  const sameDevice = !!ownerDevice && ownerDevice === assigneeDevice
  if (sameDevice) weakSignals.push('same_recent_device')
  const ownerIp = normalizedText(input.owner?.lastLoginIp)
  const assigneeIp = normalizedText(input.assignee?.lastLoginIp)
  const sameIp = !!ownerIp && ownerIp === assigneeIp
  if (sameIp) weakSignals.push('same_recent_ip')

  if (weakSignals.length) {
    return {
      allowed: true,
      blocked: false,
      eventType: sameDevice && sameIp
        ? 'marketing_shared_device_and_ip'
        : 'marketing_shared_device_or_ip',
      eventLevel: sameDevice && sameIp ? 'error' : 'warning',
      reasonCode: sameDevice && sameIp
        ? 'marketing_combined_device_ip_relation'
        : 'marketing_weak_relation',
      signals: weakSignals,
      hasMarketingBenefit: true,
    }
  }

  return { allowed: true, blocked: false, signals: [], hasMarketingBenefit: true }
}

async function readIdentityProfile(db: any, userId: string): Promise<IdentityProfile | null> {
  const [user, rider] = await Promise.all([
    db?.user?.findUnique
      ? db.user.findUnique({
          where: { id: userId },
          select: {
            phone: true,
            unionid: true,
            lastLoginIp: true,
            lastLoginDevice: true,
            withdraws: {
              where: { status: { not: 'REJECTED' } },
              orderBy: { createdAt: 'desc' },
              take: 10,
              select: { account: true, channel: true },
            },
            studentVerify: {
              select: {
                status: true,
                idCard: true,
                studentId: true,
                schoolId: true,
                schoolName: true,
              },
            },
          },
        })
      : null,
    db?.regionRider?.findUnique
      ? db.regionRider.findUnique({
          where: { userId },
          select: { phone: true, idCard: true, alipayAccount: true },
        })
      : null,
  ])
  return user || rider ? { ...(user || {}), rider } : null
}

export async function inspectErrandAssignmentRisk(
  db: any,
  order: any,
  assigneeUserId: string,
): Promise<ErrandAssignmentRisk> {
  const directAssessment = assessErrandAssignmentRisk({
    ownerUserId: order?.userId,
    assigneeUserId,
    hasMarketingBenefit: Number(order?.couponDiscount || order?.coupon_discount || 0) > 0,
  })
  if (directAssessment.blocked) return directAssessment

  let hasMarketingBenefit = directAssessment.hasMarketingBenefit
  try {
    if (!hasMarketingBenefit && db?.subsidyLedger?.findFirst && order?.id) {
      const subsidy = await db.subsidyLedger.findFirst({
        where: {
          orderType: 'errand_order',
          orderId: order.id,
          status: { not: 'cancelled' },
        },
        select: { id: true },
      })
      hasMarketingBenefit = !!subsidy
    }
    if (!hasMarketingBenefit) return directAssessment

    const [owner, assignee] = await Promise.all([
      readIdentityProfile(db, String(order?.userId || '')),
      readIdentityProfile(db, String(assigneeUserId || '')),
    ])
    return assessErrandAssignmentRisk({
      ownerUserId: order?.userId,
      assigneeUserId,
      hasMarketingBenefit: true,
      owner,
      assignee,
    })
  } catch (_) {
    // 金融风控查询异常时必须失败关闭，不能把“查不到”当成“无关联”。
    return unavailableRisk(hasMarketingBenefit)
  }
}

export async function recordErrandAssignmentRisk(
  db: any,
  order: any,
  assigneeUserId: string,
  source: string,
  risk: ErrandAssignmentRisk,
) {
  if (!risk.eventType || !order?.id || !db?.deliveryRiskEvent) return
  try {
    const existing = await db.deliveryRiskEvent.findFirst({
      where: {
        orderId: order.id,
        orderType: 'errand',
        riderId: assigneeUserId || null,
        eventType: risk.eventType,
        handled: false,
      },
      select: { id: true },
    })
    if (existing) return
    await db.deliveryRiskEvent.create({
      data: {
        orderId: order.id,
        orderType: 'errand',
        riderId: assigneeUserId || null,
        eventType: risk.eventType,
        eventLevel: risk.eventLevel || 'warning',
        description: errandRiskDescription(`跑腿订单 ${order.orderNo || order.id} 在${source}环节命中防刷规则：${risk.signals.join(', ') || risk.reasonCode || 'unknown'}。`),
      },
    })
  } catch (_) {
    // 风控日志失败不能放行高风险接单；拦截仍由调用方依据 risk.blocked 执行。
  }
}

export async function enforceErrandAssignmentGuard(
  db: any,
  order: any,
  assigneeUserId: string,
  source: string,
) {
  await assertErrandRiderGender(db, order, assigneeUserId)
  const risk = await inspectErrandAssignmentRisk(db, order, assigneeUserId)
  await recordErrandAssignmentRisk(db, order, assigneeUserId, source, risk)
  if (risk.blocked) throw new BadRequestException(risk.message || '该接单行为已被风控拦截')
  if (Number(order?.payAmount ?? order?.pay_amount ?? 0) > 0 && !order?.payTime) {
    throw new BadRequestException('订单尚未确认付款，不能接单、派单或转单')
  }
  return risk
}
