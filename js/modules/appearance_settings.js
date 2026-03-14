// --- 外观设置 (Appearance Settings) ---
// 整体 UI 切换：论坛、设置、APP 布局、小组件等（聊天列表与聊天详情页保持不变）

const APPEARANCE_STORAGE_KEY = 'ovo_appearance_ui_mode';

function getAppearanceMode() {
    try {
        return localStorage.getItem(APPEARANCE_STORAGE_KEY) || 'classic';
    } catch (_) {
        return 'classic';
    }
}

function setAppearanceMode(mode) {
    try {
        localStorage.setItem(APPEARANCE_STORAGE_KEY, mode);
    } catch (_) {}
}

function renderAppearanceSettingsScreen() {
    const screen = document.getElementById('appearance-settings-screen');
    if (!screen) return;
    
    screen.innerHTML = '';

    const inner = document.createElement('div');
    inner.className = 'appearance-settings-inner';

    const currentMode = getAppearanceMode();

    inner.innerHTML = `
        <header class="app-header">
            <button class="back-btn" data-target="home-screen">‹</button>
            <div class="title-container">
                <h1 class="title">外观设置</h1>
            </div>
            <div class="placeholder"></div>
        </header>
        <main class="content appearance-content">
            
            <!-- 教程排版设置区 -->
            <div class="appearance-section">
                <div class="appearance-section-header">
                    <h2 class="appearance-section-title">教程排版</h2>
                    <span class="appearance-section-desc">选择教程界面的显示风格</span>
                </div>
                
                <div class="appearance-thumbnail-container">
                    <!-- 方案一：经典 -->
                    <div class="appearance-thumbnail-item ${currentMode === 'classic' ? 'selected' : ''}" data-mode="classic">
                        <div class="appearance-thumbnail-box">
                            <div class="thumb-screen thumb-classic">
                                <div class="thumb-header"></div>
                                <div class="thumb-card"></div>
                                <div class="thumb-card"></div>
                                <div class="thumb-card"></div>
                            </div>
                            <div class="thumbnail-check-icon">✓</div>
                        </div>
                        <div class="appearance-thumbnail-label">经典</div>
                    </div>

                    <!-- 方案二：简约 -->
                    <div class="appearance-thumbnail-item ${currentMode === 'modern' ? 'selected' : ''}" data-mode="modern">
                        <div class="appearance-thumbnail-box">
                            <div class="thumb-screen thumb-modern">
                                <div class="thumb-header"></div>
                                <div class="thumb-group">
                                    <div class="thumb-row"></div>
                                    <div class="thumb-row"></div>
                                </div>
                                <div class="thumb-group">
                                    <div class="thumb-row"></div>
                                </div>
                            </div>
                            <div class="thumbnail-check-icon">✓</div>
                        </div>
                        <div class="appearance-thumbnail-label">简约</div>
                    </div>

                    <!-- 方案三：白兔岛 -->
                    <div class="appearance-thumbnail-item ${currentMode === 'rabbit' ? 'selected' : ''}" data-mode="rabbit">
                        <div class="appearance-thumbnail-box">
                            <div class="thumb-screen thumb-rabbit">
                                <div class="thumb-rabbit-bg"></div>
                                <div class="thumb-header"></div>
                                <div class="thumb-rabbit-card"></div>
                                <div class="thumb-rabbit-card"></div>
                            </div>
                            <div class="thumbnail-check-icon">✓</div>
                        </div>
                        <div class="appearance-thumbnail-label">白兔岛</div>
                    </div>
                </div>
            </div>

            <!-- 预留区：壁纸设置 (未来添加) -->
            <div class="appearance-section" style="opacity: 0.5;">
                <div class="appearance-section-header">
                    <h2 class="appearance-section-title">壁纸方案</h2>
                    <span class="appearance-section-desc">敬请期待</span>
                </div>
                <div class="appearance-thumbnail-container">
                    <div class="appearance-thumbnail-item">
                        <div class="appearance-thumbnail-box" style="background:#eee;"></div>
                        <div class="appearance-thumbnail-label">默认</div>
                    </div>
                </div>
            </div>

        </main>
    `;

    screen.appendChild(inner);

    const items = inner.querySelectorAll('.appearance-thumbnail-item');
    items.forEach(item => {
        item.addEventListener('click', () => {
            if (!item.dataset.mode) return; // 忽略没有 mode 的占位项
            
            // 移除同组内的 selected
            const container = item.closest('.appearance-thumbnail-container');
            container.querySelectorAll('.appearance-thumbnail-item').forEach(c => c.classList.remove('selected'));
            
            item.classList.add('selected');
            const mode = item.dataset.mode;
            setAppearanceMode(mode);
            
            if (typeof renderTutorialContent === 'function') {
                renderTutorialContent();
            }
        });
    });
}

(function initAppearanceSettings() {
    function injectWhenReady() {
        const screen = document.getElementById('appearance-settings-screen');
        if (!screen || screen.querySelector('.appearance-settings-inner')) return;
        renderAppearanceSettingsScreen();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectWhenReady);
    } else {
        injectWhenReady();
    }
})();
