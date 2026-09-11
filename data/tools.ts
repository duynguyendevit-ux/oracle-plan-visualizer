export interface ToolDefinition {
  name: string
  href: string
  keywords: string
  icon: string
}

export const tools = [
  { name: 'Log Analyzer', href: '/log-analyzer', keywords: 'logs rancher kubectl pod errors', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { name: 'Execution Plan Visual', href: '/', keywords: 'oracle sql explain xplan cost', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { name: 'SQL Extractor', href: '/sql-extractor', keywords: 'hibernate query bind log format', icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4' },
  { name: 'Protobuf Decoder', href: '/protobuf-decoder', keywords: 'protobuf proto kafka decode hex base64 escaped bytes confluent schema registry', icon: 'M4 6h16M4 12h10M4 18h16m-3-9 3 3-3 3' },
  { name: 'Excel Tools', href: '/excel-tools', keywords: 'xlsx csv analyzer formula calculator', icon: 'M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' },
  { name: 'Activity Diagram', href: '/activity-diagram', keywords: 'uml drawio flow chart svg', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { name: 'Env to K8s', href: '/env-to-k8s', keywords: 'environment kubernetes yaml properties config', icon: 'M4 7h16M4 12h16M4 17h7m5-1 2 2 4-4' },
  { name: 'Cron Generator', href: '/cron-expression', keywords: 'cron crontab schedule expression timer job', icon: 'M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z' },
  { name: 'Nginx Redirects', href: '/nginx-redirect', keywords: 'nginx redirect generator rewrite 301 302 308 server config', icon: 'M5 12h13m-5-5 5 5-5 5M5 5v14' },
  { name: 'Web hữu ích', href: '/useful-websites', keywords: 'website resources links tools mạng dns network globalping', icon: 'M12 21a9 9 0 100-18 9 9 0 000 18zm0 0c2.2-2.46 3.33-5.46 3.33-9S14.2 5.46 12 3m0 18c-2.2-2.46-3.33-5.46-3.33-9S9.8 5.46 12 3M3 12h18' },
  { name: 'Hash Generator', href: '/hash-generator', keywords: 'md5 sha checksum digest', icon: 'M7 20l4-16m2 16 4-16M6 9h14M4 15h14' },
  { name: 'Consistent Hashing', href: '/consistent-hashing', keywords: 'consistent hash ring distributed systems server vnode sharding scaling', icon: 'M12 3a9 9 0 109 9M12 3a9 9 0 00-9 9m9-9v4m9 5h-4M12 21v-4M3 12h4' },
  { name: 'Diff Viewer', href: '/diff-viewer', keywords: 'compare text changes', icon: 'M8 7h12m0 0-4-4m4 4-4 4m0 6H4m0 0 4 4m-4-4 4-4' },
  { name: 'URL Encoder', href: '/url-encoder', keywords: 'base64 encode decode uri', icon: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1' },
] satisfies readonly ToolDefinition[]
