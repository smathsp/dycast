export const DYCAST_WS_HOST_PARAM = '__dycast_ws_host';

const DOUYIN_PUSH_HOST_PATTERN = /^webcast[\w-]*-ws-web-[\w-]+\.douyin\.com$/i;

/** 只接受抖音官方的弹幕推送主机，响应异常时由本地代理继续使用固定后备节点。 */
export function getDouyinPushServerHost(rawValue: unknown): string {
  if (typeof rawValue !== 'string' || !rawValue.trim()) return '';
  try {
    const url = new URL(rawValue);
    if (url.protocol !== 'wss:' || !DOUYIN_PUSH_HOST_PATTERN.test(url.hostname)) return '';
    return url.hostname.toLowerCase();
  } catch {
    return '';
  }
}
