export const navbar = `
<header class="flex items-center justify-between bg-base-100 shadow-sm px-4" style="position: fixed; top: 0; left: 0; right: 0; height: 48px; z-index: 50;">
    <span class="text-base font-semibold">Forminator Admin</span>
    <div class="flex gap-2">
        <button onclick="syncProdData()" class="btn btn-info btn-xs" title="Sync production data to dev">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Sync Prod
        </button>
        <button onclick="logout()" class="btn btn-error btn-xs">Logout</button>
    </div>
</header>
`;
