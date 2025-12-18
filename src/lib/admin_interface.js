// Enhanced admin interface with integrated value mapping and tabs
export const adminHTML = `<!DOCTYPE html>
<html lang="nl" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Forminator Mapping Admin v1.1</title>
    <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" type="text/css" />
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="/admin.css">
    <style>
        /* Override admin.css for main layout only */
        body { background: inherit !important; font-family: inherit !important; }
        .admin-interface { display: flex !important; }
        .header { all: unset; display: flex !important; }
        .sidebar { all: unset; width: 16rem; background: white; }
        .form-list { all: unset; list-style: none; }
        .form-list li { padding: 0.5rem 0.75rem !important; border-radius: 0.375rem; font-size: 0.875rem; cursor: pointer; }
        .form-list li:hover { background: #f3f4f6 !important; }
        .form-list li.active { background: #6366f1 !important; color: white !important; font-weight: 500; }
        .tabs { border-bottom: 1px solid #e5e7eb !important; margin-bottom: 1.5rem !important; }
        .tab { padding: 0.75rem 1.5rem !important; border-bottom: 2px solid transparent !important; font-size: 0.875rem !important; font-weight: 500 !important; }
        .tab.active { border-bottom-color: #6366f1 !important; color: #6366f1 !important; }
        .section { background: white; padding: 1.5rem; margin-bottom: 1.5rem; border-radius: 0.5rem; border: 1px solid #e5e7eb; }
        .section h3 { font-size: 1rem; font-weight: 600; margin-bottom: 1rem; }
        input[type="text"], input[type="password"], input[type="number"], textarea, select { 
            font-size: 0.875rem !important; 
            padding: 0.5rem !important;
            border: 1px solid #d1d5db !important;
            border-radius: 0.375rem !important;
        }
        input[type="text"]:focus, textarea:focus, select:focus {
            outline: 2px solid #6366f1 !important;
            outline-offset: 2px;
            border-color: #6366f1 !important;
        }
    </style>
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
        <div class="header navbar bg-base-100 shadow-sm px-6 min-h-14">
            <div class="flex-1">
                <h1 class="text-lg font-semibold">Forminator Mapping Admin</h1>
            </div>
            <div class="flex-none">
                <button onclick="logout()" class="btn btn-error btn-sm">Logout</button>
            </div>
        </div>
        <div class="main-content flex flex-1 overflow-hidden">
            <div class="sidebar w-64 bg-base-100 border-r border-base-300 overflow-y-auto">
                <div class="p-4">
                    <h2 class="text-sm font-medium text-base-content/70 mb-3 uppercase tracking-wide">Forms</h2>
                    <button class="add-field-btn btn btn-primary btn-sm w-full mb-3" onclick="createNewForm()">+ New Form</button>
                    <ul id="formList" class="form-list menu menu-sm bg-base-100 w-full p-0 gap-1"></ul>
                </div>
            </div>
            <div class="editor flex-1 overflow-y-auto p-8 pr-56">
                <h2 id="editorTitle" class="text-xl font-semibold mb-6 text-base-content">Select a form</h2>
                <div id="editorContent"></div>
            </div>
            <div class="field-palette fixed right-0 top-14 w-52 h-[calc(100vh-3.5rem)] bg-base-100 border-l border-base-300 overflow-y-auto p-4">
                <h3 class="text-xs font-semibold text-primary mb-3 uppercase tracking-wide">📋 Available Fields</h3>
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
