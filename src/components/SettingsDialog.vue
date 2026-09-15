<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div class="settings-dialog-overlay" v-if="modelValue" @click.self="close">
        <div
          ref="settingsDialogRef"
          class="settings-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-dialog-title"
          aria-describedby="settings-dialog-description"
          tabindex="-1"
          @keydown="handleDialogKeydown">
          <div class="dialog-header">
            <div class="dialog-title-block">
              <span id="settings-dialog-title" class="dialog-title">控制中心</span>
              <span id="settings-dialog-description" class="dialog-subtitle">直播常用设置集中管理</span>
            </div>
            <button type="button" class="dialog-close" aria-label="关闭设置" title="关闭" @click="close">×</button>
          </div>
          <div class="settings-layout">
            <aside class="settings-sidebar">
              <div class="sidebar-label">设置分类</div>
              <button
                v-for="tab in settingsTabs"
                :key="tab.id"
                type="button"
                class="settings-tab"
                :class="{ active: activeTab === tab.id, primary: tab.primary }"
                @click="activeTab = tab.id">
                <span class="settings-tab-icon">{{ tab.icon }}</span>
                <span class="settings-tab-copy">
                  <strong>{{ tab.label }}</strong>
                  <small>{{ tab.hint }}</small>
                </span>
                <span class="settings-tab-arrow">›</span>
              </button>
              <div class="sidebar-note">常用设置按 Happy、显示、音频、AI 与运行数据分类，修改后自动保存。</div>
            </aside>

            <div class="settings-main">
              <div class="dialog-body">
            <section v-show="activeTab === 'display'" class="settings-section">
              <div class="section-heading">
                <span class="section-icon">🎁</span>
                <div><strong>礼物展示</strong><small>礼物价值与置顶规则</small></div>
              </div>
              <div class="setting-card compact-card">
                <div class="setting-row">
                  <div class="setting-text">
                    <div class="setting-label">显示礼物单价</div>
                    <div class="setting-desc">在礼物消息中展示单价</div>
                  </div>
                  <label class="switch">
                    <input type="checkbox" v-model="appSettings.showGiftPrice" />
                    <span class="slider"></span>
                  </label>
                </div>
                <div class="row-divider"></div>
                <div class="setting-row">
                  <div class="setting-text">
                    <div class="setting-label">显示总计价值</div>
                    <div class="setting-desc">展示礼物累计总价</div>
                  </div>
                  <label class="switch">
                    <input type="checkbox" v-model="appSettings.showGiftTotal" />
                    <span class="slider"></span>
                  </label>
                </div>
              </div>
              <div class="setting-grid">
                <div class="setting-group setting-card">
                  <div class="setting-label">礼物置顶阈值</div>
                  <div class="setting-desc">超过此价值时置顶</div>
                  <div class="setting-input-row">
                    <input type="number" class="setting-input" v-model.number="appSettings.giftHighlightThreshold" min="0" />
                    <span class="setting-unit">抖币</span>
                  </div>
                </div>
                <div class="setting-group setting-card">
                  <div class="setting-label">置顶显示时长</div>
                  <div class="setting-desc">到时后自动取消置顶</div>
                  <div class="setting-input-row">
                    <input type="number" class="setting-input" v-model.number="appSettings.giftHighlightDuration" min="1" max="60" />
                    <span class="setting-unit">秒</span>
                  </div>
                </div>
              </div>
            </section>

            <section v-show="activeTab === 'lottery'" class="settings-section">
              <div class="section-heading">
                <span class="section-icon">🎰</span>
                <div><strong>弹幕 Happy</strong><small>触发频率与参与资格</small></div>
              </div>
              <div
                class="setting-card lottery-auto-status-card"
                :class="`is-${lotteryAutoStatus.tone}`"
                role="status"
                aria-live="polite">
                <span class="lottery-auto-status-icon" aria-hidden="true">{{ lotteryAutoStatus.icon }}</span>
                <div class="lottery-auto-status-copy">
                  <div class="setting-label">当前自动开奖状态</div>
                  <strong>{{ lotteryAutoStatus.title }}</strong>
                  <p>{{ lotteryAutoStatus.detail }}</p>
                </div>
                <span class="lottery-auto-status-badge">{{ lotteryAutoStatus.badge }}</span>
              </div>
              <div class="setting-card">
                <div class="setting-row setting-row-top">
                  <div class="setting-text">
                    <div class="setting-label">Happy 阈值</div>
                    <div class="setting-desc">每累计多少条弹幕后触发 Happy，最少 10 条</div>
                  </div>
                  <div class="setting-input-row inline-input">
                    <input
                      type="text"
                      inputmode="numeric"
                      pattern="[0-9]*"
                      aria-label="Happy 阈值"
                      class="setting-input short-input"
                      :value="lotteryThresholdInput"
                      @input="handleLotteryThresholdInput"
                      @blur="commitLotteryThreshold"
                      @keydown.enter="($event.currentTarget as HTMLInputElement).blur()" />
                    <span class="setting-unit">条</span>
                  </div>
                </div>
                <div class="threshold-presets">
                  <button
                    v-for="value in thresholdPresets"
                    :key="value"
                    type="button"
                    :class="{ active: danmuSettings.lotteryThreshold === value }"
                    @click="setLotteryThreshold(value)">
                    {{ formatThreshold(value) }}{{ value === 100 ? ' · 推荐' : '' }}
                  </button>
                </div>
              </div>
              <div class="setting-card lottery-filter-card">
                <div class="setting-label">中奖资格筛选</div>
                <div class="setting-desc">在灯牌条件之前，先筛选有效参与弹幕</div>
                <label class="lottery-keyword-field">
                  <span>参与关键词</span>
                  <input
                    class="setting-input"
                    type="text"
                    :value="danmuSettings.lotteryKeyword"
                    maxlength="50"
                    autocomplete="off"
                    placeholder="留空表示不限，例如：我要Happy"
                    @input="setLotteryKeyword"
                    @blur="commitLotteryKeyword" />
                  <small>弹幕包含该关键词才有中奖资格，不区分英文大小写</small>
                </label>
                <div class="row-divider"></div>
                <div class="setting-row lottery-cooldown-row">
                  <div class="setting-text">
                    <div class="setting-label">20秒防刷</div>
                    <div class="setting-desc">同一用户20秒内的多条有效弹幕只计一张票</div>
                  </div>
                  <label class="switch">
                    <input
                      type="checkbox"
                      :checked="danmuSettings.lotteryUserCooldownEnabled"
                      @change="setLotteryUserCooldown" />
                    <span class="slider"></span>
                  </label>
                </div>
                <div class="lottery-filter-status">
                  <span>{{ danmuSettings.lotteryKeyword.trim() ? `关键词：${danmuSettings.lotteryKeyword.trim()}` : '关键词不限' }}</span>
                  <span>{{ danmuSettings.lotteryUserCooldownEnabled ? '20秒防刷已开启' : '20秒防刷未开启' }}</span>
                  <span>安全随机抽取</span>
                </div>
              </div>
              <div class="setting-card">
                <div class="setting-label">粉丝灯牌筛选</div>
                <div class="setting-desc">只匹配当前直播间主播的灯牌等级</div>
                <div class="badge-presets">
                  <button
                    v-for="preset in badgePresets"
                    :key="`${preset.mode}-${preset.level}`"
                    type="button"
                    :class="{ active: isBadgePresetActive(preset) }"
                    @click="applyBadgePreset(preset)">
                    <strong>{{ preset.label }}</strong>
                    <span>{{ preset.hint }}</span>
                  </button>
                </div>
                <div class="badge-manual-row" :class="{ active: appSettings.lotteryBadgeMode === 'max' && ![0, 1, 5, 10].includes(appSettings.lotteryBadgeLevel) }">
                  <div>
                    <strong>手动等级</strong>
                    <span>当前主播灯牌等级达到输入值</span>
                  </div>
                  <label>
                    <input
                      v-model="badgeLevelInput"
                      type="text"
                      inputmode="numeric"
                      pattern="[0-9]*"
                      aria-label="手动输入灯牌等级"
                      @input="handleBadgeLevelInput"
                      @focus="($event.currentTarget as HTMLInputElement).select()"
                      @blur="commitBadgeLevel"
                      @keydown.enter="($event.currentTarget as HTMLInputElement).blur()"
                    />
                    <span>级</span>
                  </label>
                </div>
              </div>
            </section>

            <section v-show="activeTab === 'display'" class="settings-section">
              <div class="section-heading">
                <span class="section-icon">💬</span>
                <div><strong>弹幕显示</strong><small>调整直播大屏的阅读体验</small></div>
              </div>
              <div v-if="canChooseWindowDisplay" class="setting-card window-display-card">
                <div class="window-display-heading">
                  <div>
                    <div class="setting-label">窗口打开位置</div>
                    <div class="setting-desc">双屏直播时可分别指定抽奖大屏和右侧弹幕栏</div>
                  </div>
                  <span>{{ windowDisplays.length }} 块屏幕</span>
                </div>
                <div class="window-display-grid">
                  <label>
                    <span>闪电抽奖 / 飘动弹幕</span>
                    <select
                      class="setting-select"
                      :disabled="windowDisplayLoading"
                      :value="windowDisplayConfig.danmuDisplayId"
                      @change="setWindowDisplay('danmuDisplayId', $event)">
                      <option value="auto">跟随主窗口（推荐）</option>
                      <option v-for="display in windowDisplays" :key="`danmu-${display.id}`" :value="display.id">
                        {{ formatWindowDisplay(display) }}
                      </option>
                    </select>
                  </label>
                  <label>
                    <span>右侧弹幕栏</span>
                    <select
                      class="setting-select"
                      :disabled="windowDisplayLoading"
                      :value="windowDisplayConfig.sidebarDisplayId"
                      @change="setWindowDisplay('sidebarDisplayId', $event)">
                      <option value="auto">跟随抽奖大屏（推荐）</option>
                      <option v-for="display in windowDisplays" :key="`sidebar-${display.id}`" :value="display.id">
                        {{ formatWindowDisplay(display) }}
                      </option>
                    </select>
                  </label>
                </div>
                <div class="window-display-tip">切换后已打开的窗口会立即移动；弹幕放大页始终跟随右侧弹幕栏。</div>
                <div class="row-divider"></div>
                <div class="setting-row">
                  <div class="setting-text">
                    <div class="setting-label">侧边栏弹幕默认置顶</div>
                    <div class="setting-desc">推荐开启；抽奖中奖时侧边栏弹幕仍显示在最上层</div>
                  </div>
                  <label class="switch">
                    <input
                      type="checkbox"
                      :disabled="windowDisplayLoading"
                      :checked="windowDisplayConfig.sidebarAlwaysOnTop"
                      @change="setSidebarAlwaysOnTop" />
                    <span class="slider"></span>
                  </label>
                </div>
              </div>
              <div class="setting-card lottery-filter-card">
                <div class="setting-label">红色弹幕昵称特例</div>
                <div class="setting-desc">适合在其他平台或场景中有重要贡献、但当前灯牌等级不高的观众</div>
                <div class="lottery-keyword-field">
                  <span>昵称关键词</span>
                  <div class="nickname-keyword-editor">
                    <div v-if="redDanmuNicknameKeywordList.length" class="nickname-keyword-list">
                      <span
                        v-for="(keyword, index) in redDanmuNicknameKeywordList"
                        :key="`${keyword}-${index}`"
                        class="nickname-keyword-chip">
                        <span :title="keyword">{{ keyword }}</span>
                        <button
                          type="button"
                          class="nickname-keyword-remove"
                          :aria-label="`删除关键词 ${keyword}`"
                          :title="`删除 ${keyword}`"
                          @mousedown.prevent
                          @click="removeRedDanmuNicknameKeyword(index)">×</button>
                      </span>
                    </div>
                    <div class="nickname-keyword-entry">
                      <input
                        v-model="redDanmuNicknameKeywordInput"
                        class="setting-input"
                        type="text"
                        maxlength="50"
                        autocomplete="off"
                        placeholder="输入一个关键词，按回车添加"
                        @keydown="handleRedDanmuNicknameKeywordKeydown"
                        @blur="addRedDanmuNicknameKeywords" />
                      <button
                        type="button"
                        class="nickname-keyword-add"
                        :disabled="!redDanmuNicknameKeywordInput.trim()"
                        @mousedown.prevent
                        @click="addRedDanmuNicknameKeywords">添加</button>
                    </div>
                  </div>
                  <small>昵称包含任一关键词即使用红色特效；不区分英文大小写，灯牌数字仍显示真实等级</small>
                </div>
              </div>
              <div class="setting-card range-card">
                <label class="range-row">
                  <span>字号基数</span>
                  <input
                    type="range"
                    :value="danmuSettings.fontSize"
                    min="12"
                    max="48"
                    step="1"
                    @input="setDanmuFontSize" />
                  <strong>{{ danmuSettings.fontSize }}px</strong>
                </label>
                <div class="tier-size-preview" aria-label="各灯牌阶段实际弹幕字号">
                  <span><small>0–4级</small><b>{{ getDanmuTierFontSize(0, danmuSettings.fontSize) }}px</b></span>
                  <span class="orange"><small>5–9级</small><b>{{ getDanmuTierFontSize(5, danmuSettings.fontSize) }}px</b></span>
                  <span class="purple"><small>10–14级</small><b>{{ getDanmuTierFontSize(10, danmuSettings.fontSize) }}px</b></span>
                  <span class="red"><small>15级以上</small><b>{{ getDanmuTierFontSize(15, danmuSettings.fontSize) }}px</b></span>
                </div>
                <div class="row-divider"></div>
                <label class="range-row">
                  <span>飘动速度</span>
                  <input
                    type="range"
                    :value="danmuSettings.speedBase"
                    min="6"
                    max="20"
                    step="1"
                    @input="setDanmuSpeed" />
                  <strong>{{ danmuSettings.speedBase }}~{{ danmuSettings.speedBase + danmuSettings.speedRange }}秒</strong>
                </label>
              </div>
            </section>

            <section
              v-show="activeTab === 'audio'"
              class="settings-section audio-settings-section"
              :class="{ 'audio-drag-active': audioDragActive }"
              @dragenter.prevent="audioDragActive = true"
              @dragover.prevent
              @dragleave="handleAudioDragLeave"
              @drop.prevent="handleAudioDrop">
              <div v-if="audioDragActive" class="audio-drop-overlay">
                <strong>释放文件即可添加</strong>
                <span>音频加入“{{ AUDIO_CATEGORY_META[activeAudioCategory].label }}”，ZIP 将作为音频包导入</span>
              </div>
              <div class="section-heading">
                <span class="section-icon">🎵</span>
                <div><strong>音频管理</strong><small>本地曲库与场景播放方式</small></div>
              </div>
              <div class="audio-control-grid">
              <div class="audio-volume-card">
                <span class="normalization-icon">🔊</span>
                <div class="volume-copy">
                  <div class="volume-title">
                    <strong>播放音量</strong>
                    <output>{{ audioLibraryState.masterVolume }}%</output>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    aria-label="播放音量百分比"
                    :value="audioLibraryState.masterVolume"
                    :style="{ '--volume-progress': `${audioLibraryState.masterVolume}%` }"
                    @input="setAudioMasterVolume(Number(($event.target as HTMLInputElement).value))" />
                </div>
              </div>
              <div class="audio-normalization-card">
                <span class="normalization-icon">⚖</span>
                <div>
                  <strong>自动均衡音量</strong>
                  <small>首次播放会分析歌曲响度，之后使用缓存结果，并限制突然过响</small>
                </div>
                <label class="switch" title="自动均衡不同歌曲的播放音量">
                  <input
                    type="checkbox"
                    :checked="audioLibraryState.volumeNormalization"
                    @change="setAudioVolumeNormalization(($event.target as HTMLInputElement).checked)" />
                  <span class="slider"></span>
                </label>
              </div>
              </div>
              <div class="audio-local-tip">
                <span>拖入音频即可加入当前阶段；音频包会分享自定义曲目和全部播放设置</span>
                <div class="audio-pack-actions">
                  <button v-if="canOpenAudioFolder" type="button" @click="openAudioFolder">打开目录</button>
                  <button v-if="canManageAudioPacks" type="button" @click="shareAudioPack">分享音频包</button>
                  <button v-if="canManageAudioPacks" type="button" @click="chooseAudioPack">导入音频包</button>
                </div>
              </div>
              <div class="audio-stage-tabs" role="tablist" aria-label="音频阶段">
                <button
                  v-for="category in audioCategories"
                  :key="category"
                  type="button"
                  role="tab"
                  :aria-selected="activeAudioCategory === category"
                  :class="{ active: activeAudioCategory === category }"
                  @click="activeAudioCategory = category">
                  <strong>{{ AUDIO_CATEGORY_META[category].label }}</strong>
                  <span>{{ getAudioTracks(category).length }} 首</span>
                </button>
              </div>
              <div class="audio-category-card audio-category-single">
                <div class="audio-category-header">
                  <div>
                    <strong>{{ AUDIO_CATEGORY_META[activeAudioCategory].label }}</strong>
                    <span>{{ AUDIO_CATEGORY_META[activeAudioCategory].hint }}</span>
                  </div>
                  <button class="audio-upload-button" type="button" @click="chooseAudioFiles(activeAudioCategory)">
                    ＋ 上传音频
                  </button>
                </div>

                <div class="audio-mode-row" role="group" :aria-label="`${AUDIO_CATEGORY_META[activeAudioCategory].label}播放模式`">
                  <button
                    v-for="mode in audioModes"
                    :key="mode"
                    type="button"
                    :class="{ active: audioLibraryState.configs[activeAudioCategory].mode === mode }"
                    @click="setAudioPlaybackMode(activeAudioCategory, mode)">
                    {{ AUDIO_MODE_META[mode] }}{{ mode === 'single' ? ' · 推荐' : '' }}
                  </button>
                </div>

                <div class="audio-track-list">
                  <div
                    v-for="track in getAudioTracks(activeAudioCategory)"
                    :key="track.id"
                    class="audio-track-item"
                    :class="{
                      selected: audioLibraryState.configs[activeAudioCategory].selectedTrackId === track.id,
                      disabled: !isAudioTrackEnabled(activeAudioCategory, track.id)
                    }">
                    <label class="audio-enable" :title="isAudioTrackEnabled(activeAudioCategory, track.id) ? '已加入播放列表' : '未加入播放列表'">
                      <input
                        type="checkbox"
                        :checked="isAudioTrackEnabled(activeAudioCategory, track.id)"
                        @change="toggleAudioTrack(activeAudioCategory, track.id, $event)" />
                      <span></span>
                    </label>
                    <button class="audio-track-main" type="button" @click="selectAudioTrack(activeAudioCategory, track.id)">
                      <span class="audio-radio"></span>
                      <span class="audio-track-text">
                        <strong :title="track.name">{{ track.name }}</strong>
                        <small>{{ track.builtin ? '内置音频' : `本地音频 · ${formatAudioSize(track.size)}` }}</small>
                      </span>
                    </button>
                    <button
                      class="audio-preview-button"
                      type="button"
                      :title="previewingTrackId === track.id ? '停止试听' : '试听'"
                      @click="toggleAudioPreview(track)">
                      {{ previewingTrackId === track.id ? '■' : '▶' }}
                    </button>
                    <button
                      v-if="!track.builtin"
                      class="audio-delete-button"
                      type="button"
                      title="删除本地音频"
                      @click="removeAudioTrack(track)">
                      ×
                    </button>
                  </div>
                </div>
              </div>
              <div v-if="audioTip" class="audio-tip" :class="audioTipType">{{ audioTip }}</div>
              <input
                ref="audioFileInput"
                class="audio-file-input"
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.webm"
                multiple
                @change="handleBrowserAudioFiles" />
            </section>

            <section v-show="activeTab === 'ai'" class="settings-section ai-settings-section">
              <div class="section-heading">
                <span class="section-icon">✦</span>
                <div><strong>AI 精选弹幕</strong><small>为观众互动页筛选值得主播回应的内容</small></div>
              </div>
              <div class="setting-card">
                <div class="setting-row">
                  <div class="setting-text">
                    <div class="setting-label">启用自动精选</div>
                    <div class="setting-desc">仅发送最近一批弹幕文本，不发送头像、灯牌或用户 ID</div>
                  </div>
                  <label class="switch">
                    <input type="checkbox" v-model="appSettings.aiCurationEnabled" />
                    <span class="slider"></span>
                  </label>
                </div>
              </div>
              <div class="setting-card ai-form-card">
                <label class="ai-field ai-field-wide">
                  <span>API 地址 / Base URL</span>
                  <input
                    v-model.trim="appSettings.aiCurationEndpoint"
                    class="setting-input"
                    type="url"
                    autocomplete="off"
                    placeholder="例如 https://api.deepseek.com"
                    @change="loadAICredentialState" />
                </label>
                <div class="ai-form-grid">
                  <div class="ai-field">
                    <span>API Key</span>
                    <div class="ai-key-row">
                      <input
                        v-model="aiApiKeyInput"
                        class="setting-input"
                        type="password"
                        autocomplete="new-password"
                        :placeholder="aiCredentialStored ? '已安全保存，输入新 Key 可替换' : '输入 API Key'"
                        @keyup.enter="saveAIApiKey" />
                      <button
                        class="ai-key-button"
                        type="button"
                        :disabled="aiCredentialBusy || !aiApiKeyInput.trim()"
                        @click="saveAIApiKey">
                        {{ aiCredentialBusy ? '处理中' : '安全保存' }}
                      </button>
                      <button
                        v-if="aiCredentialStored"
                        class="ai-key-button danger"
                        type="button"
                        :disabled="aiCredentialBusy"
                        @click="clearAIApiKey">
                        清除
                      </button>
                    </div>
                    <small class="ai-key-status" :class="aiCredentialFeedbackType">
                      {{ aiCredentialFeedback || (aiCredentialStored ? '已由系统加密存储' : canSecureAICredential ? '尚未配置' : '浏览器模式：仅当前会话有效') }}
                    </small>
                  </div>
                  <label class="ai-field">
                    <span>模型名称</span>
                    <input
                      v-model.trim="appSettings.aiCurationModel"
                      class="setting-input"
                      type="text"
                      autocomplete="off"
                      placeholder="gpt-4o-mini" />
                  </label>
                </div>
                <div class="ai-number-grid">
                  <label class="ai-field ai-interval-field">
                    <span>AI 筛选间隔</span>
                    <div class="setting-input-row">
                      <input
                        v-model.number="appSettings.aiCurationInterval"
                        class="setting-input short-input"
                        type="number"
                        min="20"
                        max="600"
                        step="10" />
                      <span class="setting-unit">秒</span>
                    </div>
                  </label>
                  <label class="ai-field ai-interval-field">
                    <span>AI 悬浮卡片停留时间</span>
                    <div class="setting-input-row">
                      <input
                        v-model.number="appSettings.commentHighlightDuration"
                        class="setting-input short-input"
                        type="number"
                        min="3"
                        max="120"
                        step="1" />
                      <span class="setting-unit">秒</span>
                    </div>
                  </label>
                </div>
                <p class="ai-privacy-tip">启用后会把候选昵称和弹幕内容发送到你填写的 API。系统提示词会自动排除政治、攻击谩骂、带节奏、广告和无意义内容。</p>
              </div>
            </section>

            <section v-show="activeTab === 'data'" class="settings-section data-settings-section">
              <div class="section-heading">
                <span class="section-icon">⚠</span>
                <div><strong>数据管理</strong><small>清理弹幕 Happy 运行数据</small></div>
              </div>
              <div class="setting-card reset-card">
                <div class="setting-text">
                  <div class="setting-label">重置本轮充能与奖池</div>
                  <div class="setting-desc">停止当前充能，清空候选奖池并取消未揭晓结果；已揭晓的 Happy 记录会保留</div>
                </div>
                <button class="danger-button" type="button" @click="handleResetDanmu">重置</button>
              </div>
              <div v-if="persistentSettingsInfo" class="setting-card storage-card">
                <div class="setting-text">
                  <div class="setting-label">本机公共设置</div>
                  <div class="setting-desc">
                    新版本会继续读取此目录；API Key 仍由 Windows 加密保存
                  </div>
                  <code :title="persistentSettingsInfo.filePath">{{ persistentSettingsInfo.filePath }}</code>
                  <small v-if="persistentSettingsFeedback">{{ persistentSettingsFeedback }}</small>
                </div>
                <button class="secondary-button" type="button" @click="openPersistentSettingsFolder">打开目录</button>
              </div>
            </section>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useSettings, type LotteryBadgeMode } from '@/utils/settingUtil';
import {
  resetDanmuState,
  settings as danmuSettings,
  updateSettings as updateDanmuSettings
} from '@/danmu/store';
import { normalizeLotteryThreshold } from '@/danmu/lotteryPolicy';
import {
  AUDIO_CATEGORY_META,
  AUDIO_MODE_META,
  audioLibraryState,
  deleteAudioTrack,
  exportAudioPack,
  getCategoryTracks,
  importAudioPack,
  importDroppedAudioTracks,
  importLocalAudioTracks,
  setAudioPlaybackMode,
  setAudioMasterVolume,
  setAudioVolumeNormalization,
  setAudioTrackEnabled,
  setSelectedAudioTrack,
  uploadAudioTracks,
  usesLocalAudioFiles,
  type AudioCategory,
  type AudioPlaybackMode,
  type AudioTrack
} from '@/danmu/audioLibrary';
import { createBalancedAudio } from '@/danmu/audio';
import { getDanmuTierFontSize } from '@/danmu/visual';

const modelValue = defineModel<boolean>({ default: false });
const settingsDialogRef = ref<HTMLElement | null>(null);
const appSettings = useSettings();
const lotteryAutoStatus = computed(() => {
  const remainingWinnerCount = Math.max(0, Math.round(Number(appSettings.value.remainingWinnerCount) || 0));
  const badgeLevel = Math.max(0, Math.round(Number(appSettings.value.lotteryBadgeLevel) || 0));
  const keyword = danmuSettings.lotteryKeyword.trim();

  if (remainingWinnerCount <= 0) {
    return {
      tone: 'blocked',
      icon: '!',
      badge: '不会自动开奖',
      title: '未开奖原因：剩余中奖名额为 0',
      detail: '请先在主界面的“剩余中奖名额”输入框中填写大于 0 的数字。能量即使达到满值，也不会消耗不存在的名额。'
    } as const;
  }

  const requirements: string[] = [];
  if (keyword) requirements.push(`弹幕包含“${keyword}”`);
  if (badgeLevel > 0) requirements.push(`当前主播灯牌 ≥ ${badgeLevel} 级`);
  if (requirements.length > 0) {
    return {
      tone: 'limited',
      icon: 'i',
      badge: '有资格限制',
      title: '自动开奖已开启，需等待合格弹幕',
      detail: `剩余 ${remainingWinnerCount} 个中奖名额。能量满后，只有满足“${requirements.join(' 且 ')}”的观众会进入候选池；无人满足时不会开奖。`
    } as const;
  }

  return {
    tone: 'ready',
    icon: '✓',
    badge: '配置正常',
    title: '达到 Happy 阈值后将自动开奖',
    detail: `剩余 ${remainingWinnerCount} 个中奖名额，当前不限关键词和灯牌等级。`
  } as const;
});
type SettingsTabId = 'lottery' | 'audio' | 'ai' | 'data' | 'display';
const settingsTabs = [
  { id: 'lottery', icon: '🎰', label: 'Happy 设置', hint: '阈值与资格', description: '设置 Happy 频率和粉丝灯牌筛选规则', primary: true },
  { id: 'display', icon: '◫', label: '显示与礼物', hint: '窗口与显示效果', description: '调整弹幕阅读体验和礼物展示规则', primary: true },
  { id: 'audio', icon: '🎵', label: '音频管理', hint: '曲库与模式', description: '管理本地音频和各场景播放模式', primary: true },
  { id: 'ai', icon: '✦', label: 'AI 精选', hint: '观众互动弹幕', description: '配置精选弹幕使用的兼容 API', primary: true },
  { id: 'data', icon: '↻', label: '运行重置', hint: '清零当前进度', description: '重置本轮充能与候选奖池', primary: true }
] as const;
const activeTab = ref<SettingsTabId>('lottery');
const lotteryThresholdInput = ref(String(danmuSettings.lotteryThreshold));
const badgeLevelInput = ref(String(appSettings.value.lotteryBadgeLevel));
const thresholdPresets = [10, 100, 200, 500, 1000, 10000] as const;
const badgePresets = [
  { mode: 'max', level: 0, label: '不限（推荐）', hint: '全部参与' },
  { mode: 'max', level: 1, label: '等级 ≥ 1', hint: '当前主播灯牌' },
  { mode: 'max', level: 5, label: '等级 ≥ 5', hint: '当前主播灯牌' },
  { mode: 'max', level: 10, label: '等级 ≥ 10', hint: '当前主播灯牌' }
] as const;
const audioCategories: AudioCategory[] = ['charging', 'lottery', 'winner'];
const audioModes: AudioPlaybackMode[] = ['single', 'list', 'random'];
const activeAudioCategory = ref<AudioCategory>('charging');
const audioDragActive = ref(false);
const redDanmuNicknameKeywordInput = ref('');
const redDanmuNicknameKeywordList = computed(() => parseRedDanmuNicknameKeywords(
  danmuSettings.redDanmuNicknameKeywords
));

const audioFileInput = ref<HTMLInputElement | null>(null);
const pendingAudioCategory = ref<AudioCategory>('charging');
const audioTip = ref('');
const audioTipType = ref<'success' | 'error'>('success');
const previewingTrackId = ref('');
const canChooseWindowDisplay = Boolean(window.electronAPI?.getWindowDisplayState);
const windowDisplays = ref<WindowDisplayInfo[]>([]);
const windowDisplayConfig = ref<WindowDisplayConfig>({
  danmuDisplayId: 'auto',
  sidebarDisplayId: 'auto',
  sidebarAlwaysOnTop: true
});
const windowDisplayLoading = ref(false);
const canOpenAudioFolder = Boolean(window.electronAPI?.openAudioFolder);
const canManageAudioPacks = Boolean(window.electronAPI?.exportAudioPack && window.electronAPI?.importAudioPack);
const canSecureAICredential = Boolean(window.electronAPI?.setAIApiKey);
const aiApiKeyInput = ref('');
const aiCredentialStored = ref(Boolean(appSettings.value.aiCurationApiKey));
const aiCredentialBusy = ref(false);
const aiCredentialFeedback = ref('');
const aiCredentialFeedbackType = ref<'neutral' | 'success' | 'error'>('neutral');
const persistentSettingsInfo = ref<{
  directory: string;
  filePath: string;
  isPublicDirectory: boolean;
} | null>(null);
const persistentSettingsFeedback = ref('');
let previewAudio: HTMLAudioElement | null = null;
let previewDisconnect: (() => void) | null = null;
let stopWindowDisplayListener: (() => void) | null = null;
let previouslyFocusedElement: HTMLElement | null = null;

const close = () => {
  stopAudioPreview();
  modelValue.value = false;
};

function handleDialogKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    close();
    return;
  }
  if (event.key !== 'Tab' || !settingsDialogRef.value) return;
  const focusable = Array.from(settingsDialogRef.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
  )).filter(element => element.offsetParent !== null);
  if (!focusable.length) {
    event.preventDefault();
    settingsDialogRef.value.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function getAudioTracks(category: AudioCategory): AudioTrack[] {
  return getCategoryTracks(category);
}

function isAudioTrackEnabled(category: AudioCategory, trackId: string): boolean {
  return !audioLibraryState.configs[category].disabledTrackIds.includes(trackId);
}

function selectAudioTrack(category: AudioCategory, trackId: string): void {
  setSelectedAudioTrack(category, trackId);
}

function toggleAudioTrack(category: AudioCategory, trackId: string, event: Event): void {
  setAudioTrackEnabled(category, trackId, (event.target as HTMLInputElement).checked);
}

function handleAudioDragLeave(event: DragEvent): void {
  if (event.currentTarget === event.target) audioDragActive.value = false;
}

async function handleAudioDrop(event: DragEvent): Promise<void> {
  audioDragActive.value = false;
  const files = Array.from(event.dataTransfer?.files || []);
  if (!files.length) return;
  audioTip.value = '';
  try {
    const zipFile = files.length === 1 && /\.zip$/i.test(files[0].name) ? files[0] : null;
    if (zipFile) {
      const filePath = window.electronAPI?.getPathForFile?.(zipFile);
      const result = await importAudioPack(filePath);
      if (!result.canceled) {
        audioTip.value = `已导入音频包，共 ${result.count} 首音频`;
        audioTipType.value = 'success';
      }
      return;
    }
    const imported = await importDroppedAudioTracks(activeAudioCategory.value, files);
    audioTip.value = `已添加 ${imported.length} 首音频到“${AUDIO_CATEGORY_META[activeAudioCategory.value].label}”`;
    audioTipType.value = 'success';
  } catch (error) {
    audioTip.value = `拖拽导入失败：${(error as Error).message}`;
    audioTipType.value = 'error';
  }
}

async function shareAudioPack(): Promise<void> {
  audioTip.value = '';
  try {
    const result = await exportAudioPack();
    if (!result.canceled) {
      audioTip.value = `音频包已导出，共 ${result.count || 0} 首本地音频`;
      audioTipType.value = 'success';
    }
  } catch (error) {
    audioTip.value = `分享失败：${(error as Error).message}`;
    audioTipType.value = 'error';
  }
}

async function chooseAudioPack(): Promise<void> {
  audioTip.value = '';
  try {
    const result = await importAudioPack();
    if (!result.canceled) {
      audioTip.value = `音频包导入成功，共 ${result.count} 首音频`;
      audioTipType.value = 'success';
    }
  } catch (error) {
    audioTip.value = `导入失败：${(error as Error).message}`;
    audioTipType.value = 'error';
  }
}

async function chooseAudioFiles(category: AudioCategory): Promise<void> {
  audioTip.value = '';
  if (usesLocalAudioFiles) {
    try {
      const imported = await importLocalAudioTracks(category);
      if (imported.length) {
        audioTip.value = `已保存 ${imported.length} 首音频到本地`;
        audioTipType.value = 'success';
      }
    } catch (error) {
      audioTip.value = `上传失败：${(error as Error).message}`;
      audioTipType.value = 'error';
    }
    return;
  }
  pendingAudioCategory.value = category;
  audioFileInput.value?.click();
}

async function handleBrowserAudioFiles(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = '';
  if (!files.length) return;
  try {
    const errors = await uploadAudioTracks(pendingAudioCategory.value, files);
    if (errors.length) {
      audioTip.value = errors.join('；');
      audioTipType.value = 'error';
    } else {
      audioTip.value = `已保存 ${files.length} 首音频到本地`;
      audioTipType.value = 'success';
    }
  } catch (error) {
    audioTip.value = `上传失败：${(error as Error).message}`;
    audioTipType.value = 'error';
  }
}

function stopAudioPreview(): void {
  if (previewAudio) {
    previewAudio.pause();
    previewDisconnect?.();
    previewDisconnect = null;
    previewAudio.removeAttribute('src');
    previewAudio.load();
    previewAudio = null;
  }
  previewingTrackId.value = '';
}

function toggleAudioPreview(track: AudioTrack): void {
  if (previewingTrackId.value === track.id) {
    stopAudioPreview();
    return;
  }
  stopAudioPreview();
  audioTip.value = '';
  const balancedAudio = createBalancedAudio(track);
  const audio = balancedAudio.audio;
  previewAudio = audio;
  previewDisconnect = balancedAudio.disconnect;
  previewingTrackId.value = track.id;
  audio.addEventListener('ended', stopAudioPreview, { once: true });
  audio.addEventListener('error', () => {
    audioTip.value = `无法播放：${track.name}`;
    audioTipType.value = 'error';
    stopAudioPreview();
  }, { once: true });
  void audio.play().catch(error => {
    audioTip.value = `试听失败：${error.message}`;
    audioTipType.value = 'error';
    stopAudioPreview();
  });
}

async function removeAudioTrack(track: AudioTrack): Promise<void> {
  if (!confirm(`确认删除本地音频“${track.name}”吗？`)) return;
  stopAudioPreview();
  try {
    await deleteAudioTrack(track.id);
    audioTip.value = `已删除：${track.name}`;
    audioTipType.value = 'success';
  } catch (error) {
    audioTip.value = `删除失败：${(error as Error).message}`;
    audioTipType.value = 'error';
  }
}

function formatAudioSize(size: number): string {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(size / 1024))}KB`;
}

async function openAudioFolder(): Promise<void> {
  const error = await window.electronAPI?.openAudioFolder();
  if (error) {
    audioTip.value = `打开目录失败：${error}`;
    audioTipType.value = 'error';
  }
}

function applyWindowDisplayState(state?: WindowDisplayState): void {
  if (!state) return;
  windowDisplays.value = state.displays;
  windowDisplayConfig.value = { ...state.config };
}

async function loadWindowDisplayState(): Promise<void> {
  if (!canChooseWindowDisplay) return;
  windowDisplayLoading.value = true;
  try {
    applyWindowDisplayState(await window.electronAPI?.getWindowDisplayState());
  } catch (error) {
    console.warn('[Settings] 读取屏幕信息失败:', error);
  } finally {
    windowDisplayLoading.value = false;
  }
}

async function setWindowDisplay(key: 'danmuDisplayId' | 'sidebarDisplayId', event: Event): Promise<void> {
  const value = (event.target as HTMLSelectElement).value;
  windowDisplayConfig.value = { ...windowDisplayConfig.value, [key]: value };
  windowDisplayLoading.value = true;
  try {
    applyWindowDisplayState(await window.electronAPI?.setWindowDisplayConfig({ [key]: value }));
  } catch (error) {
    console.warn('[Settings] 切换窗口屏幕失败:', error);
    await loadWindowDisplayState();
  } finally {
    windowDisplayLoading.value = false;
  }
}

async function setSidebarAlwaysOnTop(event: Event): Promise<void> {
  const value = (event.target as HTMLInputElement).checked;
  windowDisplayConfig.value = { ...windowDisplayConfig.value, sidebarAlwaysOnTop: value };
  windowDisplayLoading.value = true;
  try {
    applyWindowDisplayState(await window.electronAPI?.setWindowDisplayConfig({ sidebarAlwaysOnTop: value }));
  } catch (error) {
    console.warn('[Settings] 切换侧边栏置顶失败:', error);
    await loadWindowDisplayState();
  } finally {
    windowDisplayLoading.value = false;
  }
}

function formatWindowDisplay(display: WindowDisplayInfo): string {
  const size = `${display.bounds.width}×${display.bounds.height}`;
  const scale = display.scaleFactor === 1 ? '' : ` · ${Math.round(display.scaleFactor * 100)}%`;
  return `${display.label}${display.primary ? '（主屏）' : ''} · ${size}${scale}`;
}

async function loadAICredentialState(): Promise<void> {
  if (!window.electronAPI?.getAICredentialState) {
    aiCredentialStored.value = Boolean(appSettings.value.aiCurationApiKey);
    return;
  }

  aiCredentialBusy.value = true;
  try {
    const state = await window.electronAPI.getAICredentialState(appSettings.value.aiCurationEndpoint);
    aiCredentialStored.value = state.stored;
    if (!state.encryptionAvailable) {
      aiCredentialFeedback.value = '当前系统暂不支持安全存储';
      aiCredentialFeedbackType.value = 'error';
    } else if (state.stored && !state.endpointMatches) {
      aiCredentialFeedback.value = 'API 地址已变化，请为当前地址重新保存 Key';
      aiCredentialFeedbackType.value = 'error';
    } else {
      aiCredentialFeedback.value = '';
      aiCredentialFeedbackType.value = 'neutral';
    }
  } catch (error) {
    aiCredentialFeedback.value = `读取状态失败：${(error as Error).message}`;
    aiCredentialFeedbackType.value = 'error';
  } finally {
    aiCredentialBusy.value = false;
  }
}

async function saveAIApiKey(): Promise<void> {
  const apiKey = aiApiKeyInput.value.trim().slice(0, 4096);
  if (!apiKey || aiCredentialBusy.value) return;
  aiCredentialBusy.value = true;
  aiCredentialFeedback.value = '';

  try {
    if (window.electronAPI?.setAIApiKey) {
      const state = await window.electronAPI.setAIApiKey(apiKey, appSettings.value.aiCurationEndpoint);
      aiCredentialStored.value = state.stored;
      appSettings.value.aiCurationApiKey = '';
      aiCredentialFeedback.value = 'API Key 已使用系统能力加密保存';
    } else {
      appSettings.value.aiCurationApiKey = apiKey;
      aiCredentialStored.value = true;
      aiCredentialFeedback.value = 'API Key 仅保留在当前浏览器会话';
    }
    aiCredentialFeedbackType.value = 'success';
    aiApiKeyInput.value = '';
  } catch (error) {
    aiCredentialFeedback.value = `保存失败：${(error as Error).message}`;
    aiCredentialFeedbackType.value = 'error';
  } finally {
    aiCredentialBusy.value = false;
  }
}

async function clearAIApiKey(): Promise<void> {
  if (aiCredentialBusy.value) return;
  aiCredentialBusy.value = true;
  aiCredentialFeedback.value = '';

  try {
    if (window.electronAPI?.setAIApiKey) {
      await window.electronAPI.setAIApiKey('', appSettings.value.aiCurationEndpoint);
    }
    appSettings.value.aiCurationApiKey = '';
    aiApiKeyInput.value = '';
    aiCredentialStored.value = false;
    aiCredentialFeedback.value = 'API Key 已清除';
    aiCredentialFeedbackType.value = 'success';
  } catch (error) {
    aiCredentialFeedback.value = `清除失败：${(error as Error).message}`;
    aiCredentialFeedbackType.value = 'error';
  } finally {
    aiCredentialBusy.value = false;
  }
}

onMounted(() => {
  stopWindowDisplayListener = window.electronAPI?.onWindowDisplaysChanged?.(applyWindowDisplayState) || null;
});

onBeforeUnmount(() => {
  stopAudioPreview();
  stopWindowDisplayListener?.();
  if (previouslyFocusedElement?.isConnected) previouslyFocusedElement.focus();
});

watch(modelValue, visible => {
  if (visible) {
    previouslyFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void loadWindowDisplayState();
    void loadAICredentialState();
    void loadPersistentSettingsInfo();
    void nextTick().then(() => settingsDialogRef.value?.focus());
  } else {
    stopAudioPreview();
    if (previouslyFocusedElement?.isConnected) previouslyFocusedElement.focus();
    previouslyFocusedElement = null;
  }
}, { immediate: true });

async function loadPersistentSettingsInfo(): Promise<void> {
  if (!window.electronAPI?.getPersistentSettingsInfo) return;
  try {
    persistentSettingsInfo.value = await window.electronAPI.getPersistentSettingsInfo();
    persistentSettingsFeedback.value = persistentSettingsInfo.value.isPublicDirectory
      ? '已启用公共目录持久化'
      : '公共目录不可写，已使用当前用户的持久目录';
  } catch (error) {
    persistentSettingsFeedback.value = `读取保存位置失败：${(error as Error).message}`;
  }
}

async function openPersistentSettingsFolder(): Promise<void> {
  if (!window.electronAPI?.openPersistentSettingsFolder) return;
  const error = await window.electronAPI.openPersistentSettingsFolder();
  if (error) persistentSettingsFeedback.value = `打开目录失败：${error}`;
}

function setLotteryThreshold(value: number) {
  const normalized = normalizeLotteryThreshold(value);
  updateDanmuSettings({ lotteryThreshold: normalized });
  lotteryThresholdInput.value = String(normalized);
}

function handleLotteryThresholdInput(event: Event) {
  lotteryThresholdInput.value = (event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 9);
}

function commitLotteryThreshold() {
  if (!lotteryThresholdInput.value) {
    lotteryThresholdInput.value = String(danmuSettings.lotteryThreshold);
    return;
  }
  setLotteryThreshold(Number(lotteryThresholdInput.value));
}

function setLotteryKeyword(event: Event): void {
  updateDanmuSettings({ lotteryKeyword: (event.target as HTMLInputElement).value.slice(0, 50) });
}

function commitLotteryKeyword(event: Event): void {
  const input = event.target as HTMLInputElement;
  const keyword = input.value.trim().slice(0, 50);
  updateDanmuSettings({ lotteryKeyword: keyword });
  input.value = keyword;
}

function setLotteryUserCooldown(event: Event): void {
  updateDanmuSettings({ lotteryUserCooldownEnabled: (event.target as HTMLInputElement).checked });
}

watch(() => danmuSettings.lotteryThreshold, value => {
  lotteryThresholdInput.value = String(value);
});

type BadgePreset = typeof badgePresets[number];

function isBadgePresetActive(preset: BadgePreset): boolean {
  return appSettings.value.lotteryBadgeMode === preset.mode &&
    appSettings.value.lotteryBadgeLevel === preset.level;
}

function applyBadgePreset(preset: BadgePreset): void {
  appSettings.value.lotteryBadgeMode = preset.mode as LotteryBadgeMode;
  appSettings.value.lotteryBadgeLevel = preset.level;
  badgeLevelInput.value = String(preset.level);
}

function handleBadgeLevelInput(): void {
  badgeLevelInput.value = badgeLevelInput.value.replace(/\D/g, '').slice(0, 2);
  if (!badgeLevelInput.value) return;
  const level = Number(badgeLevelInput.value);
  if (level >= 0 && level <= 30) {
    appSettings.value.lotteryBadgeMode = 'max';
    appSettings.value.lotteryBadgeLevel = level;
  }
}

function commitBadgeLevel(): void {
  const level = Math.min(30, Math.max(0, Math.round(Number(badgeLevelInput.value) || 0)));
  appSettings.value.lotteryBadgeMode = 'max';
  appSettings.value.lotteryBadgeLevel = level;
  badgeLevelInput.value = String(level);
}

watch(() => appSettings.value.lotteryBadgeLevel, value => {
  if (appSettings.value.lotteryBadgeMode === 'max') badgeLevelInput.value = String(value);
});

function formatThreshold(value: number): string {
  if (value >= 10000) return `${value / 10000}万`;
  if (value >= 1000) return `${value / 1000}千`;
  return String(value);
}

function setDanmuFontSize(event: Event) {
  updateDanmuSettings({ fontSize: Number((event.target as HTMLInputElement).value) });
}

function setDanmuSpeed(event: Event) {
  updateDanmuSettings({ speedBase: Number((event.target as HTMLInputElement).value) });
}

function parseRedDanmuNicknameKeywords(value: string): string[] {
  return value
    .split(/[,，;；\n]+/)
    .map(keyword => keyword.trim())
    .filter(Boolean)
    .filter((keyword, index, values) => values.findIndex(value => (
      value.localeCompare(keyword, undefined, { sensitivity: 'accent' }) === 0
    )) === index);
}

function saveRedDanmuNicknameKeywords(keywords: string[]): void {
  updateDanmuSettings({ redDanmuNicknameKeywords: keywords.join('，').slice(0, 500) });
}

function addRedDanmuNicknameKeywords(): void {
  const additions = parseRedDanmuNicknameKeywords(redDanmuNicknameKeywordInput.value)
    .map(keyword => keyword.slice(0, 50));
  if (!additions.length) return;

  const keywords = [...redDanmuNicknameKeywordList.value];
  const normalized = new Set(keywords.map(keyword => keyword.toLocaleLowerCase()));
  for (const keyword of additions) {
    const key = keyword.toLocaleLowerCase();
    if (normalized.has(key)) continue;
    if ([...keywords, keyword].join('，').length > 500) break;
    keywords.push(keyword);
    normalized.add(key);
  }
  saveRedDanmuNicknameKeywords(keywords);
  redDanmuNicknameKeywordInput.value = '';
}

function removeRedDanmuNicknameKeyword(index: number): void {
  saveRedDanmuNicknameKeywords(
    redDanmuNicknameKeywordList.value.filter((_, keywordIndex) => keywordIndex !== index)
  );
}

function handleRedDanmuNicknameKeywordKeydown(event: KeyboardEvent): void {
  if (event.isComposing || !['Enter', ',', '，', ';', '；'].includes(event.key)) return;
  event.preventDefault();
  addRedDanmuNicknameKeywords();
}

function handleResetDanmu() {
  if (confirm('确认重置本轮充能与奖池？本场弹幕总数和 Happy 记录会保留。')) {
    resetDanmuState();
  }
}
</script>

<style lang="scss" scoped>
$theme: #68be8d;
$text: #576470;
$desc: #9aa7b1;
$bd: #b2bfc3;
$bg: #f7f6f5;
$activeColor: #68be8d;
$inactiveColor: #ccc;

.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.25s ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}

.settings-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 20px;
  background: rgba(38, 48, 54, 0.48);
  backdrop-filter: blur(7px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.settings-dialog {
  width: min(1120px, calc(100vw - 40px));
  height: min(780px, calc(100vh - 40px));
  display: flex;
  flex-direction: column;
  background: $bg;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 22px;
  box-shadow: 0 26px 90px rgba(30, 42, 48, 0.3);
  overflow: hidden;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 68px;
  padding: 0 24px;
  border-bottom: 1px solid rgba($bd, 0.58);
  background: rgba(255, 255, 255, 0.62);

  .dialog-title-block {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .dialog-title {
    font-size: 17px;
    font-weight: bold;
    color: $text;
    font-family: 'mkwxy';
  }

  .dialog-subtitle {
    color: $desc;
    font: 10px 'mkwxy';
  }

  .dialog-close {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    color: $desc;
    padding: 0;
    border: 0;
    cursor: pointer;
    border-radius: 50%;
    transition: all 0.2s;

    &:hover {
      color: #e95464;
      background: rgba(233, 84, 100, 0.1);
    }
  }
}

.settings-layout {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: 224px minmax(0, 1fr);
}

.settings-sidebar {
  min-height: 0;
  padding: 18px 14px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  border-right: 1px solid rgba($bd, 0.54);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(241, 245, 242, 0.8));
}

.sidebar-label {
  padding: 0 10px 7px;
  color: $desc;
  font: 9px 'mkwxy';
  letter-spacing: 0.14em;
}

.settings-tab {
  width: 100%;
  min-height: 55px;
  padding: 8px 9px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  outline: none;
  text-align: left;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  transition: 0.18s ease;

  &:hover { background: rgba(255, 255, 255, 0.76); }
  &.primary .settings-tab-icon { color: #fff; background: $theme; }
  &.active {
    border-color: rgba($theme, 0.28);
    background: #fff;
    box-shadow: 0 8px 22px rgba(70, 99, 82, 0.08);
  }
  &.active .settings-tab-arrow { opacity: 1; transform: translateX(0); }
}

.settings-tab-icon {
  width: 34px;
  height: 34px;
  flex: none;
  display: grid;
  place-items: center;
  color: $text;
  border-radius: 10px;
  background: rgba($bd, 0.16);
  font: 16px/1 sans-serif;
}

.settings-tab-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;

  strong { color: $text; font: 600 12px 'mkwxy'; }
  small { color: $desc; font: 9px 'mkwxy'; }
}

.settings-tab-arrow {
  color: $theme;
  font: 22px/1 sans-serif;
  opacity: 0;
  transform: translateX(-4px);
  transition: 0.18s ease;
}

.sidebar-note {
  margin-top: auto;
  padding: 10px;
  color: $desc;
  border-radius: 10px;
  background: rgba($theme, 0.06);
  font: 9px/1.65 'mkwxy';
}

.settings-main {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.settings-pane-header {
  min-height: 72px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid rgba($bd, 0.42);

  .pane-icon {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    color: #fff;
    border-radius: 11px;
    background: linear-gradient(135deg, $theme, #83ceb0);
    box-shadow: 0 8px 18px rgba($theme, 0.22);
    font: 17px/1 sans-serif;
  }
  div { display: flex; flex-direction: column; gap: 4px; }
  strong { color: $text; font: 700 15px 'mkwxy'; }
  small { color: $desc; font: 10px 'mkwxy'; }
}

.dialog-body {
  padding: 20px 24px 24px;
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 18px;
  min-height: 0;
  overflow-y: auto;

  &::-webkit-scrollbar { width: 7px; }
  &::-webkit-scrollbar-thumb { border-radius: 10px; background: rgba($bd, 0.64); }
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-heading {
  display: flex;
  align-items: center;
  gap: 9px;

  .section-icon {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    border-radius: 9px;
    background: rgba(104, 190, 141, 0.11);
    font-size: 15px;
  }

  div {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  strong {
    color: $text;
    font-size: 14px;
    font-family: 'mkwxy';
  }

  small {
    color: $desc;
    font-size: 10px;
    font-family: 'mkwxy';
  }
}

.setting-card {
  padding: 13px 14px;
  border: 1px solid rgba($bd, 0.72);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.68);
}

.lottery-auto-status-card {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 11px;
  border-color: rgba($theme, 0.34);
  background: rgba($theme, 0.07);

  &.is-blocked {
    border-color: rgba(211, 76, 65, 0.42);
    background: rgba(211, 76, 65, 0.075);
  }

  &.is-limited {
    border-color: rgba(212, 151, 42, 0.4);
    background: rgba(245, 183, 62, 0.08);
  }
}

.lottery-auto-status-icon {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  color: #fff;
  border-radius: 50%;
  background: $theme;
  box-shadow: 0 4px 12px rgba($theme, 0.22);
  font: 900 15px/1 Arial, sans-serif;

  .is-blocked & { background: #d34c41; box-shadow: 0 4px 12px rgba(211, 76, 65, 0.22); }
  .is-limited & { background: #d4972a; box-shadow: 0 4px 12px rgba(212, 151, 42, 0.22); }
}

.lottery-auto-status-copy {
  min-width: 0;

  > strong {
    display: block;
    margin-top: 3px;
    color: $text;
    font: 800 13px/1.35 'mkwxy';
  }

  > p {
    margin: 4px 0 0;
    color: $desc;
    font: 11px/1.55 'mkwxy';
  }
}

.lottery-auto-status-badge {
  align-self: start;
  padding: 5px 8px;
  color: #327250;
  border: 1px solid rgba($theme, 0.3);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.7);
  font: 700 10px/1 'mkwxy';
  white-space: nowrap;

  .is-blocked & { color: #b33d34; border-color: rgba(211, 76, 65, 0.3); }
  .is-limited & { color: #9a6b18; border-color: rgba(212, 151, 42, 0.32); }
}

.compact-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.row-divider {
  height: 1px;
  background: rgba($bd, 0.48);
}

.setting-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.setting-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.setting-row-top {
  align-items: flex-start;
}

.setting-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.setting-label {
  font-size: 14px;
  font-weight: 500;
  color: $text;
  font-family: 'mkwxy';
}

.setting-desc {
  font-size: 12px;
  color: $desc;
  font-family: 'mkwxy';
}

.setting-divider {
  height: 0;
  border: 0;
  border-top: 1px solid $bd;
  margin: 4px 0;
}

/* 开关样式 */
.switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
  flex-shrink: 0;

  input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: $inactiveColor;
    transition: 0.3s;
    border-radius: 22px;

    &::before {
      position: absolute;
      content: '';
      height: 16px;
      width: 16px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: 0.3s;
      border-radius: 50%;
    }
  }

  input:checked + .slider {
    background-color: $activeColor;
  }

  input:checked + .slider::before {
    transform: translateX(18px);
  }
}

.setting-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.inline-input {
  margin-top: 0;
}

.short-input {
  width: 94px;
}

.threshold-presets {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 6px;
  margin-top: 11px;

  button {
    height: 30px;
    cursor: pointer;
    color: $desc;
    border: 1px solid rgba($bd, 0.78);
    border-radius: 7px;
    background: #fff;
    font-size: 11px;
    font-family: 'mkwxy';
    transition: 0.16s;

    &:hover,
    &.active {
      color: $theme;
      border-color: $theme;
      background: rgba($theme, 0.07);
    }
  }
}

.badge-presets {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
  margin-top: 10px;

  button {
    min-width: 0;
    padding: 8px 3px 7px;
    cursor: pointer;
    color: $desc;
    border: 1px solid rgba($bd, 0.78);
    border-radius: 8px;
    background: #fff;
    font-family: 'mkwxy';
    transition: 0.16s;

    strong,
    span {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    strong { font-size: 11px; font-weight: 600; }
    span { margin-top: 3px; font-size: 9px; opacity: 0.66; }

    &:hover,
    &.active {
      color: $theme;
      border-color: $theme;
      background: rgba($theme, 0.07);
    }
  }
}

.badge-manual-row {
  margin-top: 9px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  border: 1px solid rgba($bd, 0.72);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.72);

  > div { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  > div strong { color: $text; font: 700 13px 'mkwxy'; }
  > div span { color: $desc; font: 11px/1.4 'mkwxy'; }
  > label {
    height: 34px;
    flex: none;
    display: flex;
    align-items: center;
    padding: 0 10px;
    border: 1px solid rgba($bd, 0.8);
    border-radius: 8px;
    background: #fff;
    color: $desc;
    font: 11px 'mkwxy';
  }
  input {
    width: 42px;
    padding: 0;
    color: $text;
    border: 0;
    outline: 0;
    background: transparent;
    font: 800 17px Arial, sans-serif;
    text-align: center;
  }
  &.active { border-color: $theme; box-shadow: inset 3px 0 $theme; }
}

.lottery-filter-card {
  display: grid;
  gap: 9px;
}

.lottery-keyword-field {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr);
  align-items: center;
  gap: 6px 10px;
  margin-top: 2px;

  > span {
    color: $text;
    font: 700 12px/1 'mkwxy';
  }

  input {
    width: 100%;
    min-width: 0;
    height: 36px;
    box-sizing: border-box;
  }

  small {
    grid-column: 2;
    color: $desc;
    font: 10px/1.45 'mkwxy';
  }
}

.nickname-keyword-editor {
  min-width: 0;
  display: grid;
  gap: 7px;
}

.nickname-keyword-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.nickname-keyword-chip {
  max-width: 100%;
  height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 4px 0 10px;
  box-sizing: border-box;
  color: #b34b58;
  border: 1px solid rgba(214, 82, 99, 0.28);
  border-radius: 8px;
  background: rgba(214, 82, 99, 0.07);
  font: 700 11px/1 'mkwxy';

  > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.nickname-keyword-remove {
  width: 22px;
  height: 22px;
  flex: none;
  padding: 0;
  cursor: pointer;
  color: #b56b75;
  border: 0;
  border-radius: 6px;
  background: transparent;
  font: 700 16px/20px Arial, sans-serif;
  transition: 0.16s;

  &:hover {
    color: #fff;
    background: #d65263;
  }
}

.nickname-keyword-entry {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.nickname-keyword-add {
  height: 36px;
  flex: none;
  padding: 0 12px;
  cursor: pointer;
  color: #fff;
  border: 1px solid $theme;
  border-radius: 8px;
  background: $theme;
  font: 700 11px 'mkwxy';
  transition: 0.16s;

  &:hover:not(:disabled) {
    filter: brightness(0.94);
  }

  &:disabled {
    cursor: default;
    opacity: 0.42;
  }
}

.lottery-cooldown-row {
  gap: 16px;
}

.lottery-filter-status {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;

  span {
    max-width: 100%;
    overflow: hidden;
    padding: 5px 8px;
    color: #5a7180;
    border: 1px solid rgba($theme, 0.18);
    border-radius: 999px;
    background: rgba($theme, 0.055);
    font: 10px/1 'mkwxy';
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.badge-logic-tip {
  margin-top: 7px;
  padding: 8px 10px;
  color: #8b6824;
  border-radius: 8px;
  background: rgba(255, 193, 65, 0.12);
  font: 11px/1.55 'mkwxy';
}

.range-card {
  display: flex;
  flex-direction: column;
  gap: 11px;
}

.tier-size-preview {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;

  span {
    min-width: 0;
    padding: 7px 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 5px;
    color: #66727d;
    border: 1px solid rgba(109, 122, 132, 0.16);
    border-radius: 8px;
    background: rgba(92, 104, 113, 0.06);
  }

  small { overflow: hidden; font: 10px/1 'mkwxy'; text-overflow: ellipsis; white-space: nowrap; }
  b { flex: none; font: 700 11px/1 Arial, sans-serif; }

  .orange { color: #c76a16; border-color: rgba(224, 119, 22, 0.22); background: rgba(241, 129, 25, 0.07); }
  .purple { color: #8753b7; border-color: rgba(137, 70, 196, 0.22); background: rgba(153, 81, 215, 0.07); }
  .red { color: #c84656; border-color: rgba(210, 60, 80, 0.22); background: rgba(226, 66, 87, 0.07); }
}

.window-display-card {
  display: grid;
  gap: 12px;
  background:
    linear-gradient(135deg, rgba($theme, 0.08), transparent 52%),
    rgba(255, 255, 255, 0.76);
}

.window-display-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;

  > div { display: grid; gap: 3px; }

  > span {
    flex: none;
    padding: 5px 9px;
    color: #4d956b;
    border: 1px solid rgba($theme, 0.26);
    border-radius: 999px;
    background: rgba($theme, 0.08);
    font: 10px/1 'mkwxy';
  }
}

.window-display-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;

  label {
    min-width: 0;
    padding: 10px;
    border: 1px solid rgba($bd, 0.62);
    border-radius: 9px;
    background: rgba(255, 255, 255, 0.72);
  }

  label > span {
    display: block;
    color: $text;
    font: 700 11px/1.3 'mkwxy';
  }

  .setting-select {
    min-width: 0;
    font-size: 11px;
  }
}

.window-display-tip {
  color: $desc;
  font: 10px/1.5 'mkwxy';
}

.range-row {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr) 76px;
  align-items: center;
  gap: 12px;
  color: $text;
  font-size: 13px;
  font-family: 'mkwxy';

  input {
    width: 100%;
    accent-color: $theme;
  }

  strong {
    color: $theme;
    font-size: 11px;
    font-weight: 500;
    text-align: right;
  }
}

.setting-input {
  width: 120px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid $bd;
  border-radius: 8px;
  background: #fff;
  font-size: 14px;
  color: $text;
  font-family: 'mkwxy';
  outline: none;
  transition: border-color 0.2s;

  &:focus {
    border-color: $theme;
  }

  &::-webkit-inner-spin-button,
  &::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  -moz-appearance: textfield;
}

.setting-select {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border: 1px solid $bd;
  border-radius: 8px;
  background: #fff;
  font-size: 14px;
  color: $text;
  font-family: 'mkwxy';
  outline: none;
  transition: border-color 0.2s;
  cursor: pointer;
  margin-top: 4px;

  &:focus {
    border-color: $theme;
  }
}

.setting-unit {
  font-size: 13px;
  color: $desc;
  font-family: 'mkwxy';
}

.dialog-footer {
  min-height: 64px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  border-top: 1px solid rgba($bd, 0.48);
  background: rgba(255, 255, 255, 0.44);

  > span { color: $desc; font: 9px 'mkwxy'; }
}

.reset-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.data-settings-section {
  .reset-card {
    min-height: 110px;
    padding: 22px;
    border-color: rgba(233, 84, 100, 0.2);
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.86), rgba(233, 84, 100, 0.045));
  }
}

.storage-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;

  .setting-text { min-width: 0; }

  code {
    max-width: 100%;
    margin-top: 7px;
    display: block;
    overflow: hidden;
    color: #536a78;
    font: 10px/1.5 Consolas, monospace;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    margin-top: 4px;
    display: block;
    color: $theme;
    font: 10px/1.4 'mkwxy';
  }
}

.secondary-button {
  flex: none;
  padding: 7px 14px;
  cursor: pointer;
  color: #587361;
  border: 1px solid rgba($theme, 0.34);
  border-radius: 8px;
  background: rgba($theme, 0.08);
  font: 12px 'mkwxy';
  transition: 0.16s;

  &:hover {
    color: #fff;
    background: $theme;
  }
}

.danger-button {
  flex-shrink: 0;
  padding: 7px 17px;
  cursor: pointer;
  color: #e95464;
  border: 1px solid rgba(233, 84, 100, 0.3);
  border-radius: 8px;
  background: rgba(233, 84, 100, 0.08);
  font-size: 12px;
  font-family: 'mkwxy';
  transition: 0.16s;

  &:hover {
    color: #fff;
    background: #e95464;
  }
}

.dialog-btn {
  padding: 8px 24px;
  background: $theme;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-family: 'mkwxy';
  cursor: pointer;
  transition: opacity 0.2s;

  &:hover {
    opacity: 0.9;
  }

  &:active {
    opacity: 0.8;
  }
}

.anchor-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 0;
}

.anchor-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: #fff;
  border: 1px solid $bd;
  border-radius: 8px;
  font-size: 13px;
  font-family: 'mkwxy';

  .anchor-name {
    color: $text;
    font-weight: 500;
    flex-shrink: 0;
  }

  .anchor-uid {
    color: $desc;
    font-size: 12px;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .anchor-room {
    color: $desc;
    font-size: 11px;
    flex-shrink: 0;
  }

  .anchor-remove {
    width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    color: $desc;
    cursor: pointer;
    border-radius: 50%;
    flex-shrink: 0;
    transition: all 0.2s;
    padding: 0;
    border: 0;
    background: transparent;

    &:hover {
      color: #e95464;
      background: rgba(233, 84, 100, 0.1);
    }
  }

  .anchor-fixed {
    flex-shrink: 0;
    padding: 2px 6px;
    color: $theme;
    border: 1px solid rgba($theme, 0.3);
    border-radius: 5px;
    background: rgba($theme, 0.06);
    font-size: 9px;
  }
}

.anchor-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.anchor-input {
  flex: 1;
  width: auto;
}

.anchor-btn {
  height: 36px;
  padding: 0 16px;
  background: $theme;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-family: 'mkwxy';
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.2s;

  &:hover {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.anchor-tip {
  font-size: 12px;
  font-family: 'mkwxy';
  margin-top: 4px;

  &.success {
    color: $theme;
  }

  &.error {
    color: #e95464;
  }
}

.audio-local-tip {
  margin: -2px 0 9px;
  padding: 7px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #6f7f89;
  border: 1px solid rgba($theme, 0.18);
  border-radius: 8px;
  background: rgba($theme, 0.055);
  font: 10px/1.45 'mkwxy';

  span { min-width: 0; }
  .audio-pack-actions { flex: none; display: flex; gap: 5px; }
  button {
    flex: none;
    padding: 3px 7px;
    cursor: pointer;
    color: $theme;
    border: 1px solid rgba($theme, 0.28);
    border-radius: 6px;
    background: #fff;
    font: 9px 'mkwxy';
  }
}

.audio-settings-section {
  position: relative;
  min-height: 100%;
}
.audio-settings-section > .section-heading { display: none; }
.audio-drag-active { outline: 2px dashed $theme; outline-offset: -4px; border-radius: 12px; }
.audio-drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: grid;
  place-content: center;
  gap: 8px;
  color: $text;
  text-align: center;
  border-radius: 12px;
  background: rgba(244, 253, 248, 0.95);
  backdrop-filter: blur(5px);
  pointer-events: none;

  strong { color: $theme; font: 800 20px 'mkwxy'; }
  span { font: 12px 'mkwxy'; }
}

.audio-control-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
}

.audio-normalization-card,
.audio-volume-card {
  min-height: 54px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  box-sizing: border-box;
  border: 1px solid rgba($theme, 0.24);
  border-radius: 11px;
  background: linear-gradient(135deg, rgba($theme, 0.1), rgba(255, 255, 255, 0.7));

  .normalization-icon {
    width: 32px;
    height: 32px;
    flex: none;
    display: grid;
    place-items: center;
    color: #fff;
    border-radius: 9px;
    background: $theme;
    font-size: 16px;
  }
  > div {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  strong { color: $text; font: 700 14px 'mkwxy'; }
  small { color: $desc; font: 11px/1.45 'mkwxy'; }
}

.volume-copy {
  min-width: 0;
  flex: 1;
}

.volume-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  output {
    min-width: 44px;
    color: $theme;
    font-size: 14px;
    font-weight: 800;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
}

.audio-volume-card input[type='range'] {
  width: 100%;
  height: 5px;
  margin: 8px 0 2px;
  cursor: pointer;
  appearance: none;
  border-radius: 99px;
  background: linear-gradient(90deg, $theme var(--volume-progress), rgba($bd, 0.55) var(--volume-progress));
}

.audio-volume-card input[type='range']::-webkit-slider-thumb {
  width: 16px;
  height: 16px;
  appearance: none;
  border: 3px solid #fff;
  border-radius: 50%;
  background: $theme;
  box-shadow: 0 1px 5px rgba($theme, 0.36);
}

.audio-stage-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;

  button {
    height: 46px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    cursor: pointer;
    color: $desc;
    border: 1px solid rgba($bd, 0.75);
    border-radius: 10px;
    background: #fff;
    font-family: 'mkwxy';
  }
  strong { font-size: 14px; }
  span { padding: 2px 6px; border-radius: 99px; background: rgba($bd, 0.18); font-size: 10px; }
  button:hover,
  button.active { color: $theme; border-color: $theme; background: rgba($theme, 0.07); }
}

.audio-category-card {
  min-width: 0;
  margin-bottom: 0;
  padding: 11px;
  border: 1px solid rgba($bd, 0.8);
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.62);

  &:last-of-type { margin-bottom: 0; }
}

.audio-category-single {
  padding: 14px;
}
.audio-category-single .audio-track-list {
  max-height: 340px;
  overflow-y: auto;
  padding-right: 4px;
}

.audio-category-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  > div {
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
  }

  strong { color: $text; font: 700 13px 'mkwxy'; }
  span { overflow: hidden; color: $desc; font: 9px 'mkwxy'; text-overflow: ellipsis; white-space: nowrap; }
}

.audio-upload-button {
  flex: none;
  height: 28px;
  padding: 0 9px;
  cursor: pointer;
  color: $theme;
  border: 1px solid rgba($theme, 0.34);
  border-radius: 7px;
  background: rgba($theme, 0.06);
  font: 11px 'mkwxy';

  &:hover { color: #fff; background: $theme; }
}

.audio-mode-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
  margin-top: 9px;

  button {
    height: 28px;
    cursor: pointer;
    color: $desc;
    border: 1px solid rgba($bd, 0.75);
    border-radius: 7px;
    background: #fff;
    font: 10px 'mkwxy';

    &:hover,
    &.active { color: $theme; border-color: $theme; background: rgba($theme, 0.07); }
  }
}

.audio-track-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 8px;
}

.audio-track-item {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 6px;
  border: 1px solid rgba($bd, 0.62);
  border-radius: 8px;
  background: #fff;
  transition: 0.16s;

  &.selected { border-color: rgba($theme, 0.62); box-shadow: inset 2px 0 $theme; }
  &.disabled { opacity: 0.52; }
}

.audio-enable {
  position: relative;
  width: 17px;
  height: 17px;
  flex: none;
  cursor: pointer;

  input { position: absolute; opacity: 0; pointer-events: none; }
  span {
    position: absolute;
    inset: 0;
    border: 1px solid $bd;
    border-radius: 5px;
    background: #fff;
  }
  input:checked + span { border-color: $theme; background: $theme; }
  input:checked + span::after {
    content: '';
    position: absolute;
    left: 5px;
    top: 2px;
    width: 4px;
    height: 8px;
    border: solid #fff;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }
}

.audio-track-main {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0;
  cursor: pointer;
  text-align: left;
  border: 0;
  background: transparent;
}

.audio-radio {
  width: 8px;
  height: 8px;
  flex: none;
  border: 2px solid $bd;
  border-radius: 50%;
}
.audio-track-item.selected .audio-radio { border-color: $theme; background: $theme; box-shadow: inset 0 0 0 2px #fff; }

.audio-track-text {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;

  strong { overflow: hidden; color: $text; font: 500 11px 'mkwxy'; text-overflow: ellipsis; white-space: nowrap; }
  small { color: $desc; font: 8px 'mkwxy'; }
}

.audio-preview-button,
.audio-delete-button {
  width: 26px;
  height: 26px;
  flex: none;
  display: grid;
  place-items: center;
  padding: 0;
  cursor: pointer;
  color: $desc;
  border: 1px solid rgba($bd, 0.62);
  border-radius: 7px;
  background: #fff;
  font-size: 10px;

  &:hover { color: $theme; border-color: $theme; }
}
.audio-delete-button { font-size: 17px; }
.audio-delete-button:hover { color: #e95464; border-color: rgba(233, 84, 100, 0.5); }

.audio-tip {
  margin-top: 7px;
  font: 10px/1.4 'mkwxy';
  &.success { color: $theme; }
  &.error { color: #e95464; }
}

.audio-file-input { display: none; }

.ai-form-card {
  display: grid;
  gap: 14px;
}

.ai-form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 14px;
}

.ai-number-grid {
  display: grid;
  grid-template-columns: 240px 240px;
  gap: 14px;
}

.ai-field {
  display: grid;
  gap: 7px;
  color: #53636b;
  font: 600 13px/1.3 'mkwxy', sans-serif;

  .setting-input {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
  }
}

.ai-key-row {
  display: flex;
  align-items: stretch;
  gap: 7px;

  .setting-input { flex: 1 1 150px; }
}

.ai-key-button {
  flex: none;
  min-width: 70px;
  padding: 0 11px;
  color: #327250;
  border: 1px solid rgba($theme, 0.42);
  border-radius: 8px;
  background: rgba($theme, 0.09);
  font: 600 12px/1 'mkwxy', sans-serif;
  cursor: pointer;

  &:hover:not(:disabled) { border-color: $theme; background: rgba($theme, 0.16); }
  &:disabled { opacity: 0.52; cursor: not-allowed; }
  &.danger { min-width: 48px; color: #c73d4f; border-color: rgba(199, 61, 79, 0.28); background: rgba(199, 61, 79, 0.06); }
}

.ai-key-status {
  min-height: 16px;
  color: #7b888e;
  font: 11px/1.4 'mkwxy', sans-serif;

  &.success { color: #327250; }
  &.error { color: #c73d4f; }
}

.ai-interval-field {
  max-width: 240px;
}

.ai-privacy-tip {
  margin: 0;
  padding: 11px 13px;
  color: #68777f;
  border: 1px solid rgba($theme, 0.2);
  border-radius: 10px;
  background: rgba($theme, 0.055);
  font: 12px/1.65 'mkwxy', sans-serif;
}

/* 设置面板以可读性优先，避免高分屏下 9px～10px 字号过小。 */
.settings-dialog .dialog-title { font-size: 20px; }
.settings-dialog .dialog-subtitle { font-size: 12px; }
.settings-dialog .sidebar-label { font-size: 11px; }
.settings-dialog .settings-tab-copy strong { font-size: 14px; }
.settings-dialog .settings-tab-copy small { font-size: 11px; }
.settings-dialog .sidebar-note { font-size: 11px; }
.settings-dialog .settings-pane-header strong { font-size: 17px; }
.settings-dialog .settings-pane-header small { font-size: 12px; }
.settings-dialog .section-heading strong { font-size: 16px; }
.settings-dialog .section-heading small { font-size: 12px; }
.settings-dialog .setting-label { font-size: 15px; }
.settings-dialog .setting-desc { font-size: 13px; line-height: 1.45; }
.settings-dialog .threshold-presets button { height: 34px; font-size: 13px; }
.settings-dialog .badge-presets button strong { font-size: 13px; }
.settings-dialog .badge-presets button span { font-size: 11px; }
.settings-dialog .range-row { font-size: 14px; }
.settings-dialog .range-row strong { font-size: 13px; }
.settings-dialog .dialog-footer > span { font-size: 11px; }
.settings-dialog .danger-button,
.settings-dialog .anchor-btn { font-size: 13px; }
.settings-dialog .dialog-btn { font-size: 15px; }
.settings-dialog .anchor-item { font-size: 14px; }
.settings-dialog .anchor-item .anchor-uid { font-size: 13px; }
.settings-dialog .anchor-item .anchor-room { font-size: 12px; }
.settings-dialog .audio-local-tip { font-size: 12px; }
.settings-dialog .audio-local-tip button { font-size: 11px; }
.settings-dialog .audio-category-header strong { font-size: 15px; }
.settings-dialog .audio-category-header span { font-size: 11px; }
.settings-dialog .audio-upload-button { height: 31px; font-size: 12px; }
.settings-dialog .audio-mode-row button { height: 31px; font-size: 11px; }
.settings-dialog .audio-track-text strong { font-size: 13px; }
.settings-dialog .audio-track-text small { font-size: 10px; }
.settings-dialog .audio-tip { font-size: 12px; }

@media (max-width: 900px) {
  .settings-dialog-overlay { padding: 10px; }
  .settings-dialog {
    width: calc(100vw - 20px);
    height: calc(100vh - 20px);
  }
  .settings-layout { grid-template-columns: 172px minmax(0, 1fr); }
  .settings-sidebar { padding-inline: 9px; }
  .sidebar-note { display: none; }
}

@media (max-width: 650px) {
  .ai-form-grid { grid-template-columns: 1fr; }
  .ai-number-grid { grid-template-columns: 1fr; }
  .audio-control-grid { grid-template-columns: 1fr; }
  .window-display-grid { grid-template-columns: 1fr; }
  .tier-size-preview { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .settings-layout { display: flex; flex-direction: column; }
  .settings-sidebar {
    min-height: auto;
    padding: 8px 10px;
    flex-direction: row;
    overflow-x: auto;
    border-right: 0;
    border-bottom: 1px solid rgba($bd, 0.54);
  }
  .sidebar-label { display: none; }
  .settings-tab { min-width: 112px; min-height: 43px; padding: 5px 7px; }
  .settings-tab-icon { width: 29px; height: 29px; font-size: 13px; }
  .settings-tab-copy small,
  .settings-tab-arrow { display: none; }
  .dialog-header { min-height: 58px; padding-inline: 16px; }
  .dialog-body { padding-inline: 14px; }
  .setting-grid { grid-template-columns: 1fr; }
  .threshold-presets { grid-template-columns: repeat(3, 1fr); }
  .badge-presets { grid-template-columns: repeat(3, 1fr); }
  .lottery-auto-status-card { grid-template-columns: 34px minmax(0, 1fr); }
  .lottery-auto-status-badge { grid-column: 2; justify-self: start; }
  .range-row { grid-template-columns: 64px minmax(0, 1fr) 66px; gap: 8px; }
  .anchor-uid { display: none; }
  .audio-category-header > div span { display: none; }
  .audio-local-tip { align-items: flex-start; flex-direction: column; }
  .audio-pack-actions { width: 100%; flex-wrap: wrap; }
}
</style>
