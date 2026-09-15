import type { DyLiveInfo } from './dycast';

/**
 * 解析直播间信息
 * @param html
 * @returns
 */
export const parseLiveHtml_old = function (html: string): DyLiveInfo | null {
  try {
    const matchRes = html.match(
      /<script\snonce="\S+?"\s>self\.__pace_f\.push\(\[1,"[a-z]?:\[\\"\$\\",\\"\$L\d+\\",null,([\s\S]+?state[\s\S]+?)\]\\n"\]\)<\/script>/
    );
    const REGLIST = [
      {
        reg: /\\{1,7}"/g,
        str: '"'
      },
      {
        reg: /"\{/g,
        str: '{'
      },
      {
        reg: /\}"/g,
        str: '}'
      },
      {
        reg: /"\[(.*)]\"/g,
        str: '[$1]'
      },
      {
        reg: /([^:,{\[])(")([^:,}\]])/g,
        str: '$1"$3'
      }
    ];
    if (!matchRes) return null;
    let json: string = matchRes[1];
    for (const REG of REGLIST) {
      json = json.replace(REG.reg, REG.str);
    }
    const data = JSON.parse(json);
    return {
      roomId: data['state']['roomStore']['roomInfo']['roomId'],
      uniqueId: data['state']['userStore']['odin']['user_unique_id'],
      avatar: data['state']['roomStore']['roomInfo']['anchor']?.['avatar_thumb']?.['url_list'][0],
      cover: data['state']['roomStore']['roomInfo']['room']?.['cover']?.['url_list'][0],
      nickname: data['state']['roomStore']['roomInfo']['anchor']['nickname'],
      title: data['state']['roomStore']['roomInfo']['room']['title'],
      status: data['state']['roomStore']['roomInfo']['room']['status']
    };
  } catch (err) {
    return null;
  }
};

/**
 * 解析直播间信息
 * @param html
 * @returns
 */
export const parseLiveHtml = function (html: string): DyLiveInfo | null {
  try {
    const matchRes = html.match(
      /<script\snonce="\S+?"\s>self\.__pace_f\.push\(\[1,"[a-z]?:\[\\"\$\\",\\"\$L\d+\\",null,([\s\S]+?state[\s\S]+?)\]\\n"\]\)<\/script>/
    );
    // 抖音会不定期调整 Next.js script 的 nonce/空格/分片格式。优先使用精确
    // 分片，匹配不到时在整页的转义文本中做同字段回退，避免页面微调即断连。
    let json: string = matchRes?.[1] || html;
    const REGMAP: Record<string, RegExp | RegExp[]> = {
      roomId: [
        /"roomInfo":{[\s\S]*?"roomId":"([0-9]+?)"/,
        /"roomInfo":{[\s\S]*?"room_id":"([0-9]+?)"/
      ],
      uniqueId: /"userStore":{[\s\S]*?"odin":{[\s\S]*?"user_unique_id":"([0-9]+?)"/,
      avatar: /"roomInfo":{[\s\S]*?"anchor":{[\s\S]*?"avatar_thumb":{[\s\S]*?"url_list":\["([^"\s]+?)"/,
      cover: /"roomInfo":{[\s\S]*?"room":{[\s\S]*?"cover":{[\s\S]*?"url_list":\["([^"\s]+?)"/,
      nickname: /"roomInfo":{[\s\S]*?"anchor":{[\s\S]*?"nickname":"((?:\\.|[^"\\])*)"/,
      title: /"roomInfo":{[\s\S]*?"room":{[\s\S]*?"title":"((?:\\.|[^"\\])*)"/,
      status: /"roomInfo":{[\s\S]*?"room":{[\s\S]*?"status":([0-9]+)/,
      anchorId: [
        /"roomInfo":{[\s\S]*?"anchor":{[\s\S]*?"id_str":"?([0-9]+?)"?[,}]/,
        /"roomInfo":{[\s\S]*?"room":{[\s\S]*?"owner_user_id":"?([0-9]+?)"?[,}]/,
        /"roomInfo":{[\s\S]*?"room":{[\s\S]*?"ownerUserId":"?([0-9]+?)"?[,}]/
      ]
    };
    function extractJsonField(name: string, json: string) {
      const configured = REGMAP[name];
      const patterns = Array.isArray(configured) ? configured : configured ? [configured] : [];
      for (const pattern of patterns) {
        const exec = pattern.exec(json);
        if (exec) return exec[1];
      }
      return '';
    }
    function decodeJsonText(value: string) {
      if (!value) return value;
      try {
        return String(JSON.parse(`"${value}"`))
          .replace(/\\+u0026/g, '&')
          .replace(/\\+\//g, '/');
      } catch {
        return value.replace(/\\+u0026/g, '&').replace(/\\+\//g, '/');
      }
    }
    json = json.replace(/\\{1,7}"/g, '"');
    const roomId = extractJsonField('roomId', json);
    const uniqueId = extractJsonField('uniqueId', json);
    const avatar = extractJsonField('avatar', json);
    const cover = extractJsonField('cover', json);
    const nickname = extractJsonField('nickname', json);
    const title = extractJsonField('title', json);
    const status = extractJsonField('status', json);
    const anchorId = extractJsonField('anchorId', json);
    // 缺少任一连接主键都不能伪装成可用房间；让上层重试或显示明确错误。
    if (!roomId || !uniqueId) return null;
    return {
      roomId,
      uniqueId,
      avatar: decodeJsonText(avatar),
      cover: decodeJsonText(cover),
      nickname: decodeJsonText(nickname),
      title: decodeJsonText(title),
      status: parseInt(status || '4'),
      anchorId
    };
  } catch (err) {
    return null;
  }
};

/**
 * 将对象化成请求参数字符串
 *  - 如：item1=value1&item2=value2&...
 * @param params 请求参数对象
 * @returns
 */
export const makeUrlParams = function (params: any): string {
  return Object.keys(params)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key] ?? '')}`)
    .join('&');
};
