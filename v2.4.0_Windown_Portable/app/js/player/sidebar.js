(function() {
    const s = window.PlayerState;
    const u = window.PlayerUtils;

    window.SidebarController = {
        
        deleteTargetIndex: -1,
        smartTags: [],
        editingSmartId: null, 

        textOps: [
            {val: 'contains', label: 'を含む'},
            {val: 'not_contains', label: 'を含まない'},
            {val: 'equals', label: 'である'},
            {val: 'not_equals', label: 'ではない'},
            {val: 'startswith', label: 'で始まる'},
            {val: 'endswith', label: 'で終わる'}
        ],
        numOps: [
            {val: 'equals', label: 'である'},
            {val: 'not_equals', label: 'ではない'},
            {val: 'greater', label: 'より大きい'},
            {val: 'less', label: 'より小さい'},
            {val: 'range', label: 'の範囲内'}
        ],

        init: function() {
            this.sidebar = document.getElementById('sidebar');
            this.playlistList = document.getElementById('playlistList');
            
            document.addEventListener('click', () => {
                const bg = document.getElementById('playlistBackgroundMenu');
                const it = document.getElementById('playlistItemMenu');
                const tr = document.getElementById('trackContextMenu');
                if(bg) bg.style.display='none';
                if(it) it.style.display='none';
                if(tr) tr.style.display='none';
            });
            
            if (this.sidebar) {
                this.sidebar.addEventListener('contextmenu', (e) => {
                    if (!e.target.closest('.playlist-item')) {
                        e.preventDefault();
                        const menu = document.getElementById('playlistBackgroundMenu');
                        if (menu) window.SidebarController.showContextMenu(menu, e.clientX, e.clientY);
                    }
                });
            }

            // Menu Actions
            const menuNew = document.getElementById('menuNewPlaylist');
            if(menuNew) menuNew.addEventListener('click', () => { 
                s.editingPlaylistIndex = 'new'; 
                window.SidebarController.renderSidebar(); 
            });

            const menuNewSmart = document.getElementById('menuNewSmartPlaylist');
            if(menuNewSmart) menuNewSmart.addEventListener('click', () => { 
                window.SidebarController.openSmartPlaylistModal();
            });

            const btnCancelSmart = document.getElementById('btnCancelSmart');
            if(btnCancelSmart) btnCancelSmart.addEventListener('click', () => {
                document.getElementById('smartPlaylistModal').classList.remove('show');
            });

            const btnCreateSmart = document.getElementById('btnCreateSmart');
            if(btnCreateSmart) btnCreateSmart.addEventListener('click', () => {
                window.SidebarController.finishCreateSmart();
            });

            const menuPlay = document.getElementById('menuPlayPlaylist');
            if(menuPlay) menuPlay.addEventListener('click', () => {
                window.MainViewController.selectPlaylist(s.contextTargetIndex);
                window.PlayerController.startPlaybackSession('normal');
            });

            const menuShuffle = document.getElementById('menuShufflePlaylist');
            if(menuShuffle) menuShuffle.addEventListener('click', () => {
                window.MainViewController.selectPlaylist(s.contextTargetIndex);
                window.PlayerController.startPlaybackSession('shuffle');
            });

            const menuRename = document.getElementById('menuRenamePlaylist');
            if(menuRename) menuRename.addEventListener('click', () => {
                s.editingPlaylistIndex = s.contextTargetIndex;
                window.SidebarController.renderSidebar();
            });

            const menuDup = document.getElementById('menuDuplicatePlaylist');
            if(menuDup) menuDup.addEventListener('click', async () => {
                window.SidebarController.showSaving();
                const plId = s.playlists[s.contextTargetIndex].id;
                const newPl = await eel.duplicate_playlist_by_id(plId)();
                if (newPl) {
                    s.playlists.push(newPl);
                    s.playlists.sort((a, b) => (a.playlistName||"").toLowerCase().localeCompare((b.playlistName||"").toLowerCase(), 'ja'));
                    window.SidebarController.renderSidebar();
                }
                window.SidebarController.hideSaving();
                u.showToast("複製しました", false);
            });

            const menuDel = document.getElementById('menuDeletePlaylist');
            if(menuDel) menuDel.addEventListener('click', () => {
                window.SidebarController.openDeleteModal(s.contextTargetIndex);
            });

            const btnCancelDel = document.getElementById('btnCancelDelPl');
            const btnExecDel = document.getElementById('btnExecDelPl');
            if(btnCancelDel) btnCancelDel.addEventListener('click', () => document.getElementById('playlistDeleteModal').classList.remove('show'));
            if(btnExecDel) btnExecDel.addEventListener('click', () => window.SidebarController.executeDelete());

            const btnCancelSmartRemove = document.getElementById('btnCancelSmartRemove');
            if(btnCancelSmartRemove) btnCancelSmartRemove.onclick = () => document.getElementById('smartRemoveConfirmModal').classList.remove('show');

            document.addEventListener('keydown', (e) => {
                if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
                if (e.key === 'F2') {
                    if (s.currentPlaylistIndex !== -1) { e.preventDefault(); s.editingPlaylistIndex = s.currentPlaylistIndex; window.SidebarController.renderSidebar(); }
                }
                if (e.key === 'Delete') {
                    if (s.currentPlaylistIndex !== -1) { e.preventDefault(); window.SidebarController.openDeleteModal(s.currentPlaylistIndex); }
                }
            });
        },

        startRenameById: function(plId) {
            const idx = s.playlists.findIndex(p => p.id === plId);
            if (idx !== -1) {
                s.editingPlaylistIndex = idx;
                this.renderSidebar();
            }
        },

        showSaving: function() { 
            const el = document.getElementById('savingOverlay');
            if(el) el.style.display = 'flex'; 
        },
        hideSaving: function() { 
            const el = document.getElementById('savingOverlay');
            if(el) el.style.display = 'none'; 
        },

        loadPlaylists: async function() {
            u.showLoading();
            try {
                // 設定を取得
                const settings = await eel.get_app_settings()();
                
                u.updateLoadingProgress(0, 0, "楽曲一覧を取得中...");
                s.fullLibrary = await eel.get_library_data_with_meta(true)();

                u.updateLoadingProgress(0, 0, "プレイリスト一覧を取得中...");
                const summaries = await eel.get_playlist_summaries()();
                summaries.sort((a, b) => (a.playlistName||"").toLowerCase().localeCompare((b.playlistName||"").toLowerCase(), 'ja'));
                
                s.playlists = summaries.map(pl => ({...pl, songs: null}));

                // ★ 設定が「遅延読み込みオフ（事前読み込みオン）」の場合
                if (!settings.lazy_load_playlists) {
                    const total = s.playlists.length;
                    for (let i = 0; i < total; i++) {
                        const pl = s.playlists[i];
                        u.updateLoadingProgress(i + 1, total, `「${pl.playlistName}」を読み込み中...`);
                        const details = await eel.get_playlist_details(pl.id)();
                        if (details) {
                            s.playlists[i] = details;
                        }
                    }
                    
                    // すべて読み込んだので最初のプレイリストを表示
                    if (s.playlists.length > 0) {
                        window.MainViewController.selectPlaylist(0);
                    }
                }

                window.SidebarController.renderSidebar();

            } catch (e) { 
                console.error("Load Error:", e); 
                u.showToast("読み込み中にエラーが発生しました", true);
            } finally { 
                u.hideLoading(); 
            }
        },

        renderSidebar: function() {
            if(!this.playlistList) return;
            this.playlistList.innerHTML = '';
            
            s.playlists.forEach((pl, index) => {
                const li = document.createElement('li');
                li.className = 'playlist-item';
                
                const isSmart = pl.type === 'smart';
                const iconSvg = isSmart ? 
                    `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:20px;height:20px;"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>` :
                    `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:20px;height:20px;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163z" /></svg>`;

                if (index === s.editingPlaylistIndex) {
                    li.innerHTML = iconSvg;
                    const input = document.createElement('input');
                    input.type = 'text'; input.value = pl.playlistName; input.className = 'playlist-name-input';
                    let cancelled = false;
                    input.onblur = () => { if(!cancelled) window.SidebarController.finishRename(index, input.value); };
                    input.onkeydown = (e) => {
                        if(e.key === 'Enter') input.blur();
                        else if(e.key === 'Escape') { cancelled = true; s.editingPlaylistIndex = -1; window.SidebarController.renderSidebar(); }
                    };
                    li.appendChild(input); setTimeout(()=>input.select(), 0);
                } else {
                    li.innerHTML = `${iconSvg}<span>${u.escapeHtml(pl.playlistName)}</span>`;
                    li.onclick = () => {
                        if(window.MainViewController) window.MainViewController.playerSettings = null;
                        window.MainViewController.selectPlaylist(index);
                    };
                    li.addEventListener('contextmenu', (e) => {
                        e.preventDefault(); e.stopPropagation(); s.contextTargetIndex = index;
                        const menu = document.getElementById('playlistItemMenu');
                        if (menu) window.SidebarController.showContextMenu(menu, e.clientX, e.clientY);
                    });
                }
                this.playlistList.appendChild(li);
            });

            if (s.editingPlaylistIndex === 'new') this.createTemporaryInput('normal');

            if (s.currentPlaylistIndex >= 0 && s.playlists[s.currentPlaylistIndex]) {
                const items = this.playlistList.querySelectorAll('.playlist-item');
                if(items[s.currentPlaylistIndex]) items[s.currentPlaylistIndex].classList.add('active');
            }
        },

        createTemporaryInput: function(type = 'normal') {
            const li = document.createElement('li');
            li.className = 'playlist-item';
            const iconSvg = type === 'smart' ? 
                `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:20px;height:20px;"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>` :
                `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:20px;height:20px;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163z" /></svg>`;
            
            li.innerHTML = iconSvg;
            const input = document.createElement('input');
            input.type='text'; 
            input.value = type === 'smart' ? "新規スマートプレイリスト" : "新規プレイリスト"; 
            input.className='playlist-name-input';
            let cancelled=false;
            input.onblur=()=>{ if(!cancelled) window.SidebarController.finishCreate(input.value, type); };
            input.onkeydown=(e)=>{ 
                if(e.key==='Enter') input.blur(); 
                else if(e.key==='Escape') { cancelled=true; s.editingPlaylistIndex=-1; window.SidebarController.renderSidebar(); }
            };
            li.appendChild(input); this.playlistList.appendChild(li); setTimeout(()=>input.select(), 0);
        },

        openSmartPlaylistModal: async function(existingPl = null) {
            try {
                const settings = await eel.get_app_settings()();
                const allTags = await eel.get_available_tags()();
                const activeTags = settings.active_tags; 
                this.smartTags = allTags.filter(t => activeTags.includes(t.key));
                this.smartTags.push({key: 'lyric', label: '歌詞'});

                const modalTitle = document.querySelector('#smartPlaylistModal h3');
                const nameInput = document.getElementById('smartPlaylistName');
                const nameContainer = document.getElementById('smartPlaylistNameContainer');
                const btnCreate = document.getElementById('btnCreateSmart');
                const rootContainer = document.getElementById('smartConditionRoot');
                rootContainer.innerHTML = '';
                nameInput.classList.remove('input-error');

                if (existingPl) {
                    this.editingSmartId = existingPl.id;
                    modalTitle.textContent = "スマートプレイリストを編集";
                    nameContainer.style.display = 'none'; 
                    nameInput.value = existingPl.playlistName;
                    btnCreate.textContent = "保存";
                    const buildUI = (rules, container, isRoot) => {
                        if (rules.type === 'group') {
                            const groupWrap = window.SidebarController.createConditionGroup(isRoot);
                            groupWrap.querySelector('.smart-group-match').value = rules.match;
                            const groupBody = groupWrap.querySelector('.smart-group-body');
                            groupBody.innerHTML = ''; 
                            rules.items.forEach(item => buildUI(item, groupBody, false));
                            container.appendChild(groupWrap);
                        } else {
                            const filterRow = window.SidebarController.createFilterRow();
                            filterRow.querySelector('.smart-filter-tag').value = rules.tag;
                            const event = new Event('change');
                            filterRow.querySelector('.smart-filter-tag').dispatchEvent(event);
                            filterRow.querySelector('.smart-filter-op').value = rules.op;
                            filterRow.querySelector('.smart-filter-op').dispatchEvent(event);
                            const inputs = filterRow.querySelectorAll('.smart-input');
                            if (Array.isArray(rules.val)) { inputs[0].value = rules.val[0]; inputs[1].value = rules.val[1]; } 
                            else { if (inputs[0]) inputs[0].value = rules.val; }
                            container.appendChild(filterRow);
                        }
                    };
                    buildUI(existingPl.conditions, rootContainer, true);
                } else {
                    this.editingSmartId = null;
                    modalTitle.textContent = "スマートプレイリストを新規作成";
                    nameContainer.style.display = 'block'; 
                    nameInput.value = "";
                    btnCreate.textContent = "作成";
                    rootContainer.appendChild(window.SidebarController.createConditionGroup(true));
                }
                window.SidebarController.updateAllMinusButtons();
                const modal = document.getElementById('smartPlaylistModal');
                if(modal) modal.classList.add('show');
            } catch(e) { 
                console.error("Open Smart Modal Error:", e);
                u.showToast("設定の読み込みに失敗しました", true); 
            }
        },

        createConditionGroup: function(isRoot) {
            const groupWrap = document.createElement('div');
            groupWrap.className = 'smart-group-wrapper';
            groupWrap.style.marginBottom = '12px';
            const groupHeader = document.createElement('div');
            groupHeader.className = 'smart-group-header';
            const matchSelect = document.createElement('select');
            matchSelect.className = 'smart-tag-select smart-group-match';
            matchSelect.innerHTML = `<option value="all">すべての</option><option value="any">いずれかの</option>`;
            const textSpan = document.createElement('span');
            textSpan.className = 'smart-text';
            textSpan.textContent = 'ルールに一致';
            const spacer = document.createElement('div');
            spacer.style.flex = "1";
            groupHeader.appendChild(matchSelect);
            groupHeader.appendChild(textSpan);
            groupHeader.appendChild(spacer);
            const btnContainer = document.createElement('div');
            btnContainer.className = 'smart-btn-container';
            const btnMinus = document.createElement('button');
            btnMinus.className = 'smart-row-btn minus group-minus';
            btnMinus.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 12h-15" /></svg>`;
            const btnPlus = document.createElement('button');
            btnPlus.className = 'smart-row-btn plus';
            btnPlus.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>`;
            const btnMore = document.createElement('button');
            btnMore.className = 'smart-row-btn more';
            btnMore.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" /></svg>`;
            if (isRoot) {
                btnMinus.disabled = btnPlus.disabled = btnMore.disabled = true;
                btnMinus.classList.add('disabled'); btnPlus.classList.add('disabled'); btnMore.classList.add('disabled');
            } else {
                btnMinus.onclick = () => { groupWrap.remove(); window.SidebarController.updateAllMinusButtons(); };
                btnPlus.onclick = () => { groupWrap.parentElement.insertBefore(window.SidebarController.createFilterRow(), groupWrap.nextSibling); window.SidebarController.updateAllMinusButtons(); };
                btnMore.onclick = () => { groupWrap.parentElement.insertBefore(window.SidebarController.createConditionGroup(false), groupWrap.nextSibling); window.SidebarController.updateAllMinusButtons(); };
            }
            btnContainer.appendChild(btnMinus); btnContainer.appendChild(btnPlus); btnContainer.appendChild(btnMore);
            groupHeader.appendChild(btnContainer);
            const groupBody = document.createElement('div');
            groupBody.className = 'smart-group-body';
            groupBody.style.paddingLeft = '24px'; groupBody.style.borderLeft = '2px solid rgba(128,128,128,0.2)';
            groupBody.appendChild(window.SidebarController.createFilterRow());
            groupWrap.appendChild(groupHeader); groupWrap.appendChild(groupBody);
            return groupWrap;
        },

        createFilterRow: function() {
            const row = document.createElement('div');
            row.className = 'smart-condition-row';
            const tagSelect = document.createElement('select');
            tagSelect.className = 'smart-tag-select smart-filter-tag';
            window.SidebarController.smartTags.forEach(t => { const opt = document.createElement('option'); opt.value = t.key; opt.textContent = t.label; tagSelect.appendChild(opt); });
            const defaultTag = window.SidebarController.smartTags.some(t => t.key === 'artist') ? 'artist' : window.SidebarController.smartTags[0].key;
            tagSelect.value = defaultTag;
            const textSpan = document.createElement('span');
            textSpan.className = 'smart-text'; textSpan.textContent = 'が';
            const inputContainer = document.createElement('div');
            inputContainer.className = 'smart-input-container';
            const opSelect = document.createElement('select');
            opSelect.className = 'smart-op-select smart-filter-op';
            const btnContainer = document.createElement('div');
            btnContainer.className = 'smart-btn-container';
            const btnMinus = document.createElement('button');
            btnMinus.className = 'smart-row-btn minus filter-minus';
            btnMinus.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 12h-15" /></svg>`;
            btnMinus.onclick = () => { row.remove(); window.SidebarController.updateAllMinusButtons(); };
            const btnPlus = document.createElement('button');
            btnPlus.className = 'smart-row-btn plus';
            btnPlus.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>`;
            btnPlus.onclick = () => { row.parentElement.insertBefore(window.SidebarController.createFilterRow(), row.nextSibling); window.SidebarController.updateAllMinusButtons(); };
            const btnMore = document.createElement('button');
            btnMore.className = 'smart-row-btn more';
            btnMore.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" /></svg>`;
            btnMore.onclick = () => { row.parentElement.insertBefore(window.SidebarController.createConditionGroup(false), row.nextSibling); window.SidebarController.updateAllMinusButtons(); };
            btnContainer.appendChild(btnMinus); btnContainer.appendChild(btnPlus); btnContainer.appendChild(btnMore);
            const updateRow = () => {
                const tag = tagSelect.value;
                const isNum = ['track', 'year', 'disc', 'bpm'].includes(tag);
                const prevInputs = inputContainer.querySelectorAll('.smart-input');
                const prevVals = Array.from(prevInputs).map(i => i.value);
                const wasNum = prevInputs.length > 0 && prevInputs[0].type === 'number';
                const prevOp = opSelect.value;
                opSelect.innerHTML = '';
                const ops = isNum ? window.SidebarController.numOps : window.SidebarController.textOps;
                ops.forEach(o => { const opt = document.createElement('option'); opt.value = o.val; opt.textContent = o.label; opSelect.appendChild(opt); });
                if (Array.from(opSelect.options).some(o => o.value === prevOp)) opSelect.value = prevOp;
                else opSelect.value = isNum ? 'equals' : 'contains';
                const op = opSelect.value;
                inputContainer.innerHTML = '';
                if (isNum) {
                    if (op === 'range') inputContainer.innerHTML = `<input type="number" class="smart-input" placeholder="数字..."><span class="smart-text">と</span><input type="number" class="smart-input" placeholder="数字...">`;
                    else inputContainer.innerHTML = `<input type="number" class="smart-input" placeholder="数字を入力...">`;
                } else inputContainer.innerHTML = `<input type="text" class="smart-input" placeholder="キーワードを入力...">`;
                const newInputs = inputContainer.querySelectorAll('.smart-input');
                if (isNum === wasNum) newInputs.forEach((input, i) => { if (prevVals[i]) input.value = prevVals[i]; });
            };
            tagSelect.addEventListener('change', updateRow); opSelect.addEventListener('change', updateRow);
            row.appendChild(tagSelect); row.appendChild(textSpan); row.appendChild(inputContainer); row.appendChild(opSelect); row.appendChild(btnContainer);
            updateRow(); return row;
        },

        updateAllMinusButtons: function() {
            const root = document.getElementById('smartConditionRoot');
            if (!root) return;
            root.querySelectorAll('.smart-group-body').forEach(body => {
                const children = Array.from(body.children).filter(c => c.classList.contains('smart-condition-row') || c.classList.contains('smart-group-wrapper'));
                const isSingle = (children.length <= 1);
                children.forEach(child => {
                    let btn = child.classList.contains('smart-condition-row') ? child.querySelector('.filter-minus') : child.querySelector('.smart-group-header .group-minus');
                    if (btn) { btn.disabled = isSingle; if (isSingle) btn.classList.add('disabled'); else btn.classList.remove('disabled'); }
                });
            });
        },

        finishCreateSmart: async function() {
            const nameInput = document.getElementById('smartPlaylistName');
            let name = nameInput.value.trim();
            if (!this.editingSmartId && !name) {
                nameInput.classList.add('input-error'); nameInput.focus();
                u.showToast("プレイリスト名を入力してください", true);
                nameInput.addEventListener('input', () => nameInput.classList.remove('input-error'), { once: true }); return;
            }
            if (this.editingSmartId) {
                const currentPl = s.playlists.find(p => p.id === this.editingSmartId);
                if (currentPl) name = currentPl.playlistName;
            }
            const rootElement = document.querySelector('#smartConditionRoot > .smart-group-wrapper');
            if (!rootElement) return;
            const parseGroup = (groupWrap) => {
                const match = groupWrap.querySelector('.smart-group-match').value;
                const items = [];
                Array.from(groupWrap.querySelector('.smart-group-body').children).forEach(child => {
                    if (child.classList.contains('smart-condition-row')) {
                        const tag = child.querySelector('.smart-filter-tag').value;
                        const op = child.querySelector('.smart-filter-op').value;
                        const inputs = child.querySelectorAll('.smart-input');
                        const val = inputs.length > 1 ? [inputs[0].value, inputs[1].value] : inputs[0].value;
                        items.push({ type: 'filter', tag, op, val });
                    } else if (child.classList.contains('smart-group-wrapper')) items.push(parseGroup(child));
                });
                return { type: 'group', match, items };
            };
            const rules = parseGroup(rootElement);
            document.getElementById('smartPlaylistModal').classList.remove('show');
            window.SidebarController.showSaving();
            try {
                let resultPl;
                if (this.editingSmartId) {
                    resultPl = await eel.update_smart_playlist(this.editingSmartId, name, rules)();
                    const idx = s.playlists.findIndex(p => p.id === this.editingSmartId);
                    if (idx !== -1) s.playlists[idx] = resultPl;
                    u.showToast("更新しました", false);
                } else {
                    resultPl = await eel.create_smart_playlist(name, rules)();
                    s.playlists.push(resultPl);
                    u.showToast("作成しました", false);
                }
                s.playlists.sort((a, b) => (a.playlistName||"").toLowerCase().localeCompare((b.playlistName||"").toLowerCase(), 'ja'));
                window.SidebarController.renderSidebar();
                window.MainViewController.selectPlaylist(s.playlists.findIndex(p => p.id === resultPl.id));
            } catch(e) { u.showToast("処理に失敗しました", true); } finally { window.SidebarController.hideSaving(); }
        },

        finishCreate: async function(name, type) {
            s.editingPlaylistIndex = -1;
            window.SidebarController.showSaving();
            const newPl = await eel.create_playlist(name, type)(); 
            if (newPl) {
                s.playlists.push(newPl);
                s.playlists.sort((a, b) => (a.playlistName||"").toLowerCase().localeCompare((b.playlistName||"").toLowerCase(), 'ja'));
                window.SidebarController.renderSidebar();
                window.MainViewController.selectPlaylist(s.playlists.findIndex(p => p.id === newPl.id));
            }
            window.SidebarController.hideSaving();
            u.showToast("作成しました", false);
        },

        finishRename: async function(index, newName) {
            s.editingPlaylistIndex = -1;
            if(!newName.trim()) { window.SidebarController.renderSidebar(); return; }
            window.SidebarController.showSaving();
            const plId = s.playlists[index].id;
            const updatedPl = await eel.update_playlist_by_id(plId, 'playlistName', newName)(); 
            if (updatedPl) {
                s.playlists[index].playlistName = updatedPl.playlistName; 
                s.playlists.sort((a, b) => (a.playlistName||"").toLowerCase().localeCompare((b.playlistName||"").toLowerCase(), 'ja'));
                window.SidebarController.renderSidebar();
                const newIdx = s.playlists.findIndex(p => p.id === plId);
                s.currentPlaylistIndex = newIdx;
                window.SidebarController.renderSidebar();
            }
            window.SidebarController.hideSaving();
            u.showToast("更新しました", false);
        },

        showContextMenu: function(menu, x, y) {
            document.getElementById('playlistBackgroundMenu').style.display='none';
            document.getElementById('playlistItemMenu').style.display='none';
            document.getElementById('trackContextMenu').style.display='none';
            menu.style.display = 'block'; menu.style.visibility = 'hidden'; 
            const mw = menu.offsetWidth || 220; const mh = menu.offsetHeight || 220; 
            if (x + mw > window.innerWidth) x -= mw;
            if (y + mh > window.innerHeight) y -= mh;
            menu.style.left = `${x}px`; menu.style.top = `${y}px`; menu.style.visibility = 'visible'; 
        },

        openDeleteModal: function(index) {
            this.deleteTargetIndex = index;
            const pl = s.playlists[index];
            const nameEl = document.getElementById('delPlaylistName');
            const modal = document.getElementById('playlistDeleteModal');
            if(nameEl) nameEl.textContent = pl.playlistName;
            if(modal) modal.classList.add('show');
        },

        executeDelete: async function() {
            const modal = document.getElementById('playlistDeleteModal');
            if(modal) modal.classList.remove('show');
            window.SidebarController.showSaving();
            const plId = s.playlists[this.deleteTargetIndex].id;
            await eel.delete_playlist_by_id(plId)();
            if (this.deleteTargetIndex === s.currentPlaylistIndex) s.currentPlaylistIndex = -1;
            s.playlists.splice(this.deleteTargetIndex, 1);
            window.SidebarController.renderSidebar();
            window.SidebarController.hideSaving();
            u.showToast("削除しました", false);
        }
    };
})();