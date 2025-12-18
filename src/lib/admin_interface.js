// Enhanced admin interface with integrated value mapping and tabs
export const adminHTML = `<!DOCTYPE html>
<html lang="nl" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Forminator Mapping Admin v1.1</title>
    <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" type="text/css" />
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-base-200">
    <div id="loginScreen" class="login-screen flex items-center justify-center min-h-screen" style="display: flex;">
        <div class="login-box card w-96 bg-base-100 shadow-xl">
            <div class="card-body">
                <h1 class="card-title text-2xl justify-center mb-4">🔐 Admin Login</h1>
                <input type="password" id="tokenInput" placeholder="Enter admin token" class="input input-bordered w-full">
                <button onclick="login()" class="btn btn-primary w-full mt-4">Login</button>
            </div>
        </div>
    </div>
    
    <div id="adminInterface" class="admin-interface flex flex-col h-screen" style="display: none;">
        <div class="header navbar bg-base-100 shadow-md">
            <div class="flex-1">
                <h1 class="text-xl font-bold">Forminator Mapping Admin</h1>
            </div>
            <div class="flex-none">
                <button onclick="logout()" class="btn btn-error btn-sm">Logout</button>
            </div>
        </div>
        <div class="main-content flex flex-1 overflow-hidden">
            <div class="sidebar w-64 bg-base-100 border-r border-base-300 overflow-y-auto">
                <div class="p-4">
                    <h2 class="text-lg font-semibold mb-4">Forms</h2>
                    <button class="add-field-btn btn btn-primary btn-sm w-full mb-4" onclick="createNewForm()">+ New Form</button>
                    <ul id="formList" class="form-list menu bg-base-100 w-full p-0"></ul>
                </div>
            </div>
            <div class="editor flex-1 overflow-y-auto p-6 pr-56">
                <h2 id="editorTitle" class="text-2xl font-bold mb-6">Select a form</h2>
                <div id="editorContent"></div>
            </div>
            <div class="field-palette fixed right-0 top-16 w-52 h-[calc(100vh-4rem)] bg-base-100 border-l-2 border-primary overflow-y-auto p-4 shadow-lg">
                <h3 class="text-sm font-semibold text-primary mb-4">📋 Available Fields</h3>
                <div id="fieldPaletteContent" class="field-palette-content flex flex-col gap-2"></div>
            </div>
        </div>
    </div>
    
    <!-- HTML Card Editor Modal -->
    <div id="htmlCardModal" class="html-card-modal">
        <div class="html-card-modal-content">
            <div class="html-card-modal-header">
                <h3>🎨 HTML Card Editor</h3>
                <button onclick="closeHtmlCardEditor()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer;">×</button>
            </div>
            <div class="html-card-modal-body">
                <div class="html-card-editor-sidebar">
                    <div class="html-card-element-group">
                        <h4>📝 Form Fields</h4>
                        <div id="htmlCardFields"></div>
                    </div>
                    <div class="html-card-element-group">
                        <h4>📦 Layout Elements</h4>
                        <div class="html-card-draggable" draggable="true" data-type="heading">
                            <span>📄</span> Heading
                        </div>
                        <div class="html-card-draggable" draggable="true" data-type="text">
                            <span>📝</span> Text Block
                        </div>
                        <div class="html-card-draggable" draggable="true" data-type="divider">
                            <span>➖</span> Divider
                        </div>
                        <div class="html-card-draggable" draggable="true" data-type="container">
                            <span>📦</span> Container
                        </div>
                    </div>
                </div>
                <div class="html-card-editor-canvas">
                    <div id="htmlCardCanvas" class="html-card-canvas-area">
                        <p style="color: #999; text-align: center; margin-top: 2rem;">Drag elements here to build your HTML card</p>
                    </div>
                </div>
            </div>
            <div class="html-card-modal-footer">
                <button class="btn-secondary" onclick="closeHtmlCardEditor()">Cancel</button>
                <button class="btn-primary" onclick="saveHtmlCard()">Save HTML Card</button>
            </div>
        </div>
    </div>
    
    <script src="/admin.js"></script>
</body>
</html>`;
