(function () {
    const LOCAL_AUTH_KEY = 'ovo_fixed_auth';
    const LEGACY_AUTH_KEY = 'ephone_auth';
    const FIXED_ACCOUNT = 'ss';
    const FIXED_PASSWORD = 'wyd';

    function syncAuthState () {
        const isLocallyAuthorized = localStorage.getItem(LOCAL_AUTH_KEY) === 'true';
        if (isLocallyAuthorized) {
            localStorage.setItem(LEGACY_AUTH_KEY, 'true');
        } else {
            localStorage.removeItem(LEGACY_AUTH_KEY);
        }
    }

    function setAuthorized () {
        localStorage.setItem(LOCAL_AUTH_KEY, 'true');
        localStorage.setItem(LEGACY_AUTH_KEY, 'true');
    }

    function clearLegacyLoginUi () {
        const title = document.querySelector('#login-overlay .login-title');
        const divider = document.querySelector('#login-overlay .login-divider');
        const forgotLink = document.getElementById('forgot-pwd-link');
        const accountInput = document.getElementById('login-uid');
        const passwordInput = document.getElementById('login-pwd');
        const submitButton = document.getElementById('btn-login-submit');

        if (title) title.textContent = 'Login';
        if (divider) divider.textContent = 'Use fixed credentials to enter';
        if (accountInput) {
            accountInput.placeholder = 'Account';
            accountInput.autocomplete = 'off';
        }
        if (passwordInput) {
            passwordInput.placeholder = 'Password ';
            passwordInput.autocomplete = 'off';
        }
        if (submitButton) submitButton.textContent = 'Enter';
        if (forgotLink) {
            forgotLink.textContent = 'Local fixed login enabled';
            forgotLink.style.textDecoration = 'none';
            forgotLink.style.cursor = 'default';
            forgotLink.onclick = null;
        }
    }

    async function handleLocalLogin () {
        const accountInput = document.getElementById('login-uid');
        const passwordInput = document.getElementById('login-pwd');
        const message = document.getElementById('login-msg');
        const submitButton = document.getElementById('btn-login-submit');

        if (!accountInput || !passwordInput || !message || !submitButton) return;

        const account = accountInput.value.trim();
        const password = passwordInput.value.trim();
        if (!account || !password) {
            message.style.color = '#ff453a';
            message.textContent = 'Enter account and password';
            return;
        }

        submitButton.disabled = true;
        const originalButtonText = submitButton.textContent;
        message.style.color = '#007aff';
        message.textContent = 'Checking...';
        submitButton.textContent = 'Checking...';

        try {
            if (account !== FIXED_ACCOUNT || password !== FIXED_PASSWORD) {
                throw new Error('Wrong account or password');
            }

            setAuthorized();
            message.style.color = '#32d74b';
            message.textContent = 'Success, opening...';

            if (typeof initDatabase === 'function') {
                initDatabase();
            }

            const overlay = document.getElementById('login-overlay');
            if (overlay) {
                overlay.style.transition = 'opacity 0.5s ease';
                overlay.style.opacity = '0';
                setTimeout(() => overlay.remove(), 500);
            }

            if (typeof init === 'function') {
                await init();
            }
        } catch (error) {
            message.style.color = '#ff453a';
            message.textContent = error.message || 'Login failed';
            submitButton.style.background = '#ff453a';
            setTimeout(() => {
                submitButton.style.background = '#c7e0f8';
            }, 500);
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = originalButtonText;
        }
    }

    function patchLoginOverlay () {
        const overlay = document.getElementById('login-overlay');
        if (!overlay) return false;

        clearLegacyLoginUi();

        const submitButton = document.getElementById('btn-login-submit');
        const passwordInput = document.getElementById('login-pwd');
        const accountInput = document.getElementById('login-uid');

        if (submitButton) {
            submitButton.onclick = handleLocalLogin;
        }

        if (passwordInput) {
            passwordInput.onkeypress = function (event) {
                if (event.key === 'Enter') handleLocalLogin();
            };
        }

        if (accountInput) {
            accountInput.onkeypress = function (event) {
                if (event.key === 'Enter') {
                    if (passwordInput) {
                        passwordInput.focus();
                    } else {
                        handleLocalLogin();
                    }
                }
            };
        }

        return true;
    }

    syncAuthState();

    document.addEventListener('DOMContentLoaded', function () {
        setTimeout(function () {
            if (patchLoginOverlay()) return;

            const observer = new MutationObserver(function () {
                if (patchLoginOverlay()) {
                    observer.disconnect();
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }, 0);
    });
})();
