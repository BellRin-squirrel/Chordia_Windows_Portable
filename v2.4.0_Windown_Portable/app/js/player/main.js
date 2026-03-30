document.addEventListener('DOMContentLoaded', async () => {
    try {
        // UI・機能コンポーネントの初期化
        if (window.HeaderController) window.HeaderController.init();
        if (window.SidebarController) window.SidebarController.init();
        if (window.MainViewController) window.MainViewController.init();
        if (window.PlayerController) window.PlayerController.init();
        if (window.ModalSongSelect) window.ModalSongSelect.init();

        // 起動時の表示調整
        const settings = await eel.get_app_settings()();
        
        // ★ 修正: .header-left ごと消すのではなく、戻るボタン（.back-link）だけを消す
        // これにより、右側に配置された音量バーは残ります
        if (settings && settings.open_player_new_window) {
            const backLink = document.querySelector('.back-link');
            if (backLink) {
                backLink.style.display = 'none';
            }
        }

        // 歌詞データの移行
        await eel.migrate_lyrics_to_db()();

        // プレイリストの基本情報のみを読み込む
        if (window.SidebarController) await window.SidebarController.loadPlaylists();

    } catch (e) {
        console.error("Initialization Error:", e);
    }
});