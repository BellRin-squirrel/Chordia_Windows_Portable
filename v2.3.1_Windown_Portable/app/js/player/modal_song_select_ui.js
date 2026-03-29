(function() {
    const s = window.PlayerState;
    const u = window.PlayerUtils;
    const m = window.ModalSongSelect;

    Object.assign(m, {
        isRendered: false, 

        init: function() {
            const playlistList = document.getElementById('playlistList');
            if (playlistList) {
                playlistList.addEventListener('mousedown', (e) => {
                    if (e.button === 2) {
                        const item = e.target.closest('.playlist-item');
                        if (item) {
                            const nameEl = item.querySelector('span');
                            if (nameEl) {
                                const name = nameEl.textContent.trim();
                                const found = s.playlists.find(p => p.playlistName === name);
                                if (found) this._tempContextId = found.id;
                            }
                        }
                    }
                });
            }

            const menuEditSongs = document.getElementById('menuEditSongs');
            if (menuEditSongs) {
                menuEditSongs.addEventListener('click', () => {
                    const itemMenu = document.getElementById('playlistItemMenu');
                    if (itemMenu) itemMenu.style.display = 'none';
                    const targetId = this.findTargetPlaylistId();
                    if (targetId) this.open(targetId);
                    else u.showToast("対象のプレイリストが見つかりません。", true);
                });
            }

            document.getElementById('btnCancelSelect').addEventListener('click', () => this.close());
            document.getElementById('btnSaveSelect').addEventListener('click', () => this.save());

            const searchInput = document.getElementById('songSelectSearch');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => this.filterData(e.target.value));
            }

            this.initMarqueeSelection();
        },

        open: async function(pl_id) {
            const modal = document.getElementById('songSelectModal');

            if (!this.isRendered) {
                const overlay = document.getElementById('savingOverlay');
                overlay.style.display = 'flex';
                const head = overlay.querySelector('.loading-text');
                const org = head.textContent;
                head.textContent = "編集画面を準備中...";

                try {
                    const settings = await eel.get_app_settings()();
                    const allTags = await eel.get_available_tags()();
                    this.activeTags = allTags.filter(t => settings.active_tags.includes(t.key));

                    this.renderHeader();
                    this.libraryData = s.fullLibrary || [];
                    this.filteredData = [...this.libraryData];
                    
                    this.renderList();
                    this.isRendered = true;
                } finally {
                    overlay.style.display = 'none';
                    head.textContent = org;
                }
            }

            this.currentPlaylistId = pl_id;
            const pl = s.playlists.find(p => p.id === pl_id);
            this.selectedFilenames = new Set();
            if (pl && pl.music) {
                pl.music.forEach(fname => this.selectedFilenames.add(fname));
            }

            this.syncSelectedUI();
            modal.classList.add('show');
        },

        close: function() {
            const modal = document.getElementById('songSelectModal');
            if (modal) modal.classList.remove('show');
            this._tempContextId = null;
            const searchInput = document.getElementById('songSelectSearch');
            if (searchInput) {
                searchInput.value = '';
                this.filterData('');
            }
        },

        renderHeader: function() {
            const head = document.getElementById('selectTableHeader');
            if (!head) return;
            let html = `<tr><th class="chk-cell"><input type="checkbox" id="checkAllSongs" class="col-check-box"></th><th class="col-art-small"></th>`;
            this.activeTags.forEach(tag => {
                html += `<th class="sortable col-${tag.key}">${tag.label}</th>`;
            });
            html += `</tr>`;
            head.innerHTML = html;
            const checkAllBtn = document.getElementById('checkAllSongs');
            if (checkAllBtn) {
                checkAllBtn.closest('th').addEventListener('click', (e) => {
                    if (e.target !== checkAllBtn) e.preventDefault();
                    this.toggleAllSelection();
                });
            }
        },

        syncSelectedUI: function() {
            const rows = document.querySelectorAll('#selectTableBody tr');
            rows.forEach(tr => {
                const fname = tr.dataset.fname;
                const isSelected = this.selectedFilenames.has(fname);
                const cb = tr.querySelector('.col-check-box');
                if (isSelected) {
                    tr.classList.add('selected');
                    if(cb) cb.checked = true;
                } else {
                    tr.classList.remove('selected');
                    if(cb) cb.checked = false;
                }
            });
            this.updateHeaderCheckboxState();
        },

        renderList: function() {
            const tbody = document.getElementById('selectTableBody');
            if (!tbody) return;
            tbody.innerHTML = '';
            const fragment = document.createDocumentFragment();

            this.filteredData.forEach((item, index) => {
                const fname = item.musicFilename.split(/[\\/]/).pop();
                const tr = document.createElement('tr');
                tr.className = `select-row`;
                tr.dataset.fname = fname;
                tr.onclick = (e) => { if (e.target.tagName !== 'INPUT') this.handleRowClick(index, e); };

                const artSrc = item.imageData || s.DEFAULT_ICON;
                let cellsHtml = `<td class="chk-cell"><input type="checkbox" class="col-check-box" onchange="window.ModalSongSelect.handleRowClick(${index}, event)"></td><td class="col-art-small"><img src="${artSrc}"></td>`;
                this.activeTags.forEach(tag => {
                    const val = u.escapeHtml(item[tag.key] || '');
                    cellsHtml += `<td class="col-${tag.key}">${val}</td>`;
                });
                tr.innerHTML = cellsHtml;
                fragment.appendChild(tr);
            });

            tbody.appendChild(fragment);
        },

        handleRowClick: function(index, event) {
            const item = this.filteredData[index];
            const fname = item.musicFilename.split(/[\\/]/).pop();

            if (event.shiftKey && this.lastClickedIndex !== null) {
                const start = Math.min(this.lastClickedIndex, index);
                const end = Math.max(this.lastClickedIndex, index);
                const startItem = this.filteredData[this.lastClickedIndex];
                const startFname = startItem.musicFilename.split(/[\\/]/).pop();
                const shouldSelect = this.selectedFilenames.has(startFname);
                for (let i = start; i <= end; i++) {
                    const targetFname = this.filteredData[i].musicFilename.split(/[\\/]/).pop();
                    if (shouldSelect) this.selectedFilenames.add(targetFname);
                    else this.selectedFilenames.delete(targetFname);
                }
            } else {
                if (this.selectedFilenames.has(fname)) this.selectedFilenames.delete(fname);
                else this.selectedFilenames.add(fname);
                this.lastClickedIndex = index;
            }
            this.syncSelectedUI();
        },

        updateHeaderCheckboxState: function() {
            const checkAllBtn = document.getElementById('checkAllSongs');
            if (!checkAllBtn) return;
            const rows = Array.from(document.querySelectorAll('#selectTableBody tr')).filter(r => r.style.display !== 'none');
            if (rows.length === 0) { checkAllBtn.checked = false; checkAllBtn.indeterminate = false; return; }
            let checkedCount = 0;
            rows.forEach(tr => { if (this.selectedFilenames.has(tr.dataset.fname)) checkedCount++; });
            if (checkedCount === 0) { checkAllBtn.checked = false; checkAllBtn.indeterminate = false; }
            else if (checkedCount === rows.length) { checkAllBtn.checked = true; checkAllBtn.indeterminate = false; }
            else { checkAllBtn.checked = false; checkAllBtn.indeterminate = true; }
        },

        toggleAllSelection: function() {
            const checkAllBtn = document.getElementById('checkAllSongs');
            const rows = Array.from(document.querySelectorAll('#selectTableBody tr')).filter(r => r.style.display !== 'none');
            const shouldSelectAll = !checkAllBtn.checked || checkAllBtn.indeterminate;
            rows.forEach(tr => {
                const fname = tr.dataset.fname;
                if (shouldSelectAll) this.selectedFilenames.add(fname);
                else this.selectedFilenames.delete(fname);
            });
            this.syncSelectedUI();
        },

        initMarqueeSelection: function() {
            const container = document.getElementById('songSelectListContainer');
            const marquee = document.getElementById('selectionMarquee');
            if (!container || !marquee) return;
            let isSelecting = false; let startX = 0; let startY = 0;
            container.onmousedown = (e) => {
                if (e.button !== 0 || e.target.closest('tr') || e.target.tagName === 'INPUT') return;
                isSelecting = true;
                const rect = container.getBoundingClientRect();
                startX = e.clientX - rect.left; startY = e.clientY - rect.top + container.scrollTop;
                marquee.style.display = 'block'; marquee.style.width = '0'; marquee.style.height = '0';
                e.preventDefault();
            };
            window.onmousemove = (e) => {
                if (!isSelecting) return;
                const rect = container.getBoundingClientRect();
                const curX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
                const curY = Math.max(0, Math.min(e.clientY - rect.top, rect.height)) + container.scrollTop;
                const x = Math.min(startX, curX); const y = Math.min(startY, curY);
                const w = Math.abs(curX - startX); const h = Math.abs(curY - startY);
                marquee.style.left = x + 'px'; marquee.style.top = (y - container.scrollTop) + 'px';
                marquee.style.width = w + 'px'; marquee.style.height = h + 'px';
                this.selectRowsInMarquee(x, y, w, h, rect, container.scrollTop);
            };
            window.onmouseup = () => { isSelecting = false; marquee.style.display = 'none'; };
        },

        selectRowsInMarquee: function(x, y, w, h, containerRect, scrollY) {
            const rows = Array.from(document.querySelectorAll('#selectTableBody tr')).filter(r => r.style.display !== 'none');
            rows.forEach(row => {
                const r = row.getBoundingClientRect();
                const rTop = r.top - containerRect.top + scrollY;
                const rBot = r.bottom - containerRect.top + scrollY;
                if (!(rBot < y || rTop > y + h)) {
                    const fname = row.dataset.fname;
                    if (!this.selectedFilenames.has(fname)) {
                        this.selectedFilenames.add(fname);
                        row.classList.add('selected');
                        const c = row.querySelector('input'); if(c) c.checked = true;
                    }
                }
            });
            this.updateHeaderCheckboxState();
        }
    });
})();