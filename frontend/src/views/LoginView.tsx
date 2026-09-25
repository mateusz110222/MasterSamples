import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    AlertCircle,
    Eye,
    EyeOff,
    Key,
    Loader2,
    Lock,
    ShieldCheck,
    User,
    UserCheck,
    Globe,
} from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { useLanguage } from '../i18n/useLanguage';

export const LoginView: React.FC = () => {
    const { login, loginAsGuest, isGuest } = useAuth();
    const { t, language, setLanguage } = useLanguage();
    const navigate = useNavigate();
    const location = useLocation();

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const trimmedUser = username.trim();
        if (!trimmedUser || !password) return;

        setLoading(true);
        setErrorMessage(null);

        try {
            const res = await login(trimmedUser, password);
            if (!res.status) {
                setErrorMessage(res.message || t.loginErrorTitle);
            } else {
                const destination = (location.state as { from?: { pathname?: string } })?.from?.pathname || '/';
                navigate(destination, { replace: true });
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : t.loginErrorTitle;
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

    return (
        <div className="min-h-dvh box-border w-full bg-brand-bg flex justify-center items-center px-4 py-6 relative overflow-x-clip font-sans">
            {/* Przełącznik języka w prawym górnym rogu */}
            <div className="absolute top-4 right-4 z-20 flex items-center gap-1 rounded-xl border border-brand-border bg-brand-surface/80 backdrop-blur-sm p-1 font-mono text-xs font-bold">
                <Globe size={14} className="text-brand-text-muted ml-1 mr-0.5" />
                <button
                    type="button"
                    onClick={() => setLanguage('PL')}
                    className={`rounded-lg px-2.5 py-1 transition-colors ${
                        language === 'PL' ? 'bg-brand-accent text-brand-text' : 'text-brand-text-muted hover:bg-brand-surface-high hover:text-brand-text'
                    }`}
                >
                    PL
                </button>
                <button
                    type="button"
                    onClick={() => setLanguage('EN')}
                    className={`rounded-lg px-2.5 py-1 transition-colors ${
                        language === 'EN' ? 'bg-brand-accent text-brand-text' : 'text-brand-text-muted hover:bg-brand-surface-high hover:text-brand-text'
                    }`}
                >
                    EN
                </button>
            </div>

            {/* Dynamiczne poświaty w tle */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
                <div className="login-glow login-glow-primary absolute -top-40 -left-40 w-96 h-96 bg-brand-accent/10 rounded-full blur-3xl" />
                <div className="login-glow login-glow-secondary absolute -bottom-40 -right-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
            </div>

            {/* Karta logowania */}
            <div className="login-card-enter my-auto w-full max-w-md bg-brand-surface border border-brand-border rounded-3xl p-5 sm:p-6 md:p-8 shadow-2xl relative z-10 space-y-5">
                {/* Logo & Nagłówek */}
                <div className="flex flex-col items-center text-center space-y-2">
                    <div className="w-14 h-14 rounded-2xl bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center text-brand-accent mb-1 shadow-inner">
                        <ShieldCheck size={30} />
                    </div>
                    <span className="text-xs font-black tracking-[0.25em] text-brand-accent uppercase">
                        MASTER SAMPLES
                    </span>
                    <h1 className="text-xl sm:text-2xl font-black text-brand-text tracking-tight uppercase">
                        {t.loginTitle}
                    </h1>
                    <p className="text-xs text-brand-text-muted">
                        {t.loginSubtitle}
                    </p>
                </div>

                {/* Komunikat o błędzie */}
                {errorMessage && (
                    <div
                        role="alert"
                        className="login-fields-enter bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3 text-red-400 text-xs overflow-hidden"
                    >
                        <AlertCircle size={18} className="shrink-0 mt-0.5" />
                        <div className="space-y-1">
                            <p className="font-bold uppercase tracking-wider">{t.loginErrorTitle}</p>
                            <p className="text-red-300/90 leading-relaxed">{errorMessage}</p>
                        </div>
                    </div>
                )}

                {/* Formularz logowania domenowego */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="login-fields-enter space-y-4">
                        <div className="space-y-2">
                            <label className="text-[11px] font-bold text-brand-text-muted uppercase tracking-wider block">
                                {t.loginUsernameLabel}
                            </label>
                            <div className="relative flex items-center">
                                <User size={18} className="absolute left-4 text-brand-text-muted" />
                                <input
                                    type="text"
                                    required
                                    autoComplete="username"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder={t.loginUsernamePlaceholder}
                                    className="w-full bg-brand-bg border border-brand-border rounded-xl py-3.5 pl-11 pr-4 text-sm font-mono text-brand-text focus:ring-2 focus:ring-brand-accent/30 outline-none transition-all"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[11px] font-bold text-brand-text-muted uppercase tracking-wider block">
                                {t.loginPasswordLabel}
                            </label>
                            <div className="relative flex items-center">
                                <Key size={18} className="absolute left-4 text-brand-text-muted" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder={t.loginPasswordPlaceholder}
                                    className="w-full bg-brand-bg border border-brand-border rounded-xl py-3.5 pl-11 pr-12 text-sm text-brand-text focus:ring-2 focus:ring-brand-accent/30 outline-none transition-all"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((visible) => !visible)}
                                    aria-label={showPassword ? t.loginHidePassword : t.loginShowPassword}
                                    title={showPassword ? t.loginHidePassword : t.loginShowPassword}
                                    className="absolute right-3 p-1 text-brand-text-muted hover:text-brand-accent rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/50 transition-colors cursor-pointer"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading || !username.trim() || !password}
                            className="w-full py-3.5 bg-brand-accent hover:bg-brand-accent/90 text-brand-text font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_10px_20px_rgba(99,102,241,0.25)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-3 cursor-pointer active:scale-[0.98]"
                        >
                            {loading ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" />
                                    <span>{t.loginBtnAuthenticating}</span>
                                </>
                            ) : (
                                <>
                                    <Lock size={16} />
                                    <span>{t.loginBtn}</span>
                                </>
                            )}
                        </button>

                        <div className="relative flex py-1 items-center">
                            <div className="grow border-t border-brand-border/60"></div>
                            <span className="shrink mx-4 text-[10px] font-bold text-brand-text-muted/60 uppercase tracking-widest">
                                {t.loginOrDivider}
                            </span>
                            <div className="grow border-t border-brand-border/60"></div>
                        </div>
                    </div>

                    {/* Sekcja Trybu Gościa */}
                    <div className="login-fields-enter rounded-2xl border border-brand-accent/25 bg-brand-accent/5 p-4 space-y-3">
                        <div className="flex items-start gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-accent/15 text-brand-accent">
                                <UserCheck size={18} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-black uppercase tracking-wider text-brand-text">
                                    {t.loginGuestTitle}
                                </p>
                                <p className="mt-1 text-[10px] leading-relaxed text-brand-text-muted">
                                    {t.loginGuestDesc}
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={handleGuestLogin}
                            disabled={loading}
                            className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-border bg-brand-surface-high hover:border-brand-accent/50 hover:bg-brand-accent/10 py-3 text-[11px] font-bold uppercase tracking-wider text-brand-text transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <UserCheck size={16} className="text-brand-accent" />
                            <span>
                                {isGuest
                                    ? (language === 'PL' ? 'WRÓĆ DO DASHBOARDU (TRYB GOŚCIA)' : 'RETURN TO DASHBOARD (GUEST MODE)')
                                    : t.loginGuestBtn}
                            </span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
