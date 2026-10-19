import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { useLanguage } from '../i18n/useLanguage';
import { subscribeBroadcast } from '../lib/broadcastSync';

export const useLogin = () => {
    const { login, loginAsGuest, isGuest, isAuthenticated } = useAuth();
    const { t, language, setLanguage } = useLanguage();
    const navigate = useNavigate();
    const location = useLocation();
    const destination = (location.state as { from?: { pathname?: string } })?.from?.pathname || '/';

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        if (isAuthenticated && !isGuest) {
            navigate(destination, { replace: true });
            return;
        }
        return subscribeBroadcast((message) => {
            if (message.type === 'auth:logout') {
                setErrorMessage(null);
            }
        });
    }, [isAuthenticated, isGuest, navigate, destination]);

    const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        const trimmedUser = username.trim();
        if (!trimmedUser || !password) return;

        setLoading(true);
        setErrorMessage(null);

        try {
            const res = await login(trimmedUser, password);
            if (!res.status) {
                setPassword('');
                setErrorMessage(res.message || '');
            } else {
                setPassword('');
                navigate(destination, { replace: true });
            }
        } catch (err: unknown) {
            setPassword('');
            const msg = err instanceof Error ? err.message : '';
            setErrorMessage(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleGuestLogin = () => {
        loginAsGuest();
        navigate(destination, { replace: true });
    };

    const canSubmit = !loading && Boolean(username.trim()) && Boolean(password);
    return {
        canSubmit, handleSubmit, handleGuestLogin, username, setUsername,
        password, setPassword, showPassword, setShowPassword, loading,
        errorMessage, isGuest, t, language, setLanguage,
    };
};

