document.addEventListener('DOMContentLoaded', async () => {
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
            const settings = await eel.get_app_settings()();
            if (settings.open_manage_new_window) {
                const width = 1200;
                const height = 900;
                const left = (window.screen.width / 2) - (width / 2);
                const top = (window.screen.height / 2) - (height / 2);
                window.open('manage.html?mode=window', '_blank', `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`);
            } else {
                window.location.href = 'manage.html';
            }
        });
    }

    if (btnExport) btnExport.addEventListener('click', () => window.location.href = 'export.html');
    if (btnImport) btnImport.addEventListener('click', () => window.location.href = 'import.html');

    if (btnPlayer) {
        btnPlayer.addEventListener('click', async () => {
            const settings = await eel.get_app_settings()();
            if (settings.open_player_new_window) {
                const width = 1200;
                const height = 900;
                const left = (window.screen.width / 2) - (width / 2);
                const top = (window.screen.height / 2) - (height / 2);
                window.open('player.html', '_blank', `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`);
            } else {
                window.location.href = 'player.html';
            }
        });
    }

    if (btnMobileSync) {
        btnMobileSync.addEventListener('click', () => {
            const width = 500;
            const height = 650;
            const left = (window.screen.width / 2) - (width / 2);
            const top = (window.screen.height / 2) - (height / 2);
            window.open('api.html', '_blank', `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes`);
        });
    }

    if (btnSettings) btnSettings.addEventListener('click', () => window.location.href = 'settings.html');
    if (btnInfo) btnInfo.addEventListener('click', () => window.location.href = 'info.html');
});