function normalizeAICurationEndpoint(rawEndpoint) {
  const endpoint = new URL(String(rawEndpoint || '').trim());
  const pathName = endpoint.pathname.replace(/\/+$/, '');

  if (!pathName || pathName === '/v1') {
    endpoint.pathname = '/v1/chat/completions';
  }

  return endpoint;
}

function isAllowedAICurationEndpoint(endpoint) {
  const isLocalHttp = endpoint.protocol === 'http:' &&
    ['127.0.0.1', 'localhost', '::1'].includes(endpoint.hostname);
  return endpoint.protocol === 'https:' || isLocalHttp;
}

function filterCurationCandidates(rawMessages) {
  const blockedPatterns = [
    /政治|政治新闻|政治热点|敏感公共事件|选举|战争|台独|港独|六四|共产党|习近平|特朗普|普京/i,
    /垃圾|傻[逼比]|蠢货?|滚(?:开|蛋)?|闭嘴|赶紧下播|骗子|传销|割韭菜|黑心|脑残|恶心|去死|妈的|操你|废物|坑人/i,
    /关注我|点(?:击)?我头像|进我主页|私信我|加微(?:信)?|加我|V信|VX|引流|领券|返现|招代理|兼职|刷单|带货合作/i,
  ];
  const valuePattern = /[?？]|请问|想问|什么|怎么|怎样|如何|为什么|为啥|多少|几[个级号款天次]?|哪[个款种里]?|是否|能否|可不可以|能不能|有没有|适合|区别|条件|要求|时候|多久|哪里|在哪|谁|值不值得|需要吗|可以吗|行吗|建议|希望|麻烦讲|可以讲|介绍一下|对比一下|演示一下|说明一下|再讲一下/i;
  const seenContents = new Set();

  return rawMessages
    .map((item) => ({
      id: String(item?.id || ''),
      nickname: String(item?.nickname || '').slice(0, 40),
      content: String(item?.content || '').trim().slice(0, 240),
    }))
    .filter((item) => {
      if (!item.id || item.content.length < 2) return false;

      const compact = item.content.replace(/\s+/g, '');
      if (!compact || blockedPatterns.some((pattern) => pattern.test(compact))) return false;
      if (/^[\p{N}\p{P}\p{S}\p{Z}]+$/u.test(compact)) return false;
      if (/^(.)\1{3,}$/u.test(compact) || /^(.{1,4})\1{2,}$/u.test(compact)) return false;
      if (!valuePattern.test(compact)) return false;

      const dedupeKey = compact.toLocaleLowerCase('zh-CN');
      if (seenContents.has(dedupeKey)) return false;
      seenContents.add(dedupeKey);
      return true;
    });
}

function parseCurationSelectedIds(rawContent, allowedIds, limit = 3) {
  let content = rawContent;
  if (Array.isArray(content)) {
    content = content
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .join('');
  }

  const cleaned = String(content || '')
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  const parsed = JSON.parse(cleaned);
  const allowed = new Set(Array.from(allowedIds || [], String));
  const selectedIds = Array.isArray(parsed?.selectedIds) ? parsed.selectedIds : [];
  const result = [];
  const seen = new Set();

  for (const rawId of selectedIds) {
    const id = String(rawId);
    if (!allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    if (result.length >= limit) break;
  }

  return result;
}

module.exports = {
  filterCurationCandidates,
  isAllowedAICurationEndpoint,
  normalizeAICurationEndpoint,
  parseCurationSelectedIds,
};
