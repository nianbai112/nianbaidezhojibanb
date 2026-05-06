/** 统一 API 响应格式 */
export interface ApiResponse<T = any> {
  code: number
  message: string
  data: T
  list?: any[]
  total?: number
  [key: string]: any
}

/** 分页请求参数 */
export interface PageParams {
  page: number
  pageSize: number
  sort?: string
  order?: 'ascend' | 'descend'
  [key: string]: any
}

/** 分页响应 */
export interface PageResult<T = any> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

/** 通用 ID 请求 */
export interface IdParam {
  id: number | string
}

/** 批量操作请求 */
export interface BatchParams {
  ids: (number | string)[]
  action: string
  data?: Record<string, any>
}
