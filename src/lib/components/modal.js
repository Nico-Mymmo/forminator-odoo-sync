export const htmlCardModal = `
<dialog id="htmlCardModal" class="modal">
    <div class="modal-box w-11/12 max-w-5xl">
        <h3 class="font-bold text-lg mb-4">🎨 HTML Card Editor</h3>
        <div class="flex gap-4 h-96">
            <div class="w-1/3 border-r border-base-300 pr-4 overflow-y-auto">
                <div class="mb-4">
                    <h4 class="font-semibold mb-2">📝 Form Fields</h4>
                    <div id="htmlCardFields" class="flex flex-col gap-1"></div>
                </div>
                <div>
                    <h4 class="font-semibold mb-2">📦 Layout Elements</h4>
                    <div class="flex flex-col gap-1">
                        <div class="badge badge-lg cursor-grab" draggable="true" data-type="heading">📄 Heading</div>
                        <div class="badge badge-lg cursor-grab" draggable="true" data-type="text">📝 Text Block</div>
                        <div class="badge badge-lg cursor-grab" draggable="true" data-type="divider">➖ Divider</div>
                        <div class="badge badge-lg cursor-grab" draggable="true" data-type="container">📦 Container</div>
                    </div>
                </div>
            </div>
            <div class="flex-1">
                <div id="htmlCardCanvas" class="h-full border-2 border-dashed border-base-300 rounded p-4 overflow-y-auto">
                    <p class="text-base-content/50 text-center mt-8">Drag elements here to build your HTML card</p>
                </div>
            </div>
        </div>
        <div class="modal-action">
            <button class="btn" onclick="closeHtmlCardEditor()">Cancel</button>
            <button class="btn btn-primary" onclick="saveHtmlCard()">Save HTML Card</button>
        </div>
    </div>
    <form method="dialog" class="modal-backdrop">
        <button onclick="closeHtmlCardEditor()">close</button>
    </form>
</dialog>
`;
