export type Tone = 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'cyan'
export type FieldType = 'text' | 'money' | 'tag' | 'avatar' | 'image' | 'date' | 'number' | 'rating' | 'progress'

export interface StatItem { label: string; value: string | number; delta?: string; down?: boolean; icon?: string; tone?: Tone }
export interface SearchField { key: string; label: string; type: 'input' | 'select' | 'daterange' | 'date'; placeholder?: string; options?: { label: string; value: string | number }[] }
export interface TableColumn { prop: string; label: string; type?: FieldType; minWidth?: number; width?: number; fixed?: 'left' | 'right' }
export interface SideMetric { title: string; desc?: string; value: string | number; icon?: string; tone?: Tone }
export interface ModuleConfig { key: string; menuKey?: string; title: string; subtitle: string; endpoint?: string; stats: StatItem[]; search: SearchField[]; actions: string[]; columns: TableColumn[]; sideTitle?: string; sideMetrics?: SideMetric[]; chartTitle?: string; detailTabs?: string[] }
