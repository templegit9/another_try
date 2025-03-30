// reset-password.js
import { supabase } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    const resetPasswordForm = document.getElementById('reset-password-form');
    const resetError = document.getElementById('reset-error');

    // Check if we have a valid reset token in the URL
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');

    if (!accessToken || !refreshToken) {
        resetError.textContent = 'Invalid or expired reset link. Please request a new one.';
        resetError.classList.remove('hidden');
        return;
    }

    resetPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;

        if (newPassword !== confirmPassword) {
            resetError.textContent = 'Passwords do not match.';
            resetError.classList.remove('hidden');
            return;
        }

        try {
            // Set the session with the tokens from the URL
            const { error: sessionError } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken
            });

            if (sessionError) throw sessionError;

            // Update the password
            const { error: updateError } = await supabase.auth.updateUser({
                password: newPassword
            });

            if (updateError) throw updateError;

            // Show success message and redirect to login
            alert('Password successfully reset! Please log in with your new password.');
            window.location.href = '/index.html';
        } catch (error) {
            console.error('Error resetting password:', error);
            resetError.textContent = error.message || 'Failed to reset password. Please try again.';
            resetError.classList.remove('hidden');
        }
    });
}); 