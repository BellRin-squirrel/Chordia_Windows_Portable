document.addEventListener('DOMContentLoaded', async () => {
    // Tauriのinvokeを取得
    const invoke = window.__TAURI__.core ? window.__TAURI__.core.invoke : window.__TAURI__.tauri.invoke;

    const btnAddMusic = document.getElementById('btnAddMusic');
    const btnManage = document.getElementById('btnManage');
    const btnExport = document.getElementById('btnExport');
    const btnImport = document.getElementById('btnImport');
    const btnPlayer = document.getElementById('btnPlayer');
    const btnMobileSync = document.getElementById('btnMobileSync');
    const btnSettings = document.getElementById('btnSettings');
    const btnInfo = document.getElementById('btnInfo');

    if (btnAddMusic) btnAddMusic.addEventListener('click', () => window.location.href = 'add_music.html');

    if (btnManage) {
        btnManage.addEventListener('click', async () => {
            const settings = await invoke("get_app_settings");
            if (settings.open_manage_new_window) {
                // ★ 新しいウィンドウとして開く
                await invoke("open_new_window", {
                    label: "manage_window", // ウィンドウの識別子
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
                // ★ 新しいウィンドウとして開く
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
            // ★ 同期画面も別ウィンドウで開く設定になっていたため対応
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
});