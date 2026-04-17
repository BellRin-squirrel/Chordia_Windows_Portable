(function() {
    const s = window.ManageState;
    const u = window.ManageUtils;

    window.ModalController = {
        activeTags: [],
        textOps:[
            {val: 'contains', label: 'を含む'},
            {val: 'not_contains', label: 'を含まない'},
            {val: 'equals', label: 'である'},
            {val: 'not_equals', label: 'ではない'},
            {val: 'startswith', label: 'で始まる'},
            {val: 'endswith', label: 'で終わる'}
        ],
        numOps:[
            {val: 'equals', label: 'である'},
            {val: 'not_equals', label: 'ではない'},
            {val: 'greater', label: 'より大きい'},
            {val: 'less', label: 'より小さい'},
            {val: 'range', label: 'の範囲内'}
        ],

        init: function() {
            // --- 共通閉じるボタン ---
            document.getElementById('btnCancelLyric').onclick = () => document.getElementById('lyricModal').classList.remove('show');
            document.getElementById('btnCloseLyricModalX').onclick = () => document.getElementById('lyricModal').classList.remove('show');
            document.getElementById('btnCancelArt').onclick = () => document.getElementById('artModal').classList.remove('show');
            document.getElementById('btnCloseArtModalX').onclick = () => document.getElementById('artModal').classList.remove('show');
            document.getElementById('btnCancelDelete').onclick = () => document.getElementById('deleteModal').classList.remove('show');
            document.getElementById('btnCancelBulkEdit').onclick = () => document.getElementById('bulkEditModal').classList.remove('show');
            document.getElementById('btnCloseAdvSearchModal').onclick = () => document.getElementById('advancedSearchModal').classList.remove('show');

            // --- 歌詞保存 ---
            document.getElementById('btnSaveLyric').onclick = async () => {
                const text = document.getElementById('lyricTextArea').value;
                const item = s.libraryData[s.editingIndex];
                const success = await eel.update_song_by_id(item.musicFilename, 'lyric', text)();
                if (success) {
                    item.lyric = text;
                    u.showToast("歌詞を保存しました", false);
                    document.getElementById('lyricModal').classList.remove('show');
                    window.TableController.renderTable();
                }
            };

            // --- 歌詞自動取得 (LRCLIB) ---
            document.getElementById('btnAutoLyricManage').onclick = () => this.searchLyrics();
            document.getElementById('btnCancelLyricSearchManage').onclick = () => document.getElementById('lyricSearchModalManage').classList.remove('show');
            document.getElementById('btnBackToResultManage').onclick = () => {
                document.getElementById('lyricSearchDetailViewManage').style.display = 'none';
                document.getElementById('lyricSearchListViewManage').style.display = 'block';
            };

            // --- アートワーク編集 ミニタブ切り替え ---
            const artMiniTabs = document.querySelectorAll('.art-mini-tab-btn');
            artMiniTabs.forEach(btn => {
                btn.onclick = async () => {
                    const target = btn.dataset.target;
                    
                    // 動画タブの場合はツールチェックを実行
                    if (target === 'art-mini-video') {
                        try {
                            const status = await eel.check_tools_status()();
                            if (!status['yt-dlp'] || !status['ffmpeg']) {
                                // ★修正: インポート画面と同様の通知メッセージを表示
                                u.showToast("動画機能を利用するには拡張機能（yt-dlp, ffmpeg）をインストールしてください", true);
                                return; // タブを切り替えずに終了
                            }
                        } catch (e) {
                            console.error("Tool check error:", e);
                            return;
                        }
                    }
                    
                    // タブの切り替え実行
                    artMiniTabs.forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.art-mini-tab-content').forEach(c => c.classList.remove('active'));
                    btn.classList.add('active');
                    document.getElementById(target).classList.add('active');
                };
            });

            // --- アートワーク: ローカルファイル選択 ---
            document.getElementById('newArtInput').onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    s.newArtBase64 = ev.target.result;
                    document.getElementById('currentArtPreview').src = ev.target.result;
                    document.getElementById('artStatusText').textContent = "新しい画像 (反映前)";
                };
                reader.readAsDataURL(file);
            };

            // --- アートワーク: 動画サムネイル取得 ---
            document.getElementById('btnFetchVideoArt').onclick = async () => {
                const url = document.getElementById('miniVideoUrl').value.trim();
                if (!url) return;
                const btn = document.getElementById('btnFetchVideoArt');
                const orgText = btn.textContent;
                btn.disabled = true; btn.textContent = "取得中...";
                try {
                    const info = await eel.fetch_video_info(url)();
                    if (info.status === 'success' && info.thumbnail) {
                        const b64 = await eel.fetch_and_crop_thumbnail(info.thumbnail)();
                        if (b64) {
                            s.newArtBase64 = b64;
                            document.getElementById('currentArtPreview').src = b64;
                            document.getElementById('artStatusText').textContent = "動画サムネイル (反映前)";
                            u.showToast("サムネイルを取得しました");
                        }
                    } else { u.showToast(info.message || "取得失敗", true); }
                } catch(e) { u.showToast("エラー", true); }
                finally { btn.disabled = false; btn.textContent = orgText; }
            };

            // --- アートワーク: 画像URL取得 ---
            document.getElementById('btnFetchDirectArt').onclick = async () => {
                const url = document.getElementById('miniImageUrl').value.trim();
                if (!url) return;
                const btn = document.getElementById('btnFetchDirectArt');
                const orgText = btn.textContent;
                btn.disabled = true; btn.textContent = "取得中...";
                try {
                    const res = await eel.fetch_and_crop_image_url(url)();
                    if (res.status === 'success') {
                        s.newArtBase64 = res.data;
                        document.getElementById('currentArtPreview').src = res.data;
                        document.getElementById('artStatusText').textContent = "画像URL (反映前)";
                        u.showToast("画像を取得しました");
                    } else { u.showToast(res.message, true); }
                } catch(e) { u.showToast("エラー", true); }
                finally { btn.disabled = false; btn.textContent = orgText; }
            };

            document.getElementById('btnExecRemoveArt').onclick = () => {
                s.newArtBase64 = "REMOVE";
                document.getElementById('currentArtPreview').src = s.DEFAULT_ICON;
                document.getElementById('artStatusText').textContent = "削除予定 (反映前)";
            };

            document.getElementById('btnSaveArt').onclick = async () => {
                const item = s.libraryData[s.editingIndex];
                const isRemove = (s.newArtBase64 === "REMOVE");
                const b64 = isRemove ? null : s.newArtBase64;
                const success = await eel.update_song_artwork_by_id(item.musicFilename, b64, isRemove)();
                if (success) {
                    u.showToast("アートワークを更新しました", false);
                    document.getElementById('artModal').classList.remove('show');
                    window.TableController.loadTableData();
                }
            };

            // --- 削除実行 ---
            document.getElementById('btnExecDelete').onclick = async () => {
                const item = s.libraryData[s.editingIndex];
                const success = await eel.delete_song_by_id(item.musicFilename)();
                if (success) {
                    u.showToast("削除しました", false);
                    document.getElementById('deleteModal').classList.remove('show');
                    window.TableController.loadTableData();
                }
            };

            // --- 一括変更実行 ---
            document.getElementById('btnExecBulkEdit').onclick = () => this.executeBulkEdit();

            // --- 高度な検索ボタン群 ---
            document.getElementById('btnClearAdvSearch').onclick = () => this.clearAdvancedSearch();
            document.getElementById('btnApplyAdvSearch').onclick = () => this.applyAdvancedSearch();

            // 背景クリックでカスタムドロップダウンを閉じる
            document.addEventListener('click', (e) => {
                document.querySelectorAll('.custom-select-dropdown').forEach(d => {
                    if (!e.target.closest('.custom-select-wrapper')) d.classList.remove('show');
                });
            });
        },

        openLyricModal: function(index) {
            s.editingIndex = index;
            const item = s.libraryData[index];
            document.getElementById('lyricTargetTitle').textContent = `${item.title} / ${item.artist}`;
            document.getElementById('lyricTextArea').value = item.lyric || "";
            document.getElementById('lyricModal').classList.add('show');
        },

        openArtModal: function(index) {
            s.editingIndex = index;
            s.newArtBase64 = null;
            const item = s.libraryData[index];
            document.getElementById('currentArtPreview').src = item.imageData || s.DEFAULT_ICON;
            document.getElementById('artStatusText').textContent = "現在の画像";
            
            // 入力欄をクリア
            document.getElementById('miniVideoUrl').value = '';
            document.getElementById('miniImageUrl').value = '';
            
            // ローカルタブを初期選択
            document.querySelector('.art-mini-tab-btn[data-target="art-mini-local"]').click();
            
            document.getElementById('artModal').classList.add('show');
        },

        openDeleteModal: function(index) {
            s.editingIndex = index;
            const item = s.libraryData[index];
            document.getElementById('deleteTargetName').textContent = `${item.title} - ${item.artist}`;
            document.getElementById('deleteModal').classList.add('show');
        },

        searchLyrics: async function() {
            const item = s.libraryData[s.editingIndex];
            if (!item.title || !item.artist) { u.showToast("タイトルとアーティストが必要です", true); return; }
            
            const btn = document.getElementById('btnAutoLyricManage');
            const originalText = btn.textContent;
            btn.textContent = "検索中..."; btn.disabled = true;

            try {
                const res = await fetch(`https://lrclib.net/api/search?track_name=${encodeURIComponent(item.title)}&artist_name=${encodeURIComponent(item.artist)}`);
                const data = await res.json();
                const filtered = data.filter(d => d.plainLyrics);
                
                if (filtered.length === 0) {
                    u.showToast("見つかりませんでした", true);
                } else {
                    const list = document.getElementById('lyricResultListManage');
                    list.innerHTML = '';
                    filtered.forEach(d => {
                        const li = document.createElement('li');
                        li.className = 'lyric-result-item';
                        li.innerHTML = `<strong>${u.escapeHtml(d.trackName)}</strong><br><small>${u.escapeHtml(d.artistName)}</small>`;
                        li.onclick = () => {
                            document.getElementById('lyricPreviewTextManage').textContent = d.plainLyrics;
                            document.getElementById('lyricSearchListViewManage').style.display = 'none';
                            document.getElementById('lyricSearchDetailViewManage').style.display = 'block';
                            document.getElementById('btnApplyLyricManage').onclick = () => {
                                document.getElementById('lyricTextArea').value = d.plainLyrics;
                                document.getElementById('lyricSearchModalManage').classList.remove('show');
                            };
                        };
                        list.appendChild(li);
                    });
                    document.getElementById('lyricSearchListViewManage').style.display = 'block';
                    document.getElementById('lyricSearchDetailViewManage').style.display = 'none';
                    document.getElementById('lyricSearchModalManage').classList.add('show');
                }
            } catch(e) { u.showToast("検索エラー", true); }
            finally { btn.textContent = originalText; btn.disabled = false; }
        },

        openBulkEditModal: async function() {
            if (s.selectedIds.size === 0) { u.showToast("楽曲を選択してください", true); return; }
            const container = document.getElementById('bulkFormContainer');
            container.innerHTML = '<p style="text-align:center; padding:20px;">読込中...</p>';
            document.getElementById('bulkEditModal').classList.add('show');
            const commonValues = await eel.get_common_values_for_selected(Array.from(s.selectedIds))();
            const settings = await eel.get_app_settings()();
            const allTags = await eel.get_available_tags()();
            const activeTags = allTags.filter(t => settings.active_tags.includes(t.key));
            container.innerHTML = '';
            activeTags.forEach(tag => {
                const row = document.createElement('div');
                row.className = 'form-row';
                const val = commonValues[tag.key];
                const displayVal = (val === "__KEEP__") ? "< 維持 >" : val;
                row.innerHTML = `
                    <label>${tag.label}</label>
                    <input type="text" class="bulk-input" data-key="${tag.key}" value="${u.escapeHtml(displayVal)}" 
                           onfocus="if(this.value==='< 維持 >') this.value=''" onblur="if(this.value==='') this.value='< 維持 >'">
                `;
                container.appendChild(row);
            });
        },

        executeBulkEdit: async function() {
            const updates = {};
            document.querySelectorAll('.bulk-input').forEach(input => {
                updates[input.dataset.key] = input.value;
            });
            document.getElementById('bulkEditModal').classList.remove('show');
            const res = await eel.update_multiple_songs(Array.from(s.selectedIds), updates)();
            if (res.success) {
                u.showToast(`${res.count}曲を更新しました`, false);
                window.TableController.loadTableData();
            }
        },

        openBulkDeleteModal: function() {
            if (s.selectedIds.size === 0) { u.showToast("楽曲を選択してください", true); return; }
            s.editingIndex = -99;
            document.getElementById('deleteTargetName').textContent = `選択された ${s.selectedIds.size} 曲`;
            document.getElementById('btnExecDelete').onclick = async () => {
                const res = await eel.delete_multiple_songs(Array.from(s.selectedIds))();
                if (res.success) {
                    u.showToast(`${res.count}曲を削除しました`, false);
                    document.getElementById('deleteModal').classList.remove('show');
                    window.TableController.toggleSelectionMode();
                }
            };
            document.getElementById('deleteModal').classList.add('show');
        },

        openAdvancedSearch: async function() {
            const container = document.getElementById('advSearchRootContainer');
            if (container.children.length === 0) {
                const settings = await eel.get_app_settings()();
                const allTags = await eel.get_available_tags()();
                this.activeTags = allTags.filter(t => settings.active_tags.includes(t.key)).map(t => ({val: t.key, label: t.label}));
                this.activeTags.push({val: 'lyric', label: '歌詞'});
                container.appendChild(this.createConditionGroup(true));
                this.updateAllMinusButtons();
            }
            document.getElementById('advancedSearchModal').classList.add('show');
        },

        createDynamicCustomSelector: function(options, currentValue, onSelect) {
            const wrapper = document.createElement('div');
            wrapper.className = 'custom-select-wrapper';
            const trigger = document.createElement('button');
            trigger.type = 'button';
            trigger.className = 'custom-select-trigger';
            const currentLabel = options.find(o => o.val === currentValue)?.label || currentValue;
            trigger.innerHTML = `<span>${currentLabel}</span><svg class="custom-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>`;
            const dropdown = document.createElement('div');
            dropdown.className = 'custom-select-dropdown';
            options.forEach(opt => {
                const item = document.createElement('div');
                item.className = 'custom-option' + (opt.val === currentValue ? ' active' : '');
                item.innerHTML = `<svg class="custom-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M4.5 12.75l6 6 9-13.5" /></svg><span>${opt.label}</span>`;
                item.onclick = (e) => {
                    e.stopPropagation();
                    trigger.querySelector('span').textContent = opt.label;
                    dropdown.querySelectorAll('.custom-option').forEach(o => o.classList.remove('active'));
                    item.classList.add('active');
                    onSelect(opt.val);
                    dropdown.classList.remove('show');
                };
                dropdown.appendChild(item);
            });
            trigger.onclick = (e) => {
                e.stopPropagation();
                document.querySelectorAll('.custom-select-dropdown').forEach(d => { if (d !== dropdown) d.classList.remove('show'); });
                dropdown.classList.toggle('show');
            };
            wrapper.appendChild(trigger);
            wrapper.appendChild(dropdown);
            return wrapper;
        },

        createConditionGroup: function(isRoot, matchVal = 'all') {
            const groupWrap = document.createElement('div');
            groupWrap.className = 'smart-group-wrapper';
            groupWrap.style.marginBottom = '12px';
            groupWrap.dataset.match = matchVal;
            const groupHeader = document.createElement('div');
            groupHeader.className = 'smart-group-header';
            const matchSelector = this.createDynamicCustomSelector([{val:'all', label:'すべての'}, {val:'any', label:'いずれかの'}],
                matchVal,
                (val) => { groupWrap.dataset.match = val; }
            );
            const textSpan = document.createElement('span');
            textSpan.className = 'smart-text'; textSpan.textContent = 'ルールに一致';
            const spacer = document.createElement('div'); spacer.style.flex = "1";
            groupHeader.appendChild(matchSelector);
            groupHeader.appendChild(textSpan);
            groupHeader.appendChild(spacer);
            const btnContainer = document.createElement('div');
            btnContainer.className = 'smart-btn-container';
            const btnMinus = document.createElement('button');
            btnMinus.className = 'smart-row-btn minus group-minus';
            btnMinus.innerHTML = `<svg style="width:16px;height:16px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19.5 12h-15" /></svg>`;
            const btnPlus = document.createElement('button');
            btnPlus.className = 'smart-row-btn plus';
            btnPlus.innerHTML = `<svg style="width:16px;height:16px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 4.5v15m7.5-7.5h-15" /></svg>`;
            const btnMore = document.createElement('button');
            btnMore.className = 'smart-row-btn more';
            btnMore.innerHTML = '●●●';
            if (isRoot) {
                btnMinus.disabled = btnPlus.disabled = btnMore.disabled = true;
                btnMinus.classList.add('disabled'); btnPlus.classList.add('disabled'); btnMore.classList.add('disabled');
            } else {
                btnMinus.onclick = () => { groupWrap.remove(); this.updateAllMinusButtons(); };
                btnPlus.onclick = () => { groupWrap.parentElement.insertBefore(this.createFilterRow(), groupWrap.nextSibling); this.updateAllMinusButtons(); };
                btnMore.onclick = () => { groupWrap.parentElement.insertBefore(this.createConditionGroup(false), groupWrap.nextSibling); this.updateAllMinusButtons(); };
            }
            btnContainer.appendChild(btnMinus); btnContainer.appendChild(btnPlus); btnContainer.appendChild(btnMore);
            groupHeader.appendChild(btnContainer);
            const groupBody = document.createElement('div');
            groupBody.className = 'smart-group-body';
            groupBody.style.paddingLeft = '24px';
            groupBody.style.borderLeft = '2px solid rgba(128,128,128,0.2)';
            groupBody.appendChild(this.createFilterRow());
            groupWrap.appendChild(groupHeader);
            groupWrap.appendChild(groupBody);
            return groupWrap;
        },

        createFilterRow: function(initTag = null, initOp = null, initVal = null) {
            const row = document.createElement('div');
            row.className = 'smart-condition-row';
            const defaultTag = initTag || 'title';
            row.dataset.tag = defaultTag;
            row.dataset.op = initOp || 'contains';
            const inputContainer = document.createElement('div');
            inputContainer.className = 'smart-input-container';
            const opContainer = document.createElement('div');
            opContainer.className = 'custom-select-wrapper';
            const updateInputs = (tag, op, val = null) => {
                inputContainer.innerHTML = '';
                const isNum = ['track', 'year', 'disc', 'bpm'].includes(tag);
                if (isNum) {
                    if (op === 'range') {
                        const i1 = document.createElement('input'); i1.type = 'number'; i1.className = 'smart-input'; i1.placeholder = '0';
                        const i2 = document.createElement('input'); i2.type = 'number'; i2.className = 'smart-input'; i2.placeholder = '0';
                        if (Array.isArray(val)) { i1.value = val[0]; i2.value = val[1]; }
                        inputContainer.appendChild(i1);
                        inputContainer.innerHTML += '<span class="smart-text">と</span>';
                        inputContainer.appendChild(i2);
                    } else {
                        const i = document.createElement('input'); i.type = 'number'; i.className = 'smart-input'; i.placeholder = '数字...';
                        if (val) i.value = val;
                        inputContainer.appendChild(i);
                    }
                } else {
                    const i = document.createElement('input'); i.type = 'text'; i.className = 'smart-input'; i.placeholder = '検索ワード...';
                    if (val) i.value = val;
                    inputContainer.appendChild(i);
                }
            };
            const tagSelector = this.createDynamicCustomSelector(this.activeTags, row.dataset.tag, (newTag) => {
                row.dataset.tag = newTag;
                const isNum = ['track', 'year', 'disc', 'bpm'].includes(newTag);
                const newOps = isNum ? this.numOps : this.textOps;
                const newOp = newOps[0].val;
                row.dataset.op = newOp;
                const newOpSelector = this.createDynamicCustomSelector(newOps, newOp, (o) => {
                    row.dataset.op = o;
                    updateInputs(newTag, o);
                });
                opContainer.innerHTML = '';
                opContainer.appendChild(newOpSelector);
                updateInputs(newTag, newOp);
            });
            const initialOps = ['track', 'year', 'disc', 'bpm'].includes(row.dataset.tag) ? this.numOps : this.textOps;
            const opSelector = this.createDynamicCustomSelector(initialOps, row.dataset.op, (newOp) => {
                row.dataset.op = newOp;
                updateInputs(row.dataset.tag, newOp);
            });
            opContainer.appendChild(opSelector);
            const textSpan = document.createElement('span');
            textSpan.className = 'smart-text'; textSpan.textContent = 'が';
            const btnContainer = document.createElement('div');
            btnContainer.className = 'smart-btn-container';
            const btnMinus = document.createElement('button');
            btnMinus.className = 'smart-row-btn minus filter-minus';
            btnMinus.innerHTML = `<svg style="width:16px;height:16px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19.5 12h-15" /></svg>`;
            btnMinus.onclick = () => { row.remove(); this.updateAllMinusButtons(); };
            const btnPlus = document.createElement('button');
            btnPlus.className = 'smart-row-btn plus';
            btnPlus.innerHTML = `<svg style="width:16px;height:16px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 4.5v15m7.5-7.5h-15" /></svg>`;
            btnPlus.onclick = () => { row.parentElement.insertBefore(this.createFilterRow(), row.nextSibling); this.updateAllMinusButtons(); };
            const btnMore = document.createElement('button');
            btnMore.className = 'smart-row-btn more';
            btnMore.innerHTML = '●●●';
            btnMore.onclick = () => { row.parentElement.insertBefore(this.createConditionGroup(false), row.nextSibling); this.updateAllMinusButtons(); };
            btnContainer.appendChild(btnMinus); btnContainer.appendChild(btnPlus); btnContainer.appendChild(btnMore);
            row.appendChild(tagSelector); row.appendChild(textSpan); row.appendChild(inputContainer); row.appendChild(opContainer); row.appendChild(btnContainer);
            updateInputs(row.dataset.tag, row.dataset.op, initVal);
            return row;
        },

        updateAllMinusButtons: function() {
            const root = document.getElementById('advSearchRootContainer');
            if (!root) return;
            root.querySelectorAll('.smart-group-body').forEach(body => {
                const children = Array.from(body.children).filter(c => c.classList.contains('smart-condition-row') || c.classList.contains('smart-group-wrapper'));
                const isSingle = (children.length <= 1);
                children.forEach(child => {
                    let btn = child.classList.contains('smart-condition-row') ? child.querySelector('.filter-minus') : child.querySelector('.smart-group-header .group-minus');
                    if (btn) { btn.disabled = isSingle; btn.style.opacity = isSingle ? "0.3" : "1"; }
                });
            });
        },

        applyAdvancedSearch: function() {
            const rootElement = document.querySelector('#advSearchRootContainer > .smart-group-wrapper');
            if (!rootElement) return;
            const parseGroup = (groupWrap) => {
                const match = groupWrap.dataset.match || 'all';
                const items =[];
                Array.from(groupWrap.querySelector('.smart-group-body').children).forEach(child => {
                    if (child.classList.contains('smart-condition-row')) {
                        const tag = child.dataset.tag;
                        const op = child.dataset.op;
                        const inputs = child.querySelectorAll('.smart-input');
                        const val = inputs.length > 1 ?[inputs[0].value, inputs[1].value] : inputs[0].value;
                        items.push({ type: 'filter', tag, op, val });
                    } else if (child.classList.contains('smart-group-wrapper')) items.push(parseGroup(child));
                });
                return { type: 'group', match, items };
            };
            const conditions = parseGroup(rootElement);
            document.getElementById('advancedSearchModal').classList.remove('show');
            if (window.TableController) window.TableController.execAdvancedSearch(conditions);
        },

        clearAdvancedSearch: function() {
            document.getElementById('advSearchRootContainer').innerHTML = '';
            document.getElementById('advancedSearchModal').classList.remove('show');
            if (window.TableController) window.TableController.execAdvancedSearch(null);
        }
    };
})();