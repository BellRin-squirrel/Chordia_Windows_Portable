document.addEventListener('DOMContentLoaded', () => {
    if (window.PlayerController && typeof window.PlayerController.init === 'function') {
        window.PlayerController.init();
    } else {
        console.error("PlayerController is not defined or init is missing");
    }

    if (window.ModalController && typeof window.ModalController.init === 'function') {
        window.ModalController.init();
    }

    if (window.TableController && typeof window.TableController.loadTableData === 'function') {
        window.TableController.loadTableData();
    }

    const btnToggle = document.getElementById('btnToggleSelection');
    if(btnToggle) {
        btnToggle.addEventListener('click', () => {
            window.TableController.toggleSelectionMode();
        });
    }

    const btnBulkEdit = document.getElementById('btnBulkEdit');
    if (btnBulkEdit) {
        btnBulkEdit.addEventListener('click', () => {
            if (window.ModalController && typeof window.ModalController.openBulkEditModal === 'function') {
                window.ModalController.openBulkEditModal();
            }
        });
    }

    const btnBulkDelete = document.getElementById('btnBulkDelete');
    if (btnBulkDelete) {
        btnBulkDelete.addEventListener('click', () => {
            if (window.ModalController && typeof window.ModalController.openBulkDeleteModal === 'function') {
                window.ModalController.openBulkDeleteModal();
            }
        });
    }

    // 検索機能のイベント登録
    const btnSearch = document.getElementById('btnSearchManage');
    const inputSearch = document.getElementById('searchInputManage');
    const btnClear = document.getElementById('btnClearSearch'); // ★追加

    if (btnSearch && inputSearch) {
        btnSearch.addEventListener('click', () => {
            window.TableController.execSearch(inputSearch.value.trim());
        });

        inputSearch.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                window.TableController.execSearch(inputSearch.value.trim());
            }
        });
    }

    // ★追加: クリアボタンのイベント
    if (btnClear && inputSearch) {
        btnClear.addEventListener('click', () => {
            inputSearch.value = ''; // 入力欄を空に
            window.TableController.execSearch(''); // 空文字で検索（全件表示）
        });
    }

    const btnAdvanced = document.getElementById('btnAdvancedSearch');
    if (btnAdvanced) {
        btnAdvanced.addEventListener('click', () => {
            document.getElementById('advancedSearchModal').classList.add('show');
        });
    }
});