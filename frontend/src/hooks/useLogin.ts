import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { useLanguage } from '../i18n/useLanguage';

export const useLogin = () => {
    const { login, loginAsGuest, isGuest } = useAuth();
    const { t, language, setLanguage } = useLanguage();
    const navigate = useNavigate();
    const location = useLocation();

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        const trimmedUser = username.trim();
        if (!trimmedUser || !password) return;

        setLoading(true);
        setErrorMessage(null);

        try {
            const res = await login(trimmedUser, password);
            if (!res.status) {
                setErrorMessage(res.message || '');
            } else {
                const destination = (location.state as { from?: { pathname?: string } })?.from?.pathname || '/';
                navigate(destination, { replace: true });
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : '';
            setErrorMessage(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleGuestLogin = () => {
        loginAsGuest();
        const destination = (location.state as { from?: { pathname?: string } })?.from?.pathname || '/';
        navigate(destination, { replace: true });
    };


    const canSubmit = !loading && Boolean(username.trim()) && Boolean(password);
    return {
        canSubmit, handleSubmit, handleGuestLogin, username, setUsername,
        password, setPassword, showPassword, setShowPassword, loading,
        errorMessage, isGuest, t, language, setLanguage,
    };
};
