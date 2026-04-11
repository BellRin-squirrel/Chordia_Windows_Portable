document.addEventListener('DOMContentLoaded', () => {
    // プレイヤーの初期化
    if (window.PlayerController && typeof window.PlayerController.init === 'function') {
        window.PlayerController.init();
    }

    // モーダルの初期化 (一括変更・削除・高度な検索など)
    // ★ 修正: ManageModal から ModalController へ
    if (window.ModalController && typeof window.ModalController.init === 'function') {
        window.ModalController.init();
    }

    // テーブルデータの初期読み込み
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
    const btnClear = document.getElementById('btnClearSearch');

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

    if (btnClear && inputSearch) {
        btnClear.addEventListener('click', () => {
            inputSearch.value = ''; 
            window.TableController.execSearch(''); 
        });
    }

    // 高度な検索ボタン
    const btnAdvanced = document.getElementById('btnAdvancedSearch');
    if (btnAdvanced) {
        btnAdvanced.addEventListener('click', () => {
            if (window.ModalController && typeof window.ModalController.openAdvancedSearch === 'function') {
                window.ModalController.openAdvancedSearch();
            }
        });
    }
});