// Microsoft sign-in (MSAL). Redirect-based, which works best on phones and
// home-screen apps where popups are unreliable.
import { InteractionRequiredAuthError, PublicClientApplication } from '@azure/msal-browser';
import { APP_URL, GRAPH_SCOPES, MS_CLIENT_ID, MS_TENANT } from './config';

export const isConfigured = !!MS_CLIENT_ID;

const msal = isConfigured
  ? new PublicClientApplication({
      auth: {
        clientId: MS_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${MS_TENANT}`,
        redirectUri: APP_URL,
        postLogoutRedirectUri: APP_URL,
      },
      // localStorage keeps you signed in between visits (and home-screen launches).
      cache: { cacheLocation: 'localStorage' },
    })
  : null;

let lastToken = null;

// Finishes a sign-in redirect if we're returning from one, and returns the signed-in account.
export async function initAuth() {
  await msal.initialize();
  const result = await msal.handleRedirectPromise();
  if (result?.account) msal.setActiveAccount(result.account);
  if (!msal.getActiveAccount()) {
    const [first] = msal.getAllAccounts();
    if (first) msal.setActiveAccount(first);
  }
  return msal.getActiveAccount();
}

export function signIn() {
  return msal.loginRedirect({ scopes: GRAPH_SCOPES, prompt: 'select_account' });
}

export function signOut() {
  return msal.logoutRedirect({ account: msal.getActiveAccount() });
}

export async function getToken() {
  const account = msal.getActiveAccount();
  if (!account) throw new Error('Not signed in');
  try {
    const result = await msal.acquireTokenSilent({ scopes: GRAPH_SCOPES, account });
    lastToken = { value: result.accessToken, expires: result.expiresOn?.getTime() ?? 0 };
    return result.accessToken;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      await msal.acquireTokenRedirect({ scopes: GRAPH_SCOPES, account });
      return new Promise(() => {}); // the page is navigating away
    }
    throw err;
  }
}

// For saving while the page is closing, when there's no time to wait for MSAL.
export function cachedToken() {
  return lastToken && lastToken.expires > Date.now() + 30_000 ? lastToken.value : null;
}
