export const sidebar = `
<aside class="bg-base-100 border-r border-base-300" style="position: fixed; left: 0; top: 48px; width: 208px; height: calc(100vh - 48px); overflow-y: auto; z-index: 10;">
    <div class="p-3">
        <h2 class="text-xs font-bold text-base-content/60 mb-2 uppercase">Forms</h2>
        <button class="btn btn-primary btn-xs w-full mb-3" onclick="createNewForm()">+ New Form</button>
        <ul id="formList" class="menu bg-base-100 w-full p-0"></ul>
    </div>
</aside>
`;
