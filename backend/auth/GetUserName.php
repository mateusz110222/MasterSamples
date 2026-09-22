<?php
declare(strict_types=1);

/**
 * Endpoint pobierania nazwy zalogowanego użytkownika domeny (SSO / LDAP / Windows Auth).
 * Ścieżka docelowa na serwerze produkcyjnym: /custom/auth/GetUserName.php
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

$user = (string)(getenv('REMOTE_USER') ?: ($_SERVER['REMOTE_USER'] ?? $_SERVER['AUTH_USER'] ?? ''));

// Usunięcie prefiksu domeny (np. BORGWARNER\username -> username)
if (str_contains($user, '\\')) {
    $user = substr($user, (int)strrpos($user, '\\') + 1);
}

$user = trim($user, " \t\n\r\0\x0B\"'");

echo json_encode([
    'status' => $user !== '',
    'user' => $user,
], JSON_UNESCAPED_UNICODE);
