(function() {
    const s = window.PlayerState;
    const u = window.PlayerUtils;

    window.MainViewController = {
        playerSettings: null,
        selectedTrackIndices: new Set(), 
        lastTrackClickedIndex: null,    

        init: function() {
            document.getElementById('btnPlayAll').addEventListener('click', () => window.PlayerController.startPlaybackSession('normal'));
            document.getElementById('btnShuffleAll').addEventListener('click', () => window.PlayerController.startPlaybackSession('shuffle'));
            
            const btnEditRules = document.createElement('button');
            btnEditRules.id = 'btnEditRules';
            btnEditRules.className = 'btn-edit-rules';
            btnEditRules.textContent = 'ルールを編集';
            btnEditRules.onclick = () => {
                const plData = s.playlists[s.currentPlaylistIndex];
                if (window.SidebarController) window.SidebarController.openSmartPlaylistModal(plData);
            };

            document.addEventListener('click', (e) => {
                const isClickInTable = e.target.closest('.song-table tr');
                const isClickInMenu = e.target.closest('.context-menu');
                if (!isClickInTable && !isClickInMenu) this.clearSelection();
                const trackMenu = document.getElementById('trackContextMenu');
                if (trackMenu) trackMenu.style.display = 'none';
            });

            this.initInfoModal();
            this.initTrackMenuEvents();
            this.initSmartRemoveModal();
        },

        initInfoModal: function() {
            const modal = document.getElementById('songInfoModal');
            const btnClose = document.getElementById('btnCloseInfo');
            if (btnClose) btnClose.onclick = () => modal.classList.remove('show');
            const tabs = modal.querySelectorAll('.tab-btn');
            tabs.forEach(btn => {
                btn.onclick = () => {
                    tabs.forEach(b => b.classList.remove('active'));
                    modal.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                    btn.classList.add('active');
                    document.getElementById(btn.dataset.target).classList.add('active');
                };
            });
        },

        initTrackMenuEvents: function() {
            document.getElementById('menuSongInfo').onclick = () => this.openSongInfoModal();
            document.getElementById('menuEditSmartRules').onclick = () => {
                const plData = s.playlists[s.currentPlaylistIndex];
                if (window.SidebarController) window.SidebarController.openSmartPlaylistModal(plData);
            };
            document.getElementById('menuShowInExplorer').onclick = () => {
                const songs = this.getSelectedSongs();
                if (songs.length > 0) eel.open_in_explorer(songs[0].musicFilename)();
            };
            document.getElementById('menuRemoveFromPlaylist').onclick = async () => {
                const pl = s.playlists[s.currentPlaylistIndex];
                const songs = this.getSelectedSongs().map(song => song.musicFilename.split(/[\\/]/).pop());
                if (pl.type === 'smart') this.openSmartRemoveConfirmModal(pl.id, songs);
                else {
                    const res = await eel.remove_songs_from_playlist(pl.id, songs)();
                    if (res) { s.playlists[s.currentPlaylistIndex] = res; this.renderMainView(); u.showToast("削除しました", false); }
                }
            };
        },

        initSmartRemoveModal: function() {
            const modal = document.getElementById('smartRemoveConfirmModal');
            const btnCancel = document.getElementById('btnCancelSmartRemove');
            const btnExec = document.getElementById('btnExecSmartRemove');
            btnCancel.onclick = () => modal.classList.remove('show');
            btnExec.onclick = async () => {
                modal.classList.remove('show');
                window.SidebarController.showSaving();
                const plId = modal.dataset.plId;
                const songs = JSON.parse(modal.dataset.songs);
                try {
                    const res = await eel.convert_smart_to_normal_and_remove_songs(plId, songs)();
                    if (res) {
                        await window.SidebarController.loadPlaylists();
                        const newIdx = s.playlists.findIndex(p => p.id === plId);
                        if (newIdx !== -1) window.MainViewController.selectPlaylist(newIdx);
                        u.showToast("通常プレイリストに変換し削除しました", false);
                    }
                } catch (e) { u.showToast("処理に失敗しました", true); } finally { window.SidebarController.hideSaving(); }
            };
        },

        openSmartRemoveConfirmModal: function(plId, songs) {
            const modal = document.getElementById('smartRemoveConfirmModal');
            modal.dataset.plId = plId;
            modal.dataset.songs = JSON.stringify(songs);
            modal.classList.add('show');
        },

        // ★修正: 遅延ロードロジックを追加
        selectPlaylist: async function(index) {
            if (index === -1 || !s.playlists[index]) return;

            document.querySelectorAll('.playlist-item').forEach(el => el.classList.remove('active'));
            s.currentPlaylistIndex = index;
            this.clearSelection(); 
            window.SidebarController.renderSidebar(); 

            const pl = s.playlists[index];

            // まだ一度も読み込まれていなければ Python から取得
            if (pl.songs === null) {
                u.showLoading();
                try {
                    u.updateLoadingProgress(0, 0, `「${pl.playlistName}」を読み込み中...`);
                    const details = await eel.get_playlist_details(pl.id)();
                    if (details) {
                        s.playlists[index] = details; // キャッシュに保存
                    }
                } catch (e) {
                    console.error(e);
                    u.showToast("プレイリストの読み込みに失敗しました", true);
                } finally {
                    u.hideLoading();
                }
            }

            this.renderMainView();
        },

        clearSelection: function() {
            this.selectedTrackIndices.clear();
            this.lastTrackClickedIndex = null;
            this.updateSelectionUI();
        },

        updateSelectionUI: function() {
            const rows = document.querySelectorAll('.song-table tbody tr');
            rows.forEach((tr, idx) => {
                if (this.selectedTrackIndices.has(idx)) tr.classList.add('selected');
                else tr.classList.remove('selected');
            });
        },

        handleRowClick: function(index, event) {
            if (event.shiftKey && this.lastTrackClickedIndex !== null) {
                const start = Math.min(this.lastTrackClickedIndex, index);
                const end = Math.max(this.lastTrackClickedIndex, index);
                this.selectedTrackIndices.clear();
                for (let i = start; i <= end; i++) this.selectedTrackIndices.add(i);
            } else {
                this.selectedTrackIndices.clear();
                this.selectedTrackIndices.add(index);
                this.lastTrackClickedIndex = index;
            }
            this.updateSelectionUI();
        },

        getSelectedSongs: function() {
            if (s.currentPlaylistIndex === -1) return [];
            const pl = s.playlists[s.currentPlaylistIndex];
            const sortedSongs = u.sortSongs(pl.songs, pl.sortBy, pl.sortDesc);
            return Array.from(this.selectedTrackIndices).map(idx => sortedSongs[idx]);
        },

        showTrackContextMenu: function(e) {
            const menu = document.getElementById('trackContextMenu');
            const pl = s.playlists[s.currentPlaylistIndex];
            document.getElementById('menuEditSmartRules').style.display = (pl.type === 'smart') ? 'block' : 'none';
            this.renderPlaylistSubmenu();
            menu.style.display = 'block'; menu.style.visibility = 'hidden'; 
            const mw = 220; const mh = menu.offsetHeight;
            let x = e.clientX; let y = e.clientY;
            if (x + mw > window.innerWidth) x -= mw;
            if (y + mh > window.innerHeight) y -= mh;
            menu.style.left = `${x}px`; menu.style.top = `${y}px`; menu.style.visibility = 'visible';
            const submenu = document.getElementById('playlistSubmenu');
            if (x + mw + 180 > window.innerWidth) submenu.classList.add('left-side');
            else submenu.classList.remove('left-side');
        },

        renderPlaylistSubmenu: function() {
            const container = document.getElementById('playlistSubmenu');
            container.innerHTML = '<ul><li id="subNewPlaylist">新規プレイリスト</li><li class="menu-divider"></li></ul>';
            const ul = container.querySelector('ul');
            s.playlists.forEach(p => {
                if (p.type !== 'smart') {
                    const li = document.createElement('li'); li.textContent = p.playlistName;
                    li.onclick = async () => {
                        const songs = this.getSelectedSongs().map(song => song.musicFilename.split(/[\\/]/).pop());
                        const res = await eel.add_songs_to_playlist(p.id, songs)();
                        // 追加された側が現在開いているプレイリストなら、そちらもキャッシュをクリアするか更新する必要があるが、
                        // ここでは簡易的にトースト通知のみ
                        if (res) u.showToast(`「${p.playlistName}」に追加しました`, false);
                    };
                    ul.appendChild(li);
                }
            });
            document.getElementById('subNewPlaylist').onclick = async () => {
                const songs = this.getSelectedSongs();
                const filenames = songs.map(song => song.musicFilename.split(/[\\/]/).pop());
                const defaultName = songs.length === 1 ? songs[0].title : `${songs.length}個の楽曲`;
                const newPl = await eel.create_playlist(defaultName, 'normal')();
                if (filenames.length > 0 && newPl) await eel.add_songs_to_playlist(newPl.id, filenames)();
                await window.SidebarController.loadPlaylists();
                if (newPl) window.SidebarController.startRenameById(newPl.id);
            };
        },

        openSongInfoModal: async function() {
            const selectedSongs = this.getSelectedSongs();
            if (selectedSongs.length === 0) return;
            const modal = document.getElementById('songInfoModal');
            const pl = s.playlists[s.currentPlaylistIndex];
            const imgEl = document.getElementById('infoArt');
            const largeImgEl = document.getElementById('largeArt');
            const titleEl = document.getElementById('infoTitle');
            const artistEl = document.getElementById('infoArtist');
            const albumEl = document.getElementById('infoAlbum');
            if (selectedSongs.length === 1) {
                const song = selectedSongs[0]; imgEl.src = largeImgEl.src = song.imageData || s.DEFAULT_ICON;
                titleEl.textContent = song.title || "Unknown Title"; artistEl.textContent = song.artist || "Unknown Artist";
                albumEl.textContent = song.album || ""; albumEl.style.display = song.album ? "block" : "none";
                document.getElementById('infoLyrics').textContent = song.lyric || "歌詞情報はありません。";
            } else {
                const artworks = new Set(selectedSongs.map(song => song.imageData));
                imgEl.src = largeImgEl.src = (artworks.size === 1) ? Array.from(artworks)[0] : s.DEFAULT_ICON;
                titleEl.textContent = `${selectedSongs.length}個の楽曲を選択中`; artistEl.textContent = `選択元: ${pl.playlistName}`;
                albumEl.style.display = "none"; document.getElementById('infoLyrics').textContent = "複数選択時は歌詞を表示できません。";
            }
            const detailsList = document.getElementById('detailsList'); detailsList.innerHTML = '';
            if (!this.playerSettings) this.playerSettings = await eel.get_app_settings()();
            const allTags = await eel.get_available_tags()();
            const dbTags = allTags.filter(t => this.playerSettings.active_tags.includes(t.key));
            dbTags.forEach(tag => {
                const row = document.createElement('div'); row.className = 'detail-item';
                let valText = (selectedSongs.length === 1) ? (selectedSongs[0][tag.key] || "-") : 
                    (new Set(selectedSongs.map(s => s[tag.key] || ""))).size === 1 ? Array.from(new Set(selectedSongs.map(s => s[tag.key] || "")))[0] : "< 複数の値 >";
                row.innerHTML = `<div class="detail-label">${tag.label}</div><div class="detail-value">${u.escapeHtml(valText || "-")}</div>`;
                detailsList.appendChild(row);
            });
            modal.querySelector('.tab-btn[data-target="tab-details"]').click(); modal.classList.add('show');
        },

        renderMainView: async function() {
            if (s.currentPlaylistIndex === -1 || !s.playlists[s.currentPlaylistIndex] || s.playlists[s.currentPlaylistIndex].songs === null) return;
            if (!this.playerSettings) this.playerSettings = await eel.get_app_settings()();

            const plData = s.playlists[s.currentPlaylistIndex];
            const isDesc = plData.sortDesc === true;
            const songs = u.sortSongs(plData.songs, plData.sortBy, isDesc);
            const visibleTags = this.playerSettings.player_visible_tags || ['title', 'artist', 'album'];
            
            document.getElementById('currentPlaylistTitle').textContent = plData.playlistName;
            document.getElementById('currentPlaylistCount').textContent = `${songs.length} 曲`;
            
            let totalSec = 0;
            songs.forEach(song => {
                if(song.duration && song.duration!=="--:--") {
                    const p = song.duration.split(':');
                    if(p.length===2) totalSec += parseInt(p[0])*60 + parseInt(p[1]);
                }
            });
            document.getElementById('currentPlaylistDuration').textContent = u.formatTotalDuration(totalSec);

            const sortArea = document.getElementById('phSortArea');
            sortArea.innerHTML = '';
            let btnEdit = document.getElementById('btnEditRules');
            if (!btnEdit) {
                btnEdit = document.createElement('button');
                btnEdit.id = 'btnEditRules';
                btnEdit.className = 'btn-edit-rules';
                btnEdit.textContent = 'ルールを編集';
                btnEdit.onclick = () => {
                    const plData = s.playlists[s.currentPlaylistIndex];
                    if (window.SidebarController) window.SidebarController.openSmartPlaylistModal(plData);
                };
            }
            btnEdit.style.display = (plData.type === 'smart') ? 'inline-block' : 'none';
            sortArea.appendChild(btnEdit);

            const sortLabel = document.createElement('span');
            sortLabel.className = 'ph-sort-label';
            sortLabel.textContent = '並び替え:';
            sortArea.appendChild(sortLabel);

            const sortSelect = document.createElement('select');
            sortSelect.className = 'ph-sort-select';
            const allTags = await eel.get_available_tags()();
            const sortTags = allTags.filter(t => this.playerSettings.active_tags.includes(t.key));
            sortTags.forEach(tag => {
                const opt = document.createElement('option');
                opt.value = tag.key; opt.textContent = tag.label;
                if (plData.sortBy === tag.key) opt.selected = true;
                sortSelect.appendChild(opt);
            });
            sortSelect.onchange = async (e) => {
                const newSort = e.target.value;
                plData.sortBy = newSort;
                await eel.update_playlist_by_id(plData.id, 'sortBy', newSort)();
                this.renderMainView(); 
            };
            sortArea.appendChild(sortSelect);

            const orderSelect = document.createElement('select');
            orderSelect.className = 'ph-sort-select';
            const optAsc = document.createElement('option');
            optAsc.value = "asc"; optAsc.textContent = "昇順";
            const optDesc = document.createElement('option');
            optDesc.value = "desc"; optDesc.textContent = "降順";
            if (isDesc) optDesc.selected = true; else optAsc.selected = true;
            orderSelect.appendChild(optAsc);
            orderSelect.appendChild(optDesc);
            orderSelect.onchange = async (e) => {
                const isDescending = (e.target.value === "desc");
                plData.sortDesc = isDescending;
                await eel.update_playlist_by_id(plData.id, 'sortDesc', isDescending)();
                this.renderMainView();
            };
            sortArea.appendChild(orderSelect);

            const cover = document.getElementById('playlistCoverArt');
            if (songs.length>0 && songs[0].imageData) cover.src = songs[0].imageData;
            else cover.src = s.DEFAULT_ICON;

            document.getElementById('playlistActions').style.display = 'flex';
            const tbody = document.getElementById('songListBody');
            tbody.innerHTML = '';
            
            songs.forEach((song, idx) => {
                const tr = document.createElement('tr');
                const isPlaying = window.PlayerController.isSongPlaying(song);
                if (isPlaying) tr.classList.add('current-playing');
                if (this.selectedTrackIndices.has(idx)) tr.classList.add('selected');
                const artSrc = song.imageData || s.DEFAULT_ICON;
                let rowHtml = `
                    <td class="col-status">${isPlaying ? s.ICON_PLAYING : ''}</td>
                    <td class="col-art">
                        <div class="art-container">
                            <img src="${artSrc}">
                            <div class="art-overlay" onclick="event.stopPropagation(); window.MainViewController.playTrackAtIndex(${idx})">${s.SVG_PLAY}</div>
                        </div>
                    </td>
                `;
                visibleTags.forEach(tagKey => {
                    const val = u.escapeHtml(song[tagKey] || '');
                    rowHtml += `<td class="col-${tagKey}" title="${val}">${val}</td>`;
                });
                rowHtml += `<td class="col-time">${song.duration}</td>`;
                tr.innerHTML = rowHtml;
                tr.onclick = (e) => this.handleRowClick(idx, e);
                tr.oncontextmenu = (e) => {
                    e.preventDefault();
                    if (!this.selectedTrackIndices.has(idx)) this.handleRowClick(idx, e);
                    this.showTrackContextMenu(e);
                };
                tr.ondblclick = (e) => {
                    if (e.target.closest('.art-container')) return;
                    window.PlayerController.startPlaybackSession('normal', idx);
                };
                tbody.appendChild(tr);
            });
        },

        playTrackAtIndex: function(idx) {
            s.isShuffle = false; 
            s.loopMode = 'off';
            window.PlayerController.startPlaybackSession('normal', idx);
        }
    };
})();