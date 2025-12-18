// Enhanced admin interface with integrated value mapping and tabs
export const adminHTML = `<!DOCTYPE html>
<html lang="nl" data-theme="cupcake">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Forminator Mapping Admin</title>
    <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" type="text/css" />
    <link rel="stylesheet" href="/tailwind.min.css">
    <link rel="stylesheet" href="/admin.css">
</head>
<body class="bg-base-200">
    <!-- Login Screen -->
    <div id="loginScreen" class="flex items-center justify-center min-h-screen" style="display: flex;">
        <div class="card w-96 bg-base-100 shadow-xl">
            <div class="card-body">
                <h2 class="card-title text-2xl justify-center">🔐 Admin Login</h2>
                <div class="form-control">
                    <input type="password" id="tokenInput" placeholder="Enter admin token" class="input input-bordered">
                </div>
                <button onclick="login()" class="btn btn-primary">Login</button>
            </div>
        </div>
    </div>
    
    <!-- Admin Interface -->
    <div id="adminInterface" style="display: none; height: 100vh; display: flex; flex-direction: column;">
        <!-- Navbar -->
        <header class="flex items-center justify-between bg-base-100 shadow-sm px-4" style="height: 48px; flex-shrink: 0;">
            <span class="text-base font-semibold">Forminator Admin</span>
            <button onclick="logout()" class="btn btn-error btn-xs">Logout</button>
        </header>
        
        <!-- Main Content Wrapper -->
        <div style="flex: 1; display: flex; flex-direction: row; overflow: hidden; position: relative;">
            <!-- Left Sidebar -->
            <aside class="bg-base-100 border-r border-base-300 overflow-y-auto" style="width: 208px; flex-shrink: 0;">
                <div class="p-3">
                    <h2 class="text-xs font-bold text-base-content/60 mb-2 uppercase">Forms</h2>
                    <button class="btn btn-primary btn-xs w-full mb-3" onclick="createNewForm()">+ New Form</button>
                    <ul id="formList" class="menu bg-base-100 w-full p-0"></ul>
                </div>
            </aside>
            
            <!-- Main Editor -->
            <main class="overflow-y-auto p-6" style="flex: 1; padding-right: 192px;">
                <h2 id="editorTitle" class="text-xl font-bold mb-4">Select a form</h2>
                <div id="editorContent"></div>
            </main>
            
            <!-- Right Field Palette (Fixed) -->
            <aside class="bg-base-100 border-l border-base-300 overflow-y-auto p-3" style="position: fixed; right: 0; top: 48px; width: 176px; height: calc(100vh - 48px);">
                <h3 class="text-xs font-bold text-primary mb-2 uppercase">📋 Fields</h3>
                <div id="fieldPaletteContent" class="flex flex-col gap-2"></div>
            </aside>
        </div>
    </div>
    
    <!-- HTML Card Editor Modal -->
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
    
    <script src="/admin.js"></script>
</body>
</html>`;
