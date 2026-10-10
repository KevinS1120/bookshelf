// Microsoft sign-in (MSAL). Redirect-based, which works best on phones and
// home-screen apps where popups are unreliable.
//
// Staying signed in: MSAL's saved tokens only last until the browser (or
// home-screen app) closes, and Microsoft limits them to 24 hours for web apps
// anyway. So we remember who signed in on this device, and when the tokens are
// gone we quietly renew them through Microsoft's own "stay signed in" session.
// That's a quick redirect with nothing to click.
import { InteractionRequiredAuthError, PublicClientApplication } from '@azure/msal-browser';
import { APP_URL, GRAPH_SCOPES, MS_CLIENT_ID, MS_TENANT } from './config';

export const isConfigured = !!MS_CLIENT_ID;

const HINT_KEY = 'bookshelf-login-hint'; // who last signed in on this device
const TRIED_KEY = 'bookshelf-silent-signin'; // one quiet attempt per visit, to avoid loops

const msal = isConfigured
  ? new PublicClientApplication({
      auth: {
        clientId: MS_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${MS_TENANT}`,
        redirectUri: APP_URL,
        postLogoutRedirectUri: APP_URL,
      },
      cache: { cacheLocation: 'localStorage' },
    })
  : null;

let lastToken = null;

function storage(kind) {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}
const loginHint = () => storage('local')?.getItem(HINT_KEY) || undefined;

function needsUser(err) {
  return (
    err instanceof InteractionRequiredAuthError ||
    /login_required|interaction_required|consent_required|no_tokens_found|no_account/i.test(err?.errorCode ?? '')
  );
}

// Finishes a sign-in redirect if we're returning from one, renews an expired
// sign-in if possible, and returns the signed-in account (or null).
export async function initAuth() {
  await msal.initialize();
  let result = null;
  try {
    result = await msal.handleRedirectPromise();
  } catch (err) {
    if (!needsUser(err)) throw err; // a quiet renewal that needs you: show the sign-in button
  } finally {
    // Don't leave the one-time sign-in code in the address bar (or in history).
    if (/[#&](code|error|state)=/.test(window.location.hash)) {
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    }
  }
  if (result?.account) msal.setActiveAccount(result.account);
  if (!msal.getActiveAccount()) {
    const [first] = msal.getAllAccounts();
    if (first) msal.setActiveAccount(first);
  }

  const account = msal.getActiveAccount();
  if (account) {
    try {
      await acquire(account);
      storage('local')?.setItem(HINT_KEY, account.username);
      storage('session')?.removeItem(TRIED_KEY);
      return account;
    } catch (err) {
      if (!needsUser(err)) throw err;
    }
  }

  // Signed in on this device before: renew quietly, once per visit.
  const hint = loginHint();
  const session = storage('session');
  if (hint && session && !session.getItem(TRIED_KEY)) {
    session.setItem(TRIED_KEY, '1');
    await msal.loginRedirect({ scopes: GRAPH_SCOPES, loginHint: hint, prompt: 'none' });
    return new Promise(() => {}); // the page is navigating away
  }
  return null;
}

export function signIn() {
  storage('session')?.removeItem(TRIED_KEY);
  return msal.loginRedirect({ scopes: GRAPH_SCOPES, loginHint: loginHint() });
}

export function signOut() {
  storage('local')?.removeItem(HINT_KEY);
  return msal.logoutRedirect({ account: msal.getActiveAccount() });
}

async function acquire(account) {
  const result = await msal.acquireTokenSilent({ scopes: GRAPH_SCOPES, account });
  lastToken = { value: result.accessToken, expires: result.expiresOn?.getTime() ?? 0 };
  return result.accessToken;
}

export async function getToken() {
  const account = msal.getActiveAccount();
  if (!account) throw new Error('Not signed in');
  try {
    return await acquire(account);
  } catch (err) {
    if (needsUser(err)) {
      // Usually completes on its own using your Microsoft session.
      await msal.acquireTokenRedirect({ scopes: GRAPH_SCOPES, account, loginHint: account.username });
      return new Promise(() => {}); // the page is navigating away
    }
    throw err;
  }
}

// For saving while the page is closing, when there's no time to wait for MSAL.
export function cachedToken() {
  return lastToken && lastToken.expires > Date.now() + 30_000 ? lastToken.value : null;
}
