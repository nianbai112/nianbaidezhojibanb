export function checkPasswordStrength(password: string, minLength = 8): { valid: boolean; message?: string } {
  if (String(password || '').length < minLength) {
    return { valid: false, message: `密码长度至少 ${minLength} 位` };
  }

  const classCount = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
  if (classCount < 3) {
    return { valid: false, message: '密码必须包含大写字母、小写字母、数字、特殊字符中至少3种' };
  }

  const weakPatterns = [
    /admin/i, /password/i, /123456/, /654321/, /qwerty/i, /abc123/i,
    /test\d*$/i, /demo\d*$/i, /lingmeng/i, /xiaoyi/i, /(.)\1{5,}/, /^\d{6,}$/,
  ];
  if (weakPatterns.some(pattern => pattern.test(password))) {
    return { valid: false, message: '密码过于简单，请使用更复杂的密码' };
  }
  return { valid: true };
}
