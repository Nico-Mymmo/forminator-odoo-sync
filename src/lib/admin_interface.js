// Enhanced admin interface with integrated value mapping and tabs
export const adminHTML = `<!DOCTYPE html>
<html lang="nl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Forminator Mapping Admin v1.1</title>
    <link rel="stylesheet" href="/admin.css">
</head>
<body>
    <div id="loginScreen" class="login-screen">
        <div class="login-box">
            <h1>🔐 Admin Login</h1>
            <input type="password" id="tokenInput" placeholder="Enter admin token">
            <button onclick="login()">Login</button>
        </div>
    </div>
    
    <div id="adminInterface" class="admin-interface">
        <div class="header">
            <h1>Forminator Mapping Admin</h1>
            <button onclick="logout()">Logout</button>
        </div>
        <div class="main-content">
            <div class="sidebar">
                <h2>Forms</h2>
                <button class="add-field-btn" onclick="createNewForm()" style="width: calc(100% - 2rem); margin: 0.5rem 1rem 1rem 1rem;">+ New Form</button>
                <ul id="formList" class="form-list"></ul>
            </div>
            <div class="editor">
                <h2 id="editorTitle">Select a form</h2>
                <div id="editorContent"></div>
            </div>
            <div class="field-palette">
                <h3>📋 Available Fields</h3>
                <div id="fieldPaletteContent" class="field-palette-content"></div>
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
