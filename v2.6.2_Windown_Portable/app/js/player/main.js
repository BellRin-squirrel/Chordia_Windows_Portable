document.addEventListener('DOMContentLoaded', async () => {
    try {
        if (window.HeaderController) window.HeaderController.init();
        if (window.SidebarController) window.SidebarController.init();
        if (window.MainViewController) window.MainViewController.init();
        if (window.PlayerController) window.PlayerController.init();
        if (window.ModalSongSelect) window.ModalSongSelect.init();

        const settings = await eel.get_app_settings()();
        if (settings && settings.open_player_new_window) {
            const backLink = document.querySelector('.back-link');
            if (backLink) {
                backLink.style.display = 'none';
            }
        }
        await eel.migrate_lyrics_to_db()();
        
        // ★ 修正: 起動直後にサイドバーの初期読み込みを実行
        if (window.SidebarController) {
            await window.SidebarController.loadPlaylists();
        }

    } catch (e) {
        console.error("Initialization Error:", e);
    }
});