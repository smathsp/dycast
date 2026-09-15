/**
 * 从纯房间号或抖音直播链接中提取房间号
 * @param value
 * @returns 提取失败时返回空字符串
 */
export function extractRoomNum(value: string): string {
  const input = value.trim();
  if (/^[0-9]{8,19}$/.test(input)) return input;

  try {
    const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    if (url.hostname.toLowerCase() !== 'live.douyin.com') return '';
    const roomNum = url.pathname.split('/').filter(Boolean)[0] || '';
    return /^[0-9]{8,19}$/.test(roomNum) ? roomNum : '';
  } catch {
    return '';
  }
}

/**
 * 验证房间号
 * @param value
 * @returns
 */
export function verifyRoomNum(value: string) {
  return Boolean(extractRoomNum(value));
}

/**
 * 验证 wss 地址
 * @param value
 * @returns
 */
export function verifyWsUrl(value: string) {
  const reg = /^wss?:\/\/(?:\[[^\]]+\]|[^/:]+)(?::\d+)?(?:\/.*)?$/i;
  return reg.test(value);
}
