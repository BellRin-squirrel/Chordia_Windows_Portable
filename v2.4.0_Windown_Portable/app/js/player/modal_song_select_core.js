(function() {
    const s = window.PlayerState;

    window.ModalSongSelect = {
        libraryData: [],
        selectedFilenames: new Set(),
        currentPlaylistId: null,
        sortField: null,
        sortDesc: false,
        lastClickedIndex: null,
        _tempContextId: null,
        activeTags: [],

        findTargetPlaylistId: function() {
            if (this._tempContextId) return this._tempContextId;
            if (window.SidebarController) {
                const side = window.SidebarController;
                for (let key in side) {
                    if (typeof side[key] === 'number' && side[key] !== -1 && s.playlists[side[key]]) {
                        return s.playlists[side[key]].id;
                    }
                }
            }
            return s.currentPlaylistId || null;
        },

        // ★ 修正: 表示を 'table-row' に戻すことでレイアウト崩れを修正
        filterData: function(query) {
            const q = query.toLowerCase().trim();
            const rows = document.querySelectorAll('#selectTableBody tr');
            
            rows.forEach((row, index) => {
                const item = this.libraryData[index];
                const match = !q || (
                    (item.title && item.title.toLowerCase().includes(q)) ||
                    (item.artist && item.artist.toLowerCase().includes(q)) ||
                    (item.album && item.album.toLowerCase().includes(q))
                );
                // display: flex になっていた箇所を修正
                row.style.display = match ? 'table-row' : 'none';
            });
            
            this.lastClickedIndex = null;
            this.updateHeaderCheckboxState();
        },

        sortData: function(field) {
            // 軽量化のため、現在はDOMの再構築を伴うソートは無効化しています。
            // 必要であれば、ここから再レンダリング処理を呼ぶように拡張可能です。
        },

        save: async function() {
            const btn = document.getElementById('btnSaveSelect');
            const originalText = btn.textContent;
            btn.disabled = true; btn.textContent = "保存中...";
            
            try {
                const newSongs = Array.from(this.selectedFilenames);
                const updatedPl = await eel.update_playlist_by_id(this.currentPlaylistId, 'music', newSongs)();
                if (updatedPl) {
                    const idx = s.playlists.findIndex(p => p.id === this.currentPlaylistId);
                    if (idx !== -1) s.playlists[idx] = updatedPl;
                    if (s.currentPlaylistIndex !== -1 && s.playlists[s.currentPlaylistIndex].id === this.currentPlaylistId) {
                        window.MainViewController.renderMainView();
                    }
                    window.PlayerUtils.showToast("プレイリストを更新しました", false);
                    this.close();
                }
            } catch (e) { 
                console.error(e);
                window.PlayerUtils.showToast("保存に失敗しました", true); 
            } finally { 
                btn.disabled = false; btn.textContent = originalText; 
            }
        }
    };
})();