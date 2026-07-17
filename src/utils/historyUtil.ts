const STORAGE_KEY = 'dycast_room_history';
const MAX_HISTORY = 20;

export interface HistoryItem {
  roomNum: string;
  nickname?: string;
  avatar?: string;
}

/**
 * 获取历史记录
 */
export function getHistory(): HistoryItem[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      const list = JSON.parse(data);
      // 兼容旧格式（字符串数组）
      return list.map((item: any) => {
        if (typeof item === 'string') {
          return { roomNum: item };
        }
        return item;
      });
    }
    return getDefaultHistory();
  } catch {
    return getDefaultHistory();
  }
}

/** 默认历史记录 */
function getDefaultHistory(): HistoryItem[] {
  return [{ roomNum: '194594114480' }];
}

/**
 * 添加房间号到历史记录（去重、置顶）
 */
export function addHistory(roomNum: string, nickname?: string, avatar?: string): HistoryItem[] {
  if (!roomNum) return getHistory();
  const history = getHistory().filter(item => item.roomNum !== roomNum);
  history.unshift({ roomNum, nickname, avatar });
  if (history.length > MAX_HISTORY) {
    history.length = MAX_HISTORY;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  return history;
}

/**
 * 删除指定历史记录
 */
export function removeHistory(roomNum: string): HistoryItem[] {
  const history = getHistory().filter(item => item.roomNum !== roomNum);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  return history;
}

/**
 * 清空所有历史记录
 */
export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}
