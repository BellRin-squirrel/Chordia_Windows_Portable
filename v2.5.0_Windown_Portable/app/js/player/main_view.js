(function() {
    const s = window.PlayerState;
    const u = window.PlayerUtils;

    window.MainViewController = {
        playerSettings: null,
        selectedTrackIndices: new Set(), 
        lastTrackClickedIndex: null,    

        init: function() {
            const setClick = (id, fn) => {
                const el = document.getElementById(id);
                if (el) el.addEventListener('click', fn);
            };

            setClick('btnPlayAll', () => window.PlayerController.startPlaybackSession('normal'));
            setClick('btnShuffleAll', () => window.PlayerController.startPlaybackSession('shuffle'));
            
            document.addEventListener('click', (e) => {
                const isClickInTable = e.target.closest('.song-table tr');
                const isClickInMenu = e.target.closest('.context-menu');
                if (!isClickInTable && !isClickInMenu) this.clearSelection();

                const trackMenu = document.getElementById('trackContextMenu');
                if (trackMenu) trackMenu.style.display = 'none';

                document.querySelectorAll('.ph-sort-container .custom-select-dropdown').forEach(d => {
                    if (!e.target.closest('.custom-select-wrapper')) d.classList.remove('show');
                });
            });

            this.initInfoModal();
            this.initTrackMenuEvents();
            this.initSmartRemoveModal();
        },

        initInfoModal: function() {
            const modal = document.getElementById('songInfoModal');
            if (!modal) return;
            const btnClose = document.getElementById('btnCloseInfo');
            if (btnClose) btnClose.onclick = () => modal.classList.remove('show');

            const tabs = modal.querySelectorAll('.tab-btn');
            tabs.forEach(btn => {
                btn.onclick = () => {
                    tabs.forEach(b => b.classList.remove('active'));
                    modal.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                    btn.classList.add('active');
                    const pane = document.getElementById(btn.dataset.target);
                    if (pane) pane.classList.add('active');
                };
            });
        },

        initTrackMenuEvents: function() {
            const setClick = (id, fn) => {
                const el = document.getElementById(id);
                if (el) el.onclick = fn;
            };

            setClick('menuSongInfo', () => this.openSongInfoModal());
            
            setClick('menuEditSmartRules', () => {
                const plData = s.playlists[s.currentPlaylistIndex];
                if (window.SidebarController) window.SidebarController.openSmartPlaylistModal(plData);
            });
            
            setClick('menuShowInExplorer', () => {
                const songs = this.getSelectedSongs();
                if (songs.length > 0) eel.open_in_explorer(songs[0].musicFilename)();
            });
            
            setClick('menuRemoveFromPlaylist', async () => {
                const pl = s.playlists[s.currentPlaylistIndex];
                if (!pl) return;
                const songs = this.getSelectedSongs().map(song => song.musicFilename.split(/[\\/]/).pop());
                if (pl.type === 'smart') this.openSmartRemoveConfirmModal(pl.id, songs);
                else {
                    const res = await eel.remove_songs_from_playlist(pl.id, songs)();
                    if (res) { s.playlists[s.currentPlaylistIndex] = res; this.renderMainView(); u.showToast("削除しました", false); }
                }
            });
        },

        initSmartRemoveModal: function() {
            const modal = document.getElementById('smartRemoveConfirmModal');
            if (!modal) return;
            const btnCancel = document.getElementById('btnCancelSmartRemove');
            const btnExec = document.getElementById('btnExecSmartRemove');
            if (btnCancel) btnCancel.onclick = () => modal.classList.remove('show');
            if (btnExec) {
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
            }
        },

        openSmartRemoveConfirmModal: function(plId, songs) {
            const modal = document.getElementById('smartRemoveConfirmModal');
            if (!modal) return;
            modal.dataset.plId = plId;
            modal.dataset.songs = JSON.stringify(songs);
            modal.classList.add('show');
        },

        selectPlaylist: async function(index) {
            if (index === -1 || !s.playlists[index]) return;

            document.querySelectorAll('.playlist-item').forEach(el => el.classList.remove('active'));
            s.currentPlaylistIndex = index;
            s.currentPlaylistType = 'normal';
            this.clearSelection(); 
            window.SidebarController.renderSidebar(); 

            const pl = s.playlists[index];

            if (pl.songs === null) {
                u.showLoading();
                try {
                    u.updateLoadingProgress(0, 0, `「${pl.playlistName}」を読み込み中...`);
                    const details = await eel.get_playlist_details(pl.id)();
                    if (details) {
                        s.playlists[index] = details; 
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
            const isVirtual = s.currentPlaylistType === 'virtual';
            const targetPl = isVirtual ? s.currentVirtualPlaylist : s.playlists[s.currentPlaylistIndex];
            if (!targetPl || !targetPl.songs) return[];

            const sortedSongs = u.sortSongs(targetPl.songs, targetPl.sortBy, targetPl.sortDesc);
            return Array.from(this.selectedTrackIndices).map(idx => sortedSongs[idx]);
        },

        showTrackContextMenu: function(e) {
            const menu = document.getElementById('trackContextMenu');
            if (!menu) return;
            
            const isVirtual = s.currentPlaylistType === 'virtual';
            const pl = isVirtual ? s.currentVirtualPlaylist : s.playlists[s.currentPlaylistIndex];
            if (!pl) return; 
            
            const btnRemove = document.getElementById('menuRemoveFromPlaylist');
            const btnEdit = document.getElementById('menuEditSmartRules');

            if (btnRemove) {
                // 仮想プレイリストの場合は「削除」を非表示にする
                btnRemove.style.display = isVirtual ? 'none' : 'block';
                // ★ 修正: 直前のディバイダー（線）も非表示にする
                const divider = btnRemove.previousElementSibling;
                if (divider && divider.classList.contains('menu-divider')) {
                    divider.style.display = isVirtual ? 'none' : 'block';
                }
            }
            
            if (btnEdit) btnEdit.style.display = (pl.type === 'smart' && !isVirtual) ? 'block' : 'none';

            this.renderPlaylistSubmenu();

            menu.style.position = 'fixed'; 
            menu.style.display = 'block';
            menu.style.visibility = 'hidden';
            
            const mw = 220; const mh = menu.offsetHeight;
            let x = e.clientX; let y = e.clientY;
            if (x + mw > window.innerWidth) x -= mw;
            if (y + mh > window.innerHeight) y -= mh;
            
            menu.style.left = `${x}px`;
            menu.style.top = `${y}px`;
            menu.style.visibility = 'visible';

            const submenu = document.getElementById('playlistSubmenu');
            if (submenu) {
                if (x + mw + 180 > window.innerWidth) submenu.classList.add('left-side');
                else submenu.classList.remove('left-side');
            }
        },

        renderPlaylistSubmenu: function() {
            const container = document.getElementById('playlistSubmenu');
            if (!container) return;
            container.innerHTML = '<ul><li id="subNewPlaylist">新規プレイリスト</li><li class="menu-divider"></li></ul>';
            const ul = container.querySelector('ul');
            s.playlists.forEach(p => {
                if (p.type !== 'smart') {
                    const li = document.createElement('li'); li.textContent = p.playlistName;
                    li.onclick = async () => {
                        const songs = this.getSelectedSongs().map(song => song.musicFilename.split(/[\\/]/).pop());
                        
                        // ★ 修正: 重複チェックのロジック追加
                        let targetPl = s.playlists.find(pl => pl.id === p.id);
                        if (!targetPl.music) {
                            // まだ読み込まれていない場合は詳細を取得
                            targetPl = await eel.get_playlist_details(p.id)();
                        }
                        
                        const existingMusic = targetPl.music ||[];
                        const newSongs = songs.filter(fname => !existingMusic.includes(fname));
                        
                        // すべて追加済みの場合はエラー通知を出して処理を中断
                        if (newSongs.length === 0) {
                            u.showToast(`すでに「${p.playlistName}」に追加されています`, true);
                            return;
                        }

                        // 未追加の楽曲のみを追加
                        const res = await eel.add_songs_to_playlist(p.id, newSongs)();
                        if (res) {
                            const idx = s.playlists.findIndex(pl => pl.id === res.id);
                            if (idx !== -1) s.playlists[idx] = res; // キャッシュを更新
                            
                            if (newSongs.length === songs.length) {
                                u.showToast(`「${p.playlistName}」に追加しました`, false);
                            } else {
                                u.showToast(`未追加の ${newSongs.length} 曲を追加しました`, false);
                            }
                        }
                    };
                    ul.appendChild(li);
                }
            });
            const btnSubNew = document.getElementById('subNewPlaylist');
            if (btnSubNew) {
                btnSubNew.onclick = async () => {
                    const songs = this.getSelectedSongs();
                    const filenames = songs.map(song => song.musicFilename.split(/[\\/]/).pop());
                    const defaultName = songs.length === 1 ? songs[0].title : `${songs.length}個の楽曲`;
                    
                    const newPl = await eel.create_playlist(defaultName, 'normal')();
                    if (filenames.length > 0 && newPl) {
                        await eel.add_songs_to_playlist(newPl.id, filenames)();
                    }
                    await window.SidebarController.loadPlaylists();
                    if (newPl) window.SidebarController.startRenameById(newPl.id);
                };
            }
        },

        openSongInfoModal: async function() {
            const selectedSongs = this.getSelectedSongs();
            if (selectedSongs.length === 0) return;
            const modal = document.getElementById('songInfoModal');
            if (!modal) return;

            const isVirtual = s.currentPlaylistType === 'virtual';
            const plName = isVirtual ? s.currentVirtualName : (s.playlists[s.currentPlaylistIndex] ? s.playlists[s.currentPlaylistIndex].playlistName : "Unknown");

            const imgEl = document.getElementById('infoArt');
            const largeImgEl = document.getElementById('largeArt');
            const titleEl = document.getElementById('infoTitle');
            const artistEl = document.getElementById('infoArtist');
            const albumEl = document.getElementById('infoAlbum');

            if (selectedSongs.length === 1) {
                const song = selectedSongs[0]; 
                if (imgEl) imgEl.src = song.imageData || s.DEFAULT_ICON;
                if (largeImgEl) largeImgEl.src = song.imageData || s.DEFAULT_ICON;
                if (titleEl) titleEl.textContent = song.title || "Unknown Title"; 
                if (artistEl) artistEl.textContent = song.artist || "Unknown Artist";
                if (albumEl) {
                    albumEl.textContent = song.album || ""; 
                    albumEl.style.display = song.album ? "block" : "none";
                }
                const lyrView = document.getElementById('infoLyrics');
                if (lyrView) lyrView.textContent = song.lyric || "歌詞情報はありません。";
            } else {
                const artworks = new Set(selectedSongs.map(song => song.imageData));
                const commonArt = (artworks.size === 1) ? Array.from(artworks)[0] : s.DEFAULT_ICON;
                if (imgEl) imgEl.src = commonArt;
                if (largeImgEl) largeImgEl.src = commonArt;
                if (titleEl) titleEl.textContent = `${selectedSongs.length}個の楽曲を選択中`; 
                if (artistEl) artistEl.textContent = `選択元: ${plName}`;
                if (albumEl) albumEl.style.display = "none"; 
                const lyrView = document.getElementById('infoLyrics');
                if (lyrView) lyrView.textContent = "複数選択時は歌詞を表示できません。";
            }
            const detailsList = document.getElementById('detailsList'); 
            if (detailsList) {
                detailsList.innerHTML = '';
                if (!this.playerSettings) this.playerSettings = await eel.get_app_settings()();
                const allTags = await eel.get_available_tags()();
                const dbTags = allTags.filter(t => this.playerSettings.active_tags.includes(t.key));
                dbTags.forEach(tag => {
                    const row = document.createElement('div'); row.className = 'detail-item';
                    let valText = (selectedSongs.length === 1) ? (selectedSongs[0][tag.key] || "-") : 
                        (new Set(selectedSongs.map(s => s[tag.key] || ""))).size === 1 ? Array.from(new Set(selectedSongs.map(s => s[tag.key] || "")))[0] : "< 複数の値 >";
                    row.innerHTML = `<div class="detail-label">${tag.label}</div><div class="detail-value">${u.escapeHtml(valText)}</div>`;
                    detailsList.appendChild(row);
                });
            }
            const firstTab = modal.querySelector('.tab-btn[data-target="tab-details"]');
            if (firstTab) firstTab.click(); 
            modal.classList.add('show');
        },

        createCustomSelector: function(id, options, currentValue, onSelect) {
            const wrapper = document.createElement('div');
            wrapper.className = 'custom-select-wrapper';
            wrapper.id = `wrapper_${id}`;

            const trigger = document.createElement('button');
            trigger.className = 'custom-select-trigger';
            const currentLabel = options.find(o => o.value === currentValue)?.label || currentValue;
            trigger.innerHTML = `<span>${currentLabel}</span><svg class="custom-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>`;
            
            const dropdown = document.createElement('div');
            dropdown.className = 'custom-select-dropdown';

            options.forEach(opt => {
                const item = document.createElement('div');
                item.className = 'custom-option' + (opt.value === currentValue ? ' active' : '');
                item.innerHTML = `<svg class="custom-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M4.5 12.75l6 6 9-13.5" /></svg><span>${opt.label}</span>`;
                item.onclick = (e) => {
                    e.stopPropagation();
                    trigger.querySelector('span').textContent = opt.label;
                    dropdown.querySelectorAll('.custom-option').forEach(o => o.classList.remove('active'));
                    item.classList.add('active');
                    onSelect(opt.value);
                    dropdown.classList.remove('show');
                };
                dropdown.appendChild(item);
            });

            trigger.onclick = (e) => {
                e.stopPropagation();
                document.querySelectorAll('.custom-select-dropdown').forEach(d => {
                    if (d !== dropdown) d.classList.remove('show');
                });
                dropdown.classList.toggle('show');
            };

            wrapper.appendChild(trigger);
            wrapper.appendChild(dropdown);
            return wrapper;
        },

        renderMainView: async function() {
            const isVirtual = s.currentPlaylistType === 'virtual';
            const target = isVirtual ? s.currentVirtualPlaylist : s.playlists[s.currentPlaylistIndex];

            if (!target || target.songs === null) return;
            if (!this.playerSettings) this.playerSettings = await eel.get_app_settings()();

            const plData = target;
            const isDesc = plData.sortDesc === true;
            const songs = u.sortSongs(plData.songs, plData.sortBy, isDesc);
            const visibleTags = this.playerSettings.player_visible_tags || ['title', 'artist', 'album'];
            
            const titleEl = document.getElementById('currentPlaylistTitle');
            const countEl = document.getElementById('currentPlaylistCount');
            const durEl = document.getElementById('currentPlaylistDuration');
            if (titleEl) titleEl.textContent = plData.playlistName;
            if (countEl) countEl.textContent = `${songs.length} 曲`;
            
            let totalSec = 0;
            songs.forEach(song => {
                if(song.duration && song.duration!=="--:--") {
                    const p = song.duration.split(':');
                    if(p.length===2) totalSec += parseInt(p[0])*60 + parseInt(p[1]);
                }
            });
            if (durEl) durEl.textContent = u.formatTotalDuration(totalSec);

            const sortArea = document.getElementById('phSortArea');
            if (sortArea) {
                sortArea.innerHTML = '';
                
                if (!isVirtual) {
                    let btnEdit = document.createElement('button');
                    btnEdit.className = 'btn-edit-rules';
                    btnEdit.textContent = 'ルールを編集';
                    btnEdit.style.display = (plData.type === 'smart') ? 'inline-block' : 'none';
                    btnEdit.onclick = () => window.SidebarController.openSmartPlaylistModal(plData);
                    sortArea.appendChild(btnEdit);
                }

                const sortLabel = document.createElement('span');
                sortLabel.className = 'ph-sort-label';
                sortLabel.textContent = '並び替え:';
                sortArea.appendChild(sortLabel);

                const allTags = await eel.get_available_tags()();
                const sortOptions = allTags.filter(t => this.playerSettings.active_tags.includes(t.key)).map(t => ({value: t.key, label: t.label}));
                
                const sortKeySelector = this.createCustomSelector('sortKey', sortOptions, plData.sortBy, async (val) => {
                    plData.sortBy = val;
                    if (!isVirtual) await eel.update_playlist_by_id(plData.id, 'sortBy', val)();
                    this.renderMainView();
                });
                sortArea.appendChild(sortKeySelector);

                const orderOptions =[{ value: 'asc', label: '昇順' }, { value: 'desc', label: '降順' }];
                const currentOrder = isDesc ? 'desc' : 'asc';
                const orderSelector = this.createCustomSelector('sortOrder', orderOptions, currentOrder, async (val) => {
                    const isDescending = (val === 'desc');
                    plData.sortDesc = isDescending;
                    if (!isVirtual) await eel.update_playlist_by_id(plData.id, 'sortDesc', isDescending)();
                    this.renderMainView();
                });
                sortArea.appendChild(orderSelector);
            }

            const cover = document.getElementById('playlistCoverArt');
            if (cover) {
                if (songs.length>0 && songs[0].imageData) cover.src = songs[0].imageData;
                else cover.src = s.DEFAULT_ICON;
            }

            const actions = document.getElementById('playlistActions');
            if (actions) actions.style.display = 'flex';
            
            const tbody = document.getElementById('songListBody');
            if (!tbody) return;
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
            window.PlayerController.startPlaybackSession('normal', idx);
        }
    };
})();