import React from 'react';
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
import { useLogin } from '../hooks/useLogin';

export const LoginView: React.FC = () => {
    const {
        canSubmit,
        handleSubmit,
        handleGuestLogin,
        username,
        setUsername,
        password,
        setPassword,
        showPassword,
        setShowPassword,
        loading,
        errorMessage,
        isGuest,
        t,
        language,
        setLanguage,
    } = useLogin();

    return (
        <div className="min-h-dvh w-full bg-brand-bg flex flex-col items-center px-4 py-3 relative font-sans select-none sm:select-auto">
            {/* Dynamiczne poświaty w tle */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0" aria-hidden="true">
                <div className="login-glow login-glow-primary absolute -top-24 -left-24 sm:-top-40 sm:-left-40 w-64 h-64 sm:w-96 sm:h-96 bg-brand-accent/10 rounded-full blur-3xl" />
                <div className="login-glow login-glow-secondary absolute -bottom-24 -right-24 sm:-bottom-40 sm:-right-40 w-64 h-64 sm:w-96 sm:h-96 bg-blue-600/10 rounded-full blur-3xl" />
            </div>

            {/* Przełącznik języka - w rogu ekranu, nie wypycha karty w dół */}
            <div className="w-full flex justify-end sm:w-auto sm:fixed sm:top-5 sm:right-6 z-20 mb-3 sm:mb-0 shrink-0">
                <div className="flex items-center gap-1 rounded-xl border border-brand-border bg-brand-surface/80 backdrop-blur-md p-1 font-mono text-xs font-bold shadow-sm">
                    <Globe size={14} className="text-brand-text-muted ml-1.5 mr-0.5 shrink-0" />
                    <button
                        type="button"
                        onClick={() => setLanguage('PL')}
                        className={`rounded-lg px-2.5 py-1 transition-all cursor-pointer ${
                            language === 'PL'
                                ? 'bg-brand-accent text-brand-text shadow-xs'
                                : 'text-brand-text-muted hover:bg-brand-surface-high hover:text-brand-text'
                        }`}
                    >
                        {t.languagePlShort}
                    </button>
                    <button
                        type="button"
                        onClick={() => setLanguage('EN')}
                        className={`rounded-lg px-2.5 py-1 transition-all cursor-pointer ${
                            language === 'EN'
                                ? 'bg-brand-accent text-brand-text shadow-xs'
                                : 'text-brand-text-muted hover:bg-brand-surface-high hover:text-brand-text'
                        }`}
                    >
                        {t.languageEnShort}
                    </button>
                </div>
            </div>

            {/* Karta logowania - kompaktowa w pionie, zawsze mieści się na 1 ekranie */}
            <main className="w-full max-w-[400px] z-10 my-auto">
                <div className="login-card-enter w-full bg-brand-surface/95 backdrop-blur-xs border border-brand-border rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
                    {/* Logo & Nagłówek */}
                    <div className="flex flex-col items-center text-center space-y-1">
                        <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center text-brand-accent mb-1 shadow-inner shrink-0">
                            <ShieldCheck className="w-6 h-6 sm:w-7 sm:h-7" />
                        </div>
                        <span className="text-[10px] sm:text-[11px] font-black tracking-[0.25em] text-brand-accent uppercase">
                            {t.appName}
                        </span>
                        <h1 className="text-lg sm:text-xl font-black text-brand-text tracking-tight uppercase">
                            {t.loginTitle}
                        </h1>
                    </div>

                    {/* Komunikat o błędzie */}
                    {errorMessage !== null && (
                        <div
                            role="alert"
                            className="login-fields-enter bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-start gap-2.5 text-red-400 text-xs overflow-hidden"
                        >
                            <AlertCircle size={16} className="shrink-0 mt-0.5" />
                            <div className="space-y-0.5 min-w-0 flex-1">
                                <p className="font-bold uppercase tracking-wider text-[11px]">{t.loginErrorTitle}</p>
                                <p className="text-red-300/90 leading-snug break-words text-[11px]">
                                    {language === 'PL' ? errorMessage || t.loginErrorDesc : t.loginErrorDesc}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Formularz logowania domenowego */}
                    <form onSubmit={handleSubmit} className="space-y-3.5">
                        <div className="login-fields-enter space-y-3">
                            {/* Pole Nazwa Użytkownika */}
                            <div className="space-y-1.5">
                                <label
                                    htmlFor="login-username"
                                    className="text-[10px] sm:text-[11px] font-bold text-brand-text-muted uppercase tracking-wider block"
                                >
                                    {t.loginUsernameLabel}
                                </label>
                                <div className="relative flex items-center">
                                    <User
                                        size={17}
                                        className="absolute left-3.5 text-brand-text-muted pointer-events-none z-10"
                                    />
                                    <input
                                        id="login-username"
                                        type="text"
                                        required
                                        autoComplete="username"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        placeholder={t.loginUsernamePlaceholder}
                                        className="w-full bg-brand-bg border border-brand-border rounded-xl py-2.5 sm:py-3 pl-10 pr-4 text-base sm:text-sm font-mono text-brand-text placeholder:text-brand-text-muted/50 focus:border-brand-accent/60 focus:ring-2 focus:ring-brand-accent/30 outline-none transition-all [&:-webkit-autofill]:shadow-[0_0_0_1000px_var(--color-brand-bg,#0f172a)_inset] [&:-webkit-autofill]:[-webkit-text-fill-color:var(--color-brand-text,#f8fafc)]"
                                    />
                                </div>
                            </div>

                            {/* Pole Hasło */}
                            <div className="space-y-1.5">
                                <label
                                    htmlFor="login-password"
                                    className="text-[10px] sm:text-[11px] font-bold text-brand-text-muted uppercase tracking-wider block"
                                >
                                    {t.loginPasswordLabel}
                                </label>
                                <div className="relative flex items-center">
                                    <Key
                                        size={17}
                                        className="absolute left-3.5 text-brand-text-muted pointer-events-none z-10"
                                    />
                                    <input
                                        id="login-password"
                                        type={showPassword ? 'text' : 'password'}
                                        required
                                        autoComplete="current-password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder={t.loginPasswordPlaceholder}
                                        className="w-full bg-brand-bg border border-brand-border rounded-xl py-2.5 sm:py-3 pl-10 pr-11 text-base sm:text-sm text-brand-text placeholder:text-brand-text-muted/50 focus:border-brand-accent/60 focus:ring-2 focus:ring-brand-accent/30 outline-none transition-all [&:-webkit-autofill]:shadow-[0_0_0_1000px_var(--color-brand-bg,#0f172a)_inset] [&:-webkit-autofill]:[-webkit-text-fill-color:var(--color-brand-text,#f8fafc)]"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword((visible) => !visible)}
                                        aria-label={showPassword ? t.loginHidePassword : t.loginShowPassword}
                                        title={showPassword ? t.loginHidePassword : t.loginShowPassword}
                                        className="absolute right-2.5 p-1.5 text-brand-text-muted hover:text-brand-accent rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/50 transition-colors cursor-pointer z-10"
                                    >
                                        {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                                    </button>
                                </div>
                            </div>

                            {/* Przycisk Zaloguj */}
                            <button
                                type="submit"
                                disabled={!canSubmit}
                                className="w-full py-3 bg-brand-accent hover:bg-brand-accent/90 text-brand-text font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_10px_20px_rgba(99,102,241,0.25)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-1 cursor-pointer active:scale-[0.98]"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin shrink-0" />
                                        <span className="truncate">{t.loginBtnAuthenticating}</span>
                                    </>
                                ) : (
                                    <>
                                        <Lock size={16} className="shrink-0" />
                                        <span className="truncate">{t.loginBtn}</span>
                                    </>
                                )}
                            </button>

                            {/* Separator */}
                            <div className="relative flex py-0.5 items-center">
                                <div className="grow border-t border-brand-border/60"></div>
                                <span className="shrink mx-3 text-[10px] font-bold text-brand-text-muted/60 uppercase tracking-widest">
                                    {t.loginOrDivider}
                                </span>
                                <div className="grow border-t border-brand-border/60"></div>
                            </div>
                        </div>

                        {/* Sekcja Trybu Gościa */}
                        <div className="login-fields-enter rounded-xl sm:rounded-2xl border border-brand-accent/25 bg-brand-accent/5 p-3.5 space-y-2.5">
                            <div className="flex items-start gap-2.5">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-accent/15 text-brand-accent">
                                    <UserCheck size={16} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[11px] font-black uppercase tracking-wider text-brand-text">
                                        {t.loginGuestTitle}
                                    </p>
                                    <p className="mt-0.5 text-[10px] leading-snug text-brand-text-muted">
                                        {t.loginGuestDesc}
                                    </p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleGuestLogin}
                                disabled={loading}
                                className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-border bg-brand-surface-high hover:border-brand-accent/50 hover:bg-brand-accent/10 py-2.5 px-3 text-[11px] font-bold uppercase tracking-wider text-brand-text transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <UserCheck size={15} className="text-brand-accent shrink-0" />
                                <span className="truncate">
                                    {isGuest ? t.loginGuestReturn : t.loginGuestBtn}
                                </span>
                            </button>
                        </div>
                    </form>
                </div>
            </main>
        </div>
    );
};
