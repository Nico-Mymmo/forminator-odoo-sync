export const loginScreen = `
<div id="loginScreen" class="flex items-center justify-center min-h-screen" style="display: flex;">
    <div class="card w-96 bg-base-100 shadow-lg">
        <div class="card-body">
            <h2 class="card-title text-2xl justify-center mb-4">🔐 Login</h2>
            <p class="text-center text-sm text-base-content/60 mb-4">OpenVME Operations Manager</p>
            <div class="form-control mb-2">
                <label class="label">
                    <span class="label-text">Email</span>
                </label>
                <input type="email" id="emailInput" placeholder="admin@mymmo.com" class="input input-bordered" autocomplete="username">
            </div>
            <div class="form-control mb-4">
                <label class="label">
                    <span class="label-text">Password</span>
                </label>
                <input type="password" id="passwordInput" placeholder="••••••••" class="input input-bordered" autocomplete="current-password" onkeypress="if(event.key==='Enter') login()">
            </div>
            <div id="loginError" class="alert alert-error mb-2" style="display: none;">
                <span id="loginErrorMessage"></span>
            </div>
            <button onclick="login()" class="btn btn-primary w-full">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                    <polyline points="10 17 15 12 10 7"/>
                    <line x1="15" x2="3" y1="12" y2="12"/>
                </svg>
                Login
            </button>
        </div>
    </div>
</div>
`;
