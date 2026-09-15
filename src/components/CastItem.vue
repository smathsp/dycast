<template>
  <div
    :class="{
      'cast-item': true,
      'gift-cast': method === CastMethod.GIFT,
      'chat-cast': method === CastMethod.CHAT,
      'like-cast': method === CastMethod.LIKE,
      'social-cast': method === CastMethod.SOCIAL,
      'member-cast': method === CastMethod.MEMBER,
      'emoji-cast': method === CastMethod.EMOJI_CHAT,
      'custom-cast': method === CastMethod.CUSTOM
    }">
    <span class="time" v-if="time">{{ formatTime(time) }}</span>
    <span class="prefix">$</span>
    <p class="content">
      <span
        v-for="club in targetFansClubs"
        :key="club.uid"
        class="fans-badge"
        :class="`fans-badge-${club.index + 1}`"
        :title="`${club.name}灯牌 ${club.level} 级`"
      >
        <strong>{{ club.level }}</strong>
      </span>
      <label class="nickname">[{{ user?.name ? user.name : 'unknown' }}]：</label>
      <template v-for="(item, index) in doms" :key="index">
        <span v-if="item.node === 'text'" class="text">{{ item.text }}</span>
        <span v-else-if="item.node === 'user'" class="atuser">{{ item.text }}</span>
        <span v-else-if="item.node === 'touser'" class="touser">{{ item.text }}</span>
        <img v-else-if="item.node === 'icon'" class="icon" :title="item.text" :src="item.url" :alt="item.text" />
        <img v-else-if="item.node === 'emoji'" class="emoji" :alt="item.text || '会员表情'" :title="item.text" :src="item.url" />
      </template>
    </p>
    <span class="gift-info" v-if="method === CastMethod.GIFT && gift">
      <span class="gift-name">{{ gift.name }}</span>
      <span class="gift-price" v-if="props.settings?.showGiftPrice && gift.price">×{{ gift.price }}抖币</span>
      <span class="gift-total" v-if="props.settings?.showGiftTotal && gift.price && gift.count && Number(gift.count) > 1">={{ giftTotal }}抖币</span>
    </span>
  </div>
</template>

<script setup lang="ts">
import { CastMethod, CastRtfContentType, type CastGift, type CastRtfContent, type CastUser } from '@/core/dycast';
import { emojis } from '@/core/emoji';
import { computed } from 'vue';
import type { Settings } from '@/utils/settingUtil';

/**
 * 格式化时间戳为 HH:mm:ss
 */
const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  const s = date.getSeconds().toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
};

interface CastContentDOM {
  node: 'text' | 'icon' | 'emoji' | 'user' | 'touser';
  url?: string;
  text?: string;
}

interface CastItemProps {
  method?: CastMethod;
  user?: CastUser;
  toUser?: CastUser;
  gift?: CastGift;
  content?: string;
  emojiText?: string;
  rtfContent?: CastRtfContent[];
  time?: number;
  settings?: Settings;
}

const props = withDefaults(defineProps<CastItemProps>(), {});

/** 计算礼物总价 */
const giftTotal = computed(() => {
  if (!props.gift?.price || !props.gift?.count) return 0;
  return props.gift.price * Number(props.gift.count);
});

/** 主页只展示当前直播间主播的灯牌。 */
const targetFansClubs = computed(() => {
  const currentAnchorId = props.user?.currentTargetAnchorId;
  return (props.user?.fansClub || [])
    .filter(club => club.level && currentAnchorId && club.anchorId === currentAnchorId)
    .map((club, index) => ({
      uid: club.anchorId || `current-${index}`,
      name: club.clubName || '当前',
      level: club.level!,
      index
    }));
});

/**
 * 创建普通内容
 * @param content
 * @returns
 */
const createTextContent = function (content?: string): CastContentDOM[] {
  if (!content) return [];
  const list: CastContentDOM[] = [];
  const cns = content.split(/(\[.*?])/);
  for (const item of cns) {
    if (!item) continue;
    if (emojis[item]) list.push({ node: 'icon', text: item, url: emojis[item] });
    else list.push({ node: 'text', text: item });
  }
  return list;
};

/**
 * 创建富文本内容
 * @param content
 * @returns
 */
const createRtfContent = function (content?: CastRtfContent[]): CastContentDOM[] {
  if (!content) return [];
  const list: CastContentDOM[] = [];
  for (let i = 0; i < content.length; i++) {
    const item = content[i];
    switch (content[i].type) {
      case CastRtfContentType.TEXT:
        list.push(...createTextContent(item.text));
        break;
      case CastRtfContentType.USER:
        list.push({
          node: 'user',
          text: item.text
        });
        break;
      case CastRtfContentType.EMOJI:
        list.push({
          node: 'icon',
          text: item.text,
          url: item.url
        });
        break;
    }
  }
  return list;
};

const doms = computed(() => {
  let list: CastContentDOM[] = [];
  switch (props.method) {
    case CastMethod.CHAT:
      if (props.rtfContent) list = createRtfContent(props.rtfContent);
      else list = createTextContent(props.content);
      break;
    case CastMethod.GIFT:
      if (props.gift) {
        if (props.toUser) {
          list = [
            {
              node: 'text',
              text: '送给'
            },
            {
              node: 'touser',
              text: props.toUser?.name
            },
            {
              node: 'text',
              text: `${props.gift.count} 个`
            },
            {
              node: 'icon',
              text: props.gift.name,
              url: props.gift.icon
            }
          ];
        } else {
          list = [
            {
              node: 'text',
              text: '送出了'
            },
            {
              node: 'icon',
              text: props.gift.name,
              url: props.gift.icon
            },
            {
              node: 'text',
              text: `× ${props.gift.count}`
            }
          ];
        }
      } else {
        list = [
          {
            node: 'text',
            text: '送出了礼物'
          }
        ];
      }
      break;
    case CastMethod.EMOJI_CHAT:
      list = [
        {
          node: 'emoji',
          text: props.emojiText || '会员表情',
          url: props.content
        }
      ];
      break;
    default:
      list = [
        {
          node: 'text',
          text: props.content
        }
      ];
  }
  return list;
});
</script>

<style lang="scss" scoped>
$prefixColor: #38b48b;
$nameColor: #9079ad;
$textColor: #6b798e;
$atUserColor: #e95464;
$toUserColor: #3271ae;

$prefixDarkColor: #38b48b;
$nameDarkColor: #83ccd2;
$textDarkColor: #f7fcfe;

$atUserDarkColor: #e83929;
$toUserDarkColor: #2ca9e1;

$giftText: #eba825;
$timeColor: #b0b0b0;
$giftNameColor: #e6a23c;
$giftPriceColor: #f56c6c;
$giftTotalColor: #e6a23c;

.cast-item {
  width: 100%;
  display: flex;
  padding-bottom: 3px;
  font-family: 'dymht';
  font-size: 1rem;
  .time {
    flex-shrink: 0;
    font-size: 0.75rem;
    color: $timeColor;
    line-height: 1.5rem;
    margin-right: 5px;
    font-family: 'mkwxy';
  }
  .prefix {
    font-family: 'mkwxy';
    color: $prefixColor;
    flex-shrink: 0;
    font-size: 1rem;
    line-height: 1.5rem;
    margin-right: 5px;
  }
  .nickname {
    margin-right: 3px;
    font-family: 'mkwxy';
    color: $nameColor;
    flex-shrink: 0;
  }
  .fans-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-right: 4px;
    color: #a95f00;
    vertical-align: 1px;
    flex-shrink: 0;
    white-space: nowrap;

    strong {
      color: #e07800;
      font: 400 1.22rem/1 'PangMenZhengDaoCuShuTi', 'Arial Black', sans-serif;
      text-shadow: 0 0 5px rgba(255, 180, 55, 0.42);
    }
  }
  .fans-badge-2 {
    color: #3569a8;

    strong { color: #287cc9; }
  }
  .text,
  .atuser,
  .touser {
    color: $textColor;
    font-family: 'LXGW WenKai', 'Microsoft YaHei UI', sans-serif;
    font-weight: 700;
    line-height: 1.5;
    // line-height: 1rem;
    word-break: break-all;
    white-space: normal;
  }
  .atuser {
    color: $atUserColor;
  }
  .touser {
    color: $toUserColor;
    margin: 0 3px;
  }
  .icon {
    width: 1.5rem;
    height: 1.5rem;
    object-fit: cover;
    padding: 0 3px;
    vertical-align: text-bottom;
  }
  .emoji {
    height: 2rem;
    object-fit: cover;
    padding: 0 3px;
    vertical-align: text-bottom;
  }
  .content {
    width: 0;
    margin: 0;
    flex-grow: 1;
    line-height: 1.5rem;
  }
  .gift-info {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    margin-left: auto;
    padding-left: 8px;
    gap: 4px;
    .gift-name {
      font-size: 0.85rem;
      color: $giftNameColor;
      font-family: 'mkwxy';
    }
    .gift-price {
      font-size: 0.75rem;
      color: $giftPriceColor;
      font-family: 'mkwxy';
    }
    .gift-total {
      font-size: 0.75rem;
      color: $giftTotalColor;
      font-family: 'mkwxy';
      font-weight: bold;
    }
  }
  &.gift-cast {
    .text {
      color: $giftText;
    }
  }
  &.emoji-cast {
    .prefix {
      line-height: 2.4rem;
    }
    .content {
      line-height: 2.4rem;
    }
    .emoji {
      vertical-align: middle;
    }
  }
}
.theme-dark {
  .cast-item {
    .prefix {
      color: $prefixDarkColor;
    }
    .nickname {
      color: $nameDarkColor;
    }
    .fans-badge {
      color: #ffd58b;

      strong { color: #ffba42; }
    }
    .fans-badge-2 {
      color: #a9d5ff;

      strong { color: #62b4ff; }
    }
    .text {
      color: $textDarkColor;
    }
    .atuser {
      color: $atUserDarkColor;
    }
    .touser {
      color: $toUserDarkColor;
    }
  }
}
</style>
