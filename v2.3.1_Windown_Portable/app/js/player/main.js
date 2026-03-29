document.addEventListener('DOMContentLoaded', async () => {
    try {
        // UI・機能コンポーネントの初期化
        window.HeaderController.init();
        window.SidebarController.init();
        window.MainViewController.init();
        window.PlayerController.init();
        window.ModalSongSelect.init();

        // 起動時の表示調整
        const settings = await eel.get_app_settings()();
        
        if (settings.open_player_new_window) {
            const backLinkArea = document.querySelector('.header-left');
            if (backLinkArea) {
                backLinkArea.style.display = 'none';
            }
        }

        // 歌詞データの移行（v1.0.0-beta3互換）
        await eel.migrate_lyrics_to_db()();

        // プレイリストの基本情報のみを読み込む（楽曲リストは読み込まない）
        await window.SidebarController.loadPlaylists();

    } catch (e) {
        console.error("Initialization Error:", e);
    }
});