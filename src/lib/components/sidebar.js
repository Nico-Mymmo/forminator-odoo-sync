export const sidebar = `
<aside class="bg-base-100 border-r border-base-300" style="position: fixed; left: 0; top: 48px; width: 208px; height: calc(100vh - 48px); overflow-y: auto; z-index: 10;">
    <div class="p-3">
        <h2 class="text-xs font-bold text-base-content/60 mb-2 uppercase">Navigation</h2>
        
        <!-- History Button -->
        <button class="btn btn-sm btn-neutral w-full mb-3" onclick="showHistory()">
            📜 Request History
        </button>
        
        <h2 class="text-xs font-bold text-base-content/60 mb-2 uppercase">Forms</h2>
        <button class="btn btn-primary btn-xs w-full mb-2" onclick="createNewForm()">+ New Form</button>
        
        <!-- Info box -->
        <div class="alert alert-info text-xs p-2 mb-3">
            <div class="text-[10px] leading-tight">
                <strong>Nieuw formulier toevoegen:</strong>
                <ol class="list-decimal list-inside mt-1 space-y-1">
                    <li>Klik "+ New Form"</li>
                    <li>Voer Form ID in (bijv. 12345)</li>
                    <li>Configureer mapping & workflow</li>
                    <li>Kopieer webhook URL</li>
                    <li>Plak in Forminator webhook settings</li>
                </ol>
            </div>
        </div>
        
        <ul id="formList" class="menu bg-base-100 w-full p-0"></ul>
    </div>
</aside>
`;
