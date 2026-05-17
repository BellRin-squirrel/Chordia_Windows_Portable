document.addEventListener('DOMContentLoaded', async () => {
    const invoke = window.__TAURI__.core ? window.__TAURI__.core.invoke : window.__TAURI__.tauri.invoke;

    const btnAddMusic = document.getElementById('btnAddMusic');
    const btnManage = document.getElementById('btnManage');
    const btnExport = document.getElementById('btnExport');
    const btnImport = document.getElementById('btnImport');
    const btnPlayer = document.getElementById('btnPlayer');
    const btnMobileSync = document.getElementById('btnMobileSync');
    const btnSettings = document.getElementById('btnSettings');
    const btnInfo = document.getElementById('btnInfo');
    const btnExtensions = document.getElementById('btnExtensions'); // 追加

    if (btnAddMusic) btnAddMusic.addEventListener('click', () => window.location.href = 'add_music.html');

    if (btnManage) {
        btnManage.addEventListener('click', async () => {
            const settings = await invoke("get_app_settings");
            if (settings.open_manage_new_window) {
                await invoke("open_new_window", {
                    label: "manage_window", 
                    url: "manage.html?mode=window",
                    title: "データベース管理 - Chordia",
                    width: 1200.0,
                    height: 900.0
                });
            } else {
                window.location.href = 'manage.html';
            }
        });
    }

    if (btnExport) btnExport.addEventListener('click', () => window.location.href = 'export.html');
    if (btnImport) btnImport.addEventListener('click', () => window.location.href = 'import.html');

    if (btnPlayer) {
        btnPlayer.addEventListener('click', async () => {
            const settings = await invoke("get_app_settings");
            if (settings.open_player_new_window) {
                await invoke("open_new_window", {
                    label: "player_window",
                    url: "player.html",
                    title: "音楽を再生 - Chordia",
                    width: 1200.0,
                    height: 900.0
                });
            } else {
                window.location.href = 'player.html';
            }
        });
    }

    if (btnMobileSync) {
        btnMobileSync.addEventListener('click', async () => {
            await invoke("open_new_window", {
                label: "sync_window",
                url: "api.html",
                title: "モバイル同期 - Chordia",
                width: 500.0,
                height: 650.0
            });
        });
    }

    if (btnSettings) btnSettings.addEventListener('click', () => window.location.href = 'settings.html');
    if (btnInfo) btnInfo.addEventListener('click', () => window.location.href = 'info.html');

    // ==========================================
    // トップ画面のショートカットキー
    // ==========================================
    document.addEventListener('keydown', (e) => {
        // 入力フォーム使用時は無視
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;

        let targetBtn = null;
        switch(e.key.toUpperCase()) {
            case '1': case 'A': targetBtn = btnAddMusic; break;
            case '2': case 'D': targetBtn = btnManage; break;
            case '3': case 'X': targetBtn = btnExport; break;
            case '4': case 'M': targetBtn = btnImport; break;
            case '5': case 'P': targetBtn = btnPlayer; break;
            case '6': case 'C': targetBtn = btnMobileSync; break;
            case '7': case 'E': targetBtn = btnExtensions; break;
            case '8': case 'S': targetBtn = btnSettings; break;
            case '9': case 'I': targetBtn = btnInfo; break;
        }

        if (targetBtn) {
            e.preventDefault();       // ブラウザのネイティブ機能をブロック
            e.stopPropagation();      // イベントの伝播をブロック
            if (document.activeElement) document.activeElement.blur(); // アクティブ状態を解除
            targetBtn.click();
        }
    });
});