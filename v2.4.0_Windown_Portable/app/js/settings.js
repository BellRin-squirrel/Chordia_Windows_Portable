document.addEventListener('DOMContentLoaded', async () => {
    const artPreview = document.getElementById('defaultArtPreview');
    const artInput = document.getElementById('artInput');
    const btnRestoreArt = document.getElementById('btnRestoreArt');
    const chkNewWindow = document.getElementById('openPlayerNewWindow');
    const chkManageNewWindow = document.getElementById('openManageNewWindow');
    const chkDevMode = document.getElementById('developerMode'); 
    const chkLazyLoad = document.getElementById('lazyLoadPlaylists'); // ★追加
    const itemsPerPage = document.getElementById('itemsPerPage');
    const primaryColor = document.getElementById('primaryColor');

    const themeMode = document.getElementById('themeMode');
    const backgroundColor = document.getElementById('backgroundColor');
    const subBackgroundColor = document.getElementById('subBackgroundColor');
    const textColor = document.getElementById('textColor');
    const btnSaveOriginalTheme = document.getElementById('btnSaveOriginalTheme');
    const btnDeleteOriginalTheme = document.getElementById('btnDeleteOriginalTheme');

    const themeModal = document.getElementById('themeModal');
    const newThemeName = document.getElementById('newThemeName');
    const btnConfirmTheme = document.getElementById('btnConfirmTheme');
    const btnCancelTheme = document.getElementById('btnCancelTheme');

    const devWarningModal = document.getElementById('devWarningModal');
    const btnConfirmDev = document.getElementById('btnConfirmDev');
    const btnCancelDev = document.getElementById('btnCancelDev');

    const THEME_PRESETS = {
        light: { bg: '#f3f4f6', subBg: '#ffffff', text: '#1f2937' },
        dark: { bg: '#111827', subBg: '#1f2937', text: '#f9fafb' }
    };

    let customThemes = {};
    let currentSettings = {};

    function hexToRgba(hex, alpha) {
        let h = hex.replace('#', '');
        if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
        let r = parseInt(h.substring(0, 2), 16);
        let g = parseInt(h.substring(2, 4), 16);
        let b = parseInt(h.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    const settings = await eel.get_app_settings()();
    currentSettings = settings;
    const availableTags = await eel.get_available_tags()();
    customThemes = await eel.get_custom_themes()();

    itemsPerPage.value = settings.items_per_page;
    chkNewWindow.checked = settings.open_player_new_window;
    chkManageNewWindow.checked = settings.open_manage_new_window;
    chkDevMode.checked = settings.developer_mode;
    chkLazyLoad.checked = settings.lazy_load_playlists; // ★セット
    primaryColor.value = settings.primary_color;

    function rebuildThemeOptions(selectedMode) {
        let html = '<option value="light">ライトテーマ</option><option value="dark">ダークテーマ</option>';
        for (const name in customThemes) {
            html += `<option value="${name}">${name}</option>`;
        }
        html += '<option value="custom">カスタム</option>';
        themeMode.innerHTML = html;
        themeMode.value = selectedMode;
    }

    rebuildThemeOptions(settings.theme_mode || 'light');

    function updateThemeUI() {
        const mode = themeMode.value;
        const isCustom = mode === 'custom';
        const isSavedTheme = !isCustom && mode !== 'light' && mode !== 'dark';

        backgroundColor.disabled = !isCustom;
        subBackgroundColor.disabled = !isCustom;
        textColor.disabled = !isCustom;

        btnSaveOriginalTheme.style.display = isCustom ? 'block' : 'none';
        btnDeleteOriginalTheme.style.display = isSavedTheme ? 'block' : 'none';

        if (mode === 'light' || mode === 'dark') {
            const preset = THEME_PRESETS[mode];
            backgroundColor.value = preset.bg;
            subBackgroundColor.value = preset.subBg;
            textColor.value = preset.text;
        } else if (isSavedTheme) {
            const theme = customThemes[mode];
            backgroundColor.value = theme.bg;
            subBackgroundColor.value = theme.subBg;
            textColor.value = theme.text;
        } else {
            backgroundColor.value = currentSettings.background_color;
            subBackgroundColor.value = currentSettings.sub_background_color;
            textColor.value = currentSettings.text_color;
        }
    }

    themeMode.addEventListener('change', () => {
        updateThemeUI();
        saveAllSettings();
    });
    updateThemeUI();

    async function saveAllSettings() {
        const active_tags = Array.from(document.querySelectorAll('.chk-db:checked')).map(cb => cb.value);
        const player_visible_tags = Array.from(document.querySelectorAll('.chk-player:checked')).map(cb => cb.value);

        const newSettings = {
            items_per_page: parseInt(itemsPerPage.value) || 50,
            open_player_new_window: chkNewWindow.checked,
            open_manage_new_window: chkManageNewWindow.checked,
            developer_mode: chkDevMode.checked,
            lazy_load_playlists: chkLazyLoad.checked, // ★追加
            primary_color: primaryColor.value,
            theme_mode: themeMode.value,
            background_color: backgroundColor.value,
            sub_background_color: subBackgroundColor.value,
            text_color: textColor.value,
            active_tags: active_tags,
            player_visible_tags: player_visible_tags
        };

        currentSettings = newSettings;
        const success = await eel.save_app_settings(newSettings)();
        if (success) {
            const root = document.documentElement;
            root.style.setProperty('--primary-color', newSettings.primary_color);
            root.style.setProperty('--bg-color', newSettings.background_color);
            root.style.setProperty('--card-bg', newSettings.sub_background_color);
            root.style.setProperty('--text-main', newSettings.text_color);
            root.style.setProperty('--text-sub', hexToRgba(newSettings.text_color, 0.6));
            
            localStorage.setItem('theme_primary_color', newSettings.primary_color);
            localStorage.setItem('theme_bg_color', newSettings.background_color);
            localStorage.setItem('theme_sub_bg_color', newSettings.sub_background_color);
            localStorage.setItem('theme_text_color', newSettings.text_color);
        }
    }

    chkDevMode.addEventListener('click', (e) => {
        if (chkDevMode.checked) {
            e.preventDefault(); 
            devWarningModal.style.display = 'flex';
        } else {
            saveAllSettings();
        }
    });

    btnConfirmDev.addEventListener('click', () => {
        chkDevMode.checked = true;
        devWarningModal.style.display = 'none';
        saveAllSettings();
        showToast("デベロッパーモードを有効にしました");
    });

    btnCancelDev.addEventListener('click', () => {
        chkDevMode.checked = false;
        devWarningModal.style.display = 'none';
    });

    // 各要素の変更で自動保存
    [itemsPerPage, chkNewWindow, chkManageNewWindow, chkLazyLoad, primaryColor, backgroundColor, subBackgroundColor, textColor].forEach(el => {
        el.addEventListener('change', saveAllSettings);
    });

    btnSaveOriginalTheme.addEventListener('click', () => {
        newThemeName.value = "";
        themeModal.style.display = 'flex';
    });

    btnCancelTheme.addEventListener('click', () => themeModal.style.display = 'none');

    btnConfirmTheme.addEventListener('click', async () => {
        const name = newThemeName.value.trim();
        if (!name) return;
        if (['light', 'dark', 'custom'].includes(name)) {
            alert("その名前は使用できません。");
            return;
        }

        const colors = { bg: backgroundColor.value, subBg: subBackgroundColor.value, text: textColor.value };
        const success = await eel.save_custom_theme(name, colors)();
        if (success) {
            customThemes[name] = colors;
            themeModal.style.display = 'none';
            rebuildThemeOptions(name);
            saveAllSettings();
            showToast(`テーマ "${name}" を保存しました`);
        }
    });

    btnDeleteOriginalTheme.addEventListener('click', async () => {
        const name = themeMode.value;
        if (confirm(`テーマ "${name}" を削除してもよろしいですか？`)) {
            const success = await eel.delete_custom_theme(name)();
            if (success) {
                delete customThemes[name];
                rebuildThemeOptions('custom');
                updateThemeUI();
                saveAllSettings();
                showToast(`テーマ "${name}" を削除しました`);
            }
        }
    });

    function renderCombinedTagList() {
        const container = document.getElementById('combinedTagsList');
        container.innerHTML = '';
        availableTags.forEach(tag => {
            const li = document.createElement('li');
            li.className = 'tag-item';
            const isDbChecked = currentSettings.active_tags.includes(tag.key) ? 'checked' : '';
            const isPlayerChecked = currentSettings.player_visible_tags.includes(tag.key) ? 'checked' : '';
            li.innerHTML = `
                <div class="handle disabled">${tag.label}</div>
                <div class="check-container"><label class="toggle-switch"><input type="checkbox" class="chk-db" value="${tag.key}" ${isDbChecked}><span class="slider"></span></label></div>
                <div class="check-container"><label class="toggle-switch"><input type="checkbox" class="chk-player" value="${tag.key}" ${isPlayerChecked}><span class="slider"></span></label></div>
            `;
            container.appendChild(li);
        });
        container.querySelectorAll('input').forEach(chk => {
            chk.addEventListener('change', saveAllSettings);
        });
    }
    renderCombinedTagList();

    const initialArtUrl = await eel.get_default_art_url()();
    artPreview.src = initialArtUrl;

    artInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            const b64 = event.target.result;
            artPreview.src = b64;
            await eel.update_default_artwork(b64)();
            showToast("初期画像を更新しました");
        };
        reader.readAsDataURL(file);
    });

    btnRestoreArt.addEventListener('click', async () => {
        const success = await eel.reset_default_artwork()();
        if (success) {
            const url = await eel.get_default_art_url()();
            artPreview.src = url;
            showToast("初期画像に戻しました");
        }
    });
});

function showToast(msg, isErr = false) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.className = 'toast show';
    if (isErr) toast.style.backgroundColor = "#ef4444"; else toast.style.backgroundColor = "#10b981";
    setTimeout(() => { toast.className = 'toast'; }, 3000);
}