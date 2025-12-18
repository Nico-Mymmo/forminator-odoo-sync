export const loginScreen = `
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
`;
