import type { App } from 'vue'

/**
 * 权限指令 v-permission
 * 用法: <a-button v-permission="'user:edit'">编辑</a-button>
 * 无权限时移除元素
 */
function permissionDirective(el: HTMLElement, binding: any) {
  // 延迟检查，等 store 初始化
  const check = () => {
    const permissions: string[] = JSON.parse(localStorage.getItem('admin_permissions') || '[]')
    if (permissions.includes('*')) return
    const code = binding.value as string
    if (code && !permissions.includes(code)) {
      el.parentNode?.removeChild(el)
    }
  }
  check()
}

export function setupDirectives(app: App) {
  app.directive('permission', {
    mounted: permissionDirective,
  })
}
