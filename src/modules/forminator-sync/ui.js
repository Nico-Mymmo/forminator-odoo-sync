/**
 * Forminator Sync Module - UI
 */

import { loginScreen } from '../../lib/components/login.js';
import { navbar } from '../../lib/components/navbar.js';
import { sidebar } from '../../lib/components/sidebar.js';
import { editor } from '../../lib/components/editor.js';
import { fieldPalette } from '../../lib/components/field_palette.js';
import { htmlCardModal } from '../../lib/components/modal.js';

export function adminInterfaceHTML(user) {
  return `<!DOCTYPE html>
<html lang="nl" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Forminator Mapping Admin</title>
    <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" type="text/css" />
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
    <link rel="stylesheet" href="/admin.css">
</head>
<body class="bg-base-200" style="overflow-y: scroll;">
    ${loginScreen}
    
    <div id="adminInterface" style="display: none; padding-top: 48px;">
        ${navbar(user)}
        ${sidebar}
        ${editor}
        ${fieldPalette}
    </div>
    
    ${htmlCardModal}
    
    <script src="/admin.js"></script>
</body>
</html>`;
}
