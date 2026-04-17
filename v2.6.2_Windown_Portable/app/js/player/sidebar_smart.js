(function() {
    const s = window.PlayerState;
    const u = window.PlayerUtils;

    Object.assign(window.SidebarController, {
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
            groupBody.appendChild(this.createFilterRow());
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
                const items =[];
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
        }
    });
})();